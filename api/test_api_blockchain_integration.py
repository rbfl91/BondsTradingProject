"""
Test suite for API-Blockchain Integration

This module tests that the Flask API correctly calls smart contract functions
with the expected parameters. Tests verify:
1. Contract function calls are made with correct arguments
2. Transaction flow (estimate_gas -> transact -> wait_for_receipt) is followed
3. View functions are called correctly for read operations
4. Error handling works as expected
"""
import unittest
from unittest.mock import Mock, patch, MagicMock, call
import json
from flask import Flask


class TestAPIBlockchainIntegration(unittest.TestCase):
    """Tests for API endpoints that interact with the blockchain."""
    
    def setUp(self):
        """Set up test client and mock blockchain components."""
        # Import app after patching to ensure mocks are in place
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        """Clean up after tests."""
        self.app_context.pop()

    def test_health_endpoint(self):
        """Test the health check endpoint returns healthy status."""
        response = self.app.get('/health')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['status'], 'healthy')

    def test_get_contract_address(self):
        """Test the contract address endpoint returns configured address."""
        with patch('api.app.CONTRACT_ADDRESS', '0x1234567890123456789012345678901234567890'):
            response = self.app.get('/contract/address')
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertEqual(data['contract_address'], '0x1234567890123456789012345678901234567890')


class TestIssueBondContractCalls(unittest.TestCase):
    """Tests specifically for the issue bond endpoint and its contract interactions."""
    
    def setUp(self):
        """Set up test client with mocked blockchain."""
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_issue_bond_calls_contract_with_correct_params(self, mock_contract, mock_w3):
        """
        Test that issueBond endpoint correctly calls the smart contract's issueBond function
        with all expected parameters in the correct order.
        """
        # Setup mock transaction object
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 100000
        mock_tx.transact.return_value = b'\xde\xad\xbe\xef' * 8  # 32 bytes tx hash
        
        # Setup mock receipt
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_receipt.logs = []
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        
        # Setup contract function mock
        mock_contract.functions.issueBond.return_value = mock_tx
        
        # Test payload
        payload = {
            "name": "Test Corporate Bond",
            "issuer": "Acme Corporation",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        }

        response = self.app.post('/bond/issue', json=payload)
        
        # Verify the contract function was called with correct parameters
        mock_contract.functions.issueBond.assert_called_once_with(
            "Test Corporate Bond",  # name
            "Acme Corporation",      # issuer
            1000,                    # faceValue
            1700000000,              # maturityDate
            5,                       # interestRate
            100                      # supply
        )
        
        # Verify transaction flow
        mock_tx.estimate_gas.assert_called_once()
        mock_tx.transact.assert_called_once()
        
        # Verify response
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.data)
        self.assertEqual(data['message'], 'Bond issued successfully')
        self.assertIn('tx_hash', data)

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_issue_bond_extracts_bond_id_from_event(self, mock_contract, mock_w3):
        """Test that bondId is correctly extracted from BondIssued event logs."""
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 100000
        mock_tx.transact.return_value = b'\xde\xad\xbe\xef' * 8
        
        # Create a mock log with bondId
        mock_log = Mock()
        mock_decoded_event = {'args': {'bondId': 42}}
        mock_contract.events.BondIssued.return_value.process_log.return_value = mock_decoded_event
        
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_receipt.logs = [mock_log]
        
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_contract.functions.issueBond.return_value = mock_tx

        payload = {
            "name": "Bond",
            "issuer": "Issuer",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        }

        response = self.app.post('/bond/issue', json=payload)
        
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.data)
        self.assertEqual(data['bondId'], 42)


class TestPurchaseBondContractCalls(unittest.TestCase):
    """Tests for purchase bond endpoint contract interactions."""
    
    def setUp(self):
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_purchase_bond_calls_contract_with_correct_params(self, mock_contract, mock_w3):
        """
        Test that purchaseBond endpoint correctly calls the smart contract's purchaseBond function
        with bondId and amount parameters.
        """
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 80000
        mock_tx.transact.return_value = b'\xfe\xed\xfa\xce' * 8
        
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_w3.eth.default_account = '0x2222222222222222222222222222222222222222'
        mock_contract.functions.purchaseBond.return_value = mock_tx

        payload = {"bondId": 42, "amount": 10}
        response = self.app.post('/bond/purchase', json=payload)
        
        # Verify contract function was called with correct parameters
        mock_contract.functions.purchaseBond.assert_called_once_with(42, 10)
        
        # Verify transaction flow was followed
        mock_tx.estimate_gas.assert_called_once()
        mock_tx.transact.assert_called_once()
        mock_w3.eth.wait_for_transaction_receipt.assert_called_once()
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['message'], 'Bond purchased successfully')
        self.assertEqual(data['bondId'], 42)
        self.assertEqual(data['amount'], 10)


