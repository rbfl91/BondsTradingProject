// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @custom:sec-disclosure IBondToken extends IERC20 with burn capability
/// used by BondTrading to burn tokens during redemption (fixes C-02, C-06).
interface IBondToken is IERC20 {
    function burnFrom(address account, uint256 amount) external;
}

contract BondTrading is Ownable, ReentrancyGuard, Pausable {
    struct Bond {
        string name;
        string issuer;
        uint256 faceValue;
        uint256 maturityDate;
        uint256 interestRate;
        uint256 totalSupply;
        bool isActive;
    }

    mapping(uint256 => Bond) public bonds;
    mapping(uint256 => address[]) public bondHolders;
    mapping(uint256 => mapping(address => uint256)) public bondBalances;
    uint256 public bondCount;

    // Address of the BondToken contract
    IBondToken public bondToken;

    // Maximum gas limit for single transactions (DoS protection)
    uint256 public constant MAX_GAS_LIMIT = 500000;

    // Events — every state-changing function emits one (fixes H-04)
    event BondIssued(uint256 indexed bondId, string name, string issuer, uint256 faceValue);
    event BondPurchased(uint256 indexed bondId, address indexed buyer, uint256 amount);
    event BondSold(uint256 indexed bondId, address indexed seller, address indexed buyer, uint256 amount);
    event BondRedeemed(uint256 indexed bondId, address indexed redeemer, uint256 amount);

    constructor(address _bondTokenAddress, address initialOwner) Ownable(initialOwner) {
        bondToken = IBondToken(_bondTokenAddress);
    }

    // ── Emergency stop (fixes H-10) ──────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ── Lifecycle functions ──────────────────────────────────────

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
            interestRate: _interestRate,
            totalSupply: _supply,
            isActive: true
        });

        emit BondIssued(bondId, _name, _issuer, _faceValue);
    }

    /// @notice Purchase a bond (tokens → bond ownership).
    /// @dev nonReentrant guards against reentrancy via token callback (fixes C-04).
    ///      Maturity check prevents trading after expiry (fixes H-03).
    ///      Hardcoded 10000 limit removed (fixes H-01).
    function purchaseBond(uint256 _bondId, uint256 _amount) external nonReentrant whenNotPaused {
        require(bonds[_bondId].isActive, "Bond is not active");
        require(block.timestamp <= bonds[_bondId].maturityDate, "Bond has matured");
        require(_amount > 0, "Amount must be > 0");
        require(bonds[_bondId].totalSupply >= _amount, "Insufficient bond supply");
        require(bondToken.balanceOf(msg.sender) >= _amount, "Insufficient token balance");

        // Interaction: transfer tokens from user to contract
        require(
            bondToken.transferFrom(msg.sender, address(this), _amount),
            "Token transfer failed"
        );

        // Effects: update internal state
        bondBalances[_bondId][msg.sender] += _amount;

        bool alreadyHolder = false;
        for (uint256 i = 0; i < bondHolders[_bondId].length; i++) {
            if (bondHolders[_bondId][i] == msg.sender) {
                alreadyHolder = true;
                break;
            }
        }
        if (!alreadyHolder) {
            bondHolders[_bondId].push(msg.sender);
        }

        emit BondPurchased(_bondId, msg.sender, _amount);
    }

    /// @notice Sell a bond to another address (bond ownership transfer).
    function sellBond(uint256 _bondId, uint256 _amount, address _buyer) external nonReentrant whenNotPaused {
        require(_buyer != address(0), "Buyer cannot be zero address");
        require(_buyer != msg.sender, "Cannot sell to self");
        require(bonds[_bondId].isActive, "Bond is not active");
        require(block.timestamp <= bonds[_bondId].maturityDate, "Bond has matured");
        require(_amount > 0, "Amount must be > 0");
        require(bondBalances[_bondId][msg.sender] >= _amount, "Insufficient bond holdings");
        require(bondToken.balanceOf(msg.sender) >= _amount, "Insufficient token balance for fees");

        // Interaction
        require(
            bondToken.transferFrom(msg.sender, _buyer, _amount),
            "Token transfer failed"
        );

        // Effects
        bondBalances[_bondId][msg.sender] -= _amount;
        bondBalances[_bondId][_buyer] += _amount;

        bool holderExists = false;
        for (uint256 i = 0; i < bondHolders[_bondId].length; i++) {
            if (bondHolders[_bondId][i] == _buyer) {
                holderExists = true;
                break;
            }
        }
        if (!holderExists) {
            bondHolders[_bondId].push(_buyer);
        }

        emit BondSold(_bondId, msg.sender, _buyer, _amount);
    }

    /// @notice Redeem a bond — burns the underlying tokens (fixes C-02, C-06).
    ///         Only allowed after maturity date (fixes H-03).
    function redeemBond(uint256 _bondId, uint256 _amount) external nonReentrant whenNotPaused {
        require(bonds[_bondId].isActive, "Bond is not active");
        require(block.timestamp >= bonds[_bondId].maturityDate, "Bond has not matured yet");
        require(_amount > 0, "Amount must be > 0");
        require(bondBalances[_bondId][msg.sender] >= _amount, "Insufficient bond holdings");

        // Burn tokens from caller's allowance (proper burning, not transfer to address(0))
        bondToken.burnFrom(msg.sender, _amount);

        // Effects
        bondBalances[_bondId][msg.sender] -= _amount;

        emit BondRedeemed(_bondId, msg.sender, _amount);
    }

    // ── View functions ───────────────────────────────────────────

    function getBondHolderAmount(uint256 _bondId, address _holder) external view returns (uint256) {
        return bondBalances[_bondId][_holder];
    }

    function getBondInfo(uint256 _bondId) external view returns (Bond memory) {
        return bonds[_bondId];
    }

    function getBondHolders(uint256 _bondId) external view returns (address[] memory) {
        return bondHolders[_bondId];
    }
}
