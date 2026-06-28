"""
Basic test suite for the Bonds Trading blockchain API.

This file contains a minimal set of basic tests that cover core
functionalities of the blockchain API. It focuses on essential
endpoints and their expected behavior without extensive security or edge case testing.
"""

import pytest
from unittest.mock import Mock, patch
import json

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
         patch('api.app.contract') as mock_contract, \
         patch('api.app.CONTRACT_ADDRESS', '0x1234567890123456789012345678901234567890'), \
         patch('api.app.AUTH_TOKEN', 'default-token'):
        
        # Setup default mock responses
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_w3.to_checksum_address.return_value = '0x2222222222222222222222222222222222222222'
        mock_w3.is_connected.return_value = True
        mock_contract.functions.getBondInfo.return_value.call.return_value = (
            "Corporate Bond A",  # name
            "Acme Corp",         # issuer
            1000,                # faceValue
            1700000000,          # maturityDate
            5,                   # interestRate
            100,                 # totalSupply
            True                 # isActive
        )
        mock_contract.functions.getBondHolders.return_value.call.return_value = [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222'
        ]
        mock_contract.functions.getBondHolderAmount.return_value.call.return_value = 25
        mock_contract.functions.bondCount.return_value.call.return_value = 15
        
        yield mock_w3, mock_contract


class TestBasicHealthEndpoint:
    """Test the basic health check endpoint."""
    
    def test_health_endpoint_returns_200(self, client):
        """Test that the health endpoint returns 200 status code."""
        response = client.get('/health')
        assert response.status_code == 200
    
    def test_health_endpoint_returns_healthy_status(self, client):
        """Test that the health endpoint returns healthy status."""
        response = client.get('/health')
        data = json.loads(response.data)
        assert data['status'] == 'healthy'


class TestBasicAuthentication:
    """Test basic authentication functionality."""
    
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


class TestBasicBondOperations:
    """Test basic bond operation endpoints."""
    
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
    
    def test_issue_bond_missing_auth(self, client):
        """Test bond issuance without authentication returns 401."""
        response = client.post('/bond/issue', json={
            "name": "Test Bond",
            "issuer": "Test Corp",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        })
        assert response.status_code == 401
    
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
    
    def test_purchase_bond_missing_auth(self, client):
        """Test bond purchase without authentication returns 401."""
        response = client.post('/bond/purchase', json={
            "bondId": 42,
            "amount": 10
        })
        assert response.status_code == 401


class TestBasicGetBondInfo:
    """Test basic bond information retrieval."""
    
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
    
    def test_get_bond_info_missing_auth(self, client):
        """Test bond info retrieval without authentication returns 401."""
        response = client.get('/bond/42/info')
        assert response.status_code == 401


