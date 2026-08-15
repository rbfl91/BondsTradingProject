# Bond Trading API

A Python REST API that provides endpoints to interact with Bond Trading smart contracts.

## Custody Model (read first — C-01)

> **This product is a single-tenant, operator-signed owner dashboard — NOT a
> multi-user self-custody marketplace.**

- There is **one operator key** (`OWNER_ADDRESS`, or the node's first account).
  Every on-chain transaction the API sends is signed by that key.
- UI "users" do **not** have independent on-chain identities. Bond positions
  and token balances belong to the operator's account; `sell` transfers a
  bookkeeping position to an address the operator chooses, and the operator
  key remains the sole signer.
- Per-user on-chain identity (user-supplied or embedded wallets) is a
  deliberate scope decision, **not** an MVP feature (audit C-01, option b).
- The same statement is exposed at runtime in `GET /status` (`model` field) and
  in `AGENTS.md`. Do not market this as a multi-user custody service without a
  corresponding architecture change.

## Economic Model (MVP scope — H-02)

> **Bookkeeping-only model. There is deliberately no pricing/coupon engine.**

- `interestRate` is recorded on the bond in **basis points** (500 = 5.00%) and
  displayed in the UI, but **no interest is accrued or paid by any engine**.
  Redemption settles the escrowed token principal at/after maturity only.
- There are **no coupons, no secondary-market price discovery, and no fees**.
  `sell` is a position transfer at face bookkeeping values; `purchase` is
  primary-market only (escrow of `BondToken` ERC20s).
- This scope lock is the closure for audit finding H-02: a market pricing /
  coupon / fee engine is out of scope for the MVP by design, and the scope is
  exposed at runtime in `GET /status` (`economic_model` field).

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
pip install -r api/requirements.txt
```

> **Authentication (H-04):** the API is fail-closed — every endpoint except
> `/health` and the docs routes requires `Authorization: Bearer <AUTH_TOKEN>`.
> The token is **never baked into the frontend bundle**:
>
> - **Dev:** the Vite dev proxy injects it server-side from `frontend/.env`
>   (`AUTH_TOKEN`, untracked — see `frontend/.env.example`).
> - **Production:** the reverse proxy / backend serving the SPA injects it
>   server-side (see Operations below).
> - **Direct API access:** the UI's “API Token” button (header) lets the
>   operator paste the token at runtime; it is kept in that browser's
>   `localStorage` only (per operator, revocable), and a 401 on any request
>   prompts for it automatically.
> - The API also refuses to start without `AUTH_TOKEN` set (generate one with
>   `openssl rand -hex 32`).

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
  -H "Authorization: Bearer $AUTH_TOKEN" \
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
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bondId": 1,
    "amount": 100
  }'
```

### Get Bond Info
```bash
curl http://localhost:5000/bond/1/info \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Testing

```bash
# Smart-contract suite (25 tests, built-in Hardhat network — no node needed)
npx hardhat test

# API suite (42 tests, mocked — no .env/node needed)
cd api && python -m pytest test_api.py

# Frontend suite (vitest)
cd frontend && npm test

# Frontend lint gate (ESLint, M-05)
cd frontend && npm run lint
```

## Operations (runbook)

**Custody model reminder (C-01):** this is an operator-signed owner dashboard.
One operator key signs every transaction; there is no multi-user self-custody.

1. **Generate the API token once per environment:** `openssl rand -hex 32`
   → root `.env` (`AUTH_TOKEN`) and, for dev, `frontend/.env` (`AUTH_TOKEN`,
   same value, used by the Vite proxy — the browser never sees it).
2. **Rotate on suspicion of exposure:** change `AUTH_TOKEN`, restart the API,
   update `frontend/.env` / the production proxy, and tell operators to
   re-enter the token via the “API Token” button (it is stored per browser).
3. **Deploying the frontend:** build (`cd frontend && npm run build`) and serve
   the static files behind the same reverse proxy as the API (or a proxy in
   front of it) that injects `Authorization: Bearer <AUTH_TOKEN>` on `/api/*`.
   Never ship a build that embeds the token.
4. **Rate limiting / proxying:** set `TRUST_PROXY=true` only behind a trusted
   reverse proxy; keep the API off the public internet otherwise.
5. **ABI artifact:** after contract changes, run `npm run build` in the repo
   root so the API can load the ABI artifact (fail-fast, M-01).

## Local Development

| Script | What it does |
|---|---|
| `start_dev.sh` | Cross-platform setup: installs root/frontend/Python deps, compiles contracts |
| `start_dev_env_simple.bat` | Windows one-shot: sets up venv, starts API + frontend (address extraction is legacy Truffle-format — see header note) |
| `migrate.bat` | Compiles + deploys contracts (`scripts/deploy.js`) to the node on 8545 |

Typical flow: `start_dev.sh` → `npx hardhat node` → `migrate.bat` → start API + frontend.
