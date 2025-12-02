# Configuration file for the Bond Trading API
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Blockchain configuration
WEB3_PROVIDER = os.getenv('WEB3_PROVIDER', 'http://127.0.0.1:8545')
CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS', '')
CONTRACT_ABI = os.getenv('CONTRACT_ABI', '')

# Default values for local development
DEFAULT_WEB3_PROVIDER = 'http://127.0.0.1:8545'
