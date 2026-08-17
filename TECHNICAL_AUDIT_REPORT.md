# Technical Audit Report — BondsTradingProject (Redbelly MVP)

**Audit date:** 2026-08-17 (fresh full-repo audit — replaces the 2026-07 report, which had been deleted from the working tree; the historical version is preserved in git at `HEAD:TECHNICAL_AUDIT_REPORT.md`)
**Scope:** Complete codebase — smart contracts, REST API, frontend, tests, infrastructure, repository hygiene
**Method:** Full static review of all tracked source files (68 files); `git` history inspection; execution of all three test suites + ESLint gate + OpenAPI validation (evidence in §4); cross-reference of contract ↔ API ↔ frontend behaviour
**Overall risk rating:** 🟡 **MEDIUM** (improved from 🔴 HIGH at the 2026-07 audit). All previously-critical contract defects are fixed and test-verified. Remaining findings are 1 High (container deployment), 5 Medium, 13 Low/Info. The product is a sound single-tenant operator dashboard; it is **not** a multi-user custody service (deliberate scope, C-01 option (a)) and the economic model is bookkeeping-only (H-02 scope lock).

---

## 1. Executive Summary

The project is a 3-tier MVP: React/Vite/Ant-Design SPA → Flask REST API → Solidity contracts (`BondToken` ERC-20 + `BondTrading`) on a local Hardhat node, plus a CoinMarketCap proxy layer for a crypto-market dashboard.

Since the 2026-07 audit, a full remediation pass was completed (commits `c59333a` → `fb6e560` → `e8a504d` → `6ceb5b1`). This audit **re-verified the current state by re-implementing the review from scratch and re-running every gate** (§4). Confirmed results:

- **All Critical 2026-07 findings are fixed and test-verified:** the escrow token lifecycle (C-02/C-02b), O(1) holder management (H-01), capped mint (C-03c), repo hygiene (C-03). 25/25 contract tests pass, including the full issue→purchase→sell→redeem cycle with balance assertions on both sides of the escrow.
- **API security posture is good:** fail-closed bearer auth with constant-time comparison, no token in the client bundle (server-side injection in dev/prod + revocable per-operator runtime token), authenticated `/status`, bounded rate-limiter and cache, log redaction targeting actual secrets, generic error messages.
- **This audit found one High-severity deployment defect** (N-01: the Docker image cannot load the contract ABI, so all chain endpoints are dead inside the container) and several Medium/Low issues in the current code (N-02…N-20, §5).

**Top 3 issues (headline findings):**

1. **Broken Docker deployment (N-01, High).** `get_contract_abi()` resolves `artifacts/` and `build/` relative to the repo root, but the Dockerfile only copies `api/` into the image. Inside the container both candidate paths miss, so `contract` stays `None` and every `/bond/*` endpoint returns 500 ("ABI artifact missing"). The containerised API serves only health/docs/crypto.
2. **Working tree diverges from the certified HEAD (N-02, Medium).** Five files are modified and two audit documents (`TECHNICAL_AUDIT_REPORT.md`, `AUDIT_CLOSURE_CERTIFICATE.md`) are **deleted** in the working tree, uncommitted. The "CI green + certified" state exists in git, not in the working copy.
3. **Owner can block redemption (N-03, Medium).** `redeemBond` requires `isActive` and `whenNotPaused`, while `deactivateBond`/`pause` are unrestricted `onlyOwner`. A paused or deactivated matured bond leaves holders unable to settle escrowed principal — unilateral owner power over user funds with no timelock or escape hatch.

---

## 2. Project Overview

### 2.1 Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ Frontend (3000)     │     │ Flask API (5000)    │     │ Hardhat node (8545)  │
│ React 18 + Vite 5   │ /api│ web3.py 7.16        │ RPC │ BondToken (ERC20)    │
│ AntD 5, Recharts    │────▶│ bearer auth (fail- │────▶│ BondTrading          │
│ 4 pages + crypto/   │proxy│ closed), rate limit│     └──────────────────────┘
│ widgets (12 modules)│ inj.│ CMC cache/limits   │
└─────────────────────┘ tok.└─────────┬──────────┘
                                      │
                                      ▼
                     CoinMarketCap Pro API / CoinDesk RSS
