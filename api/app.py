"""Bond Trading REST API.

C-01 NOTE — single-tenant design (deliberate MVP scope):
    This API is an *owner dashboard*, not a multi-user custody service. There is
    one operator key (OWNER_ADDRESS, or the provider's first account); every
    on-chain transaction it sends is signed by that key. UI "users" do not have
    independent on-chain identities — bond positions and token balances belong
    to the operator's account. If per-user on-chain identity is required, the
    design must move to user-supplied wallets / embedded wallets (see the audit
    report, C-01, option b).

M-01 NOTE: the contract ABI is loaded from the compiled artifact
(`artifacts/contracts/BondTrading.sol/BondTrading.json`, legacy
`build/contracts/BondTrading.json` as fallback). The ~330-line inline ABI
fallback was removed: a missing artifact is now a clear startup/runtime error
instead of silent ABI drift.
"""
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from web3 import Web3
import hmac
import json
import os
import sys
import threading
from logging.handlers import RotatingFileHandler
# Add the api directory to Python path to resolve imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from config import (
    WEB3_PROVIDER, DEFAULT_WEB3_PROVIDER, CONTRACT_ADDRESS,
    AUTH_TOKEN, OWNER_ADDRESS, COINMARKETCAP_API_KEY, TRUST_PROXY,
    validate_config,
)
import logging
import time
import re
import requests as requests_lib

# web3 v7 rejects non-checksummed addresses; normalize once so users can
# paste lowercase addresses (e.g. straight from the deploy script) into .env
try:
    CONTRACT_ADDRESS = Web3.to_checksum_address(CONTRACT_ADDRESS.lower())
except (ValueError, AttributeError):
    logging.getLogger(__name__).warning("CONTRACT_ADDRESS is not a valid hex address; chain endpoints will report misconfiguration")

# Initialize Flask app
app = Flask(__name__)

# C-05 FIX: CORS middleware — restrict to known origins
_FRONTEND_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',  # Vite dev server
]
prod_origin = os.environ.get('CORS_ORIGINS')
if prod_origin:
    _FRONTEND_ORIGINS.extend(prod_origin.split(','))
CORS(app, origins=_FRONTEND_ORIGINS, supports_credentials=True)

# ============ Enhanced Logging Configuration ============

LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
# L-08 FIX: the old `\w{20,}` pattern over-redacted ordinary words (e.g. any
# 20+ char identifier). Target only actual secrets: hex private keys, bearer
# tokens, and checksummed addresses.
SENSITIVE_FIELDS = re.compile(
    r'\b0x[a-fA-F0-9]{64}\b|'
    r'Bearer\s+[A-Za-z0-9._~+/-]{16,}|'
    r'\b0x[a-fA-F0-9]{40}\b',
    re.IGNORECASE
)


def _sanitize(msg):
    """Strip sensitive values from log messages."""
    if not isinstance(msg, str):
        return msg
    msg = SENSITIVE_FIELDS.sub('[REDACTED]', msg)
    return msg


def _log_safe(value, max_len=200):
    """N-11: neutralize CR/LF in user-controlled values before logging.

    `tag`, `X-Forwarded-For` and upstream error text are attacker-influenceable;
    a raw newline would let them forge log entries (log injection). The
    secret-redaction pass (_sanitize) does not cover this. Values are escaped
    and truncated so a single field cannot bloat a log line.
    """
    s = value if isinstance(value, str) else str(value)
    s = s.replace('\r', '\\r').replace('\n', '\\n').replace('\x00', '')
    return s[:max_len]


def _setup_logging():
    """Configure rotating file + console logging with request timing."""
    log_level = getattr(logging, os.environ.get('LOG_LEVEL', 'INFO').upper(), logging.INFO)

    formatter = logging.Formatter(LOG_FORMAT, datefmt='%Y-%m-%d %H:%M:%S')

    # Rotating file handler — 10 MB per file, keep 5 backups
    log_dir = os.path.dirname(os.path.abspath(__file__))
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, 'api.log'),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)

    # Console handler
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(log_level)
    stream_handler.setFormatter(formatter)

    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(stream_handler)

    return root_logger


_setup_logging()
logger = logging.getLogger(__name__)

# Sub-loggers for subsystem categorisation
bond_logger = logging.getLogger('bond')
crypto_logger = logging.getLogger('crypto')
blockchain_logger = logging.getLogger('blockchain')

# Global variables for blockchain connection and contract
w3 = None
contract = None

# ============ CMC API Caching & Rate Limiting ============

_cmc_cache = {}
_cmc_cache_lock = threading.Lock()
_CMC_CACHE_TTL = 300  # 5 minutes cache for listings
_CMC_CACHE_TTL_SHORT = 60  # 1 minute cache for volatile endpoints (OHLC, convert)

# Rate limiting: track requests per IP.
# H-03 FIX: the window dict is now BOUNDED — an attacker cycling source IPs can
# no longer grow it without limit. Idle IPs are evicted (LRU by last activity)
# once the cap is reached, and entries are pruned on every check.
_rate_limit_window = {}
_rate_limit_lock = threading.Lock()
_RATE_LIMIT_MAX_REQUESTS = 30  # max requests per window
_RATE_LIMIT_WINDOW_SECONDS = 60  # per minute
_RATE_LIMIT_MAX_IPS = 10_000  # H-03: hard cap on tracked clients


def _client_ip() -> str:
    """M-03 FIX: client identity for rate limiting.

    Behind a reverse proxy or the Vite dev proxy every request arrives from one
    IP (shared pool → false 429s) and the real client is invisible (attacker
    friendly). With TRUST_PROXY=1 the first X-Forwarded-For hop is used instead;
    keep it disabled when the API is directly internet-exposed.
    """
    if TRUST_PROXY:
        xff = request.headers.get('X-Forwarded-For', '')
        first = xff.split(',')[0].strip()
        if first:
            return first[:128]
    return request.remote_addr or 'unknown'


def _cache_get(key):
    """Get a value from the cache if it exists and hasn't expired."""
    with _cmc_cache_lock:
        entry = _cmc_cache.get(key)
        if entry and time.time() - entry['time'] < entry['ttl']:
            return entry['data']
        if entry:
            del _cmc_cache[key]
    return None


_CMC_CACHE_MAX_ENTRIES = 256  # H-03: bounded cache (FIFO eviction on overflow)


def _cache_set(key, data, ttl=None):
    """Set a value in the cache (H-03: evicts oldest entries past the cap)."""
    if ttl is None:
        ttl = _CMC_CACHE_TTL
    with _cmc_cache_lock:
        if len(_cmc_cache) >= _CMC_CACHE_MAX_ENTRIES and key not in _cmc_cache:
            oldest = min(_cmc_cache, key=lambda k: _cmc_cache[k]['time'])
            del _cmc_cache[oldest]
        _cmc_cache[key] = {'data': data, 'time': time.time(), 'ttl': ttl}


