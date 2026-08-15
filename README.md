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
- `GET /health` - Health check (only unauthenticated endpoint)
- `GET /status` - API status information
- `GET /contract/address` - Get contract address
- `GET /docs` - Swagger UI (browser); `GET /openapi.yaml` - spec

### Bond Operations
- `POST /bond/issue` - Issue a new bond (`interestRate` is in **basis points**: `500` = 5.00%)
- `POST /bond/purchase` - Purchase a bond (escrowed; primary market only)
- `POST /bond/sell` - Sell a bond position to another address (no token transfer)
- `POST /bond/redeem` - Redeem at/after maturity (burns the escrowed tokens)

### Bond Information
- `GET /bond/<bond_id>/info` - Get bond information
- `GET /bond/<bond_id>/holders` - Get list of bond holders
- `GET /bond/<bond_id>/holder/<holder_address>/amount` - Get amount of bonds held by a specific address
- `GET /bond/count` - Total number of bonds issued
- `GET /bond/all` - All bonds in one call (batch view — preferred by the frontend)

### Crypto Market (CoinMarketCap proxy, requires `COINMARKETCAP_API_KEY`)
- `GET /crypto/listings` - Top cryptocurrencies (USD-converted)
- `GET /crypto/ohlc` - OHLC data (`symbol`, `days`, optional `start`/`end`)
- `GET /crypto/supply` - Supply data
- `GET /crypto/movers-gainers` - Top movers and gainers
- `GET /crypto/global-metrics` - Global market metrics
- `GET /crypto/convert` - Convert amount to USD (`symbol`, `amount`, `convert`)
- `GET /crypto/news` - News feed (CoinDesk; empty + `source: "unavailable"` on failure)
- `GET /crypto/trending` - Trending cryptocurrencies

> Authentication: every endpoint except `/health` (and the docs routes) requires
> `Authorization: Bearer <AUTH_TOKEN>`. Without a configured token the API fails
> closed. Rate-limited (per-IP, `Retry-After` header on 429); set `TRUST_PROXY=true`
> only behind a trusted reverse proxy.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Start a local blockchain (from the repo root):
```bash
npx hardhat node
```

3. Deploy the BondToken and BondTrading contracts (second terminal):
```bash
npm run deploy    # Windows shortcut: migrate.bat
```

4. Update `.env` file with contract details:
```env
WEB3_PROVIDER=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x...
```

5. Run the API:
```bash
cd api && python app.py
```

> Full-stack convenience: `./start_dev.sh` (bash) or `start_dev_env_simple.bat` (Windows)
> handles dependency installation; `migrate.bat` handles compile + deploy.
> The deploy script prints the contract address **checksummed**, ready to paste into `.env`.

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
```

## Testing

```bash
# Smart-contract suite (25 tests, built-in Hardhat network — no node needed)
npx hardhat test

# API suite (42 tests, mocked — no .env/node needed)
cd api && python -m pytest test_api.py

# Frontend suite (vitest)
cd frontend && npm test
```

## Local Development

| Script | What it does |
|---|---|
| `start_dev.sh` | Cross-platform setup: installs root/frontend/Python deps, compiles contracts |
| `start_dev_env_simple.bat` | Windows one-shot: sets up venv, starts API + frontend (address extraction is legacy Truffle-format — see header note) |
| `migrate.bat` | Compiles + deploys contracts (`scripts/deploy.js`) to the node on 8545 |

Typical flow: `start_dev.sh` → `npx hardhat node` → `migrate.bat` → start API + frontend.
