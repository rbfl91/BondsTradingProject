# Bond Trading Project - Agent Instructions

## Architecture

- **Frontend**: React + Vite + Ant Design (`frontend/`)
- **API**: Flask REST API (`api/app.py`)
- **Smart Contracts**: Solidity + Hardhat 3 (`contracts/`, `scripts/`, `test/`)
- **Blockchain**: Web3 integration with local Ethereum node (Hardhat node on port 8545)

## Package Boundaries

| Directory | Purpose |
|-----------|---------|
| `api/` | Flask REST API (port 5000) |
| `frontend/` | React SPA (dev server port 3000) |
| `contracts/` | Solidity contracts (BondToken, BondTrading) |
| `scripts/` | Hardhat deployment scripts (`deploy.js`) |
| `test/` | Hardhat 3 contract tests (node:test + viem, `*.test.js`) |
| `artifacts/` | Hardhat compiled artifacts (contains ABI) |

## Commands

### Smart Contracts (Hardhat 3)
```bash
# Compile contracts
npm run build            # = npx hardhat build

# Run tests (built-in Hardhat network, no external node needed)
npm test                # = npx hardhat test

# Start a local node on 8545
npm run node            # = npx hardhat node

# Deploy to local node (external network needs PRIVATE_KEY env var)
npm run deploy          # = npx hardhat run scripts/deploy.js --network development
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

# Tests (vitest)
cd frontend && npm test
```

## Environment Setup

1. **Blockchain**: Start local node (`npx hardhat node`) on `http://127.0.0.1:8545`
2. **Deploy contracts**: `npm run deploy` (node must be running on 8545; set `PRIVATE_KEY` for external nodes)
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

Deployment script at `scripts/deploy.js` handles both.

## API Authentication

- All endpoints except `/health`, `/docs`, `/openapi.yaml` require `Authorization: Bearer <token>` header
- Token configured via `AUTH_TOKEN` env variable
- Frontend stores token in `VITE_API_TOKEN` env variable

## Testing

### Contract Tests
```bash
npx hardhat test
# Run a single file
npx hardhat test test/BondTrading.test.js
```

### API Tests
```bash
cd api
python -m pytest test_api.py   # hermetic: no .env / live node required
```

### Frontend Tests
```bash
cd frontend && npm test
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
| `hardhat.config.js` | Hardhat 3 config (solidity 0.8.21, networks) |
| `scripts/deploy.js` | Deployment script (replaces Truffle migration) |

## Data Flow

1. Frontend → API (`/api/*` proxied to localhost:5000 via Vite)
2. API → Smart Contract (via Web3 on port 8545)
3. `purchaseBond` escrows `BondToken` ERC20s into the contract; `redeemBond`
   burns them from that escrow at maturity; `sellBond` transfers the
   position mapping only (no token transfer)
4. `BondTrading` contract manages the bond lifecycle (issue/purchase/sell/redeem)

## Common Gotchas

- **ABI Loading**: API loads ABI from `artifacts/contracts/BondTrading.sol/BondTrading.json` (Hardhat) at runtime, falling back to legacy `build/contracts/BondTrading.json`; rebuild contracts after changes
- **Default Account**: API sets `w3.eth.default_account` from `OWNER_ADDRESS` env or first provider account
- **Port Conflicts**: API=5000, Frontend=3000, Blockchain=8545
- **Contract Address**: Must be set in `.env` before API can interact with contracts (lowercase is fine — the API normalizes to checksum at startup)
- **Token Approval**: Users must `approve()` the BondTrading contract to spend their tokens before purchasing bonds
- **Interest Rate Semantics**: `interestRate` is in **basis points** everywhere (API validates 0–10000; 500 = 5.00%). The frontend form collects a percent and multiplies by 100 before sending
- **Auth is fail-closed**: with no `AUTH_TOKEN` configured, every endpoint except `/health` (and docs routes) returns 401
