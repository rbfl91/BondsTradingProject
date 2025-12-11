from flask import Flask, request, jsonify, send_from_directory
from web3 import Web3
import json
from .config import WEB3_PROVIDER, DEFAULT_WEB3_PROVIDER, CONTRACT_ADDRESS
import os
import logging

# Initialize Flask app
app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Global variables for blockchain connection and contract
w3 = None
contract = None

@app.before_request
def ensure_connection():
    global w3, contract
    # Only attempt to connect if a contract address is configured.
    # When running unit tests we may mock ``w3`` and ``contract``; in that case
    # ``w3`` might not have an ``is_connected`` attribute. Guard against that
    # to avoid AttributeError during the request lifecycle.
    if CONTRACT_ADDRESS:
        # Connect if we have never connected, or if the existing client reports
        # it is not connected (and the method exists).
        if w3 is None or (hasattr(w3, "is_connected") and not w3.is_connected()):
            w3 = connect_to_blockchain()
        # Initialise the contract object only when we have a live client.
        if contract is None and w3 is not None:
            contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=get_contract_abi())

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
        
        return w3
    except Exception as e:
        # Log the error and continue without a connection
        logger.error(f"Blockchain connection error: {e}")
        return None

# Load contract ABI from the build artifacts or define it inline
def get_contract_abi():
    # Try to load ABI from build artifacts first
    try:
        abi_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'build', 'contracts', 'BondTrading.json')
        if os.path.exists(abi_path):
            with open(abi_path, 'r') as f:
                contract_json = json.load(f)
                return contract_json.get('abi', [])
    except Exception as e:
        print(f"Failed to load ABI from file: {e}")
    
    # Fallback to inline ABI definition matching the actual BondTrading.sol contract
    abi = [
        {
            "inputs": [
                {"internalType": "address", "name": "_bondTokenAddress", "type": "address"},
                {"internalType": "address", "name": "initialOwner", "type": "address"}
            ],
            "stateMutability": "nonpayable",
            "type": "constructor"
        },
        {
            "anonymous": False,
            "inputs": [
                {"indexed": False, "internalType": "uint256", "name": "bondId", "type": "uint256"},
                {"indexed": False, "internalType": "string", "name": "name", "type": "string"},
                {"indexed": False, "internalType": "string", "name": "issuer", "type": "string"},
                {"indexed": False, "internalType": "uint256", "name": "faceValue", "type": "uint256"}
            ],
            "name": "BondIssued",
            "type": "event"
        },
        {
            "anonymous": False,
            "inputs": [
                {"indexed": False, "internalType": "uint256", "name": "bondId", "type": "uint256"},
                {"indexed": False, "internalType": "address", "name": "buyer", "type": "address"},
                {"indexed": False, "internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "BondPurchased",
            "type": "event"
        },
        {
            "anonymous": False,
            "inputs": [
                {"indexed": False, "internalType": "uint256", "name": "bondId", "type": "uint256"},
                {"indexed": False, "internalType": "address", "name": "seller", "type": "address"},
                {"indexed": False, "internalType": "address", "name": "buyer", "type": "address"},
                {"indexed": False, "internalType": "uint256", "name": "amount", "type": "uint256"}
            ],
            "name": "BondSold",
            "type": "event"
        },
        {
            "inputs": [
                {"internalType": "string", "name": "_name", "type": "string"},
                {"internalType": "string", "name": "_issuer", "type": "string"},
                {"internalType": "uint256", "name": "_faceValue", "type": "uint256"},
                {"internalType": "uint256", "name": "_maturityDate", "type": "uint256"},
                {"internalType": "uint256", "name": "_interestRate", "type": "uint256"},
                {"internalType": "uint256", "name": "_supply", "type": "uint256"}
            ],
            "name": "issueBond",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"},
                {"internalType": "uint256", "name": "_amount", "type": "uint256"}
            ],
            "name": "purchaseBond",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"},
                {"internalType": "uint256", "name": "_amount", "type": "uint256"},
                {"internalType": "address", "name": "_buyer", "type": "address"}
            ],
            "name": "sellBond",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"},
                {"internalType": "uint256", "name": "_amount", "type": "uint256"}
            ],
            "name": "redeemBond",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"}
            ],
            "name": "getBondInfo",
            "outputs": [
                {
                    "components": [
                        {"internalType": "string", "name": "name", "type": "string"},
                        {"internalType": "string", "name": "issuer", "type": "string"},
                        {"internalType": "uint256", "name": "faceValue", "type": "uint256"},
                        {"internalType": "uint256", "name": "maturityDate", "type": "uint256"},
                        {"internalType": "uint256", "name": "interestRate", "type": "uint256"},
                        {"internalType": "uint256", "name": "totalSupply", "type": "uint256"},
                        {"internalType": "bool", "name": "isActive", "type": "bool"}
                    ],
                    "internalType": "struct BondTrading.Bond",
                    "name": "",
                    "type": "tuple"
                }
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"}
            ],
            "name": "getBondHolders",
            "outputs": [
                {"internalType": "address[]", "name": "", "type": "address[]"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"},
                {"internalType": "address", "name": "_holder", "type": "address"}
            ],
            "name": "getBondHolderAmount",
            "outputs": [
                {"internalType": "uint256", "name": "", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "bondCount",
            "outputs": [
                {"internalType": "uint256", "name": "", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        }
    ]
    return abi

# Initialize blockchain connection placeholders
w3 = None
contract = None

# The main API endpoints
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    logger.info("Health check requested")
    return jsonify({"status": "healthy"})

@app.route('/contract/address', methods=['GET'])
def get_contract_address():
    """Get the contract address"""
    logger.info("Contract address requested")
    return jsonify({"contract_address": CONTRACT_ADDRESS if CONTRACT_ADDRESS else "Not configured"})

@app.route('/bond/issue', methods=['POST'])
def issue_bond():
    """Issue a new bond - calls the smart contract's issueBond function"""
    try:
        logger.info("Issue bond endpoint called")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for issue bond")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        data = request.get_json()
        logger.debug(f"Issue bond data received: {data}")
        
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
        
        # Convert to appropriate types
        face_value = int(face_value)
        maturity_date = int(maturity_date)
        interest_rate = int(interest_rate)
        supply = int(supply)
        
        # Prepare and execute the smart contract transaction
        tx = contract.functions.issueBond(name, issuer, face_value, maturity_date, interest_rate, supply)
        try:
            # Estimate gas for the transaction
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            # Send transaction to the blockchain
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_estimate})
            # Wait for transaction to be mined
            tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            
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
                            continue
                except Exception:
                    pass
            
            return jsonify({
                "message": "Bond issued successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id
            }), 201
            
        except Exception as e:
            logger.error(f"Smart contract transaction failed for issue bond: {e}")
            return jsonify({"error": f"Smart contract transaction failed: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in issue_bond: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/purchase', methods=['POST'])
def purchase_bond():
    """Purchase a bond - calls the smart contract's purchaseBond function"""
    try:
        logger.info("Purchase bond endpoint called")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for purchase bond")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        data = request.get_json()
        logger.debug(f"Purchase bond data received: {data}")
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        
        # Validate required fields
        if bond_id is None or amount is None:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        bond_id = int(bond_id)
        amount = int(amount)
        
        # Prepare and execute the smart contract transaction
        tx = contract.functions.purchaseBond(bond_id, amount)
        try:
            # Estimate gas for the transaction
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            # Send transaction to the blockchain
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_estimate})
            # Wait for transaction to be mined
            tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            
            return jsonify({
                "message": "Bond purchased successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id,
                "amount": amount
            }), 200
            
        except Exception as e:
            logger.error(f"Smart contract transaction failed for purchase bond: {e}")
            return jsonify({"error": f"Smart contract transaction failed: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in purchase_bond: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/sell', methods=['POST'])
def sell_bond():
    """Sell a bond - calls the smart contract's sellBond function"""
    try:
        logger.info("Sell bond endpoint called")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for sell bond")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        data = request.get_json()
        logger.debug(f"Sell bond data received: {data}")
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        buyer_address = data.get('buyerAddress')
        
        # Validate required fields
        if bond_id is None or amount is None or not buyer_address:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        bond_id = int(bond_id)
        amount = int(amount)
        
        # Convert buyer address to checksum format
        try:
            buyer_address = w3.to_checksum_address(buyer_address)
        except Exception:
            return jsonify({"error": "Invalid buyer address format"}), 400
        
        # Prepare and execute the smart contract transaction
        tx = contract.functions.sellBond(bond_id, amount, buyer_address)
        try:
            # Estimate gas for the transaction
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            # Send transaction to the blockchain
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_estimate})
            # Wait for transaction to be mined
            tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            
            return jsonify({
                "message": "Bond sold successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id,
                "amount": amount,
                "buyerAddress": buyer_address
            }), 200
            
        except Exception as e:
            logger.error(f"Smart contract transaction failed for sell bond: {e}")
            return jsonify({"error": f"Smart contract transaction failed: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in sell_bond: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/redeem', methods=['POST'])
def redeem_bond():
    """Redeem a bond - calls the smart contract's redeemBond function"""
    try:
        logger.info("Redeem bond endpoint called")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for redeem bond")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        data = request.get_json()
        logger.debug(f"Redeem bond data received: {data}")
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        
        # Validate required fields
        if bond_id is None or amount is None:
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        bond_id = int(bond_id)
        amount = int(amount)
        
        # Prepare and execute the smart contract transaction
        tx = contract.functions.redeemBond(bond_id, amount)
        try:
            # Estimate gas for the transaction
            gas_estimate = tx.estimate_gas({'from': w3.eth.default_account})
            # Send transaction to the blockchain
            tx_hash = tx.transact({'from': w3.eth.default_account, 'gas': gas_estimate})
            # Wait for transaction to be mined
            tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            
            if tx_receipt.status != 1:
                return jsonify({"error": "Transaction failed on blockchain"}), 500
            
            # Ensure tx_hash is a hex string regardless of its type
            tx_hash_str = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            
            return jsonify({
                "message": "Bond redeemed successfully",
                "tx_hash": tx_hash_str,
                "bondId": bond_id,
                "amount": amount
            }), 200
            
        except Exception as e:
            logger.error(f"Smart contract transaction failed for redeem bond: {e}")
            return jsonify({"error": f"Smart contract transaction failed: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in redeem_bond: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/<int:bond_id>/info', methods=['GET'])
def get_bond_info(bond_id):
    """Get information about a specific bond - calls the smart contract's getBondInfo function"""
    try:
        logger.info(f"Get bond info endpoint called for bond {bond_id}")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for get bond info")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
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
                    "isActive": bond_info.get('isActive', False)
                }), 200
            else:
                # Tuple format
                logger.debug(f"Retrieved bond info for bond {bond_id} (tuple format)")
                return jsonify({
                    "bondId": bond_id,
                    "name": bond_info[0],
                    "issuer": bond_info[1],
                    "faceValue": bond_info[2],
                    "maturityDate": bond_info[3],
                    "interestRate": bond_info[4],
                    "totalSupply": bond_info[5],
                    "isActive": bond_info[6]
                }), 200
                
        except Exception as e:
            logger.error(f"Failed to retrieve bond info from smart contract for bond {bond_id}: {e}")
            return jsonify({"error": f"Failed to retrieve bond info from smart contract: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in get_bond_info for bond {bond_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/<int:bond_id>/holders', methods=['GET'])
def get_bond_holders(bond_id):
    """Get list of holders for a specific bond - calls the smart contract's getBondHolders function"""
    try:
        logger.info(f"Get bond holders endpoint called for bond {bond_id}")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for get bond holders")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        # Call the smart contract view function to get bond holders
        try:
            holders = contract.functions.getBondHolders(bond_id).call()
            logger.debug(f"Retrieved {len(holders)} holders for bond {bond_id}")
            return jsonify({
                "bondId": bond_id,
                "holders": holders
            }), 200
        except Exception as e:
            logger.error(f"Failed to retrieve bond holders from smart contract for bond {bond_id}: {e}")
            return jsonify({"error": f"Failed to retrieve bond holders from smart contract: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in get_bond_holders for bond {bond_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/<int:bond_id>/holder/<holder_address>/amount', methods=['GET'])
def get_bond_holder_amount(bond_id, holder_address):
    """Get the amount of bonds a specific holder has - calls the smart contract's getBondHolderAmount function"""
    try:
        logger.info(f"Get bond holder amount endpoint called for bond {bond_id}, holder {holder_address}")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for get bond holder amount")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        # Convert to checksum address
        try:
            holder_address = w3.to_checksum_address(holder_address)
        except Exception:
            return jsonify({"error": "Invalid holder address format"}), 400
        
        # Call the smart contract view function to get bond holder amount
        # Note: The contract function takes both bondId AND holder address
        try:
            amount = contract.functions.getBondHolderAmount(bond_id, holder_address).call()
            logger.debug(f"Retrieved bond holder amount for bond {bond_id}, holder {holder_address}: {amount}")
            return jsonify({
                "bondId": bond_id,
                "holderAddress": holder_address,
                "amount": amount
            }), 200
        except Exception as e:
            logger.error(f"Failed to retrieve bond holder amount from smart contract for bond {bond_id}, holder {holder_address}: {e}")
            return jsonify({"error": f"Failed to retrieve bond holder amount from smart contract: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in get_bond_holder_amount for bond {bond_id}, holder {holder_address}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/bond/count', methods=['GET'])
def get_bond_count():
    """Get the total number of bonds issued - calls the smart contract's bondCount function"""
    try:
        logger.info("Get bond count endpoint called")
        if w3 is None or contract is None:
            logger.error("Failed to connect to blockchain or contract for get bond count")
            return jsonify({"error": "Failed to connect to blockchain or contract"}), 500
        
        try:
            count = contract.functions.bondCount().call()
            logger.debug(f"Retrieved bond count: {count}")
            return jsonify({
                "bondCount": count
            }), 200
        except Exception as e:
            logger.error(f"Failed to retrieve bond count from smart contract: {e}")
            return jsonify({"error": f"Failed to retrieve bond count from smart contract: {str(e)}"}), 500
        
    except Exception as e:
        logger.error(f"Unexpected error in get_bond_count: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def get_api_status():
    """Get API status information including blockchain connection status"""
    blockchain_connected = False
    if w3 is not None:
        try:
            blockchain_connected = w3.is_connected()
        except Exception:
            blockchain_connected = False
    
    return jsonify({
        "status": "API is running",
        "blockchain_connected": blockchain_connected,
        "contract_deployed": contract is not None,
        "contract_address": CONTRACT_ADDRESS if CONTRACT_ADDRESS else "Not configured",
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
            "/bond/<bond_id>/holder/<holder_address>/amount"
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
    """Serve Swagger UI for the API."""
    return '''
<!DOCTYPE html>
<html>
<head>
  <title>Bond Trading API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
</head>
<body>
<div id="swagger-ui"></div>
<script>
const ui = SwaggerUIBundle({
  url: "/openapi.yaml",
  dom_id: '#swagger-ui',
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: "BaseLayout"
});
</script>
</body>
</html>
'''