class TestSellBondContractCalls(unittest.TestCase):
    """Tests for sell bond endpoint contract interactions."""
    
    def setUp(self):
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_sell_bond_calls_contract_with_correct_params(self, mock_contract, mock_w3):
        """
        Test that sellBond endpoint correctly calls the smart contract's sellBond function
        with bondId, amount, and buyer address parameters.
        """
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 90000
        mock_tx.transact.return_value = b'\x12\x34\x56\x78' * 8
        
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_w3.eth.default_account = '0x3333333333333333333333333333333333333333'
        mock_w3.to_checksum_address.return_value = '0x4444444444444444444444444444444444444444'
        mock_contract.functions.sellBond.return_value = mock_tx

        payload = {
            "bondId": 42,
            "amount": 5,
            "buyerAddress": "0x4444444444444444444444444444444444444444"
        }
        response = self.app.post('/bond/sell', json=payload)
        
        # Verify contract function was called with correct parameters
        # Note: sellBond takes (bondId, amount, buyerAddress)
        mock_contract.functions.sellBond.assert_called_once_with(
            42,  # bondId
            5,   # amount
            '0x4444444444444444444444444444444444444444'  # buyer address
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['message'], 'Bond sold successfully')


class TestRedeemBondContractCalls(unittest.TestCase):
    """Tests for redeem bond endpoint contract interactions."""
    
    def setUp(self):
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_redeem_bond_calls_contract_with_correct_params(self, mock_contract, mock_w3):
        """
        Test that redeemBond endpoint correctly calls the smart contract's redeemBond function
        with bondId and amount parameters.
        """
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 70000
        mock_tx.transact.return_value = b'\xab\xcd\xef\x01' * 8
        
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_w3.eth.wait_for_transaction_receipt.return_value = mock_receipt
        mock_w3.eth.default_account = '0x5555555555555555555555555555555555555555'
        mock_contract.functions.redeemBond.return_value = mock_tx

        payload = {"bondId": 42, "amount": 10}
        response = self.app.post('/bond/redeem', json=payload)
        
        # Verify contract function was called with correct parameters
        mock_contract.functions.redeemBond.assert_called_once_with(42, 10)
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['message'], 'Bond redeemed successfully')


class TestViewFunctionContractCalls(unittest.TestCase):
    """Tests for read-only (view) function contract interactions."""
    
    def setUp(self):
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_get_bond_info_calls_contract_view_function(self, mock_contract, mock_w3):
        """
        Test that getBondInfo endpoint correctly calls the contract's getBondInfo view function
        and properly formats the returned tuple data.
        """
        # Mock the contract view function return value (as a tuple matching the struct)
        mock_contract.functions.getBondInfo.return_value.call.return_value = (
            "Corporate Bond A",  # name
            "Acme Corp",         # issuer
            1000,                # faceValue
            1700000000,          # maturityDate
            5,                   # interestRate
            100,                 # totalSupply
            True                 # isActive
        )
        
        response = self.app.get('/bond/42/info')
        
        # Verify contract function was called with correct bondId
        mock_contract.functions.getBondInfo.assert_called_once_with(42)
        mock_contract.functions.getBondInfo.return_value.call.assert_called_once()
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['bondId'], 42)
        self.assertEqual(data['name'], "Corporate Bond A")
        self.assertEqual(data['issuer'], "Acme Corp")
        self.assertEqual(data['faceValue'], 1000)
        self.assertEqual(data['maturityDate'], 1700000000)
        self.assertEqual(data['interestRate'], 5)
        self.assertEqual(data['totalSupply'], 100)
        self.assertTrue(data['isActive'])

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_get_bond_holders_calls_contract_view_function(self, mock_contract, mock_w3):
        """
        Test that getBondHolders endpoint correctly calls the contract's getBondHolders function
        and returns the list of holder addresses.
        """
        mock_contract.functions.getBondHolders.return_value.call.return_value = [
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222',
            '0x3333333333333333333333333333333333333333'
        ]
        
        response = self.app.get('/bond/42/holders')
        
        # Verify contract function was called with correct bondId
        mock_contract.functions.getBondHolders.assert_called_once_with(42)
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['bondId'], 42)
        self.assertEqual(len(data['holders']), 3)

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_get_bond_holder_amount_calls_contract_with_both_params(self, mock_contract, mock_w3):
        """
        Test that getBondHolderAmount endpoint correctly calls the contract function
        with BOTH bondId AND holder address (not just bondId).
        
        This is an important test because the contract signature is:
        getBondHolderAmount(uint256 _bondId, address _holder)
        """
        mock_w3.to_checksum_address.return_value = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        mock_contract.functions.getBondHolderAmount.return_value.call.return_value = 25
        
        response = self.app.get('/bond/42/holder/0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/amount')
        
        # Verify contract function was called with BOTH bondId AND holder address
        mock_contract.functions.getBondHolderAmount.assert_called_once_with(
            42,  # bondId
            '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'  # holder address
        )
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['bondId'], 42)
        self.assertEqual(data['amount'], 25)

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_get_bond_count_calls_contract_view_function(self, mock_contract, mock_w3):
        """Test that bondCount endpoint correctly calls the contract's bondCount function."""
        mock_contract.functions.bondCount.return_value.call.return_value = 15
        
        response = self.app.get('/bond/count')
        
        mock_contract.functions.bondCount.assert_called_once()
        mock_contract.functions.bondCount.return_value.call.assert_called_once()
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(data['bondCount'], 15)


