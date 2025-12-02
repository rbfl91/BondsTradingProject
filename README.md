# Bond Trading API

A Python REST API that provides endpoints to interact with Bond Trading smart contracts.

## Features

- Issue new bonds
- Purchase bonds
- Sell bonds
- Redeem bonds
- Retrieve bond information
- Retrieve bond holder information

## Endpoints

### General
- `GET /health` - Health check
- `GET /status` - API status information
- `GET /contract/address` - Get contract address

### Bond Operations
- `POST /bond/issue` - Issue a new bond
- `POST /bond/purchase` - Purchase a bond
- `POST /bond/sell` - Sell a bond
- `POST /bond/redeem` - Redeem a bond

### Bond Information
- `GET /bond/<bond_id>/info` - Get bond information
- `GET /bond/<bond_id>/holders` - Get list of bond holders
- `GET /bond/<bond_id>/holder/<holder_address>/amount` - Get amount of bonds held by a specific address

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up a local blockchain (e.g., Ganache or Hardhat)

3. Deploy the BondToken and BondTrading contracts to your local blockchain

4. Update `.env` file with contract details:
```env
WEB3_PROVIDER=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x...
```

5. Run the API:
```bash
cd api && python app.py
```

## Example Usage

### Issue a Bond
```bash
curl -X POST http://localhost:5000/bond/issue \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Bond",
    "issuer": "Test Issuer",
    "faceValue": 1000,
    "maturityDate": 1735689600,
    "interestRate": 500,
    "supply": 1000
  }'
```

### Purchase a Bond
```bash
curl -X POST http://localhost:5000/bond/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "bondId": 1,
    "amount": 100
  }'
```

### Get Bond Info
```bash
curl -X GET http://localhost:5000/bond/1/info
