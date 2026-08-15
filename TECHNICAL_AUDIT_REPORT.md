# Technical Audit Report — BondsTradingProject (Redbelly MVP)

**Audit date:** 2026-07 (fresh full-repo audit, supersedes prior report)
**Scope:** Complete codebase — smart contracts, REST API, frontend, tests, infrastructure, repository hygiene
**Method:** Manual static review of all tracked source files; `git` history inspection; cross-reference of contract ↔ API ↔ frontend behaviour
**Overall risk rating:** 🔴 **HIGH** (MVP-grade; not safe for real funds as-is)

---

## 1. Executive Summary

The project is a 3-tier MVP: a React/Vite/Ant-Design SPA → a Flask REST API → Solidity
contracts (BondToken ERC-20 + BondTrading) on a local Ganache node. A CoinMarketCap
proxy layer adds a crypto-market dashboard.

A previous audit round (commit `c59333a`) fixed a batch of API-side issues (CORS,
constant-free auth token, debug mode, gas caps, log redaction, mock-based tests).
However, this fresh audit found that **the core architectural and economic design
flaws remain**, and several **new functional bugs** exist:

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | Open |
| High | 6 | Open |
| Medium | 9 | Open |
| Low | 9 | Open |
| Info/Good practice | 8 | — |

**Top 3 issues (headline findings):**

1. **Single-key custodial design (C-01).** The API signs *every* transaction with one
   default account (`OWNER_ADDRESS` or the first provider account). End users of the
   UI have no on-chain identity: "user" purchases/sales/redeems actually move the
   *owner's* tokens and update internal mappings. The system is a custody wallet with
   a GUI, not a decentralized bond marketplace.
2. **Broken token lifecycle (C-02).** `purchaseBond` locks user tokens *inside the
   contract* (`transferFrom(user, contract)`), but `redeemBond` burns from the
   *user's wallet* (`burnFrom(user)`). In the normal flow the user's balance no
   longer contains the purchased tokens, so redemption reverts (or silently burns
   unrelated tokens) while the contract's token balance grows forever — a value trap.
3. **Repository hygiene (C-03).** 424 `node_modules/` files, compiled `build/`
   artifacts and the `frontend/dist/` output are **committed to git**, despite a
   `.gitignore` that should exclude them. An unrelated stray `node_modules/adm-zip`
   also sits in the parent folder.

---

## 2. Project Overview

### 2.1 Architecture

```
┌────────────────────┐      ┌────────────────────┐      ┌─────────────────────┐
│ Frontend (3000)    │ ───▶ │ Flask API (5000)   │ ───▶ │ Ganache (8545)      │
│ React 18 + Vite 5  │  /api│ web3.py v6.15      │  RPC │ BondToken (ERC20)   │
│ AntD 5, Recharts   │ proxy│ + CMC proxy        │      │ BondTrading         │
└────────────────────┘      └────────────────────┘      └─────────────────────┘
                                       │
                                       ▼
                        CoinMarketCap Pro API / CoinDesk RSS
```

### 2.2 Directory structure (current state)

```
BondsTradingProject/
├── api/                       # Flask REST API (Python 3)
│   ├── app.py                # 1,446 lines — monolith: routes, auth, rate limit, CMC proxy, inline ABI
│   ├── config.py             # 29 lines — env loading (fails fast if AUTH_TOKEN missing ✅)
│   ├── openapi.yaml          # 453 lines — STALE (missing /bond/all, /crypto/*)
│   ├── test_api.py           # 300 lines — 34 mocked tests
│   ├── validate_openapi.py   # validator (deps not in requirements)
│   ├── requirements.txt      # pinned: flask 3.0, web3 6.15, etc. ✅
│   └── Dockerfile            # flask run (not production-grade)
├── contracts/
│   ├── BondToken.sol         # 22 lines — OZ ERC20+Burn+Ownable, uncapped mint
│   └── BondTrading.sol       # 185 lines — issue/purchase/sell/redeem, pause, events
├── migrations/2_deploy_contracts.js   # deploys token then trading contract
├── test/BondTradingTest.js   # 15 cases (happy path, errors, pause, redeem)
├── frontend/
│   ├── src/App.jsx           # router (BrowserRouter)
│   ├── src/services/api.js   # axios client + bondAPI/cryptoAPI
│   ├── src/pages/Dashboard.jsx      # 288 lines
│   ├── src/pages/BondOperations.jsx # 490 lines
│   ├── src/pages/BondDetail.jsx     # 275 lines
│   ├── src/pages/CryptoMarket.jsx   # 1,169 lines — oversized
│   └── dist/                # ⚠ committed build output (1.6 MB)
├── build/contracts/*.json    # ⚠ committed compile artifacts (10 files)
├── node_modules/             # ⚠ 424 committed files (OpenZeppelin)
├── docker-compose.yml        # ganache + api + frontend
├── fix.ps1 / fix_spins.js / fix_spins.py / check_lines.js / inspect.js
│                            # ⚠ one-off debug scripts committed
└── truffle-config.js         # dev network 127.0.0.1:8545
```

### 2.3 Code volume

| Metric | Value |
|--------|-------|
| Source lines (py/jsx/js/sol/html/css, excl. deps & dist) | ~5,666 |
| Largest file | `api/app.py` — 1,446 lines |
| API tests | 34 (all mock-based; no integration tests) |
| Contract tests | 15 (Truffle) |
| Frontend tests | **0** |
| Lint config (frontend) | **none** |
| Commits | 8 (initial → security remediation) |

