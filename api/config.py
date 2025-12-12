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
AUTH_TOKEN = os.getenv('AUTH_TOKEN', 'default-token')

# Owner account for contract interactions (will be used as default tx sender if set)
OWNER_ADDRESS = os.getenv('OWNER_ADDRESS', '')

# Default values for local development
DEFAULT_WEB3_PROVIDER = 'http://127.0.0.1:8545'
