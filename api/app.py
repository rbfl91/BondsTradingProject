from flask import Flask, request, jsonify, send_from_directory
from web3 import Web3
import json
from config import WEB3_PROVIDER, DEFAULT_WEB3_PROVIDER
import os

# Initialize Flask app
app = Flask(__name__)

@app.before_request
def ensure_connection():
    global w3
    if w3 is None or not w3.is_connected():
        w3 = connect_to_blockchain()

# Connect to blockchain
def connect_to_blockchain():
    try:
        # Try to connect to the blockchain with a timeout
        w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER, request_kwargs={'timeout': 30}))
        
        # Check if connection is successful
        if not w3.is_connected():
            # Try default provider with timeout
            w3 = Web3(Web3.HTTPProvider(DEFAULT_WEB3_PROVIDER, request_kwargs={'timeout': 30}))
            if not w3.is_connected():
                raise Exception("Failed to connect to blockchain")
        
        return w3
    except Exception as e:
        # Log the error and continue without a connection
        print(f"Blockchain connection error: {e}")
        return None

# Load contract ABI
def load_contract_abi():
    # In a real application, you'd load this from a file or contract deployment
    # For now, we'll define it here based on the Solidity contract
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
            "name": "getBondHolderAmount",
            "outputs": [
                {"internalType": "uint256", "name": "", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "uint256", "name": "_bondId", "type": "uint256"}
            ],
            "name": "getBondInfo",
            "outputs": [
                {"internalType": "string", "name": "name", "type": "string"},
                {"internalType": "string", "name": "issuer", "type": "string"},
                {"internalType": "uint256", "name": "faceValue", "type": "uint256"},
                {"internalType": "uint256", "name": "maturityDate", "type": "uint256"},
                {"internalType": "uint256", "name": "interestRate", "type": "uint256"},
                {"internalType": "uint256", "name": "totalSupply", "type": "uint256"},
                {"internalType": "bool", "name": "isActive", "type": "bool"}
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
        }
    ]
    return abi

# Initialize blockchain connection
w3 = connect_to_blockchain()

# Load contract ABI
contract_abi = load_contract_abi()

# The main API endpoints
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

@app.route('/contract/address', methods=['GET'])
def get_contract_address():
    """Get the contract address"""
    # This would be set during deployment
    return jsonify({"contract_address": "0x0000000000000000000000000000000000000000"})

@app.route('/bond/issue', methods=['POST'])
def issue_bond():
    """Issue a new bond"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        data = request.get_json()
        
        # Extract parameters
        name = data.get('name')
        issuer = data.get('issuer')
        face_value = data.get('faceValue')
        maturity_date = data.get('maturityDate')
        interest_rate = data.get('interestRate')
        supply = data.get('supply')
        
        # Validate required fields
        if not all([name, issuer, face_value, maturity_date, interest_rate, supply]):
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        face_value = int(face_value)
        maturity_date = int(maturity_date)
        interest_rate = int(interest_rate)
        supply = int(supply)
        
        # Here we would need to deploy the contract and get its address
        # For now, we'll return a success message
        return jsonify({
            "message": "Bond issued successfully",
            "name": name,
            "issuer": issuer,
            "faceValue": face_value,
            "maturityDate": maturity_date,
            "interestRate": interest_rate,
            "supply": supply
        }), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/bond/purchase', methods=['POST'])
def purchase_bond():
    """Purchase a bond"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        data = request.get_json()
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        
        # Validate required fields
        if not all([bond_id, amount]):
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        bond_id = int(bond_id)
        amount = int(amount)
        
        # Here we would actually call the contract function
        return jsonify({
            "message": "Bond purchased successfully",
            "bondId": bond_id,
            "amount": amount
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/bond/sell', methods=['POST'])
def sell_bond():
    """Sell a bond"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        data = request.get_json()
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        buyer_address = data.get('buyerAddress')
        
        # Validate required fields
        if not all([bond_id, amount, buyer_address]):
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        bond_id = int(bond_id)
        amount = int(amount)
        
        # Here we would actually call the contract function
        return jsonify({
            "message": "Bond sold successfully",
            "bondId": bond_id,
            "amount": amount,
            "buyerAddress": buyer_address
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/bond/redeem', methods=['POST'])
def redeem_bond():
    """Redeem a bond"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        data = request.get_json()
        
        # Extract parameters
        bond_id = data.get('bondId')
        amount = data.get('amount')
        
        # Validate required fields
        if not all([bond_id, amount]):
            return jsonify({"error": "Missing required parameters"}), 400
        
        # Convert to appropriate types
        bond_id = int(bond_id)
        amount = int(amount)
        
        # Here we would actually call the contract function
        return jsonify({
            "message": "Bond redeemed successfully",
            "bondId": bond_id,
            "amount": amount
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/bond/<int:bond_id>/info', methods=['GET'])
def get_bond_info(bond_id):
    """Get information about a specific bond"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        # Here we would actually call the contract function
        return jsonify({
            "bondId": bond_id,
            "message": "Bond information retrieved successfully"
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/bond/<int:bond_id>/holders', methods=['GET'])
def get_bond_holders(bond_id):
    """Get list of holders for a specific bond"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        # Here we would actually call the contract function
        return jsonify({
            "bondId": bond_id,
            "message": "Bond holders retrieved successfully"
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/bond/<int:bond_id>/holder/<holder_address>/amount', methods=['GET'])
def get_bond_holder_amount(bond_id, holder_address):
    """Get the amount of bonds a specific holder has"""
    try:
        if w3 is None:
            return jsonify({"error": "Failed to connect to blockchain"}), 500
        
        # Here we would actually call the contract function
        return jsonify({
            "bondId": bond_id,
            "holderAddress": holder_address,
            "message": "Bond holder amount retrieved successfully"
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def get_api_status():
    """Get API status information"""
    return jsonify({
        "status": "API is running",
        "blockchain_connected": w3.is_connected() if w3 else False,
        "endpoints": [
            "/health",
            "/contract/address",
            "/bond/issue",
            "/bond/purchase", 
            "/bond/sell",
            "/bond/redeem",
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
  <title>Swagger UI</title>
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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