---

## 3. Findings by Severity

Legend: 🆕 = newly discovered in this audit · 🔁 = carried over / still open

| ID | Sev | Title | Where |
|----|-----|-------|-------|
| C-01 | Critical 🆕 | Single default account signs all txs — no user identity (custodial design) | `api/app.py` `_set_default_account`, all POST endpoints |
| C-02 | Critical 🔁 | Token lifecycle broken: purchase locks tokens in contract, redeem burns from user wallet | `BondTrading.sol` L116-146 |
| C-03 | Critical 🆕 | `node_modules/`, `build/`, `frontend/dist/` committed to git | repo |
| H-01 | High 🔁 | Unbounded gas loops over `bondHolders` arrays; `MAX_GAS_LIMIT` defined but unused | `BondTrading.sol` L118-137, L155-166 |
| H-02 | High 🔁 | No pricing/interest/fees model; `interestRate` and `isActive` are decorative | `BondTrading.sol` |
| H-03 | High 🆕 | Unbounded in-memory state: rate-limit buckets and CMC cache never evicted → memory DoS | `api/app.py` `_rate_limit_window`, `_cmc_cache` |
| H-04 | High 🔁 | Single shared static bearer token embedded in client bundle; non-constant-time compare | `services/api.js`, `app.py` `ensure_connection` |
| H-05 | High 🆕 | Unauthenticated `/status` & `/contract/address` leak infra state (contract address, CMC key status, cache size) | `app.py` `exempt_paths` |
| H-06 | High 🆕 | Crypto proxy bugs: `/crypto/convert` & `/crypto/trending` double-version the URL (`/v1/v1/...`, `/v1/v2/...`) → 404; `int()` on query params unhandled → 500 | `app.py` `_CMC_BASE_URL`, `crypto_convert`, `crypto_trending`, `crypto_listings` |
| H-07 | High 🆕 | Dashboard row click uses hash URL `#/bond/:id` but app uses `BrowserRouter` → opens Dashboard, never Bond Detail | `Dashboard.jsx` L237 |
| H-08 | High 🆕 | OpenAPI spec out of sync: missing `/bond/all`, all `/crypto/*` endpoints | `api/openapi.yaml` |
| M-01 | Medium | Monolithic `app.py` (1,446 lines) with ~330-line inline ABI duplicating the contract (drift risk) | `app.py` `get_contract_abi` |
| M-02 | Medium | `/bond/all` performs N sequential RPC `getBondInfo` calls; no batch view on-chain | `app.py` `get_all_bonds` |
| M-03 | Medium | Rate limit keyed on `request.remote_addr` (proxy-blind) and shared across *all* endpoints (30/min) | `app.py` `_check_rate_limit` |
| M-04 | Medium | `/crypto/news` fetches external RSS uncached (15 s timeout per request) and falls back to **hardcoded fake news** presented as live | `app.py` `crypto_news` |
| M-05 | Medium | No frontend tests, no ESLint; 401 interceptor is a no-op | `frontend/`, `services/api.js` |
| M-06 | Medium | Tests are env-fragile: `config.py` raises at import if `AUTH_TOKEN` unset; `api/__init__.py` imports the app eagerly | `config.py`, `test_api.py` |
| M-07 | Medium | README truncated mid-`curl`; crypto endpoints & docker flow undocumented | `README.md` |
| M-08 | Medium | Dockerfile runs `flask run` as root (comment claims gunicorn, not installed); compose sets `DEBUG=true` and a fallback token | `api/Dockerfile`, `docker-compose.yml` |
| M-09 | Medium | One-off debug/fix scripts committed (`fix.ps1`, `fix_spins.*`, `check_lines.js`, `inspect.js`, `broswerConsolerIssues.jpg`) | repo root |
| M-10 | Medium | Truffle not pinned anywhere (assumed via `npx`); Truffle is end-of-life — Hardhat migration advised; root `package.json` has no scripts | `package.json`, `start_dev.sh` |
| M-11 | Medium | `validate_openapi.py` requires `pyyaml` + `openapi-spec-validator`, neither in `requirements.txt`; `interestRate` semantics inconsistent (form 0-100% vs README example `500`) | `requirements.txt`, `BondOperations.jsx` L155 |
| L-01 | Low | Duplicate `w3 = None; contract = None` declarations (top and middle of `app.py`) | `app.py` L74, L380 |
| L-02 | Low | `console.log('App rendering...')` left in `App.jsx` | `App.jsx` L14 |
| L-03 | Low | `remaining` returned by rate limiter but never used in handlers | `app.py` |
| L-04 | Low | Untracked `frontend/public/duckhunt-bonds.html` (658-line canvas game) unrelated to product | `frontend/public/` |
| L-05 | Low | `TECHNICAL_AUDIT_REPORT.md` deleted in working tree (present in git) — doc regression | git status |
| L-06 | Low | Stray `node_modules/` (adm-zip) in parent folder `Redbelly MVP/` | repo parent |
| L-07 | Low | Mixed-language UI: "Operações" menu item vs English everywhere else | `Header.jsx` |
| L-08 | Low | `.gitignore` entries (`/build`, `/node_modules`, `truffle-config.js`) ineffective — files added before the ignore rules; log-redaction regex `\w{20,}` over-redacts | `.gitignore` |
| L-09 | Low | Swagger auth panel requires user to paste full `Bearer <token>` string by hand; docs HTML served inline (10 KB string in `app.py`) | `app.py` `swagger_ui` |