class TestErrorHandling(unittest.TestCase):
    """Tests for error handling when blockchain calls fail."""
    
    def setUp(self):
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3', None)
    @patch('api.app.contract', None)
    def test_endpoints_return_500_when_not_connected(self):
        """Test that endpoints return 500 error when blockchain is not connected."""
        import api.app
        api.app.w3 = None
        api.app.contract = None
        
        # Test issue bond
        response = self.app.post('/bond/issue', json={
            "name": "Test",
            "issuer": "Test",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        })
        self.assertEqual(response.status_code, 500)
        
        # Test purchase bond
        response = self.app.post('/bond/purchase', json={"bondId": 1, "amount": 10})
        self.assertEqual(response.status_code, 500)

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_transaction_failure_returns_500(self, mock_contract, mock_w3):
        """Test that failed transactions return appropriate error response."""
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 100000
        mock_tx.transact.side_effect = Exception("Revert: Only owner can issue bonds")
        
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_contract.functions.issueBond.return_value = mock_tx

        payload = {
            "name": "Test",
            "issuer": "Test",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        }

        response = self.app.post('/bond/issue', json=payload)
        
        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertIn('error', data)
        self.assertIn('Revert', data['error'])

    def test_missing_parameters_returns_400(self):
        """Test that missing required parameters return 400 error."""
        with patch('api.app.w3') as mock_w3, patch('api.app.contract') as mock_contract:
            mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
            
            # Test issue bond with missing parameters
            response = self.app.post('/bond/issue', json={
                "name": "Test"
                # Missing other required fields
            })
            self.assertEqual(response.status_code, 400)
            
            # Test purchase bond with missing parameters
            response = self.app.post('/bond/purchase', json={
                "bondId": 1
                # Missing amount
            })
            self.assertEqual(response.status_code, 400)


class TestTransactionFlowIntegrity(unittest.TestCase):
    """Tests to verify the complete transaction flow is followed correctly."""
    
    def setUp(self):
        from api.app import app
        self.app = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    @patch('api.app.w3')
    @patch('api.app.contract')
    def test_transaction_flow_order(self, mock_contract, mock_w3):
        """
        Test that the transaction flow follows the correct order:
        1. estimate_gas
        2. transact
        3. wait_for_transaction_receipt
        """
        call_order = []
        
        mock_tx = Mock()
        mock_tx.estimate_gas.side_effect = lambda *args, **kwargs: call_order.append('estimate_gas') or 100000
        mock_tx.transact.side_effect = lambda *args, **kwargs: call_order.append('transact') or b'\x00' * 32
        
        mock_receipt = Mock()
        mock_receipt.status = 1
        mock_receipt.logs = []
        mock_w3.eth.wait_for_transaction_receipt.side_effect = lambda *args: call_order.append('wait_receipt') or mock_receipt
        mock_w3.eth.default_account = '0x1111111111111111111111111111111111111111'
        mock_contract.functions.issueBond.return_value = mock_tx

        payload = {
            "name": "Test",
            "issuer": "Test",
            "faceValue": 1000,
            "maturityDate": 1700000000,
            "interestRate": 5,
            "supply": 100
        }

        response = self.app.post('/bond/issue', json=payload)
        
        self.assertEqual(response.status_code, 201)
        self.assertEqual(call_order, ['estimate_gas', 'transact', 'wait_receipt'])


if __name__ == '__main__':
    unittest.main()