class TestBasicErrorHandling:
    """Test basic error handling scenarios."""
    
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
    
    def test_invalid_json_returns_400(self, client):
        """Test that invalid JSON returns 400."""
        response = client.post('/bond/issue', 
                             data='{"invalid": json}',
                             content_type='application/json',
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400
    
    def test_missing_required_parameters_returns_400(self, client, mock_blockchain_components):
        """Test that missing required parameters returns 400."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Test missing required fields
        response = client.post('/bond/issue', 
                             json={
                                 "name": "Test Bond",
                                 "issuer": "Test Corp",
                                 # Missing faceValue, maturityDate, interestRate, supply
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400
    
    def test_invalid_bond_id_returns_400(self, client, mock_blockchain_components):
        """Test that invalid bond ID format returns 400."""
        response = client.get('/bond/invalid/info',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400
    
    def test_invalid_holder_address_returns_400(self, client, mock_blockchain_components):
        """Test that invalid holder address format returns 400."""
        response = client.get('/bond/42/holder/invalid-address/info',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 400


class TestBasicStatusEndpoint:
    """Test the API status endpoint."""
    
    def test_status_endpoint_returns_200(self, client):
        """Test that the status endpoint returns 200 status code."""
        response = client.get('/status')
        assert response.status_code == 200
    
    def test_status_endpoint_includes_api_info(self, client):
        """Test that the status endpoint includes API information."""
        response = client.get('/status')
        data = json.loads(response.data)
        assert 'status' in data
        assert 'blockchain_connected' in data
        assert 'contract_deployed' in data
        assert 'contract_address' in data
        assert 'endpoints' in data
    
    def test_status_endpoint_lists_all_endpoints(self, client):
        """Test that the status endpoint lists all available endpoints."""
        response = client.get('/status')
        data = json.loads(response.data)
        endpoints = data['endpoints']
        
        # Verify all expected endpoints are listed
        expected_endpoints = [
            '/health',
            '/status',
            '/contract/address',
            '/auth/check',
            '/bond/issue',
            '/bond/purchase',
            '/bond/sell',
            '/bond/redeem',
            '/bond/count',
            '/bond/<bond_id>/info',
            '/bond/<bond_id>/holders',
            '/bond/<bond_id>/holder/<holder_address>/amount'
        ]
        
        for endpoint in expected_endpoints:
            assert endpoint in endpoints


class TestBasicContractAddressEndpoint:
    """Test the contract address endpoint."""
    
    def test_contract_address_endpoint_returns_200(self, client):
        """Test that the contract address endpoint returns 200 status code."""
        response = client.get('/contract/address')
        assert response.status_code == 200
    
    def test_contract_address_endpoint_returns_address(self, client):
        """Test that the contract address endpoint returns the contract address."""
        response = client.get('/contract/address')
        data = json.loads(response.data)
        assert 'contract_address' in data


class TestBasicBondSellEndpoint:
    """Test basic bond sell endpoint."""
    
    def test_sell_bond_success(self, client, mock_blockchain_components):
        """Test successful bond sale."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 90000
        mock_tx.transact.return_value = b'\x00\x01\x02\x03' * 8
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_contract.functions.sellBond.return_value = mock_tx
        
        # Test the endpoint
        response = client.post('/bond/sell', 
                             json={
                                 "bondId": 42,
                                 "amount": 15,
                                 "buyerAddress": "0x3333333333333333333333333333333333333333"
                             },
                             headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['message'] == 'Bond sold successfully'
        assert data['bondId'] == 42
        assert data['amount'] == 15
    
    def test_sell_bond_missing_auth(self, client):
        """Test bond sale without authentication returns 401."""
        response = client.post('/bond/sell', json={
            "bondId": 42,
            "amount": 15,
            "buyerAddress": "0x3333333333333333333333333333333333333333"
        })
        assert response.status_code == 401


class TestBasicBondRedeemEndpoint:
    """Test basic bond redeem endpoint."""
    
    def test_redeem_bond_success(self, client, mock_blockchain_components):
        """Test successful bond redemption."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock transaction
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 85000
        mock_tx.transact.return_value = b'\x04\x05\x06\x07' * 8
        
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
    
    def test_redeem_bond_missing_auth(self, client):
        """Test bond redemption without authentication returns 401."""
        response = client.post('/bond/redeem', json={
            "bondId": 42,
            "amount": 10
        })
        assert response.status_code == 401


class TestBasicBondHoldersEndpoint:
    """Test basic bond holders endpoint."""
    
    def test_get_bond_holders_success(self, client, mock_blockchain_components):
        """Test successful bond holders retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value
        mock_contract.functions.getBondHolders.return_value.call.return_value = [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222',
            '0x3333333333333333333333333333333333333333'
        ]
        
        # Test the endpoint
        response = client.get('/bond/42/holders',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondId'] == 42
        assert len(data['holders']) == 3
        assert '0x1111111111111111111111111111111111111111' in data['holders']
    
    def test_get_bond_holders_missing_auth(self, client):
        """Test bond holders retrieval without authentication returns 401."""
        response = client.get('/bond/42/holders')
        assert response.status_code == 401


class TestBasicBondHolderAmountEndpoint:
    """Test basic bond holder amount endpoint."""
    
    def test_get_bond_holder_amount_success(self, client, mock_blockchain_components):
        """Test successful bond holder amount retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value
        mock_contract.functions.getBondHolderAmount.return_value.call.return_value = 50
        
        # Test the endpoint
        response = client.get('/bond/42/holder/0x1111111111111111111111111111111111111111/amount',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondId'] == 42
        assert data['holderAddress'] == '0x1111111111111111111111111111111111111111'
        assert data['amount'] == 50
    
    def test_get_bond_holder_amount_missing_auth(self, client):
        """Test bond holder amount retrieval without authentication returns 401."""
        response = client.get('/bond/42/holder/0x1111111111111111111111111111111111111111/amount')
        assert response.status_code == 401


class TestBasicBondCountEndpoint:
    """Test basic bond count endpoint."""
    
    def test_get_bond_count_success(self, client, mock_blockchain_components):
        """Test successful bond count retrieval."""
        mock_w3, mock_contract = mock_blockchain_components
        
        # Setup mock return value
        mock_contract.functions.bondCount.return_value.call.return_value = 25
        
        # Test the endpoint
        response = client.get('/bond/count',
                            headers={'Authorization': 'Bearer default-token'})
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['bondCount'] == 25
    
    def test_get_bond_count_missing_auth(self, client):
        """Test bond count retrieval without authentication returns 401."""
        response = client.get('/bond/count')
        assert response.status_code == 401


class TestBasicOpenApiEndpoint:
    """Test basic OpenAPI endpoint."""
    
    def test_openapi_endpoint_returns_200(self, client):
        """Test that the OpenAPI endpoint returns 200 status code."""
        response = client.get('/openapi.yaml')
        assert response.status_code == 200
    
    def test_openapi_endpoint_returns_yaml(self, client):
        """Test that the OpenAPI endpoint returns YAML content."""
        response = client.get('/openapi.yaml')
        assert response.content_type == 'text/yaml'


class TestBasicDocsEndpoint:
    """Test basic docs endpoint."""
    
    def test_docs_endpoint_returns_html(self, client):
        """Test that the docs endpoint returns HTML content."""
        response = client.get('/docs')
        assert response.status_code == 200
        assert response.content_type == 'text/html; charset=utf-8'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