---

## 4. Smart Contract Audit

### 4.1 BondToken.sol (22 lines)

| ID | Sev | Finding |
|----|-----|---------|
| C-03c | Critical | `mint(to, amount)` is `onlyOwner` with **no cap or total-supply limit** — the owner can inflate supply without bound. Add `MAX_SUPPLY` / mint schedule, or remove minting entirely. |
| I-01 | Info | 1,000,000 tokens (18 decimals) minted to the deployer in the constructor; fine for an MVP, but the token is a single-pool instrument shared by all bonds (no per-bond token, no metadata) — limits composability. |

### 4.2 BondTrading.sol (185 lines)

Good practices found:
- ✅ `ReentrancyGuard` on all state-changing functions, `Pausable` emergency stop, `Ownable`
- ✅ Events emitted for every state change (`BondIssued/Purchased/Sold/Redeemed`)
- ✅ Maturity checks: no purchase after maturity, no redeem before maturity
- ✅ Solidity 0.8.21 built-in overflow protection; zero-address and self-sale checks

Open issues:

| ID | Sev | Finding | Detail |
|----|-----|---------|--------|
| C-02 | Critical | **Broken redemption flow.** `purchaseBond` executes `bondToken.transferFrom(msg.sender, address(this), _amount)` — tokens move *into the contract*. `redeemBond` executes `bondToken.burnFrom(msg.sender, _amount)` — burns from the *user's wallet*, requiring the user to (a) still hold tokens and (b) keep a live allowance. In the normal lifecycle the user's tokens are already in the contract, so redemption reverts; if the user happens to hold *other* tokens, the wrong assets are burned. Meanwhile the contract's token balance grows monotonically and is never returned or burned → **value trap**. Fix: burn from the contract's balance (`burn(_amount)` after the tokens are in the contract) or restructure so redemption is a transferFrom of the user's tokens at maturity. |
| C-02b | High | **Stale holder lists.** `bondHolders[bondId]` is append-only; users whose balance reaches 0 (sell/redeem) remain listed by `getBondHolders`. The UI "holders" table will show zero-balance holders forever. |
| H-01 | High | **Gas DoS via unbounded loops.** `purchaseBond`/`sellBond` linearly scan `bondHolders[bondId]` (unbounded push) to check membership. Once a bond has ~tens of holders the scan can approach the block gas limit; a malicious issuer buying through many accounts can brick a bond. Use a `mapping(address => bool)` holder flag instead of array scanning. `MAX_GAS_LIMIT` constant (500k) is declared but **never used** in the contract. |
| H-02 | High | **No economic model.** Bonds are exchanged 1:1 at face value with no market price, no fees, and `interestRate` is stored but **never paid** (no coupon function). `isActive` is never set to `false` by any function (no `deactivateBond`), so the "Inactive" state the UI renders is unreachable. `totalSupply` is set at issue and never decremented, so the `Insufficient bond supply` check compares against the original issue size forever and can never fail for repeated purchases. This is a *bookkeeping* system, not a trading system. |
| M-02c | Medium | No batch view (`getBonds(count)`) — forces the API to make N sequential RPC calls (`/bond/all`), each a full contract read. |
| L-c1 | Low | `sellBond` requires `bondToken.balanceOf(msg.sender) >= _amount` "for fees" — but no fee mechanism exists; combined with C-02 this makes selling impossible for a typical user whose tokens are locked in the contract. |

---

## 5. API (Backend) Audit

`api/app.py` — 1,446 lines, single module.

### 5.1 Security

| ID | Sev | Finding | Detail |
|----|-----|---------|--------|
| C-01 | Critical | **Single signing key = custodial API.** `_set_default_account` picks `OWNER_ADDRESS` or `accounts[0]`; every `issueBond/purchaseBond/sellBond/redeemBond` tx is signed by that one key. There is no per-user wallet, no per-user auth-to-address mapping, and `sellBond`'s "buyer" is just an address argument — the *buyer* receives no tokens and no bond balance (the internal mapping credits the *owner* as the new holder). Real fund flows would move the API operator's assets for any authenticated caller. This is the defining architectural risk of the MVP. |
| H-04 | High | **Shared static token in the client bundle.** `VITE_API_TOKEN` is baked into the JS at build time (acknowledged in a code comment). Anyone who can read the bundle (any user of the deployed SPA) can call write endpoints. The comparison `auth_header != expected` is also not constant-time (timing side-channel, low practical risk on LAN). For any real deployment: per-user tokens or OAuth-style flow, server-held signing, HSTS/HTTPS. |
| H-05 | High | **Information disclosure without auth.** `exempt_paths` includes `/status` and `/contract/address`. `/status` reveals: deployed contract address, blockchain connectivity, CMC key configuration, cache size, rate-limit policy. Either authenticate these or strip sensitive fields. |
| H-03 | High | **Unbounded in-memory state.** `_rate_limit_window` keeps a timestamp list per IP with no eviction of *inactive* IPs (only per-entry window pruning) → an attacker cycling source IPs grows the dict forever (memory exhaustion). `_cmc_cache` has TTL checks on read but no periodic purge either. Add LRU/max-size caps and idle-IP eviction. |
| M-03 | Medium | **Rate-limit effectiveness is poor in the actual deployment topology.** Keyed on `request.remote_addr`: through the Vite dev proxy or Docker, *all* clients appear as one IP (shared 30/min pool → false 429s for the dashboard, which fires ~6-8 requests on load); behind a real proxy, the real client IP is invisible (attacker-friendly). GET endpoints (`/bond/*`, `/status`) are not rate-limited at all while `/bond/all` can trigger N upstream RPC calls. |
| M-06 | Medium | **Env-fragile import chain.** `config.py` raises `RuntimeError` at import time if `AUTH_TOKEN` is missing; `api/__init__.py` imports `app` eagerly, and test fixtures patch `api.app.AUTH_TOKEN` *after* import — so the suite only runs where a `.env` happens to define the token. No CI config exists to guarantee this. |

