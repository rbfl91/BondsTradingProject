// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Minimal BondToken surface used by BondTrading.
/// @dev Tokens are escrowed in this contract at purchase (C-02 fix):
///      purchase moves tokens in via transferFrom, redemption settles them
///      with a plain burn of the contract's own escrowed balance — the same
///      tokens a user bought are the tokens settled at maturity.
interface IBondToken is IERC20 {
    function burn(uint256 amount) external;
}

/**
 * @title BondTrading
 * @notice Issues, trades and redeems fixed-maturity bonds denominated in BondToken.
 *
 * Economic model (MVP scope, see H-02):
 * - Bonds are purchased 1:1 at face value in BondToken; tokens are escrowed
 *   in this contract until redemption. There is no market pricing, no fees
 *   and no coupon payments — `interestRate` is informational (basis points).
 * - `sellBond` transfers a *position* between holders; the escrowed tokens
 *   stay in the contract and settle whichever holder redeems at maturity.
 * - `remainingSupply` decrements as primary purchases consume the issuance;
 *   secondary sales do not affect it.
 *
 * Security:
 * - ReentrancyGuard on all state-changing functions (token-callback safety)
 * - Pausable emergency stop, Ownable administrative functions
 * - O(1) holder-membership checks via mapping (H-01 fix: no unbounded
 *   array scans); holder lists are pruned when a position reaches zero (C-02b)
 */