def _check_rate_limit(client_ip):
    """Check if the client has exceeded the rate limit. Returns (allowed, remaining)."""
    now = time.time()
    with _rate_limit_lock:
        # H-03: evict the least-recently-active client once the cap is hit
        if client_ip not in _rate_limit_window and len(_rate_limit_window) >= _RATE_LIMIT_MAX_IPS:
            oldest_ip = min(
                _rate_limit_window,
                key=lambda ip: max(_rate_limit_window[ip]) if _rate_limit_window[ip] else 0.0,
            )
            del _rate_limit_window[oldest_ip]
        if client_ip not in _rate_limit_window:
            _rate_limit_window[client_ip] = []
        # Remove old entries outside the window
        _rate_limit_window[client_ip] = [
            t for t in _rate_limit_window[client_ip] if now - t < _RATE_LIMIT_WINDOW_SECONDS
        ]
        # H-03: drop idle clients opportunistically (bounded memory)
        if len(_rate_limit_window) > _RATE_LIMIT_MAX_IPS // 2:
            for ip in [ip for ip, times in _rate_limit_window.items() if not times]:
                del _rate_limit_window[ip]
        requests_in_window = len(_rate_limit_window[client_ip])
        if requests_in_window >= _RATE_LIMIT_MAX_REQUESTS:
            return False, 0
        _rate_limit_window[client_ip].append(now)
        return True, _RATE_LIMIT_MAX_REQUESTS - requests_in_window - 1


def _rate_limited_response():
    """429 response with the L-03 `remaining` value surfaced as a header."""
    resp = jsonify({'error': 'Rate limit exceeded. Please try again later.'})
    resp.status_code = 429
    resp.headers['Retry-After'] = str(_RATE_LIMIT_WINDOW_SECONDS)
    return resp


def _rate_limit_gate():
    """N-10/N-11: per-IP rate-limit check shared by ALL authenticated
    endpoints (the view endpoints used to bypass the limiter). Returns a 429
    response when over budget, or None when the request may proceed.
    The client identity is log-sanitized (N-11): with TRUST_PROXY=1 it is
    attacker-controlled via X-Forwarded-For.
    """
    client_ip = _client_ip()
    allowed, _remaining = _check_rate_limit(client_ip)
    if not allowed:
        logger.warning(f'Rate limit exceeded for {_log_safe(client_ip)}')
        return _rate_limited_response()
    return None


def _int_field(value, field):
    """N-04: strict integer coercion for numeric API inputs.

    Rejects booleans and non-integral floats instead of silently truncating
    (``{\"amount\": 1.9}`` used to execute as 1 with a 200). Whole-valued
    floats (``1.0``) and numeric strings are accepted. Returns
    ``(value, error_response)``.
    """
    if isinstance(value, bool):
        return None, (jsonify({'error': f'{field} must be an integer'}), 400)
    if isinstance(value, float):
        if value != int(value):
            return None, (jsonify({'error': f'{field} must be an integer (no fractional part)'}), 400)
        return int(value), None
    try:
        return int(value), None
    except (TypeError, ValueError):
        return None, (jsonify({'error': f'{field} must be an integer'}), 400)


# N-05 FIX: receipt polling is BOUNDED. A tx that is never mined (mempool
# rejection, node restart, underpriced gas) used to hold a gunicorn worker
# indefinitely (web3's default unbounded wait); two stuck txs would take the
# API down under --workers=2. On timeout the handler returns 504 with the
# tx_hash so the operator can check the explorer.
RECEIPT_TIMEOUT_SECONDS = 180
RECEIPT_POLL_INTERVAL_SECONDS = 2


class ReceiptTimeout(Exception):
    """Raised when a transaction is not mined within RECEIPT_TIMEOUT_SECONDS."""

    def __init__(self, tx_hash):
        super().__init__(
            f'Transaction {tx_hash} not mined within {RECEIPT_TIMEOUT_SECONDS}s'
        )
        self.tx_hash = tx_hash


def _wait_for_receipt(tx_hash):
    """Poll for the receipt with an explicit deadline (N-05)."""
    # Normalize to a hex string up front so the timeout path can surface it
    # in a JSON response (raw HexBytes/bytes are not JSON serializable)
    tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
    deadline = time.monotonic() + RECEIPT_TIMEOUT_SECONDS
    while True:
        try:
            receipt = w3.eth.get_transaction_receipt(tx_hash)
        except Exception:
            receipt = None  # unknown/not mined yet — keep polling
        if receipt is not None:
            return receipt
        if time.monotonic() >= deadline:
            raise ReceiptTimeout(tx_hash_str)
        time.sleep(RECEIPT_POLL_INTERVAL_SECONDS)


def _set_default_account(w3_client: Web3) -> None:
    """Set the default account for transactions using OWNER_ADDRESS if provided, else first account."""
    try:
        if OWNER_ADDRESS:
            w3_client.eth.default_account = w3_client.to_checksum_address(OWNER_ADDRESS)
            logger.info(f"Default account set from OWNER_ADDRESS: {w3_client.eth.default_account}")
            return
        accounts = w3_client.eth.accounts
        if accounts:
            w3_client.eth.default_account = accounts[0]
            logger.info(f"Default account set to first provider account: {w3_client.eth.default_account}")
        else:
            logger.warning("No accounts available on provider; transactions will fail until an account is configured")
    except Exception as e:
        logger.warning(f"Could not set default account: {e}")


def _chain_ready_response():
    """Return a JSON error response if blockchain/contract are not ready."""
    if not CONTRACT_ADDRESS:
        return jsonify({
            "error": "Contract address not configured. Set CONTRACT_ADDRESS in .env before calling this endpoint"
        }), 500
    if w3 is None:
        return jsonify({"error": "Blockchain connection is not available"}), 500
    if contract is None:
        return jsonify({"error": "Smart contract is not initialised (ABI artifact missing? run `npm run build` in the project root)"}), 500
    # Ensure a default account is present for transactions
    if not getattr(w3.eth, "default_account", None):
        try:
            _set_default_account(w3)
            if not getattr(w3.eth, "default_account", None):
                return jsonify({"error": "No accounts available on provider; cannot sign transactions"}), 500
        except Exception as e:
            return jsonify({"error": f"Unable to set default account: {e}"}), 500
    return None

# N-06 FIX: connection probing is cached with a short TTL instead of a live
# eth_chainId round-trip (`w3.is_connected()`) on EVERY request. A healthy
# node is re-probed at most every 5 s; while the node is down the interval
# grows exponentially (5 → 10 → 20 → 40 → 60 s) so an outage no longer makes
# every request pay the full ~60 s double-provider reconnect cost, and a
# healthy-but-slow node adds at most one probe per TTL per worker.
_CONN_PROBE_OK_TTL = 5.0
_CONN_PROBE_FAIL_MAX = 60.0
_conn_state = {'checked_at': 0.0, 'cooldown': _CONN_PROBE_OK_TTL}
_conn_lock = threading.Lock()


def _chain_probe_due() -> bool:
    with _conn_lock:
        return time.time() - _conn_state['checked_at'] >= _conn_state['cooldown']


def _mark_chain_probe(ok: bool) -> None:
    with _conn_lock:
        _conn_state['checked_at'] = time.time()
        _conn_state['cooldown'] = _CONN_PROBE_OK_TTL if ok else min(
            _conn_state['cooldown'] * 2, _CONN_PROBE_FAIL_MAX
        )