### 5.2 Correctness / bugs

| ID | Sev | Finding | Detail |
|----|-----|---------|--------|
| H-06 | High | **Double version prefix in CMC proxy.** `_CMC_BASE_URL = 'https://pro-api.coinmarketcap.com/v1'`, but `crypto_convert` calls `_call_cm_api('/v1/currency/convert')` and `crypto_trending` calls `('/v2/trending')` → resolved URLs `.../v1/v1/currency/convert` and `.../v1/v2/trending` → 404 from CMC. The converter and trending widgets silently fail. |
| H-06b | High | **Unparsed query params → 500.** `crypto_listings` does `int(request.args.get('limit', 100))` / `int(start)` with no error handling — `?limit=abc` raises `ValueError` inside the handler → 500 (and the same pattern in `/crypto/ohlc` for `start`). |
| M-04 | Medium | **`/crypto/news` is unreliable and misleading.** Every request does an uncached CoinDesk RSS fetch with a 15 s timeout (no client-side abort; request can stall the worker), and on any failure returns 8 **hardcoded fake news items** (e.g. "Bitcoin Surges Past Key Resistance...") labelled as live news. Cache the feed (e.g. 15 min) and either omit the section or clearly label the fallback. |
| H-08 | High | **OpenAPI spec is stale.** Spec is missing `/bond/all` and all eight `/crypto/*` endpoints; its `ApiStatusResponse` example and endpoint list predate the crypto features. `validate_openapi.py` exists but its deps (`pyyaml`, `openapi-spec-validator`) aren't in `requirements.txt`, so it can't run in a clean env. |
| M-01 | Medium | **~330-line inline ABI fallback** in `get_contract_abi()` duplicates `BondTrading.sol` by hand. Any contract change must be mirrored in two places; a silent drift would only surface as runtime reverts. Fail fast if the `build/contracts/BondTrading.json` artifact is missing instead. |
| M-02 | Medium | **`/bond/all` is still N+1 at the RPC level** (fixed in the frontend, not the API): it loops `getBondInfo(i)` for i in 1..N, each an individual JSON-RPC round trip. Sequential and unbounded. |
| L-09 | Low | The `/docs` Swagger page inlines ~10 KB of HTML/JS in a Python string; the "Validate token" button expects the user to hand-type the `Bearer ` prefix. Minor UX friction. |

### 5.3 Good practices (kept from prior remediation)

- ✅ `AUTH_TOKEN` mandatory — process refuses to boot without it (`config.py`)
- ✅ CORS restricted to explicit origin list (+ `CORS_ORIGINS` override)
- ✅ `debug` mode off by default, env-controlled; port configurable
- ✅ Rotating file logging (10 MB × 5) with regex redaction of keys/addresses
- ✅ Gas protection: 2× estimate, hard cap 500k, on every tx
- ✅ Rate limiting present on write + crypto endpoints (flawed topology — see M-03)
- ✅ Generic error messages (no revert/stack leakage in responses)
- ✅ Pinned `requirements.txt`

---

## 6. Frontend Audit

| ID | Sev | Finding | Detail |
|----|-----|---------|--------|
| H-07 | High | **Broken navigation: hash URL under BrowserRouter.** `Dashboard.jsx` L237: `window.open('#/bond/' + id, '_blank')`. With `BrowserRouter`, the new tab loads the current URL *with a hash*; the router sees path `/` → redirects to `/dashboard`. The table row click never opens `BondDetail`. Fix: `window.open('/bond/' + id)` or use `Link`. |
| M-05 | Medium | **Zero frontend tests and no ESLint config.** 2,200+ lines of UI with no unit/integration coverage; the 401 response interceptor is an intentional no-op with no compensating logic. |
| H-09 | Medium | **Oversized component.** `CryptoMarket.jsx` = 1,169 lines, 30+ `useState` hooks, 5 independent data fetches on mount, watchlist in `localStorage`. A tracked refactor (split into table/chart/drawer/watchlist/converter/news/trending) has not happened. |
| M-07 | Medium | **Inconsistent data semantics.** `interestRate` form is constrained 0–100 ("Rate must be between 0 and 100") and rendered with a `%` suffix, but the README example sends `500` and the contract stores raw uints — the same value means different things per surface. |
| L-02 | Low | `console.log('App rendering...')` in `App.jsx`; `main.jsx` renders `err.stack` into the page on crash (info exposure on client-side render failures). |
| L-07 | Low | Mixed-language UI (`Operações` in header menu; rest in English). |
| L-04 | Low | Untracked `frontend/public/duckhunt-bonds.html` — a 658-line standalone canvas game, unrelated to the product, currently sitting outside git. Decide: commit intentionally or delete. |
| I-02 | Info | Vite proxy correctly strips the `/api` prefix; env-driven `VITE_API_URL`/`VITE_API_TOKEN`/`VITE_BLOCK_EXPLORER` are a reasonable dev setup (token-in-bundle caveat = H-04). |

