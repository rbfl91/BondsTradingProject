# Bond Trading Project - Agent Instructions

## Architecture

- **Frontend**: React + Vite + Ant Design (`frontend/`)
- **API**: Flask REST API (`api/app.py`)
- **Smart Contracts**: Solidity + Truffle (`contracts/`, `migrations/`, `test/`)
- **Blockchain**: Web3 integration with local Ethereum node (Ganache/Hardhat on port 8545)

## Package Boundaries

| Directory | Purpose |
|-----------|---------|
| `api/` | Flask REST API (port 5000) |
| `frontend/` | React SPA (dev server port 3000) |
| `contracts/` | Solidity contracts (BondToken, BondTrading) |
| `migrations/` | Truffle deployment scripts |
| `test/` | Truffle contract tests |
| `build/` | Compiled contract artifacts (contains ABI) |

## Commands

### Smart Contracts
```bash
# Compile contracts
truffle compile

# Run tests
truffle test

# Deploy to local network
truffle migrate --network development
```

### API
```bash
# Install dependencies
pip install -r api/requirements.txt

# Run API server
cd api && python app.py
# or from root
python api/app.py
```

### Frontend
```bash
# Install dependencies
cd frontend && npm install

# Dev server
cd frontend && npm run dev

# Build
cd frontend && npm run build
```

## Environment Setup

1. **Blockchain**: Start local node (Ganache/Hardhat) on `http://127.0.0.1:8545`
2. **Deploy contracts**: `truffle migrate --network development`
3. **Configure `.env`** (root):
   ```
   WEB3_PROVIDER=http://127.0.0.1:8545
   CONTRACT_ADDRESS=<deployed_contract_address>
   AUTH_TOKEN=<bearer_token>
   ```
4. **Start API**: `python api/app.py` (port 5000)
5. **Start Frontend**: `cd frontend && npm run dev` (port 3000)

## Contract Deployment Order

1. Deploy `BondToken` first (ERC20 token for bond ownership)
2. Deploy `BondTrading` with `BondToken` address as constructor argument

Migration script at `migrations/2_deploy_contracts.js` handles both.

## API Authentication

- All endpoints except `/health`, `/docs`, `/openapi.yaml` require `Authorization: Bearer <token>` header
- Token configured via `AUTH_TOKEN` env variable
- Frontend stores token in `VITE_API_TOKEN` env variable

## Testing

### Contract Tests
```bash
truffle test
# Run specific test
truffle test test/BondTradingTest.js
```

### API Tests
```bash
cd api
pytest test_*.py
```

## Key Files

| File | Purpose |
|------|---------|
| `api/app.py` | Main Flask app with all endpoints |
| `api/config.py` | Environment variable loading |
| `contracts/BondToken.sol` | ERC20 token contract |
| `contracts/BondTrading.sol` | Bond operations contract |
| `frontend/src/services/api.js` | API client with auth interceptors |
| `frontend/vite.config.js` | Proxy config for `/api` → localhost:5000 |

## Data Flow

1. Frontend → API (`/api/*` proxied to localhost:5000 via Vite)
2. API → Smart Contract (via Web3 on port 8545)
3. Bond ownership tracked via `BondToken` ERC20 balances
4. `BondTrading` contract manages bond lifecycle (issue/purchase/sell/redeem)

## Common Gotchas

- **ABI Loading**: API loads ABI from `build/contracts/BondTrading.json` at runtime; rebuild contracts after changes
- **Default Account**: API sets `w3.eth.default_account` from `OWNER_ADDRESS` env or first provider account
- **Port Conflicts**: API=5000, Frontend=3000, Blockchain=8545
- **Contract Address**: Must be set in `.env` before API can interact with contracts
- **Token Approval**: Users must `approve()` BondTrading contract to spend their tokens before purchasing bonds
