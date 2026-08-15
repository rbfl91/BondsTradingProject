# Configuration file for the Bond Trading API
# M-06 FIX: this module no longer raises at import time, so the package can be
# imported in tests/CI without a real .env. Call validate_config() at process
# start (app.py does this in __main__) to fail fast for real deployments.
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Blockchain configuration
WEB3_PROVIDER = os.getenv('WEB3_PROVIDER', 'http://127.0.0.1:8545')
CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS', '')
CONTRACT_ABI = os.getenv('CONTRACT_ABI', '')

# Authentication token (simple bearer token).
# No default fallback — the API refuses to start without it (see validate_config).
AUTH_TOKEN = os.getenv('AUTH_TOKEN')

# Owner account for contract interactions (will be used as default tx sender if set)
OWNER_ADDRESS = os.getenv('OWNER_ADDRESS', '')

# CoinMarketCap API configuration
COINMARKETCAP_API_KEY = os.getenv('COINMARKETCAP_API_KEY', '')

# When the API sits behind a reverse proxy / the Vite dev proxy, the real client
# IP arrives via X-Forwarded-For. Set TRUST_PROXY=1 to use it for rate limiting
# (M-03). Never enable it when the API is directly exposed to the internet.
TRUST_PROXY = os.getenv('TRUST_PROXY', '').lower() in ('1', 'true', 'yes')

# Default values for local development
DEFAULT_WEB3_PROVIDER = 'http://127.0.0.1:8545'


def validate_config() -> None:
    """Fail fast at process start (not at import time)."""
    if not AUTH_TOKEN:
        raise RuntimeError(
            "AUTH_TOKEN environment variable is not set. "
            "Set it in your .env file. Generate one with: openssl rand -hex 32"
        )