```

### 2.2 Directory structure (current state, all verified)

```
BondsTradingProject/
├── api/                        # Flask REST API (Python 3.12/3.13)
│   ├── app.py                 # 1,382 lines — routes, auth, rate limit, CMC proxy
│   ├── config.py              # 41 lines — env loading; validate_config() at process start
│   ├── openapi.yaml           # 774 lines — complete (all 21 endpoints), validated
│   ├── test_api.py            # 380 lines — 42 hermetic tests
│   ├── validate_openapi.py    # spec validator (deps in requirements)
│   ├── templates/docs.html    # Swagger UI (external template, raw-token auth panel)
│   ├── requirements.txt       # pinned (flask 3.0.0, web3 7.16.0, requests 2.31.0, gunicorn 22.0.0)
│   ├── requirements-dev.txt   # + pytest 8.3.5
│   └── Dockerfile             # python:3.12-slim, gunicorn, non-root, healthcheck
├── contracts/
│   ├── BondToken.sol          # 43 lines — OZ ERC20+Burnable+Ownable, MAX_SUPPLY-capped mint
│   └── BondTrading.sol        # 296 lines — escrow model, issue/purchase/sell/redeem, pause, O(1) holders
├── scripts/deploy.js          # Hardhat 3 + viem deploy (token → trading contract)
├── test/BondTrading.test.js   # 421 lines — 25 tests (node:test + viem, fixtures, time travel)
├── frontend/
│   ├── src/App.jsx            # router (5 routes, React Router v7 future flags)
│   ├── src/auth.js            # 98 lines — H-04 runtime operator token (localStorage, event channels)
│   ├── src/components/        # Header (API Token button), AuthGate (401 modal)
│   ├── src/services/api.js    # axios client + bondAPI/cryptoAPI (auth interceptors)
│   ├── src/pages/             # Dashboard (291), BondOperations (487), BondDetail (274), CryptoMarket (422)
│   └── src/pages/crypto/      # 12 focused modules (H-09 split): table, drawer, chart, watchlist,
│                              #   converter, news, trending, movers, market stats, formatters
├── hardhat.config.js          # Hardhat 3, Solidity 0.8.21, optimizer 200 runs
├── .github/workflows/ci.yml   # 3 jobs: contracts / API+OpenAPI / frontend lint+tests
├── start_dev.sh / start_dev_env_simple.bat / migrate.bat   # dev scaffolding
└── package.json               # hardhat 3.13.0 + hardhat-toolbox-viem, OZ ^5.4.0 (lockfile present)
```

### 2.3 Code volume (this audit)

| Metric | Value |
|--------|-------|
| Solidity | 339 lines (2 contracts) |
| API (app + config + tests) | 1,803 lines (1,382 in `app.py`) |
| Frontend `src/` | 3,260 lines (22 test-verified files) |
| Hardhat config + deploy + contract tests | 505 lines |
| Tracked files (git) | 68 |
| `.git` size | 2.3 MB (clean; no committed node_modules/build/dist) |
| Tests | **89 total: 25 contract + 42 API + 22 frontend** — all passing at audit time |

---

## 3. Verified Good Practices (re-confirmed this audit)

**Contracts**
- ✅ Escrow lifecycle is consistent: `purchaseBond` moves tokens into the contract via `transferFrom`; `redeemBond` burns from the **contract's own** escrow balance — the same tokens bought are the tokens settled; `sellBond` transfers only the position mapping (no token movement, no allowance needed).
- ✅ `ReentrancyGuard` on all state-changing functions; `Pausable` emergency stop; `Ownable` admin.
- ✅ O(1) holder membership (`bondHolderFlags`/`bondHolderIndex` mappings) with swap-pop pruning on zero-out — no unbounded scans in state-changing paths.
- ✅ `BondToken.mint` capped at `MAX_SUPPLY` (10× initial), `Minted` event; overflow-safe arithmetic (0.8.21 checked by default).
- ✅ `remainingSupply` decremented on primary purchase; `deactivateBond`/`activateBond` make the Inactive state reachable; `getBondsRange` batch view (max 50) for the API.
- ✅ Events for every state change; maturity gates on purchase (≤ maturity) and redeem (≥ maturity); zero-address and self-sale checks; Solidity 0.8.21 + OZ v5.

**API**
- ✅ Fail-closed auth: no `AUTH_TOKEN` → every private route 401; `python app.py` refuses to boot. `hmac.compare_digest` (constant-time). Only `/health`, `/docs`, `/openapi.yaml` are public.
- ✅ Token never in the client bundle: Vite dev proxy injects it server-side; production reverse proxy injects it; direct access uses the revocable per-operator runtime token (`AuthGate` → localStorage).
- ✅ Deterministic error semantics: payload validation before chain contact → 400 on bad input even when the chain is down; generic 500 messages (no revert/stack leakage — asserted by test).
- ✅ Gas DoS protection: `min(estimate×2, 500k)` cap on every tx.
- ✅ Bounded in-memory state: rate-limit window evicts idle IPs (10k cap); CMC cache FIFO-bounded (256 entries) with TTL.
- ✅ Proxy-aware client IP only when `TRUST_PROXY=true` (documented); `Retry-After` on 429.
- ✅ Log redaction targets real secrets (hex private keys, bearer tokens, 40-hex addresses), not arbitrary long words; rotating file handler.
- ✅ ABI loaded **only** from compiled artifacts (Hardhat `artifacts/` → legacy `build/`), fail-fast with actionable error — no inline ABI drift.
- ✅ `/crypto/*` proxy: corrected CMC URL versioning, `_parse_int_param` → 400 on bad params, cached upstream calls, empty-labelled feed on news failure (no fake data).
- ✅ CORS restricted to explicit origin list (+ `CORS_ORIGINS` override).

**Frontend**
- ✅ 401 → `markUnauthorized()` → `AuthGate` modal prompt; token stored per-browser, revocable, with in-memory fallback for private mode.
- ✅ `CryptoMarket` split into 12 focused modules; deterministic, clearly-labelled fallback chart series; watchlist persisted in localStorage.
- ✅ Navigation fixed for `BrowserRouter` (real paths, no `#/` links); buyer-address regex validation on the sell form; bps conversion at the form boundary (`%` × 100).
- ✅ ESLint 9 flat config (react + react-hooks) with 0 errors; crash page shows a generic message (no stack in DOM).

**Process**
- ✅ CI gates all three tiers + ESLint + OpenAPI validation; `workflow_dispatch` for manual re-runs.
- ✅ 89 automated tests across tiers; API suite hermetic (no `.env`/live node needed); contract suite uses fixtures + time travel.
- ✅ Repo hygiene clean: nothing build-related or dependency-related tracked; `.env` untracked (`.env.example` template present); 68 tracked files; `.git` 2.3 MB.

---

## 4. Verification Evidence (executed at audit time)

| Gate | Command | Result |
|------|---------|--------|
| Contract tests | `npx hardhat test` | **25 passing** (Hardhat 3, built-in network) |
| API tests | `api/venv/Scripts/python -m pytest test_api.py` | **42 passed** (hermetic) |
| Frontend tests | `frontend: npm test` (vitest + jsdom) | **22 passed** (4 files) |
| Frontend lint | `frontend: npm run lint` | **0 errors** |
| OpenAPI | `api/validate_openapi.py` | **spec valid** |

Environment: Node v24.19.0, Python 3.13.15 (local venv; CI uses 3.12 — both work).

---

## 5. Findings — Current Code State (2026-08-17)

New IDs (`N-xx`) to avoid collision with historical 2026-07 IDs (C-01…L-09).

### 5.1 High

| ID | Title | Where |
|----|-------|-------|
| N-01 | **Docker image cannot load the contract ABI → all chain endpoints dead in container deployments.** `get_contract_abi()` resolves candidate paths from `os.path.dirname(os.path.dirname(__file__))`, which inside the image is `/` (app.py is copied to `/app/app.py`), while the artifacts live in the repo root and are **not** copied by the Dockerfile (`COPY api/ .` only). `contract` therefore stays `None`; every `/bond/*` endpoint returns 500 `ABI artifact missing? run npm run build`. The containerised API silently serves only `/health`, `/docs`, `/openapi.yaml` and the crypto proxy. **Fix:** `COPY artifacts/ /app/artifacts/` (and `build/` if keeping the fallback) in the Dockerfile, or add an env-overridable `CONTRACT_ABI_PATH`; add a container smoke test hitting `/bond/count`. Secondary: the CMD repeats `--host=0.0.0.0` and `--bind=0.0.0.0:5000` (redundant, `--bind` wins). | `api/app.py` `get_contract_abi`; `api/Dockerfile` |

### 5.2 Medium

| ID | Title | Where |
|----|-------|-------|
| N-02 | **Working tree diverges from the certified HEAD (uncommitted changes + deleted audit docs).** `git status`: modified `.github/workflows/ci.yml` (action bumps v4→v5), `api/openapi.yaml` (bps example fix `5`→`500`), `frontend/src/pages/BondDetail.jsx` and `frontend/src/pages/CryptoMarket.jsx` (`useCallback`/deps fixes); **deleted** `TECHNICAL_AUDIT_REPORT.md` and `AUDIT_CLOSURE_CERTIFICATE.md`. The certified, CI-green state lives in git, not in the working copy — the deletion of the audit docs is a doc regression (same class as historical L-05). **Fix:** review and commit the four code/doc changes; restore (or consciously retire) the two audit documents. | repo working tree |
| N-03 | **Owner can block redemption of matured bonds (holder funds trapped).** `redeemBond` requires `b.isActive` and `whenNotPaused`, while `deactivateBond` and `pause` are unrestricted `onlyOwner` with no timelock, event-driven deadline, or holder escape. Deactivating (or pausing) a matured bond makes holders unable to settle their escrowed principal — the operator key alone controls whether funds settle. Given the documented single-tenant model this is a key-compromise/misuse risk: the owner key can lock all escrowed tokens indefinitely. **Mitigations (pick per product decision):** always allow redemption once `block.timestamp >= maturityDate` (drop `isActive`/pause from the redeem path), add a `RedemptionWindow` that opens at maturity regardless of pause, or a timelocked admin with on-chain notice events. | `contracts/BondTrading.sol` `redeemBond`, `deactivateBond`, `pause` |
| N-04 | **Silent integer truncation on API numeric inputs.** `int(amount)`, `int(face_value)`, `int(maturity_date)`, `int(interest_rate)` accept floats and truncate: `{"amount": 1.9}` → 1 is executed with a 200. Frontend `InputNumber` fields (purchase/sell/redeem amount, faceValue, supply) have no integer constraint, so the UI can produce such values. **Fix:** reject non-integral values (`value != int(value)` → 400) or use a JSON schema that requires `integer`; add `precision={0}` to the amount fields. | `api/app.py` bond POST handlers; `frontend/src/pages/BondOperations.jsx` |
| N-05 | **`wait_for_transaction_receipt` has no timeout — worker-stall risk.** All four tx endpoints block on receipt polling with web3's default unbounded wait. A tx that is never mined (mempool rejection, node restart, underpriced gas) holds a gunicorn worker indefinitely; under `--workers=2` two stuck txs take the API down. **Fix:** poll with an explicit deadline (e.g. 120–180 s) and return 504 with the `tx_hash` so the operator can check the explorer. | `api/app.py` tx endpoints |
| N-06 | **Per-request live chain probe amplifies node-outage latency.** `ensure_connection` calls `w3.is_connected()` (a live `eth_chainId` round-trip) on **every** request, and when the node is down it re-runs the full 2-provider connection attempt (30 s timeout each) on **every** request — so every request can take up to ~60 s during an outage, and a healthy-but-slow node adds one extra RPC hop to every request. **Fix:** cache connection status with a short TTL (e.g. 5–10 s) and exponential backoff on failure; or attempt reconnect only when a request actually needs the chain. | `api/app.py` `ensure_connection` |

### 5.3 Low

| ID | Title | Where |
|----|-------|-------|
| N-07 | **Rate limiter state is per-process.** With gunicorn `--workers=2` the effective limit is 2× (60 req/min/worker) and state resets on restart. Acceptable for a single-operator MVP, but document it; for public exposure move limiting to the reverse proxy. | `api/app.py`, `api/Dockerfile` |
| N-08 | **`getBondsRange` overflow edge case.** `end = start + count - 1` reverts (checked arithmetic) when `start` is close to `uint256` max. A view-function revert on crafted input; clamp `start > bondCount → return []` before the arithmetic. | `contracts/BondTrading.sol` |
| N-09 | **`getBondHolders` is unbounded.** Returns the full holder array with no paging; a bond with many holders makes `/bond/<id>/holders` gas-costly (and the API call slow). Consider `getBondHoldersRange(bondId, offset, limit)` mirroring the bond batch view. | `contracts/BondTrading.sol`, `api/app.py` |
| N-10 | **Individual view endpoints are not rate-limited.** `/bond/count`, `/bond/<id>/info`, `/bond/<id>/holders`, `/auth/check` bypass the limiter (only `/bond/all` + `/crypto/*` are limited). Cheap reads, but a single authenticated client can still amplify upstream RPC load. | `api/app.py` |
| N-11 | **Log-injection surface.** User-controlled values (`tag`, request path, upstream error text) are interpolated into log lines without sanitization; newline injection can forge log entries. The secret-redaction regex does not cover this. | `api/app.py` `_log_request`, crypto handlers |
| N-12 | **Dashboard chart mixes units on one axis.** `faceValue` (thousands) and `interestRate` (single-digit %) share one Y-axis, so the interest area is invisible. Use a dual Y-axis or separate the series. | `frontend/src/pages/Dashboard.jsx` |
| N-13 | **SPA deep-link dependency undocumented in the runbook.** `window.open('/bond/<id>')` and all client routes require a catch-all rewrite to `index.html` on the static host; the README operations section covers API token injection but not SPA fallback — deep links 404 on naive static hosting. | README, `frontend` |
| N-14 | **Config-validation asymmetry between launchers.** `validate_config()` (fail-fast on missing `AUTH_TOKEN`) runs only under `python app.py` (`__main__`). Under gunicorn (the Docker CMD) the process starts without a token and fails closed per-route (safe, but the README's "refuses to start" claim only holds for the `python` launch). | `api/app.py`, `api/Dockerfile`, README |
| N-15 | **Aged dependency pins.** `flask==3.0.0` (Oct 2023), `requests==2.31.0` (Jan 2024), `python-dotenv==1.0.0`, `gunicorn==22.0.0` — no blocking issues observed, but pins are 2+ years old; refresh with a CVE scan (also note `websockets.legacy` deprecation warnings surfacing through web3 7.16). Solidity 0.8.21 is two LTS-ish releases behind 0.8.3x (fine for an MVP). | `api/requirements.txt`, `package.json` |
| N-16 | **Portuguese antd locale with English UI.** `main.jsx` sets `ConfigProvider locale={pt_BR}` while all copy is English (post L-07) — dates, tooltips, and pagination render in Portuguese. | `frontend/src/main.jsx` |
| N-17 | **Stdlib XML parsing of external content.** `/crypto/news` parses the CoinDesk RSS with `xml.etree.ElementTree`. The URL is pinned/trusted, but stdlib guidance for untrusted XML is `defusedxml` (entity-expansion hygiene). Low risk; harden for completeness. | `api/app.py` `crypto_news` |
| N-18 | **Client/server timeout race on crypto endpoints.** The axios client timeout (30 s) equals the server-side CMC upstream timeout (30 s) — the client will often abort exactly as the server's slow upstream succeeds (then the result is cached, so the retry succeeds — still confusing UX). Set the client to 35–45 s. | `frontend/src/services/api.js` |
| N-19 | **`/crypto/listings?tag=` filters only within the fetched page.** The comment says "fetch full list then filter", but the upstream request is bounded by `limit` (default 100); a rare tag with a small limit can return zero rows that looks like a bug. Fetch a larger window when `tag` is set, or document the behaviour. | `api/app.py` `crypto_listings` |
| N-20 | **No static-analysis tooling in CI.** No Slither for the contracts, no Bandit for the API. Both are cheap to add (Slither already supports the Hardhat layout). | CI |

### 5.4 Info

| ID | Note |
|----|------|
| N-21 | **Contract constructor has no zero-address guard** for `_bondTokenAddress` — a mis-deploy yields a contract where every token operation reverts. Add `require(_bondTokenAddress != address(0))`. |
| N-22 | **No nonce management / gas strategy under concurrency.** `transact` lets web3 pick the next nonce; two concurrent writes can race (one tx replaced). Fine under the documented single-operator assumption; add explicit nonce sequencing if the API ever gains multi-operator use. No gas-price override either (node default) — acceptable on local Hardhat, must be configured for public chains. |
| N-23 | **`name`/`issuer` strings are unbounded** in `issueBond` — a very large string raises storage gas (still bounded by the 500 k cap → tx simply fails). Consider `bytes32`-ish length caps in the API. |
| N-24 | **`interestRate` semantics are now consistent end-to-end** (verified): form collects % (0–100, precision 2) → sends bps (×100) → API validates 0–10000 → contract stores uint bps → UI renders `5.00% (500 bps)`. The OpenAPI example fix (`5` → `500`) is in the working tree (N-02) — commit it. |

---

## 6. Carry-over from the 2026-07 Audit

All historical findings (C-01…L-09, incl. C-02/C-02b/C-03/C-03c, H-01…H-09, M-01…M-11, L-01…L-09) were assessed as **fixed or scope-locked** in the remediation pass (§3 above). Status is unchanged at this audit, with these confirmations:

- **C-01 (custody model)** — scope-locked option (a): single-tenant operator dashboard. Exposed at runtime (`GET /status.model`), README, AGENTS.md. Per-user wallets remain the deferred option (b).
- **H-02 (economics)** — scope-locked: bookkeeping-only; `interestRate` recorded (bps), not paid. Exposed at runtime (`GET /status.economic_model`).
- **H-04 (auth)** — verified fail-closed + constant-time + no bundle token; 7 dedicated auth tests.
- **Repo hygiene (C-03)** — verified clean this audit: `git ls-files` shows no `node_modules/`, `build/`, `frontend/dist/`, `artifacts/`, `cache/`, or `api/api.log`; `.git` is 2.3 MB. The historical blob residue (old `build/`/`dist/` blobs in pack history) remains an optional `git gc` follow-up, not a working-tree issue.
- **Open items from the closure certificate** (unchanged): per-user identity (C-01b), `app.py` module split (M-01b), pricing/coupon engine (H-02b), automated 3-tier integration test.

The full historical remediation table (finding-by-finding outcomes with commit references) is preserved at `HEAD:TECHNICAL_AUDIT_REPORT.md` in git.

---

## 7. Recommendations — Priority Matrix

### P0 — deployment correctness
1. **N-01:** fix the Docker ABI path (copy `artifacts/` into the image or env-override) + add a container smoke test.

### P1 — before any real-fund or public exposure
2. **N-02:** commit the pending changes (CI action bumps, OpenAPI bps example, `useCallback` fixes) and restore the two deleted audit documents.
3. **N-03:** make matured-bond redemption unblockable by the owner (or timelock admin actions).
4. **N-05 + N-06:** bound receipt waiting and connection probing (worker-stall protection under node outage).
5. **N-04:** reject non-integral numeric inputs (silent truncation → 400).

### P2 — hardening & quality
6. N-07…N-11: document per-worker rate limits; clamp `getBondsRange` start; holder-list paging; rate-limit the remaining GETs; sanitize log interpolation.
7. N-12…N-19: dashboard dual-axis, SPA-fallback runbook note, gunicorn startup validation, dependency refresh, antd locale, `defusedxml`, client timeout skew, `tag` filtering behaviour.
8. N-20: add Slither + Bandit to CI.
9. Carry-over: 3-tier integration test; `app.py` split; per-user identity decision.

---

## 8. Appendices

### Appendix A — Endpoint Inventory (verified against `app.py` routes and `openapi.yaml`)

| Endpoint | Auth | In OpenAPI | Rate-limited | Notes |
|----------|------|-----------|--------------|-------|
| `GET /health` | no | ✅ | no | |
| `GET /status` | ✅ | ✅ | no | includes `model`, `economic_model` scope statements |
| `GET /contract/address` | ✅ | ✅ | no | |
| `GET /auth/check` | ✅ | ✅ | no | token validation for the docs panel |
| `POST /bond/issue` | ✅ | ✅ | ✅ | owner-only on-chain; bps validated 0–10000 |
| `POST /bond/purchase` | ✅ | ✅ | ✅ | escrows tokens (1 bond = 1 token, 18 dec) |
| `POST /bond/sell` | ✅ | ✅ | ✅ | position-only transfer |
| `POST /bond/redeem` | ✅ | ✅ | ✅ | burns contract escrow at/after maturity |
| `GET /bond/count` | ✅ | ✅ | ❌ (N-10) | |
| `GET /bond/all` | ✅ | ✅ | ✅ | batched via on-chain `getBondsRange` |
| `GET /bond/{id}/info` | ✅ | ✅ | ❌ (N-10) | |
| `GET /bond/{id}/holders` | ✅ | ✅ | ❌ (N-09/N-10) | unbounded list (N-09) |
| `GET /bond/{id}/holder/{addr}/amount` | ✅ | ✅ | ❌ (N-10) | |
| `GET /crypto/listings` | ✅ | ✅ | ✅ | `tag` filter caveat (N-19) |
| `GET /crypto/ohlc` | ✅ | ✅ | ✅ | |
| `GET /crypto/supply` | ✅ | ✅ | ✅ | |
| `GET /crypto/movers-gainers` | ✅ | ✅ | ✅ | |
| `GET /crypto/global-metrics` | ✅ | ✅ | ✅ | |
| `GET /crypto/convert` | ✅ | ✅ | ✅ | |
| `GET /crypto/news` | ✅ | ✅ | ✅ | cached 15 min; empty+labelled on failure |
| `GET /crypto/trending` | ✅ | ✅ | ✅ | CMC v2 with listings fallback |
| `GET /docs`, `GET /openapi.yaml` | no | — | no | by design |

### Appendix B — Version Pinning (verified)

| Component | Version | Pinned |
|-----------|---------|--------|
| Hardhat / toolbox-viem / viem | 3.13.0 / 5.0.7 / (transitive) | ✅ package-lock |
| Solidity / OpenZeppelin | 0.8.21 / ^5.4.0 | range (resolved via lockfile) |
| Flask / web3 / requests / dotenv / gunicorn | 3.0.0 / 7.16.0 / 2.31.0 / 1.0.0 / 22.0.0 | ✅ (aged — N-15) |
| React / Vite / AntD / axios / react-router | 18.2 / 5.0.8 / 5.12 / 1.6.2 / 6.21 | ✅ package-lock |
| Node (CI / local) | 22 (CI) / 24.19 (local, works) | ✅ |
| Python (CI / local) | 3.12 / 3.13.15 (both work) | ✅ |

### Appendix C — Test Matrix (executed at audit time)

| Suite | Count | Scope highlights |
|-------|-------|------------------|
| Contract (`test/BondTrading.test.js`) | 25 | full escrow lifecycle with balance assertions both sides, holder pruning, mint cap, pause, deactivate/reactivate, allowance revocation, `getBondsRange` windows, events, reverts |
| API (`api/test_api.py`) | 42 | auth (fail-closed, 401s), validation 400s, tx flow ordering, generic-error leakage check, CMC URL construction, rate-limit 429 + `Retry-After`, news-failure semantics, OpenAPI/docs serving |
| Frontend (vitest) | 22 | auth module (7: store/clear, 401 + prompt channels), formatter functions (7), `services/api` mapping (6), Header labels (2) |

---
*Report generated 2026-08-17 by full-repo static analysis plus execution of all test gates. Line numbers refer to the working-tree state at audit time (which includes the uncommitted changes listed in N-02). Re-verify after the working tree is committed.*