contract BondTrading is Ownable, ReentrancyGuard, Pausable {
    struct Bond {
        string name;
        string issuer;
        uint256 faceValue;
        uint256 maturityDate;
        uint256 interestRate; // informational, basis points (500 = 5.00%)
        uint256 totalSupply;  // original issuance size (constant)
        uint256 remainingSupply; // not yet purchased in primary market
        bool isActive;
    }

    mapping(uint256 => Bond) public bonds;
    /// @notice Ordered list of holders with a non-zero position (pruned on zero-out)
    mapping(uint256 => address[]) public bondHolders;
    /// @notice O(1) membership flag (H-01)
    mapping(uint256 => mapping(address => bool)) public bondHolderFlags;
    /// @notice Position of an address in bondHolders[bondId] (for O(1) removal)
    mapping(uint256 => mapping(address => uint256)) public bondHolderIndex;
    /// @notice Bond positions. 1 bond = 1 BondToken (18 decimals): a position of
    ///         N bonds settles N * 10**18 wei of the token at redemption.
    mapping(uint256 => mapping(address => uint256)) public bondBalances;
    /// @notice Existence flag (strings in storage can't be compared directly)
    mapping(uint256 => bool) public bondIssued;
    uint256 public bondCount;

    /// @notice Address of the BondToken contract (settlement asset)
    IBondToken public bondToken;

    /// @notice Maximum bonds returned by a single getBondsRange call (gas bound)
    uint256 public constant MAX_BATCH_SIZE = 50;

    event BondIssued(uint256 indexed bondId, string name, string issuer, uint256 faceValue);
    event BondPurchased(uint256 indexed bondId, address indexed buyer, uint256 amount);
    event BondSold(uint256 indexed bondId, address indexed seller, address indexed buyer, uint256 amount);
    event BondRedeemed(uint256 indexed bondId, address indexed redeemer, uint256 amount);
    event BondActiveStatusChanged(uint256 indexed bondId, bool isActive);
    event TokensEscrowed(uint256 indexed bondId, address indexed from, uint256 amount);
    event TokensSettled(uint256 indexed bondId, uint256 amount);

    constructor(address _bondTokenAddress, address initialOwner) Ownable(initialOwner) {
        bondToken = IBondToken(_bondTokenAddress);
    }

    // ── Emergency stop ─────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ── Administrative lifecycle (H-02 fix: isActive becomes reachable) ──

    /// @notice Owner deactivates a bond (blocks new purchases and secondary sales)
    function deactivateBond(uint256 _bondId) external onlyOwner {
        Bond storage b = bonds[_bondId];
        require(bondIssued[_bondId], "Bond does not exist");
        b.isActive = false;
        emit BondActiveStatusChanged(_bondId, false);
    }

    /// @notice Owner re-activates a bond (purchases still require maturity not passed)
    function activateBond(uint256 _bondId) external onlyOwner {
        Bond storage b = bonds[_bondId];
        require(bondIssued[_bondId], "Bond does not exist");
        b.isActive = true;
        emit BondActiveStatusChanged(_bondId, true);
    }

    // ── Issuance ───────────────────────────────────────────────────

    function issueBond(
        string memory _name,
        string memory _issuer,
        uint256 _faceValue,
        uint256 _maturityDate,
        uint256 _interestRate,
        uint256 _supply
    ) public onlyOwner whenNotPaused {
        require(_faceValue > 0, "Face value must be > 0");
        require(_maturityDate > block.timestamp, "Maturity must be in the future");
        require(_supply > 0, "Supply must be > 0");

        bondCount++;
        uint256 bondId = bondCount;

        bonds[bondId] = Bond({
            name: _name,
            issuer: _issuer,
            faceValue: _faceValue,
            maturityDate: _maturityDate,
            interestRate: _interestRate, // informational, basis points
            totalSupply: _supply,
            remainingSupply: _supply,
            isActive: true
        });
        bondIssued[bondId] = true;

        emit BondIssued(bondId, _name, _issuer, _faceValue);
    }

    // ── Trading ────────────────────────────────────────────────────

    /**
     * @notice Purchase bonds from the primary issuance.
     * @dev C-02 fix: the user's BondTokens are escrowed in this contract
     *      (transferFrom → contract). Redemption later settles the exact
     *      escrowed tokens via a burn — no value is trapped.
     */
    function purchaseBond(uint256 _bondId, uint256 _amount) external nonReentrant whenNotPaused {
        Bond storage b = bonds[_bondId];
        require(bondIssued[_bondId], "Bond does not exist");
        require(b.isActive, "Bond is not active");
        require(block.timestamp <= b.maturityDate, "Bond has matured");
        require(_amount > 0, "Amount must be > 0");
        require(b.remainingSupply >= _amount, "Insufficient bond supply");
        uint256 tokenAmount = _amount * 10**18; // 1 bond = 1 token (18 dec)
        require(bondToken.balanceOf(msg.sender) >= tokenAmount, "Insufficient token balance");

        // Interaction: escrow the user's tokens in the contract
        require(
            bondToken.transferFrom(msg.sender, address(this), tokenAmount),
            "Token transfer failed"
        );

        // Effects
        b.remainingSupply -= _amount;
        bondBalances[_bondId][msg.sender] += _amount;
        _addHolder(_bondId, msg.sender);

        emit BondPurchased(_bondId, msg.sender, _amount);
        emit TokensEscrowed(_bondId, msg.sender, tokenAmount);
    }

    /**
     * @notice Sell a bond position to another address (secondary market).
     * @dev L-c1 fix: the seller no longer needs to hold BondTokens — the
     *      settlement tokens were escrowed at purchase. Only the position
     *      changes hands; escrowed tokens stay in the contract and settle
     *      whichever holder redeems at maturity.
     */
    function sellBond(uint256 _bondId, uint256 _amount, address _buyer) external nonReentrant whenNotPaused {
        Bond storage b = bonds[_bondId];
        require(_buyer != address(0), "Buyer cannot be zero address");
        require(_buyer != msg.sender, "Cannot sell to self");
        require(bondIssued[_bondId], "Bond does not exist");
        require(b.isActive, "Bond is not active");
        require(block.timestamp <= b.maturityDate, "Bond has matured");
        require(_amount > 0, "Amount must be > 0");
        require(bondBalances[_bondId][msg.sender] >= _amount, "Insufficient bond holdings");

        // Effects: transfer the position (escrowed tokens stay in contract)
        bondBalances[_bondId][msg.sender] -= _amount;
        if (bondBalances[_bondId][msg.sender] == 0) {
            _removeHolder(_bondId, msg.sender); // C-02b fix: prune stale holders
        }
        bondBalances[_bondId][_buyer] += _amount;
        _addHolder(_bondId, _buyer);

        emit BondSold(_bondId, msg.sender, _buyer, _amount);
    }

    /**
     * @notice Redeem a matured bond position.
     * @dev C-02 fix: settles by burning the escrowed tokens held BY THIS
     *      CONTRACT (no allowance from the user required, no risk of burning
     *      the wrong assets). The same tokens purchased are the tokens settled.
     */
    function redeemBond(uint256 _bondId, uint256 _amount) external nonReentrant whenNotPaused {
        Bond storage b = bonds[_bondId];
        require(bondIssued[_bondId], "Bond does not exist");
        require(b.isActive, "Bond is not active");
        require(block.timestamp >= b.maturityDate, "Bond has not matured yet");
        require(_amount > 0, "Amount must be > 0");
        require(bondBalances[_bondId][msg.sender] >= _amount, "Insufficient bond holdings");
        uint256 tokenAmount = _amount * 10**18; // 1 bond = 1 token (18 dec)
        require(bondToken.balanceOf(address(this)) >= tokenAmount, "Insufficient escrowed tokens");

        // Settlement: burn the escrowed tokens from the contract's own balance
        bondToken.burn(tokenAmount);

        // Effects
        bondBalances[_bondId][msg.sender] -= _amount;
        if (bondBalances[_bondId][msg.sender] == 0) {
            _removeHolder(_bondId, msg.sender); // C-02b fix: prune stale holders
        }

        emit BondRedeemed(_bondId, msg.sender, _amount);
        emit TokensSettled(_bondId, tokenAmount);
    }

    // ── Holder-list management (H-01 / C-02b fixes) ────────────────

    function _addHolder(uint256 _bondId, address _holder) internal {
        if (!bondHolderFlags[_bondId][_holder]) {
            bondHolderIndex[_bondId][_holder] = bondHolders[_bondId].length;
            bondHolders[_bondId].push(_holder);
            bondHolderFlags[_bondId][_holder] = true;
        }
    }

    function _removeHolder(uint256 _bondId, address _holder) internal {
        if (!bondHolderFlags[_bondId][_holder]) return;
        address[] storage holders = bondHolders[_bondId];
        uint256 idx = bondHolderIndex[_bondId][_holder];
        address last = holders[holders.length - 1];
        if (idx != holders.length - 1) {
            holders[idx] = last;
            bondHolderIndex[_bondId][last] = idx;
        }
        holders.pop();
        bondHolderFlags[_bondId][_holder] = false;
        delete bondHolderIndex[_bondId][_holder];
    }

    // ── View functions ─────────────────────────────────────────────

    function getBondHolderAmount(uint256 _bondId, address _holder) external view returns (uint256) {
        return bondBalances[_bondId][_holder];
    }

    function getBondInfo(uint256 _bondId) external view returns (Bond memory) {
        return bonds[_bondId];
    }

    function getBondHolders(uint256 _bondId) external view returns (address[] memory) {
        return bondHolders[_bondId];
    }

    /**
     * @notice Batch view of bonds [start, start+count) — fixes M-02/M-02c
     *         (the API no longer needs N sequential RPC round-trips).
     * @param start  1-based first bond id (0 reads from id 1)
     * @param count  Number of bonds (capped at MAX_BATCH_SIZE)
     * @return out   The bonds in the window (named struct fields)
     */
    function getBondsRange(uint256 start, uint256 count)
        external
        view
        returns (Bond[] memory out)
    {
        if (start == 0) start = 1;
        if (count > MAX_BATCH_SIZE) count = MAX_BATCH_SIZE;

        uint256 end = start + count - 1;
        if (end > bondCount) end = bondCount;
        uint256 n = end >= start ? end - start + 1 : 0;

        out = new Bond[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = bonds[start + i];
        }
    }
}
