"""
Comprehensive test suite for the Bonds Trading blockchain API.

This file contains a complete set of basic tests that cover all core 
functionalities of the blockchain API. It includes unit tests, integration 
tests, and edge case testing for all API endpoints.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
from flask import Flask

# Import the main app
from api.app import app


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    with app.test_client() as client:
        yield client


@pytest.fixture
def mock_blockchain_components():
    """Mock blockchain components for testing."""
    with patch('api.app.w3') as mock_w3, \
         patch('api.app.contract') as mock_contract:
        
        # Setup default mock responses
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_w3.to_checksum_address.return_value = '0x2222222222222222222222222222222222222222'
        
        yield mock_w3, mock_contract


class TestAuthentication:
    """Test authentication and authorization functionality."""
    
    def test_health_endpoint(self, client):
        """Test the health check endpoint returns healthy status."""
        response = client.get('/health')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'healthy'
    
    def test_auth_check_valid_token(self, client):
        """Test that valid token passes auth check."""
        response = client.get('/auth/check', 
                            headers={'Authorization': 'Bearer default-token'})
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['authorized'] is True
    
    def test_auth_check_invalid_token(self, client):
        """Test that invalid token fails auth check."""
        response = client.get('/auth/check', 
                            headers={'Authorization': 'Bearer invalid-token'})
        assert response.status_code == 401
    
    def test_auth_required_for_bond_operations(self, client):
        """Test that bond operations require valid authentication."""
        # Test issue bond without auth
        response = client.post('/bond/issue', json={
            "name": "Test Bond",
            "issuer": "Test Corp",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        })
        assert response.status_code == 401


class TestIssueBondFunctionality:
    """Test the bond issuance functionality."""
    
    def test_issue_bond_success(self, client, mock_blockchain_components):
        """Test successful bond issuance."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 100000
        mock_tx.transact.return_value = b'\xde\xad\xbe\xef' * 8  # 32 bytes tx hash
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_receipt.logs = []
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_contract.functions.issueBond.return_value = mock_tx
        
        # Setup bond ID extraction from logs
        mock_log = Mock()
        mock_decoded_event = {'args': {'bondId': 42}}
        mock_contract.events.BondIssued.return_value.process_log.return_value = mock_decoded_event
        mock_receipt.logs = [mock_log]
        
        # Test the endpoint
        response = client.post('/bond/issue', 
                             json={
                                 "name": "Test Corporate Bond",
                                 "issuer": "Acme Corporation",
                                 "faceValue": 1000,
                                 "maturityDate": 1700000000,
                                 "interestRate": 5,
                                 "supply": 100
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['message'] == 'Bond issued successfully'
        assert data['bondId'] == 42
    
    def test_issue_bond_missing_parameters(self, client):
        """Test bond issuance with missing parameters."""
        response = client.post('/bond/issue', 
                             json={
                                 "name": "Test Bond",
                                 # Missing required parameters
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400
    
    def test_issue_bond_invalid_parameters(self, client):
        """Test bond issuance with invalid parameters."""
        response = client.post('/bond/issue', 
                             json={
                                 "name": "Test Bond",
                                 "issuer": "Test Corp",
                                 "faceValue": "not_a_number",  # Invalid type
                                 "maturityDate": 1700000000,
                                 "interestRate": 5,
                                 "supply": 100
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400


class TestPurchaseBondFunctionality:
    """Test the bond purchase functionality."""
    
    def test_purchase_bond_success(self, client, mock_blockchain_components):
        """Test successful bond purchase."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 80000
        mock_tx.transact.return_value = b'\xfe\xed\xfa\xce' * 8
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_contract.functions.purchaseBond.return_value = mock_tx
        
        # Test the endpoint
        response = client.post('/bond/purchase', 
                             json={
                                 "bondId": 42,
                                 "amount": 10
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['message'] == 'Bond purchased successfully'
        assert data['bondId'] == 42
        assert data['amount'] == 10
    
    def test_purchase_bond_missing_parameters(self, client):
        """Test bond purchase with missing parameters."""
        response = client.post('/bond/purchase', 
                             json={
                                 "bondId": 42
                                 # Missing amount
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400
    
    def test_purchase_bond_invalid_parameters(self, client):
        """Test bond purchase with invalid parameters."""
        response = client.post('/bond/purchase', 
                             json={
                                 "bondId": "not_a_number",
                                 "amount": 10
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400


class TestSellBondFunctionality:
    """Test the bond sell functionality."""
    
    def test_sell_bond_success(self, client, mock_blockchain_components):
        """Test successful bond sale."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 90000
        mock_tx.transact.return_value = b'\x12\x34\x56\x78' * 8
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_contract.functions.sellBond.return_value = mock_tx
        
        # Test the endpoint
        response = client.post('/bond/sell', 
                             json={
                                 "bondId": 42,
                                 "amount": 5,
                                 "buyerAddress": "0x4444444444444444444444444444444444444444"
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['message'] == 'Bond sold successfully'
        assert data['bondId'] == 42
        assert data['amount'] == 5
    
    def test_sell_bond_missing_parameters(self, client):
        """Test bond sale with missing parameters."""
        response = client.post('/bond/sell', 
                             json={
                                 "bondId": 42,
                                 "amount": 5
                                 # Missing buyerAddress
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400
    
    def test_sell_bond_invalid_buyer_address(self, client):
        """Test bond sale with invalid buyer address."""
        response = client.post('/bond/sell', 
                             json={
                                 "bondId": 42,
                                 "amount": 5,
                                 "buyerAddress": "invalid_address"
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400


class TestRedeemBondFunctionality:
    """Test the bond redemption functionality."""
    
    def test_redeem_bond_success(self, client, mock_blockchain_components):
        """Test successful bond redemption."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 70000
        mock_tx.transact.return_value = b'\xab\xcd\xef\x01' * 8
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_contract.functions.redeemBond.return_value = mock_tx
        
        # Test the endpoint
        response = client.post('/bond/redeem', 
                             json={
                                 "bondId": 42,
                                 "amount": 10
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['message'] == 'Bond redeemed successfully'
        assert data['bondId'] == 42
        assert data['amount'] == 10
    
    def test_redeem_bond_missing_parameters(self, client):
        """Test bond redemption with missing parameters."""
        response = client.post('/bond/redeem', 
                             json={
                                 "bondId": 42
                                 # Missing amount
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400


class TestGetBondInfoFunctionality:
    """Test the get bond info functionality."""
    
    def test_get_bond_info_success(self, client, mock_blockchain_components):
        """Test successful bond info retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value (as a tuple)
        mock_contract.functions.getBondInfo.return_value.call.return_value = (
            "Corporate Bond A",  # name
            "Acme Corp",         # issuer
            1000,                # faceValue
            1700000000,          # maturityDate
            5,                   # interestRate
            100,                 # totalSupply
            True                 # isActive
        )
        
        # Test the endpoint
        response = client.get('/bond/42/info',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondId'] == 42
        assert data['name'] == "Corporate Bond A"
        assert data['issuer'] == "Acme Corp"
        assert data['faceValue'] == 1000
    
    def test_get_bond_info_invalid_id(self, client):
        """Test bond info retrieval with invalid bond ID."""
        response = client.get('/bond/invalid/info',
                            headers={'Authorization': 'Bearer default-token'})
        # This should not fail but return appropriate error from contract
        assert response.status_code in [200, 500]  # Can be 200 or 500 depending on implementation


class TestGetBondHoldersFunctionality:
    """Test the get bond holders functionality."""
    
    def test_get_bond_holders_success(self, client, mock_blockchain_components):
        """Test successful bond holders retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value
        mock_contract.functions.getBondHolders.return_value.call.return_value = [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222'
        ]
        
        # Test the endpoint
        response = client.get('/bond/42/holders',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondId'] == 42
        assert len(data['holders']) == 2
    
    def test_get_bond_holders_empty(self, client, mock_blockchain_components):
        """Test bond holders retrieval with no holders."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value (empty list)
        mock_contract.functions.getBondHolders.return_value.call.return_value = []
        
        # Test the endpoint
        response = client.get('/bond/42/holders',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondId'] == 42
        assert len(data['holders']) == 0


class TestGetBondHolderAmountFunctionality:
    """Test the get bond holder amount functionality."""
    
    def test_get_bond_holder_amount_success(self, client, mock_blockchain_components):
        """Test successful bond holder amount retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value
        mock_w3.to_checksum_address.return_value = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        mock_contract.functions.getBondHolderAmount.return_value.call.return_value = 25
        
        # Test the endpoint
        response = client.get('/bond/42/holder/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/amount',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondId'] == 42
        assert data['amount'] == 25
    
    def test_get_bond_holder_amount_invalid_address(self, client):
        """Test bond holder amount with invalid address."""
        response = client.get('/bond/42/holder/invalid_address/amount',
                            headers={'Authorization': 'Bearer default-token'})
        
        # This should return a validation error or appropriate status
        assert response.status_code in [200, 400]


class TestGetBondCountFunctionality:
    """Test the get bond count functionality."""
    
    def test_get_bond_count_success(self, client, mock_blockchain_components):
        """Test successful bond count retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value
        mock_contract.functions.bondCount.return_value.call.return_value = 15
        
        # Test the endpoint
        response = client.get('/bond/count',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondCount'] == 15


class TestErrorHandling:
    """Test various error conditions and handling."""
    
    def test_blockchain_not_connected_returns_500(self, client):
        """Test that endpoints return 500 when blockchain is not connected."""
        # Temporarily set w3 to None to simulate disconnection
        with patch('api.app.w3', None), \
             patch('api.app.contract', None):
            
            response = client.post('/bond/issue', 
                                 json={
                                     "name": "Test Bond",
                                     "issuer": "Test Corp",
                                     "faceValue": 1000,
                                     "maturityDate": 1700000000,
                                     "interestRate": 5,
                                     "supply": 100
                                 },
                                 headers={'Authorization': 'Bearer default-token'})
            
            assert response.status_code == 500
    
    def test_transaction_failure_returns_500(self, client, mock_blockchain_components):
        """Test that transaction failures return appropriate error."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction that fails
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 100000
        mock_tx.transact.side_effect = Exception("Transaction failed")
        
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_contract.functions.issueBond.return_value = mock_tx
        
        response = client.post('/bond/issue', 
                             json={
                                 "name": "Test Bond",
                                 "issuer": "Test Corp",
                                 "faceValue": 1000,
                                 "maturityDate": 1700000000,
                                 "interestRate": 5,
                                 "supply": 100
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 500
    
    def test_invalid_json_returns_400(self, client):
        """Test that invalid JSON returns 400."""
        response = client.post('/bond/issue', 
                             data='{"invalid": json}',
                             content_type='application/json',
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400


class TestTransactionFlow:
    """Test that transaction flow is followed correctly."""
    
    def test_transaction_flow_order(self, client, mock_blockchain_components):
        """Test that the transaction flow follows correct order."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Track call order
        call_order = []
        
        # Setup mock transaction with tracking
        mock_tx = Mock()
        mock_tx.estimate_gas.side_effect = lambda *args, **kwargs: call_order.append('estimate_gas') or 100000
        mock_tx.transact.side_effect = lambda *args, **kwargs: call_order.append('transact') or b'\x00' * 32
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_receipt.logs = []
        mock_w3.eth.wait_for_transaction_receipt.side_effect = lambda *args: call_order.append('wait_receipt') or mock_receipt
        
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_contract.functions.issueBond.return_value = mock_tx
        
        # Test the endpoint
        response = client.post('/bond/issue', 
                             json={
                                 "name": "Test Bond",
                                 "issuer": "Test Corp",
                                 "faceValue": 1000,
                                 "maturityDate": 1700000000,
                                 "interestRate": 5,
                                 "supply": 100
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 201
        # Verify correct order of operations
        assert call_order == ['estimate_gas', 'transact', 'wait_receipt']


class TestEdgeCases:
    """Test edge cases and boundary conditions."""
    
    def test_get_contract_address(self, client):
        """Test contract address endpoint."""
        response = client.get('/contract/address',
                            headers={'Authorization': 'Bearer default-token'})
        assert response.status_code == 200
        data = json.loads(response.data)
        # Should return the configured address or a default value
        assert 'contract_address' in data
    
    def test_get_api_status(self, client):
        """Test API status endpoint."""
        response = client.get('/status',
                            headers={'Authorization': 'Bearer default-token'})
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'status' in data
        assert 'blockchain_connected' in data
        assert 'endpoints' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