@app.before_request
def ensure_connection():
    global w3, contract
    # Authentication check (skip for health, docs, openapi.yaml).
    # H-05 FIX: /status and /contract/address were public and leaked
    # infrastructure state — they now require the bearer token like everything
    # else (the frontend already sends it on every request).
    exempt_paths = ['/health', '/docs', '/openapi.yaml']
    if request.path not in exempt_paths:
        if not AUTH_TOKEN:
            # Fail closed: without a configured token, refuse all private routes
            return jsonify({"error": "Unauthorized"}), 401
        auth_header = request.headers.get('Authorization', '')
        # H-04 FIX: constant-time comparison (no timing side-channel)
        if not hmac.compare_digest(
            auth_header.encode('utf-8'), f"Bearer {AUTH_TOKEN}".encode('utf-8')
        ):
            return jsonify({"error": "Unauthorized"}), 401

    # Only attempt to connect if a contract address is configured.
    # When running unit tests we may mock ``w3`` and ``contract``; in that case
    # ``w3`` might not have an ``is_connected`` attribute. Guard against that
    # to avoid AttributeError during the request lifecycle.
    if CONTRACT_ADDRESS:
        if w3 is None:
            # Never connected: probe at most once per TTL (N-06), not per request
            if _chain_probe_due():
                w3 = connect_to_blockchain()
                _mark_chain_probe(w3 is not None)
        elif hasattr(w3, "is_connected"):
            # Re-probe a possibly-dead client only after the TTL — the live
            # is_connected() round-trip no longer runs on every request.
            if _chain_probe_due():
                try:
                    alive = w3.is_connected()
                except Exception:
                    alive = False
                if not alive:
                    w3 = connect_to_blockchain()
                _mark_chain_probe(w3 is not None)
        # Initialise the contract object only when we have a live client AND the
        # ABI artifact is available (M-01: no inline fallback to drift from).
        if contract is None and w3 is not None:
            abi = get_contract_abi()
            if abi is not None:
                contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=abi)


# ============ Request Timing Middleware ============
_request_start_time = threading.local()


@app.before_request
def _request_timer():
    _request_start_time.start = time.time()


@app.after_request
def _log_request(response):
    # N-11: the path is user-influenceable (query strings can carry encoded
    # newlines) — sanitize before logging.
    path = _log_safe(request.path)
    method = request.method
    status = response.status_code
    duration_ms = (time.time() - getattr(_request_start_time, 'start', time.time())) * 1000
    logger.info(f'{method} {path} {status} {duration_ms:.1f}ms')
    return response

# Connect to blockchain
def connect_to_blockchain():
    try:
        logger.info(f"Connecting to blockchain at {WEB3_PROVIDER}")
        # Try to connect to the blockchain with a timeout
        w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER, request_kwargs={'timeout': 30}))
        
        # Check if connection is successful
        if not w3.is_connected():
            logger.warning(f"Failed to connect to {WEB3_PROVIDER}, trying default provider")
            # Try default provider with timeout
            w3 = Web3(Web3.HTTPProvider(DEFAULT_WEB3_PROVIDER, request_kwargs={'timeout': 30}))
            if not w3.is_connected():
                raise Exception("Failed to connect to blockchain")
            else:
                logger.info("Successfully connected to default provider")
        else:
            logger.info("Successfully connected to blockchain")
        # Set a default account for signing transactions
        _set_default_account(w3)

        return w3
    except Exception as e:
        # Log the error and continue without a connection
        logger.error(f"Blockchain connection error: {e}")
        return None

# M-01 FIX: the ABI is loaded ONLY from the compiled artifact (Hardhat
# `artifacts/` first, legacy `build/` as fallback for old environments). The
# previous ~330-line inline fallback duplicated BondTrading.sol by hand and
# could silently drift from the contract; a missing artifact now fails fast
# with an actionable error instead.
# N-01 FIX: candidates are resolved against BOTH the app directory and its
# parent, so the same code works in the dev checkout (app.py at <root>/api/
# with the artifact at <root>/artifacts/) AND inside the Docker image (app.py
# at /app/app.py with the artifact at /app/artifacts/ — the Dockerfile now
# copies it). An explicit file path can be forced via the CONTRACT_ABI_PATH
# (or legacy CONTRACT_ABI) environment variable.
def get_contract_abi():
    artifact_rel = os.path.join('artifacts', 'contracts', 'BondTrading.sol', 'BondTrading.json')
    legacy_rel = os.path.join('build', 'contracts', 'BondTrading.json')
    app_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = []
    for env_var in ('CONTRACT_ABI_PATH', 'CONTRACT_ABI'):
        explicit = os.environ.get(env_var)
        if explicit:
            candidates.append(explicit)
    for base in (app_dir, os.path.dirname(app_dir)):
        candidates.append(os.path.join(base, artifact_rel))
        candidates.append(os.path.join(base, legacy_rel))
    for abi_path in dict.fromkeys(candidates):  # dedupe, keep order
        try:
            if os.path.exists(abi_path):
                with open(abi_path, 'r') as f:
                    contract_json = json.load(f)
                    abi = contract_json.get('abi')
                    if abi:
                        return abi
        except Exception as e:
            logger.error(f"Failed to load ABI from {abi_path}: {e}")
    logger.error(
        "BondTrading ABI artifact not found. Run `npm run build` (Hardhat) in the "
        "project root, then restart the API. (Override the path with the "
        "CONTRACT_ABI_PATH environment variable if the artifact lives elsewhere.)"
    )
    return None


# The main API endpoints
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    logger.info("Health check requested")
    return jsonify({"status": "healthy"})

@app.route('/contract/address', methods=['GET'])
def get_contract_address():
    """Get the contract address"""
    # N-10: rate-limited like the other authenticated views
    limited = _rate_limit_gate()
    if limited:
        return limited
    logger.info("Contract address requested")
    return jsonify({"contract_address": CONTRACT_ADDRESS if CONTRACT_ADDRESS else "Not configured"})


@app.route('/auth/check', methods=['GET'])
def auth_check():
    """Validate bearer token (requires Authorization header)."""
    # N-10: rate-limited (the docs panel polls this)
    limited = _rate_limit_gate()
    if limited:
        return limited
    logger.info("Auth check endpoint called")
    return jsonify({"authorized": True, "message": "Token valid"})

