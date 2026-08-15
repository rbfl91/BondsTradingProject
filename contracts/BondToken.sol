// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BondToken
 * @notice Single-pool ERC-20 used as the settlement asset for bonds
 *         (fixes I-01: one shared instrument, no per-bond metadata).
 * @dev C-03c FIX: minting is capped at MAX_SUPPLY (10x the initial supply) —
 *      the owner can no longer inflate the token without bound.
 */
contract BondToken is ERC20, ERC20Burnable, Ownable {
    /// @notice Tokens minted to the deployer at construction (1,000,000)
    uint256 public constant INITIAL_SUPPLY = 1000000 * 10**18;

    /// @notice Hard cap on total supply (10,000,000) — fixes unbounded mint (C-03c)
    uint256 public constant MAX_SUPPLY = 10000000 * 10**18;

    /// @notice Emitted when the owner mints new tokens
    event Minted(address indexed to, uint256 amount, uint256 totalSupply);

    constructor(
        string memory _name,
        string memory _symbol,
        address initialOwner
    ) ERC20(_name, _symbol) Ownable(initialOwner) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @notice Mint additional tokens (owner-only, capped).
     * @param to     Recipient address
     * @param amount Amount in wei (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "Exceeds MAX_SUPPLY"
        );
        _mint(to, amount);
        emit Minted(to, amount, totalSupply());
    }
}
