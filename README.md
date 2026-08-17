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

> **Redemption is owner-unblockable (N-03):** once a bond has matured, holders
> can redeem regardless of `pause`/`deactivateBond` — the operator key can no
> longer trap escrowed principal. Pause/deactivation still block *new*
> purchases and secondary sales.
>
> **Transaction timeout (N-05):** the four tx endpoints wait at most ~180 s for
> the receipt; a never-mined tx returns **504 with the `tx_hash`** so you can
> check the explorer (the worker is released instead of stalling).
>
> **Numeric inputs (N-04):** `amount`/`faceValue`/`maturityDate`/
> `interestRate`/`supply` must be whole numbers — fractional values are
> rejected with 400 (no silent truncation). `name`/`issuer` are capped at
> 64 characters (N-23).

### Bond Information
- `GET /bond/<bond_id>/info` - Get bond information
- `GET /bond/<bond_id>/holders` - Get bond holders (paged: `?offset=&limit=`, capped at 1000/page — N-09)
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
> closed. **Every authenticated endpoint is rate-limited** (per-IP, 30 req/min,
> `Retry-After` header on 429); set `TRUST_PROXY=true` only behind a trusted
> reverse proxy.
>
> **Rate limiter is per-process (N-07):** with gunicorn `--workers=2` the
> effective limit is 2× (per worker) and state resets on restart. Acceptable
> for the single-operator MVP; for public exposure move limiting to the reverse
> proxy and run one worker (or a shared store).
>
> **`/crypto/listings?tag=` (N-19):** the tag filter runs client-side over a
> wider upstream window (≥1000 coins) — a rare tag can still return zero rows
> if it is outside the top ~1000 by rank.

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
>   `openssl rand -hex 32`) — for **both** launchers: `python app.py`
>   (`validate_config()` in `__main__`) and gunicorn (`api/gunicorn.conf.py`
>   `on_starting` hook — N-14).

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
# Smart-contract suite (31 tests, built-in Hardhat network — no node needed)
npx hardhat test

# API suite (60 tests, mocked — no .env/node needed)
cd api && python -m pytest test_api.py

# Frontend suite (vitest)
cd frontend && npm test

# Frontend lint gate (ESLint, M-05)
cd frontend && npm run lint

# OpenAPI spec validation (openapi-spec-validator)
python api/validate_openapi.py

# Static analysis (N-20 — also run in CI)
slither . --fail-high        # contracts (Slither supports the Hardhat layout)
bandit api/app.py api/config.py api/validate_openapi.py api/gunicorn.conf.py
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

   **N-13 — SPA catch-all rewrite (required for deep links):** every non-API
   path must serve `index.html` so client-side routing (`/bond/:id`,
   `/crypto`) survives refresh/direct access:
   ```nginx
   # nginx
   location / { try_files $uri /index.html; }
   location /api/ { proxy_pass http://127.0.0.1:5000/; }
   ```
   ```json
   // Vercel vercel.json
   { "rewrites": [{ "source": "/(?!api/|assets/|index.html|openapi.yaml|docs).*", "destination": "/index.html" }] }
   ```
   ```
   # Netlify _redirects
   /*  /index.html  200
   ```
4. **Rate limiting / proxying:** set `TRUST_PROXY=true` only behind a trusted
   reverse proxy; keep the API off the public internet otherwise. The built-in
   limiter is per-process (N-07) — for public exposure move limiting to the
   proxy and run one worker.
5. **ABI artifact:** after contract changes, run `npm run build` in the repo
   root so the API can load the ABI artifact (fail-fast, M-01/N-01). In the
   Docker image the artifact ships at `/app/artifacts/` and the build context
   must be the repo root (see `api/Dockerfile`); `CONTRACT_ABI_PATH` / `CONTRACT_ABI` env vars override the path.
6. **Nonce & gas (N-22):** the API signs with a single owner key and uses
   provider-default gas estimation. Fine for the single-operator MVP, but
   queued txs bump the nonce and the next send can fail — wait for the pending
   tx to mine (or replace it with a higher gas price), then re-send. A
   multi-user deployment needs an explicit nonce manager and gas-price
   strategy.

## Local Development

| Script | What it does |
|---|---|
| `start_dev.sh` | Cross-platform setup: installs root/frontend/Python deps, compiles contracts |
| `start_dev_env_simple.bat` | Windows one-shot: sets up venv, starts API + frontend (address extraction is legacy Truffle-format — see header note) |
| `migrate.bat` | Compiles + deploys contracts (`scripts/deploy.js`) to the node on 8545 |

Typical flow: `start_dev.sh` → `npx hardhat node` → `migrate.bat` → start API + frontend.