@app.route('/bond/issue', methods=['POST'])
def issue_bond():
    """Issue a new bond - calls the smart contract's issueBond function"""
    try:
        logger.info("Issue bond endpoint called")
        # Validate the payload FIRST so bad input yields 400s even when the
        # chain is unreachable (deterministic error semantics — M-06).
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "Invalid JSON body"}), 400
        logger.debug(f"Issue bond data received: {_sanitize(str(data))}")
        
        # Extract parameters
        name = data.get('name')
        issuer = data.get('issuer')
        face_value = data.get('faceValue')
        maturity_date = data.get('maturityDate')
        interest_rate = data.get('interestRate')
        supply = data.get('supply')
        
        # Validate required fields
        if not all([name, issuer, face_value is not None, maturity_date is not None, 
                    interest_rate is not None, supply is not None]):
            return jsonify({"error": "Missing required parameters"}), 400

        # N-23: bound metadata string length (storage gas stays predictable;
        # a huge string would otherwise just fail the 500k gas cap opaquely)
        if len(str(name)) > 64 or len(str(issuer)) > 64:
            return jsonify({"error": "name and issuer must be at most 64 characters"}), 400

        # Convert to appropriate types (H-06b: bad input → 400, not 500;
        # N-04: non-integral values are REJECTED, not silently truncated)
        face_value, err = _int_field(face_value, 'faceValue')
        if err: return err
        maturity_date, err = _int_field(maturity_date, 'maturityDate')
        if err: return err
        interest_rate, err = _int_field(interest_rate, 'interestRate')
        if err: return err
        supply, err = _int_field(supply, 'supply')
        if err: return err
        # M-07/M-11 FIX: interestRate is BASIS POINTS (500 = 5.00%); 0-10000 = 0-100%.
        # Resolves the old "500 in README vs 0-100 in form" inconsistency: all
        # surfaces now use bps.
        if not (0 <= interest_rate <= 10000):
            return jsonify({"error": "interestRate must be between 0 and 10000 basis points (0-100%)"}), 400
        if face_value <= 0 or supply <= 0:
            return jsonify({"error": "faceValue and supply must be > 0"}), 400
        if face_value > 2**255 or supply > 2**255 or maturity_date > 2**255:
            return jsonify({"error": "Values exceed the supported range"}), 400
        
        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready

        limited = _rate_limit_gate()
        if limited:
            return limited

        # Prepare and execute the smart contract transaction
        tx = contract.functions.issueBond(name, issuer, face_value, maturity_date, interest_rate, supply)
        try:
            # Estimate gas for the transaction with DoS protection cap
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            # C-04 / DoS FIX: cap gas at 2x estimate, max 500k
            gas_cap = min(gas_estimate * 2, 500000)
            # Send transaction to the blockchain
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_cap})
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            # N-05: bounded wait — a never-mined tx returns 504 + tx_hash
            # instead of stalling the worker forever
            tx_receipt = _wait_for_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            # Extract bondId from the BondIssued event logs
            bond_id = "Unknown"
            if tx_receipt.logs:
                try:
                    # Try to decode the BondIssued event
                    for log in tx_receipt.logs:
                        try:
                            decoded = contract.events.BondIssued().process_log(log)
                            bond_id = decoded['args']['bondId']
                            break
                        except Exception:
                            continue  # nosec B112 -- skip logs that don't match BondIssued
                except Exception:
                    pass  # nosec B110 -- bondId stays "Unknown"; the tx itself succeeded
            
            return jsonify({
                "message": "Bond issued successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id
            }), 201
            
        except ReceiptTimeout as e:
            logger.warning(f"Transaction not mined within {RECEIPT_TIMEOUT_SECONDS}s: {_log_safe(e.tx_hash)}")
            return jsonify({
                "error": "Transaction not yet mined. It may still be pending — check the explorer with this tx hash.",
                "tx_hash": e.tx_hash
            }), 504
        except Exception as e:
            logger.error(f"Smart contract transaction failed for issue bond: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Transaction failed on blockchain. Please try again."}), 500

    except Exception as e:
        logger.error(f"Unexpected error in issue_bond: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/bond/purchase', methods=['POST'])
def purchase_bond():
    """Purchase a bond - calls the smart contract's purchaseBond function"""
    try:
        logger.info("Purchase bond endpoint called")
        # Validate the payload FIRST so bad input yields 400s even when the
        # chain is unreachable (deterministic error semantics — M-06).
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "Invalid JSON body"}), 400
        logger.debug(f"Purchase bond data received: {_log_safe(_sanitize(str(data)))}")
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        
        # Validate required fields
        if bond_id is None or amount is None:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types (H-06b: bad input → 400, not 500;
        # N-04: non-integral values are REJECTED, not silently truncated)
        bond_id, err = _int_field(bond_id, 'bondId')
        if err: return err
        amount, err = _int_field(amount, 'amount')
        if err: return err
        # Deterministic sanity bounds (the contract enforces the rest on-chain)
        if bond_id < 1 or not (1 <= amount <= 2**64):
            return jsonify({"error": "Invalid bondId or amount"}), 400

        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready
        

        limited = _rate_limit_gate()
        if limited:
            return limited

        # Prepare and execute the smart contract transaction
        tx = contract.functions.purchaseBond(bond_id, amount)
        try:
            # Estimate gas with DoS protection cap
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            gas_cap = min(gas_estimate * 2, 500000)
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_cap})
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            # N-05: bounded wait — a never-mined tx returns 504 + tx_hash
            tx_receipt = _wait_for_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            return jsonify({
                "message": "Bond purchased successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id,
                "amount": amount
            }), 200
            
        except ReceiptTimeout as e:
            logger.warning(f"Transaction not mined within {RECEIPT_TIMEOUT_SECONDS}s: {_log_safe(e.tx_hash)}")
            return jsonify({
                "error": "Transaction not yet mined. It may still be pending — check the explorer with this tx hash.",
                "tx_hash": e.tx_hash
            }), 504
        except Exception as e:
            logger.error(f"Smart contract transaction failed for purchase bond: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Transaction failed on blockchain. Please try again."}), 500

    except Exception as e:
        logger.error(f"Unexpected error in purchase_bond: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/bond/sell', methods=['POST'])
def sell_bond():
    """Sell a bond - calls the smart contract's sellBond function"""
    try:
        logger.info("Sell bond endpoint called")
        # Validate the payload FIRST so bad input yields 400s even when the
        # chain is unreachable (deterministic error semantics — M-06).
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "Invalid JSON body"}), 400
        logger.debug(f"Sell bond data received: {_log_safe(_sanitize(str(data)))}")
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        buyer_address = data.get('buyerAddress')
        
        # Validate required fields
        if bond_id is None or amount is None or not buyer_address:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types (H-06b: bad input → 400, not 500;
        # N-04: non-integral values are REJECTED, not silently truncated)
        bond_id, err = _int_field(bond_id, 'bondId')
        if err: return err
        amount, err = _int_field(amount, 'amount')
        if err: return err
        # Deterministic sanity bounds (the contract enforces the rest on-chain)
        if bond_id < 1 or not (1 <= amount <= 2**64):
            return jsonify({"error": "Invalid bondId or amount"}), 400

        # Convert buyer address to checksum format (static call: no live
        # provider needed for validation)
        try:
            buyer_address = Web3.to_checksum_address(buyer_address)
        except Exception:
            return jsonify({"error": "Invalid buyer address format"}), 400
        
        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready
        

        limited = _rate_limit_gate()
        if limited:
            return limited

        # Prepare and execute the smart contract transaction
        tx = contract.functions.sellBond(bond_id, amount, buyer_address)
        try:
            # Estimate gas with DoS protection cap
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            gas_cap = min(gas_estimate * 2, 500000)
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_cap})
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            # N-05: bounded wait — a never-mined tx returns 504 + tx_hash
            tx_receipt = _wait_for_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            return jsonify({
                "message": "Bond sold successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id,
                "amount": amount,
                "buyerAddress": buyer_address
            }), 200
            
        except ReceiptTimeout as e:
            logger.warning(f"Transaction not mined within {RECEIPT_TIMEOUT_SECONDS}s: {_log_safe(e.tx_hash)}")
            return jsonify({
                "error": "Transaction not yet mined. It may still be pending — check the explorer with this tx hash.",
                "tx_hash": e.tx_hash
            }), 504
        except Exception as e:
            logger.error(f"Smart contract transaction failed for sell bond: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Transaction failed on blockchain. Please try again."}), 500

    except Exception as e:
        logger.error(f"Unexpected error in sell_bond: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/bond/redeem', methods=['POST'])
def redeem_bond():
    """Redeem a bond - calls the smart contract's redeemBond function"""
    try:
        logger.info("Redeem bond endpoint called")
        # Validate the payload FIRST so bad input yields 400s even when the
        # chain is unreachable (deterministic error semantics — M-06).
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "Invalid JSON body"}), 400
        logger.debug(f"Redeem bond data received: {_log_safe(_sanitize(str(data)))}")
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        
        # Validate required fields
        if bond_id is None or amount is None:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types (H-06b: bad input → 400, not 500;
        # N-04: non-integral values are REJECTED, not silently truncated)
        bond_id, err = _int_field(bond_id, 'bondId')
        if err: return err
        amount, err = _int_field(amount, 'amount')
        if err: return err
        # Deterministic sanity bounds (the contract enforces the rest on-chain)
        if bond_id < 1 or not (1 <= amount <= 2**64):
            return jsonify({"error": "Invalid bondId or amount"}), 400

        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready
        

        limited = _rate_limit_gate()
        if limited:
            return limited

        # Prepare and execute the smart contract transaction
        tx = contract.functions.redeemBond(bond_id, amount)
        try:
            # Estimate gas with DoS protection cap
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            gas_cap = min(gas_estimate * 2, 500000)
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_cap})
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            # N-05: bounded wait — a never-mined tx returns 504 + tx_hash
            tx_receipt = _wait_for_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            return jsonify({
                "message": "Bond redeemed successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id,
                "amount": amount
            }), 200
            
        except ReceiptTimeout as e:
            logger.warning(f"Transaction not mined within {RECEIPT_TIMEOUT_SECONDS}s: {_log_safe(e.tx_hash)}")
            return jsonify({
                "error": "Transaction not yet mined. It may still be pending — check the explorer with this tx hash.",
                "tx_hash": e.tx_hash
            }), 504
        except Exception as e:
            logger.error(f"Smart contract transaction failed for redeem bond: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Transaction failed on blockchain. Please try again."}), 500

    except Exception as e:
        logger.error(f"Unexpected error in redeem_bond: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/bond/<int:bond_id>/info', methods=['GET'])
def get_bond_info(bond_id):
    """Get information about a specific bond - calls the smart contract's getBondInfo function"""
    try:
        logger.info(f"Get bond info endpoint called for bond {bond_id}")
        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready

        # N-10: view endpoints are rate-limited too (each call is upstream RPC work)
        limited = _rate_limit_gate()
        if limited:
            return limited
        
        # Call the smart contract view function to get bond info
        try:
            bond_info = contract.functions.getBondInfo(bond_id).call()
            
            # The contract returns a tuple/struct with bond information
            # Handle both tuple format and named struct format
            if isinstance(bond_info, dict):
                logger.debug(f"Retrieved bond info for bond {bond_id}")
                return jsonify({
                    "bondId": bond_id,
                    "name": bond_info.get('name', ''),
                    "issuer": bond_info.get('issuer', ''),
                    "faceValue": bond_info.get('faceValue', 0),
                    "maturityDate": bond_info.get('maturityDate', 0),
                    "interestRate": bond_info.get('interestRate', 0),
                    "totalSupply": bond_info.get('totalSupply', 0),
                    "remainingSupply": bond_info.get('remainingSupply', bond_info.get('totalSupply', 0)),
                    "isActive": bond_info.get('isActive', False)
                }), 200
            else:
                # Tuple format. New artifacts return 8 fields (incl.
                # remainingSupply); legacy artifacts return 7.
                logger.debug(f"Retrieved bond info for bond {bond_id} (tuple format)")
                total_supply = bond_info[5]
                remaining = bond_info[6] if len(bond_info) > 6 else total_supply
                is_active = bond_info[7] if len(bond_info) > 7 else bond_info[6]
                return jsonify({
                    "bondId": bond_id,
                    "name": bond_info[0],
                    "issuer": bond_info[1],
                    "faceValue": bond_info[2],
                    "maturityDate": bond_info[3],
                    "interestRate": bond_info[4],
                    "totalSupply": total_supply,
                    "remainingSupply": remaining,
                    "isActive": is_active
                }), 200
                
        except Exception as e:
            logger.error(f"Failed to retrieve bond info from smart contract for bond {bond_id}: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Failed to retrieve bond info"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_bond_info for bond {bond_id}: {_log_safe(_sanitize(str(e)))}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/bond/<int:bond_id>/holders', methods=['GET'])
def get_bond_holders(bond_id):
    """Get list of holders for a specific bond.

    N-09: supports paging via `?offset=&limit=` (on-chain getBondHoldersRange
    when the artifact has it, client-side slice otherwise). Without params the
    full list is returned (backwards compatible). The response carries `total`
    so callers can page.
    """
    try:
        logger.info(f"Get bond holders endpoint called for bond {bond_id}")

        # N-10: rate-limited (an unbounded holder list is expensive RPC work)
        limited = _rate_limit_gate()
        if limited:
            return limited

        # N-09: optional paging parameters — validated BEFORE chain contact
        # (M-06: bad input → 400 even when the chain is unreachable)
        offset, offset_err = _parse_int_param('offset', 0, lo=0)
        if offset_err:
            return offset_err
        raw_limit = request.args.get('limit')
        limit = None
        if raw_limit is not None:
            try:
                limit = int(raw_limit)
            except (TypeError, ValueError):
                return jsonify({'error': 'Invalid limit: expected an integer'}), 400
            limit = max(0, min(limit, 1000))  # hard cap per page

        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready

        paged = limit is not None or offset > 0
        try:
            if paged and hasattr(contract.functions, 'getBondHoldersRange'):
                # On-chain paged view (N-09)
                call_limit = limit if limit is not None else 1000
                holders = contract.functions.getBondHoldersRange(bond_id, offset, call_limit).call()
                if hasattr(contract.functions, 'getBondHoldersCount'):
                    total = contract.functions.getBondHoldersCount(bond_id).call()
                else:
                    total = None
            else:
                # Full list (default) or client-side slice (legacy artifact)
                all_holders = contract.functions.getBondHolders(bond_id).call()
                holders = all_holders[offset:offset + limit] if paged else all_holders
                total = len(all_holders)
            logger.debug(f"Retrieved {len(holders)} holders for bond {bond_id}")
            return jsonify({
                "bondId": bond_id,
                "holders": holders,
                "total": total,
                "offset": offset,
                "limit": limit
            }), 200
        except Exception as e:
            logger.error(f"Failed to retrieve bond holders from smart contract for bond {bond_id}: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Failed to retrieve bond holders"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_bond_holders for bond {bond_id}: {_log_safe(_sanitize(str(e)))}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/bond/<int:bond_id>/holder/<holder_address>/amount', methods=['GET'])
def get_bond_holder_amount(bond_id, holder_address):
    """Get the amount of bonds a specific holder has - calls the smart contract's getBondHolderAmount function"""
    try:
        logger.info(f"Get bond holder amount endpoint called for bond {bond_id}, holder {holder_address}")
        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready
        
        # N-10: rate-limited
        limited = _rate_limit_gate()
        if limited:
            return limited

        # Convert to checksum address (static call: no live provider needed)
        try:
            holder_address = Web3.to_checksum_address(holder_address)
        except Exception:
            return jsonify({"error": "Invalid holder address format"}), 400
        
        # Call the smart contract view function to get bond holder amount
        # Note: The contract function takes both bondId AND holder address
        try:
            amount = contract.functions.getBondHolderAmount(bond_id, holder_address).call()
            logger.debug(f"Retrieved bond holder amount for bond {bond_id}, holder {_log_safe(_sanitize(holder_address))}: {amount}")
            return jsonify({
                "bondId": bond_id,
                "holderAddress": holder_address,
                "amount": amount
            }), 200
        except Exception as e:
            logger.error(f"Failed to retrieve bond holder amount from smart contract for bond {bond_id}, holder {_log_safe(_sanitize(holder_address))}: {_log_safe(_sanitize(str(e)))}")
            return jsonify({"error": "Failed to retrieve holder amount"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_bond_holder_amount for bond {bond_id}, holder {_log_safe(_sanitize(holder_address))}: {_log_safe(_sanitize(str(e)))}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/bond/count', methods=['GET'])
def get_bond_count():
    """Get the total number of bonds issued - calls the smart contract's bondCount function"""
    try:
        logger.info("Get bond count endpoint called")
        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready

        # N-10: rate-limited
        limited = _rate_limit_gate()
        if limited:
            return limited

        try:
            count = contract.functions.bondCount().call()
            logger.debug(f"Retrieved bond count: {count}")
            return jsonify({
                "bondCount": count
            }), 200
        except Exception as e:
            logger.error(f"Failed to retrieve bond count from smart contract: {e}")
            return jsonify({"error": "Failed to retrieve bond count"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_bond_count: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/bond/all', methods=['GET'])
def get_all_bonds():
    """Batch endpoint — returns all bonds (replaces N+1 frontend calls).

    M-02 FIX: uses the on-chain getBondsRange batch view (chunks of 50) so the
    API no longer performs one sequential RPC round-trip per bond. Falls back
    to the per-bond loop for artifacts built before the batch view existed.
    M-03 FIX: rate-limited (each call can trigger upstream RPC work).
    """
    try:
        logger.info("Get all bonds endpoint called")
        not_ready = _chain_ready_response()
        if not_ready:
            return not_ready

        # M-03/N-10: rate-limited (each call can trigger upstream RPC work)
        limited = _rate_limit_gate()
        if limited:
            return limited

        try:
            count = int(contract.functions.bondCount().call())
            bonds = []
            if hasattr(contract.functions, 'getBondsRange'):
                for start in range(1, count + 1, 50):
                    batch = contract.functions.getBondsRange(start, 50).call()
                    for i, b in enumerate(batch):
                        bond_id = start + i
                        if isinstance(b, dict):
                            bonds.append({"bondId": bond_id, **b})
                        else:
                            bonds.append({
                                "bondId": bond_id,
                                "name": b[0],
                                "issuer": b[1],
                                "faceValue": b[2],
                                "maturityDate": b[3],
                                "interestRate": b[4],
                                "totalSupply": b[5],
                                "remainingSupply": b[6] if len(b) > 6 else b[5],
                                "isActive": b[7] if len(b) > 7 else b[6],
                            })
            else:
                for i in range(1, count + 1):
                    try:
                        bond_info = contract.functions.getBondInfo(i).call()
                        if isinstance(bond_info, dict):
                            bonds.append({"bondId": i, **bond_info})
                        else:
                            bonds.append({
                                "bondId": i,
                                "name": bond_info[0],
                                "issuer": bond_info[1],
                                "faceValue": bond_info[2],
                                "maturityDate": bond_info[3],
                                "interestRate": bond_info[4],
                                "totalSupply": bond_info[5],
                                "remainingSupply": bond_info[6] if len(bond_info) > 6 else bond_info[5],
                                "isActive": bond_info[7] if len(bond_info) > 7 else bond_info[6],
                            })
                    except Exception as e:
                        logger.warning(f"Could not retrieve bond {i}: {e}")
            logger.debug(f"Retrieved {len(bonds)} bonds")
            return jsonify({"bonds": bonds, "bondCount": count}), 200
        except Exception as e:
            logger.error(f"Failed to retrieve all bonds from smart contract: {e}")
            return jsonify({"error": "Failed to retrieve bonds"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_all_bonds: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/status', methods=['GET'])
def get_api_status():
    """Get API status information including blockchain connection status"""
    # N-10: rate-limited like the other authenticated views
    limited = _rate_limit_gate()
    if limited:
        return limited

    blockchain_connected = False
    if w3 is not None:
        try:
            blockchain_connected = w3.is_connected()
        except Exception:
            blockchain_connected = False

    cmc_api_configured = bool(COINMARKETCAP_API_KEY)
    cmc_cache_entries = len(_cmc_cache)

    return jsonify({
        "status": "API is running",
        # C-01: this API is a single-tenant owner dashboard — every transaction
        # is signed by the operator key. It is not a multi-user custody service.
        "model": "single-tenant owner dashboard (all txs signed by the operator key)",
        # H-02: economic model is intentionally locked to bookkeeping-only for
        # the MVP — no coupons, no secondary-market pricing, no fees. The
        # interest rate is recorded (basis points) but not paid out by any
        # engine; see README "Economic model (MVP scope)".
        "economic_model": "bookkeeping-only (no coupons/pricing/fees; interestRate recorded, not paid)",
        "blockchain_connected": blockchain_connected,
        "contract_deployed": contract is not None,
        "contract_address": CONTRACT_ADDRESS if CONTRACT_ADDRESS else "Not configured",
        "cmc_api_configured": cmc_api_configured,
        "cmc_cache_size": cmc_cache_entries,
        "rate_limit": {
            "max_requests": _RATE_LIMIT_MAX_REQUESTS,
            "window_seconds": _RATE_LIMIT_WINDOW_SECONDS
        },
        "endpoints": [
            "/health",
            "/status",
            "/contract/address",
            "/bond/issue",
            "/bond/purchase",
            "/bond/sell",
            "/bond/redeem",
            "/bond/count",
            "/bond/<bond_id>/info",
            "/bond/<bond_id>/holders",
            "/bond/<bond_id>/holder/<holder_address>/amount",
            "/crypto/listings",
            "/crypto/ohlc",
            "/crypto/supply",
            "/crypto/movers-gainers",
            "/crypto/global-metrics",
            "/crypto/convert",
            "/crypto/news",
            "/crypto/trending"
        ]
    })

@app.route('/openapi.yaml')
def openapi_spec():
    """Serve the OpenAPI specification file."""
    return send_from_directory(
        os.path.abspath(os.path.dirname(__file__)),
        'openapi.yaml'
    )

@app.route('/docs')
def swagger_ui():
    """Serve Swagger UI for the API.

    L-09 FIX: the ~10 KB inline HTML string moved to templates/docs.html;
    the auth panel now accepts the raw token ("Bearer " is added automatically).
    """
    return render_template('docs.html')


# ============ Cryptocurrency Market Proxy Endpoints ============

# H-06 FIX: the base URL used to embed `/v1`, so endpoints that carried their
# own version prefix resolved to `.../v1/v1/...` (convert) or `.../v1/v2/...`
# (trending) and 404'd. The version prefix now belongs to each endpoint path.
_CMC_BASE_URL = 'https://pro-api.coinmarketcap.com'
_CMC_HEADERS = {}
if COINMARKETCAP_API_KEY:
    _CMC_HEADERS['X-CMC_PRO_API_KEY'] = COINMARKETCAP_API_KEY
    _CMC_HEADERS['Accept'] = 'application/json'


def _parse_int_param(name, default, lo=None, hi=None):
    """H-06b FIX: parse an integer query param safely.

    Returns (value, error_response). `?limit=abc` now yields a 400 instead of
    an unhandled ValueError (500). Bounds are clamped.
    """
    raw = request.args.get(name)
    if raw is None:
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, (jsonify({'error': f'Invalid {name}: expected an integer'}), 400)
    if lo is not None and value < lo:
        value = lo
    if hi is not None and value > hi:
        value = hi
    return value, None


# N-17 FIX: the CoinDesk RSS is external content — parse it with defusedxml
# (entity-expansion / XXE hygiene) per stdlib guidance for untrusted XML.
# Fall back to the stdlib parser only if the dependency is missing.
try:
    import defusedxml.ElementTree as _rss_et
except ImportError:  # pragma: no cover - defusedxml is a production dep
    import xml.etree.ElementTree as _rss_et  # nosec B405 -- stdlib fallback only


def _call_cm_api(endpoint, params=None, cache_ttl=None):
    """Proxied call to CoinMarketCap API. Key never exposed to frontend. Uses caching."""
    if cache_ttl is not None:
        params_str = json.dumps(params or {}, sort_keys=True)
        cache_key = f'{endpoint}:{params_str}'
        cached = _cache_get(cache_key)
        if cached is not None:
            logger.debug(f'Cache hit for {_sanitize(cache_key)}')
            return cached

    if not COINMARKETCAP_API_KEY:
        logger.warning('CoinMarketCap API key not configured')
        return {
            'error': 'CoinMarketCap API key not configured. Set COINMARKETCAP_API_KEY in .env file.',
            'detail': 'Obtain a free API key from https://coinmarketcap.com/api/'
        }

    try:
        url = f'{_CMC_BASE_URL}{endpoint}'
        resp = requests_lib.get(url, headers=_CMC_HEADERS, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if cache_ttl is not None:
            _cache_set(cache_key, data, ttl=cache_ttl)
        return data
    except requests_lib.HTTPError as e:
        # N-11: the error text embeds the (user-influenceable) URL — sanitize
        logger.error(f'CoinMarketCap API HTTP error: {_log_safe(_sanitize(str(e)))}')
        if e.response is not None:
            return {'error': f'CoinMarketCap API error: {e.response.status_code}', 'detail': e.response.text}
        return {'error': f'CoinMarketCap API error: {str(e)}'}
    except requests_lib.RequestException as e:
        logger.error(f'CoinMarketCap API request error: {_log_safe(_sanitize(str(e)))}')
        return {'error': f'Failed to reach CoinMarketCap API: {str(e)}'}


@app.route('/crypto/listings', methods=['GET'])
def crypto_listings():
    """Fetch top N cryptocurrencies (converted to USD). Supports pagination and category filtering."""
    limited = _rate_limit_gate()
    if limited:
        return limited

    limit, limit_err = _parse_int_param('limit', 100, hi=5000)
    start, start_err = _parse_int_param('start', 1, lo=1)
    if limit_err or start_err:
        return limit_err or start_err
    tag = request.args.get('tag', None)

    # N-11: `tag` is user-controlled — sanitize before logging
    logger.info(f'Crypto listings requested: limit={limit}, start={start}, tag={_log_safe(tag)}')

    if tag:
        # N-19 FIX: a rare tag can fall outside the caller's `limit` window
        # (the old code fetched only `limit` rows and then filtered, so a
        # small limit could return zero rows that looked like a bug). Fetch a
        # wider window (at least 1000, capped at the CMC max) and filter that.
        fetch_limit = max(limit, 1000)
        list_data = _call_cm_api('/v1/cryptocurrency/listings/latest', {
            'start': start,
            'limit': fetch_limit,
            'convert': 'USD'
        }, cache_ttl=_CMC_CACHE_TTL)
        if 'error' in list_data:
            return jsonify(list_data), 502
        filtered = [c for c in list_data.get('data', []) if tag in (c.get('tags', []) or [])]
        transformed = []
        for crypto in filtered:
            usd = crypto.get('quote', {}).get('USD', {})
            transformed.append({
                'id': crypto.get('id'),
                'name': crypto.get('name'),
                'symbol': crypto.get('symbol'),
                'slug': crypto.get('slug'),
                'cmc_rank': crypto.get('cmc_rank'),
                'quote': {
                    'USD': {
                        'price': usd.get('price'),
                        'volume_24h': usd.get('volume_24h'),
                        'volume_24h_change_24h': usd.get('volume_24h_change_24h'),
                        'market_cap': usd.get('market_cap'),
                        'market_cap_dominance': usd.get('market_cap_dominance'),
                        'fully_diluted_market_cap': usd.get('fully_diluted_market_cap'),
                        'total_supply': crypto.get('total_supply'),
                        'max_supply': crypto.get('max_supply'),
                        'circulating_supply': crypto.get('circulating_supply'),
                        'percent_change_1h': usd.get('percent_change_1h'),
                        'percent_change_24h': usd.get('percent_change_24h'),
                        'percent_change_7d': usd.get('percent_change_7d'),
                        'percent_change_30d': usd.get('percent_change_30d'),
                        'percent_change_60d': usd.get('percent_change_60d'),
                        'percent_change_90d': usd.get('percent_change_90d'),
                        'ath': usd.get('ath'),
                        'ath_date': usd.get('ath_date'),
                        'last_updated': crypto.get('last_updated'),
                    }
                },
                'tags': crypto.get('tags', []),
                'total_supply': crypto.get('total_supply'),
                'max_supply': crypto.get('max_supply'),
            })
        return jsonify({'data': transformed}), 200

    data = _call_cm_api('/v1/cryptocurrency/listings/latest', {
        'start': start,
        'limit': limit,
        'convert': 'USD'
    }, cache_ttl=_CMC_CACHE_TTL)
    if 'error' in data:
        return jsonify(data), 502
    # Transform to flat format for frontend consumption (no tag filter here)
    transformed = []
    for crypto in data.get('data', []):
        usd = crypto.get('quote', {}).get('USD', {})
        transformed.append({
            'id': crypto.get('id'),
            'name': crypto.get('name'),
            'symbol': crypto.get('symbol'),
            'slug': crypto.get('slug'),
            'cmc_rank': crypto.get('cmc_rank'),
            'quote': {
                'USD': {
                    'price': usd.get('price'),
                    'volume_24h': usd.get('volume_24h'),
                    'volume_24h_change_24h': usd.get('volume_24h_change_24h'),
                    'market_cap': usd.get('market_cap'),
                    'market_cap_dominance': usd.get('market_cap_dominance'),
                    'fully_diluted_market_cap': usd.get('fully_diluted_market_cap'),
                    'total_supply': crypto.get('total_supply'),
                    'max_supply': crypto.get('max_supply'),
                    'circulating_supply': crypto.get('circulating_supply'),
                    'percent_change_1h': usd.get('percent_change_1h'),
                    'percent_change_24h': usd.get('percent_change_24h'),
                    'percent_change_7d': usd.get('percent_change_7d'),
                    'percent_change_30d': usd.get('percent_change_30d'),
                    'percent_change_60d': usd.get('percent_change_60d'),
                    'percent_change_90d': usd.get('percent_change_90d'),
                    'ath': usd.get('ath'),
                    'ath_date': usd.get('ath_date'),
                    'last_updated': crypto.get('last_updated'),
                }
            },
            'tags': crypto.get('tags', []),
        })
    return jsonify({'data': transformed}), 200


@app.route('/crypto/ohlc', methods=['GET'])
def crypto_ohlc():
    """Fetch OHLC data for a single cryptocurrency."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    symbol = request.args.get('symbol', 'BTC')
    days = request.args.get('days', 7, type=int)

    if days < 1 or days > 365:
        return jsonify({'error': 'Days must be between 1 and 365'}), 400

    duration_in_days = days
    interval = '1h' if days == 1 else '1D'
    start, start_err = _parse_int_param('start', 0, lo=0)
    if start_err:
        return start_err
    start = start or (int(time.time()) - days * 24 * 60 * 60)
    end = request.args.get('end', str(int(time.time())))

    data = _call_cm_api('/v1/cryptocurrency/ohlc', {
        'symbol': symbol,
        'duration_in_days': duration_in_days,
        'interval': interval,
        'convert': 'USD'
    }, cache_ttl=_CMC_CACHE_TTL_SHORT)
    if 'error' in data:
        return jsonify(data), 502
    return jsonify(data), 200


@app.route('/crypto/supply', methods=['GET'])
def crypto_supply():
    """Fetch supply data for a single cryptocurrency."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    symbol = request.args.get('symbol', 'BTC')
    data = _call_cm_api('/v1/cryptocurrency/supply', {
        'symbol': symbol,
        'convert': 'USD'
    }, cache_ttl=_CMC_CACHE_TTL)
    if 'error' in data:
        return jsonify(data), 502
    return jsonify(data), 200


@app.route('/crypto/movers-gainers', methods=['GET'])
def crypto_movers_gainers():
    """Fetch top movers and gainers from CoinMarketCap."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    data = _call_cm_api('/v1/cryptocurrency/trending/gainers-losers', {
        'time_interval': '24h',
        'limit': 10,
        'convert': 'USD'
    }, cache_ttl=_CMC_CACHE_TTL_SHORT)
    if 'error' in data:
        return jsonify(data), 502
    return jsonify(data), 200


@app.route('/crypto/global-metrics', methods=['GET'])
def crypto_global_metrics():
    """Fetch global cryptocurrency market metrics."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    data = _call_cm_api('/v1/cryptocurrency/metrics/global-metrics', {
        'time_interval': '24h',
        'convert': 'USD'
    }, cache_ttl=_CMC_CACHE_TTL)
    if 'error' in data:
        return jsonify(data), 502
    return jsonify(data), 200


@app.route('/crypto/convert', methods=['GET'])
def crypto_convert():
    """Convert crypto amount to another currency."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    symbol = request.args.get('symbol', 'BTC')
    try:  # H-06b: ?amount=abc → 400, not 500
        amount = float(request.args.get('amount', 1))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid amount: expected a number'}), 400
    convert = request.args.get('convert', 'USD')
    # H-06 FIX: was '/v1/currency/convert' → resolved to .../v1/v1/currency/convert (404)
    data = _call_cm_api('/v1/currency/convert', {
        'symbol': symbol,
        'amount': amount,
        'convert_symbol': convert
    }, cache_ttl=_CMC_CACHE_TTL_SHORT)
    if 'error' in data:
        return jsonify(data), 502
    return jsonify(data), 200


@app.route('/crypto/news', methods=['GET'])
def crypto_news():
    """Fetch cryptocurrency news. Uses CoinDesk RSS as fallback since CMC news requires paid tier."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    # M-04 FIX: the RSS feed is cached for 15 minutes (previously every request
    # did a live fetch with a 15 s timeout that could stall a worker), and on
    # failure we return an EMPTY feed clearly labelled unavailable — the old
    # 8-item hardcoded "news" list (fake headlines presented as live) is gone.
    cached = _cache_get('news:coindesk')
    if cached is not None:
        return jsonify(cached), 200

    try:
        url = 'https://www.coindesk.com/feeds/latest/rss'
        resp = requests_lib.get(url, timeout=10)
        resp.raise_for_status()
        # N-17: defusedxml for external content (entity-expansion hygiene);
        # `_rss_et` falls back to the stdlib parser if the dep is missing
        root = _rss_et.fromstring(resp.content)  # nosec B314 -- defusedxml is the primary path
        items = []
        for i, item in enumerate(root.findall('.//item')):
            title = item.find('title')
            link = item.find('link')
            pubDate = item.find('pubDate')
            if title is not None and link is not None:
                items.append({
                    'id': i + 1,
                    'title': title.text if title.text else '',
                    'url': link.text if link.text else '',
                    'source': 'CoinDesk',
                    'time': pubDate.text if pubDate is not None and pubDate.text else '',
                })
            if len(items) >= 20:
                break
        if items:
            payload = {'data': items, 'source': 'CoinDesk'}
            _cache_set('news:coindesk', payload, ttl=900)  # 15 min
            return jsonify(payload), 200
    except Exception as e:
        logger.warning(f'CoinDesk RSS fetch failed: {e}')

    return jsonify({
        'data': [],
        'source': 'unavailable',
        'message': 'News feed temporarily unavailable. Please try again later.',
    }), 200


@app.route('/crypto/trending', methods=['GET'])
def crypto_trending():
    """Fetch trending cryptocurrencies from CoinMarketCap."""
    # N-10: rate-limited (each call is upstream RPC work)
    limited = _rate_limit_gate()
    if limited:
        return limited

    # H-06 FIX: was '/v2/trending' → resolved to .../v1/v2/trending (404)
    data = _call_cm_api('/v2/trending', {}, cache_ttl=_CMC_CACHE_TTL_SHORT)
    if 'error' in data:
        # Fallback: return top coins by rank
        listings = _call_cm_api('/v1/cryptocurrency/listings/latest', {
            'start': 1,
            'limit': 10,
            'convert': 'USD'
        }, cache_ttl=_CMC_CACHE_TTL_SHORT)
        if 'error' in listings:
            return jsonify({'data': []}), 200
        trending = []
        for coin in listings.get('data', []):
            trending.append({
                'id': coin.get('id'),
                'name': coin.get('name'),
                'symbol': coin.get('symbol'),
                'rank': coin.get('cmc_rank'),
                'quote': coin.get('quote', {}),
            })
        return jsonify({'data': trending}), 200
    return jsonify(data), 200


if __name__ == "__main__":
    # M-06: fail fast at process start (config import itself no longer raises)
    validate_config()
    # Allow overriding port via environment variable (default 5000)
    port = int(os.getenv("PORT", 5000))
    # C-03 FIX: debug mode controlled by environment — never True in production
    debug_mode = os.getenv('DEBUG', 'false').lower() in ('true', '1', 'yes')
    app.run(host="0.0.0.0", port=port, debug=debug_mode)  # nosec B104 -- dev launcher; production uses gunicorn (Dockerfile)
