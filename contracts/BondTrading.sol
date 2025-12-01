// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BondTrading is Ownable {
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

    // Address of the BondToken contract (used for representing bond ownership)
    IERC20 public bondToken;

    // Events
    event BondIssued(uint256 bondId, string name, string issuer, uint256 faceValue);
    event BondPurchased(uint256 bondId, address buyer, uint256 amount);
    event BondSold(uint256 bondId, address seller, address buyer, uint256 amount);

    constructor(address _bondTokenAddress, address initialOwner) Ownable(initialOwner) {
        bondToken = IERC20(_bondTokenAddress);
    }

    function issueBond(
        string memory _name,
        string memory _issuer,
        uint256 _faceValue,
        uint256 _maturityDate,
        uint256 _interestRate,
        uint256 _supply
    ) public onlyOwner {
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

    function purchaseBond(uint256 _bondId, uint256 _amount) public {
        require(bonds[_bondId].isActive, "Bond is not active");
        require(_amount > 0, "Amount must be greater than 0");
        require(bonds[_bondId].totalSupply >= _amount, "Insufficient bond supply");
        require(_amount <= 10000, "Amount exceeds maximum allowed"); // Prevent overflow issues
        require(bondToken.balanceOf(msg.sender) >= _amount, "Insufficient token balance");
        
        // Transfer tokens from user to this contract (simulate payment)
        require(bondToken.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
        
        // Update bond balances
        bondBalances[_bondId][msg.sender] += _amount;
        
        // Add to bond holders list if not already there
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

    function sellBond(uint256 _bondId, uint256 _amount, address _buyer) public {
        require(bonds[_bondId].isActive, "Bond is not active");
        require(_amount > 0, "Amount must be greater than 0");
        require(bondHolders[_bondId].length > 0, "No holders for this bond");
        require(bondBalances[_bondId][msg.sender] >= _amount, "Insufficient bond holdings");
        require(_amount <= 10000, "Amount exceeds maximum allowed"); // Prevent overflow issues
        require(bondToken.balanceOf(msg.sender) >= _amount, "Insufficient token balance to pay fees");
        
        // Transfer tokens from seller to buyer (the token amount represents bond ownership)
        require(bondToken.transferFrom(msg.sender, _buyer, _amount), "Token transfer failed");
        
        // Update balances
        bondBalances[_bondId][msg.sender] -= _amount;
        bondBalances[_bondId][_buyer] += _amount;
        
        // Add buyer to bond holders list if not already there
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

    // Helper function to get the amount of bonds a holder has
    function getBondHolderAmount(uint256 _bondId, address _holder) public view returns (uint256) {
        return bondBalances[_bondId][_holder];
    }

    function redeemBond(uint256 _bondId, uint256 _amount) public {
        require(bonds[_bondId].isActive, "Bond is not active");
        require(_amount > 0, "Amount must be greater than 0");
        require(bondBalances[_bondId][msg.sender] >= _amount, "Insufficient bond holdings");
        
        // Burn the bond tokens by transferring them to the zero address
        require(bondToken.transfer(address(0), _amount), "Token transfer failed");
        
        // Update balances
        bondBalances[_bondId][msg.sender] -= _amount;
        
        // In a real implementation, this would return face value + interest
        // For MVP, we'll just burn the tokens
    }

    function getBondInfo(uint256 _bondId) public view returns (Bond memory) {
        return bonds[_bondId];
    }

    function getBondHolders(uint256 _bondId) public view returns (address[] memory) {
        return bondHolders[_bondId];
    }
}