---

## 7. Testing Audit

| Suite | Count | Quality |
|-------|-------|---------|
| Contract (`test/BondTradingTest.js`) | 15 | Decent: happy paths, reverts, pause, redeem-before-maturity. **Missing:** sell/redeem token-flow assertions (would have caught C-02), holder-list pruning, allowance exhaustion, multi-bond isolation. |
| API (`api/test_api.py`) | 34 | Good consolidation (replaced 4 duplicate suites); auth, validation, tx order, SQLi/unicode/large-value probes, generic-error check. **All mock-based** — no test ever touches a real provider or the real ABI file, so ABI drift (M-01) and the CMC URL bugs (H-06) are invisible. |
| Frontend | 0 | None. |
| Integration / E2E | 0 | No test spans the 3 tiers despite docker-compose being available. |

Recommendation: add a contract test asserting token balances of contract *and* user across the full issue→purchase→sell→redeem cycle (this single test catches C-02); add one pytest integration test against a real Ganache fixture; add a minimal Vitest suite for `services/api.js`.

---

## 8. Infrastructure & Repository Hygiene Audit

| ID | Sev | Finding | Detail |
|----|-----|---------|--------|
| C-03 | Critical | **VCS pollution.** `git ls-files` shows **424 `node_modules/` files** (OpenZeppelin), 10 `build/contracts/*.json` artifacts, and `frontend/dist/` (1.6 MB minified JS) all committed — the `.gitignore` rules for these paths exist but the files were added before the rules took effect. Parent folder additionally contains a stray `node_modules/adm-zip` (accidental `npm install` one level up). Fix: `git rm -r --cached node_modules build frontend/dist` + `git gc`; audit commit history size (`.git` = 1.7 MB today, will keep growing). |
| M-08 | Medium | **Docker not production-grade.** `api/Dockerfile`: `flask run` (dev server) with a comment claiming gunicorn (not installed), runs as root, no healthcheck. `docker-compose.yml`: `DEBUG=true` for the API, fallback `AUTH_TOKEN=change-me-in-production`, frontend service re-runs `npm install` on every boot with no lockfile guarantee. Fine as a local-dev scaffold; not deployable. |
| M-09 | Medium | **Debug artifacts committed.** `fix.ps1`, `fix_spins.js`, `fix_spins.py`, `check_lines.js`, `inspect.js` (one-off regex fixers), `broswerConsolerIssues.jpg` (typo'd screenshot). The `.gitignore` lists them but they were committed earlier (see L-08). Remove from tracking. |
| M-10 | Medium | **Toolchain drift.** Truffle is end-of-life (SuiTe sunset it, 2024-25) and is not a dependency of any `package.json` — `start_dev.sh` relies on `npx truffle` resolving it from cache/global. Root `package.json` declares only `@openzeppelin/contracts` and no scripts. Recommend Hardhat (compile + test + deploy in one pinned toolchain). |
| L-05 | Low | The previous `TECHNICAL_AUDIT_REPORT.md` is deleted in the working tree (still in git). This document restores it. |
| L-06 | Low | Stray `node_modules/` in the parent directory (`Redbelly MVP/`). |
| I-03 | Info | `start_dev.sh` / `start_dev_env_simple.bat` / `migrate.bat` — practical dev scaffolding, though the `.bat` hard-kills processes on ports 8545/5000/3000 (risky on a shared dev machine). |

---

## 9. Recommendations — Priority Matrix

### P0 — before any real funds / external users
1. **Fix the token lifecycle (C-02/C-02b):** restructure purchase/redeem so the same tokens bought are the tokens settled at maturity (burn from contract balance, or move to a user-held-token model); prune holder lists; add a full-cycle contract test.
2. **Resolve the custody model (C-01):** either (a) keep it strictly a single-tenant *owner dashboard* and say so in the UI (no "user" operations), or (b) introduce per-user wallets (user-supplied key / embedded wallet) so on-chain identity matches UI identity.
3. **Cap token minting (C-03c):** add a hard `MAX_SUPPLY` or remove `mint`.
4. **Clean the repo (C-03):** untrack `node_modules/`, `build/`, `frontend/dist/`, debug scripts; add `pre-commit` ignore check.

### P1 — before any public deployment
5. Replace the shared static client token with per-user credentials and server-side key management (H-04); authenticate `/status`, `/contract/address` (H-05).
6. Add bounded caches + idle-IP eviction to the rate limiter (H-03); move to X-Forwarded-For-aware limiting or a gateway (M-03).
7. Fix the CMC URL bugs (H-06) and param parsing; regenerate `openapi.yaml` from the live routes (H-08); make the ABI load fail-fast (M-01).
8. Fix Dashboard → BondDetail navigation (H-07).
9. Productionize the API: gunicorn + non-root user + healthcheck; remove `DEBUG=true` (M-08).

### P2 — quality & maintainability
10. Split `CryptoMarket.jsx` (H-09) and `app.py` (M-01); add batch view on-chain (M-02c/M-02).
11. Add frontend tests + ESLint (M-05); one 3-tier integration test (Section 7).
12. Migrate Truffle → Hardhat (M-10); fix README (M-07); remove fake-news fallback (M-04); decide on `duckhunt-bonds.html` (L-04).

---

## 10. Appendix A — Endpoint Inventory (actual vs documented)

| Endpoint | Auth | In OpenAPI | Rate-limited | Notes |
|----------|------|-----------|--------------|-------|
| `GET /health` | no | ✅ | no | |
| `GET /status` | **no** ⚠ | ✅ (stale schema) | no | leaks infra state (H-05) |
| `GET /contract/address` | **no** ⚠ | ✅ | no | |
| `GET /auth/check` | yes | ✅ | no | |
| `POST /bond/issue` | yes | ✅ | yes (30/min/IP) | owner-only on-chain |
| `POST /bond/purchase` | yes | ✅ | yes | |
| `POST /bond/sell` | yes | ✅ | yes | buyer receives no on-chain asset (C-01) |
| `POST /bond/redeem` | yes | ✅ | yes | broken token flow (C-02) |
| `GET /bond/count` | yes | ✅ | **no** ⚠ | |
| `GET /bond/all` | yes | **❌** | **no** ⚠ | N sequential RPC calls (M-02) |
| `GET /bond/{id}/info` | yes | ✅ | no | |
| `GET /bond/{id}/holders` | yes | ✅ | no | stale holders (C-02b) |
| `GET /bond/{id}/holder/{addr}/amount` | yes | ✅ | no | |
| `GET /crypto/listings` | yes | **❌** | yes | `?limit=abc` → 500 (H-06b) |
| `GET /crypto/ohlc` | yes | **❌** | yes | |
| `GET /crypto/supply` | yes | **❌** | yes | |
| `GET /crypto/movers-gainers` | yes | **❌** | yes | |
| `GET /crypto/global-metrics` | yes | **❌** | yes | |
| `GET /crypto/convert` | yes | **❌** | yes | **404 — double /v1 prefix (H-06)** |
| `GET /crypto/news` | yes | **❌** | yes | uncached RSS + fake fallback (M-04) |
| `GET /crypto/trending` | yes | **❌** | yes | **404 — /v1/v2 path (H-06)** |

## Appendix B — Version Pinning

| Component | Version | Pinned |
|-----------|---------|--------|
| React / Vite / AntD / axios / react-router | 18.2 / 5.0.8 / 5.12 / 1.6.2 / 6.21 | ✅ (package-lock present) |
| Flask / web3.py / requests / dotenv | 3.0.0 / 6.15.0 / 2.31.0 / 1.0.0 | ✅ |
| Solidity / OpenZeppelin | 0.8.21 / ^5.4.0 | ⚠ semver range, no lock at root |
| Truffle | — | ❌ not a declared dependency; EOL tooling (M-10) |
| Node (Docker) | 20-alpine | ✅ |
| Python (Docker) | 3.12-slim | ✅ |

---
*Report generated by full-repo static analysis. Findings reference file/line state at audit time; re-verify line numbers after refactors.*

---

## 11. Remediation Status (added 2026-08-15, commit `fb6e560`; post-certificate addendum 2026-08-15)

> Everything above is the **original audit, unmodified** (state as of 2026-07).
> This section is the only post-audit content: it maps each finding to its
> outcome after the full remediation pass. Line numbers in the original text
> are pre-refactor and intentionally not updated.
> Statuses for H-02, H-04, M-01, M-05 and L-06 reflect the post-certificate
> closure pass (see §11.4 and the addendum in AUDIT_CLOSURE_CERTIFICATE.md).

Legend: ✅ fixed · ⚠️ mitigated / partially addressed (deferral noted) · ⛔ out of scope · ℹ️ no action needed

### 11.1 Findings

| ID | Sev | Finding (short) | Status | Resolution |
|----|-----|-----------------|--------|------------|
| C-01 | Critical | Single signing key = custodial API | ⚠️ | Option (a) taken: documented as a **single-tenant owner dashboard** — `/status` `model` field, README, AGENTS.md. Option (b) (per-user wallets) **deferred**: needs a product/architecture decision (embedded wallets or user-supplied keys). |
| C-02 / C-02b | Critical | Broken redemption flow; stale holder lists | ✅ | **Escrow model** in `BondTrading.sol`: `purchaseBond` escrows tokens via `transferFrom`, `redeemBond` **burns from the contract's own balance**, `sellBond` transfers the position mapping only. Holder lists pruned on zero balance (`bondHolderFlags`/`bondHolderIndex` mappings, O(1) membership). Full issue→purchase→sell→redeem cycle covered by contract tests (balance assertions on both sides). |
| C-03 | Critical | `node_modules/`, `build/`, `frontend/dist/` committed | ✅ | 437 files untracked (`git rm -r --cached`), `.gitignore` extended (`/frontend/node_modules`, `/frontend/dist`). **Note:** the blobs remain in git *history* (`.git` size); a history rewrite / `git gc` is an optional follow-up, not done. |
| C-03c | Critical | Uncapped `onlyOwner mint` | ✅ | `MAX_SUPPLY` hard cap on `BondToken.mint` + `Minted` event; cap behaviour asserted in tests (`npx hardhat test`). |
| H-01 | High | Unbounded gas loops over holder arrays | ✅ | Array scans replaced by O(1) `mapping` membership checks; no unbounded iteration remains in state-changing paths. |
| H-02 | High | No economic model; `isActive` unreachable; supply never decremented | ✅ | `remainingSupply` now decremented on purchase (supply check is live), `deactivateBond`/`activateBond` make the Inactive state reachable, `interestRate` is a first-class validated field (basis points, 0–10000). **Scope locked (post-certificate):** product language now explicitly states the **bookkeeping-only** model — no coupons/pricing engine/fees; `interestRate` recorded, not paid (README “Economic Model (MVP scope — H-02)”, `GET /status` `economic_model` field, AGENTS.md). A pricing/coupon engine remains out of MVP scope by design. |
| H-03 | High | Unbounded in-memory state (rate limiter, CMC cache) | ✅ | Rate-limit dict evicts idle IPs (bounded); CMC cache is LRU-bounded with TTL; both covered by tests. |
| H-04 | High | Shared static token in bundle; non-constant-time compare | ✅ | Constant-time `hmac.compare_digest` + **fail-closed** (no `AUTH_TOKEN` → all private routes 401; API refuses to start). **Static bundle token removed (post-certificate):** `VITE_API_TOKEN` no longer exists — dev: Vite proxy injects `AUTH_TOKEN` server-side (`frontend/.env`, untracked); prod: reverse proxy/backend injects it; direct API access: runtime operator token via header “API Token” button → `AuthGate` (stored in `localStorage` per browser, revocable; 401 re-prompts). Covered by new `auth.test.js` (7 tests). **Deferred:** per-user (multi-user) credentials — blocked on the C-01(b) product decision. |
| H-05 | High | Unauthenticated `/status` & `/contract/address` | ✅ | Removed from `exempt_paths`; only `/health` (+ `/docs`, `/openapi.yaml`) are unauthenticated. Covered by auth tests. |
| H-06 / H-06b | High | CMC double-version URLs; `int()` on query params → 500 | ✅ | URLs corrected (`/v1/...`, `/v2/trending`), `_parse_int_param` returns 400 on bad input, client-side sanity bounds on all tx endpoints. URL construction asserted in tests. |
| H-07 | High | Dashboard row click uses `#/bond/...` under BrowserRouter | ✅ | `Dashboard.jsx` now opens the real path (`/bond/<id>`). *(Fixed in the remediation commit that added this appendix.)* |
| H-08 | High | Stale OpenAPI spec; validator deps missing | ✅ | `openapi.yaml` extended (`/bond/all`, all 8 `/crypto/*`, bps semantics, status model) and validates; `pyyaml`/`openapi-spec-validator` added to `requirements.txt`. |
| H-09 | Med | `CryptoMarket.jsx` = 1,169 lines | ✅ | Split into 12 focused modules under `frontend/src/pages/crypto/` (widgets, table, drawer, formatters, `useWatchlist`); orchestrator reduced to 423 lines. |
| M-01 | Med | Inline ~330-line ABI fallback; monolithic `app.py` | ✅ | ABI loading is now **artifact-only, fail-fast**; the dead unreachable inline ABI block (~235 lines) after the fail-fast return path was deleted (post-certificate). **Deferred (M-01b):** splitting `app.py` itself (still a single module) — tracked as future work. |
| M-02 / M-02c | Med | `/bond/all` N+1 RPC; no on-chain batch view | ✅ | `getBondsRange(start, count)` batch view added to `BondTrading`; `/bond/all` uses it (one RPC for the batch). |
| M-03 | Med | Proxy-blind, endpoint-blind rate limiting | ✅ | Proxy-aware `_client_ip()` (honours `X-Forwarded-For` only when `TRUST_PROXY=true`), limiter applies to GET endpoints too, `Retry-After` header on 429. |
| M-04 | Med | Uncached RSS + hardcoded fake news fallback | ✅ | Feed cached 15 min; on failure returns an **empty list with `source: "unavailable"`** — no more fake items presented as live. |
| M-05 | Med | Zero frontend tests, no ESLint | ✅ | **Vitest + Testing Library: 22 tests** (`npm test` — formatters, API service mapping, Header, H-04 auth module). **ESLint gate added (post-certificate):** ESLint 9 flat config (`frontend/eslint.config.js`, js + react + react-hooks; `react/jsx-uses-vars` marks JSX components as used), `npm run lint` script, and a CI lint step (`.github/workflows/ci.yml`). |
| M-06 | Med | Env-fragile import chain (tests only ran with `.env`) | ✅ | `config.py` no longer raises at import; `api/__init__.py` lazy (PEP 562); the 42-test suite is hermetic (no `.env`, no live node — verified with and without a node on 8545). |
| M-07 | Med | README truncated mid-`curl`; rate semantics inconsistent | ✅ | README completed (all endpoints, auth, bps, testing, local-dev scripts); `interestRate` is basis points end-to-end (API validates 0–10000; form collects % and sends bps; detail/dashboard render `5.00% (500 bps)`). |
| M-08 | Med | Dockerfile not production-grade; compose `DEBUG=true` | ✅ | `api/Dockerfile`: gunicorn, non-root user, healthcheck. `docker-compose.yml` **deleted** (dev path is the `.sh`/`.bat` scripts + Hardhat node); its `DEBUG=true`/fallback-token issues vanished with it. |
| M-09 | Med | One-off debug scripts committed | ✅ | `fix.ps1`, `fix_spins.js/.py`, `check_lines.js`, `inspect.js`, screenshot — deleted from tree and untracked. |
| M-10 | Med | Truffle (EOL) unpinned; no root scripts | ✅ | Migrated to **Hardhat 3.13.0** + `@nomicfoundation/hardhat-toolbox-viem` (pinned in `package.json` with `build`/`test`/`node`/`deploy` scripts); migration ported to `scripts/deploy.js`; Truffle fully uninstalled (npx cache + npm cacache scrubbed). |
| M-11 | Med | Validator deps missing; rate semantics inconsistent | ✅ | Deps added (see H-08); bps semantics unified (see M-07). |
| L-01 | Low | Duplicate `w3`/`contract` declarations | ✅ | Single declaration site. |
| L-02 | Low | `console.log` in `App.jsx`; `err.stack` rendered in page | ✅ | Both removed; crash page shows a generic message, full error goes to the browser console only. |
| L-03 | Low | Rate limiter's `remaining` never surfaced | ✅ | Surfaced via the `Retry-After` header on 429 responses. |
| L-04 | Low | Unrelated `duckhunt-bonds.html` in `frontend/public/` | ✅ | Deleted (decision: not part of the product). |
| L-05 | Low | Audit report deleted in working tree | ✅ | Restored (this document). |
| L-06 | Low | Stray `node_modules/adm-zip` in parent folder | ✅ | Outside the repository — stray `node_modules` (adm-zip 0.6.0 + lockfile fragment, 192 KB) in the parent folder **deleted** on 2026-08-15 (post-certificate). |
| L-07 | Low | Mixed-language UI ("Operações") | ✅ | Renamed to "Operations"; asserted by the Header test. |
| L-08 | Low | Ineffective `.gitignore` entries; over-redacting log regex | ✅ | Files untracked (C-03), rules extended; redaction regex now targets actual secrets (hex keys, bearer tokens, checksummed addresses) instead of any 20+ char word. |
| L-09 | Low | Swagger UI inlined in `app.py`; manual `Bearer ` prefix | ✅ | Docs externalized to `api/templates/docs.html` (served at `/docs`); spec at `/openapi.yaml`. |
| I-01 | Info | Single-pool token (no per-bond instrument) | ℹ️ | Unchanged — accepted MVP design, documented. |
| I-02 | Info | Vite proxy / env-driven setup | ℹ️ | Unchanged; token-in-bundle caveat documented (see H-04). |
| I-03 | Info | Dev scripts; `.bat` hard-kills ports 8545/5000/3000 | ℹ️ | Documented in README "Local Development"; the hard-kill behaviour is a known, accepted trade-off. |

### 11.2 Test coverage (was → is)

| Suite | At audit | After remediation |
|-------|----------|-------------------|
| Contracts | 15 (Truffle) | **25** (Hardhat 3 + viem; incl. full issue→purchase→sell→redeem cycle with balance assertions, mint-cap, holder pruning, sell-to-self, allowance revocation) |
| API | 34 (env-fragile) | **42** (hermetic — no `.env`/live node required; verified green with and without a node on 8545) |
| Frontend | 0 | **22** (Vitest + Testing Library: formatters, API service mapping, Header, H-04 auth module) + **ESLint gate** (`npm run lint`, 0 errors) |
| 3-tier integration | 0 | Still 0 in the suites — a manual 3-tier smoke (node + deploy + live API calls) was performed during remediation; an automated version remains a P2 item |

### 11.3 Remaining / deferred items

1. **C-01 (b):** per-user on-chain identity (embedded or user-supplied wallets) — blocked on a product decision. (Implies per-user credentials for H-04 as well.)
2. **M-01 (b):** split `api/app.py` into modules (auth, bonds, crypto, infra).
3. **H-02 (b):** a real economic model (pricing/coupons/fees engine) — out of MVP scope; scope language is locked (bookkeeping-only) until then.
4. **C-03 (follow-up):** optional git-history rewrite / `git gc` to shrink `.git` (437 files' worth of blobs are still in history).
5. **Testing:** one automated 3-tier integration test (node fixture → deploy → API).

### 11.4 Post-certificate addendum (2026-08-15, after AUDIT_CLOSURE_CERTIFICATE.md)

Certificate-gate residuals were closed on 2026-08-15 (see the addendum in
`AUDIT_CLOSURE_CERTIFICATE.md`):

- **C-01 (P0 condition):** explicit custody-model statement published in README
  (“Custody Model (read first — C-01)”), AGENTS.md and the operations runbook
  section; runtime exposure via `GET /status.model`.
- **H-04 (P1):** static bundle token removed; server-side injection (dev proxy /
  reverse proxy) + revocable runtime operator token (`src/auth.js`,
  `AuthGate`); 7 new tests.
- **H-02 (P1):** product scope language locked to the bookkeeping-only model
  (README section, `GET /status.economic_model`, AGENTS.md).
- **M-01 (P2):** dead inline ABI block removed from `api/app.py` (fail-fast
  artifact loading only).
- **M-05 (P2):** ESLint 9 flat config + `npm run lint` + GitHub Actions CI
  (contracts, API, frontend tests **and** lint).
- **L-06 (P2):** stray parent-folder `node_modules` deleted.

Full re-validation (25 contract / 42 API / 22 frontend tests + OpenAPI)
remains to be run against the post-certificate commit before sign-off.

---
