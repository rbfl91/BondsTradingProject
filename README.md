# Bonds Redbelly MVP

This is a minimal viable product (MVP) for a bonds trading platform built on Ethereum. The project includes two smart contracts:

## Contracts

### BondToken.sol
- An ERC20 token implementation for representing bond ownership
- Initial supply of 1 million tokens
- Ownable contract with minting capabilities

### BondTrading.sol
- Main contract for issuing, purchasing, selling, and redeeming bonds
- Manages bond information and ownership
- Implements core bond trading functionality
- Uses the BondToken for representing bond ownership

## Features Implemented

1. **Bond Issuance**: Owners can create new bonds with name, issuer, face value, maturity date, interest rate, and supply
2. **Bond Purchase**: Users can purchase bonds by transferring tokens to the contract
3. **Bond Sale**: Users can sell bonds to other users
4. **Bond Redemption**: Users can redeem bonds (burning the tokens)
5. **Bond Information**: Query bond details and holder information

## Key Functionality

- **Ownable**: Only the owner can issue new bonds
- **Token-based**: All bond transactions are represented using ERC20 tokens
- **Security**: Implements proper checks for balances, approvals, and bond status
- **Events**: Emits events for all major operations (bond issuance, purchases, sales)

## Deployment

The project is configured for deployment using Truffle. The migration script deploys both contracts to the development network.

## Testing

The project includes comprehensive tests that verify:
- Bond issuance functionality
- Bond purchase functionality
- Bond sale functionality
- Proper event emissions
- Security checks

## Requirements

- Node.js (v12 or higher recommended)
- Truffle (v5.x)
- Ganache or other Ethereum client for testing

## Setup

1. Install dependencies: `npm install`
2. Compile contracts: `npx truffle compile`
3. Run tests: `npx truffle test`
4. Deploy: `npx truffle deploy`

## License

MIT
