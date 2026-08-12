# Configuration file for the Bond Trading API
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Blockchain configuration
WEB3_PROVIDER = os.getenv('WEB3_PROVIDER', 'http://127.0.0.1:8545')
CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS', '')
CONTRACT_ABI = os.getenv('CONTRACT_ABI', '')

# Authentication token (simple bearer token)
# C-01 FIX: No default fallback — AUTH_TOKEN MUST be set in .env
AUTH_TOKEN = os.getenv('AUTH_TOKEN')
if not AUTH_TOKEN:
    raise RuntimeError(
        "AUTH_TOKEN environment variable is not set. "
        "Set it in your .env file. Generate one with: openssl rand -hex 32"
    )

# Owner account for contract interactions (will be used as default tx sender if set)
OWNER_ADDRESS = os.getenv('OWNER_ADDRESS', '')

# CoinMarketCap API configuration
COINMARKETCAP_API_KEY = os.getenv('COINMARKETCAP_API_KEY', '')

# Default values for local development
DEFAULT_WEB3_PROVIDER = 'http://127.0.0.1:8545'
