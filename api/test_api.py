"""
Consolidated test suite for the Bonds Trading blockchain API.
Replaces: test_basic_blockchain_api.py, test_blockchain_api_comprehensive.py,
          test_security_blockchain_api.py, test_api_blockchain_integration.py
(M-12 FIX: Eliminates ~85% code duplication across 4 test files.)
"""
import pytest
from unittest.mock import Mock, patch
import json


@pytest.fixture
def client():
    """Test client for the Flask app."""
    with patch('api.app.AUTH_TOKEN', 'test-token'), \
         patch('api.app.w3', None), \
         patch('api.app.contract', None):
        from api.app import app
        with app.test_client() as c:
            yield c


@pytest.fixture
def mock_bc():
    """Mock blockchain (w3 + contract) with standard responses."""
    with patch('api.app.AUTH_TOKEN', 'test-token'), \
         patch('api.app.w3') as m_w3, \
         patch('api.app.contract') as m_ct:
        m_w3.eth.default_account = '0x' + '11' * 20
        m_w3.to_checksum_address.return_value = '0x' + '22' * 20
        m_w3.is_connected.return_value = True
        m_ct.functions.getBondInfo.return_value.call.return_value = (
            "Test Bond", "Test Corp", 1000, 1700000000, 5, 100, True)
        m_ct.functions.getBondHolders.return_value.call.return_value = [
            '0x' + '11' * 20, '0x' + '22' * 20]
        m_ct.functions.getBondHolderAmount.return_value.call.return_value = 25
        m_ct.functions.bondCount.return_value.call.return_value = 15
        yield m_w3, m_ct


AUTH = {'Authorization': 'Bearer test-token'}
ISSUE_PAYLOAD = {
    "name": "Test Bond", "issuer": "Test Corp",
    "faceValue": 1000, "maturityDate": 1700000000,
    "interestRate": 5, "supply": 100,
}


def _mock_tx(m_w3, m_ct, func_name, *args):
    """Helper: set up mock tx flow on a contract function."""
    mock_tx = Mock()
    mock_tx.estimate_gas.return_value = 100000
    mock_tx.transact.return_value = b'\x00' * 32
    mock_rx = Mock()
    mock_rx.status = 1
    mock_rx.logs = []
    m_w3.eth.wait_for_transaction_receipt.return_value = mock_rx
    getattr(m_ct.functions, func_name).return_value = mock_tx
    return mock_tx, mock_rx


# ── Health & Status ──────────────────────────────────────────────────

class TestHealth:
    def test_health_200(self, client):
        r = client.get('/health')
        assert r.status_code == 200
        assert json.loads(r.data)['status'] == 'healthy'

    def test_status_200(self, client):
        r = client.get('/status')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'blockchain_connected' in data

    def test_contract_address_200(self, client):
        r = client.get('/contract/address')
        assert r.status_code == 200
        assert 'contract_address' in json.loads(r.data)


# ── Authentication ───────────────────────────────────────────────────

class TestAuth:
    def test_valid_token(self, client):
        r = client.get('/auth/check', headers=AUTH)
        assert r.status_code == 200

    def test_invalid_token(self, client):
        r = client.get('/auth/check', headers={'Authorization': 'Bearer wrong'})
        assert r.status_code == 401

    def test_no_token(self, client):
        r = client.get('/auth/check')
        assert r.status_code == 401

    def test_bond_ops_require_auth(self, client):
        assert client.post('/bond/issue', json=ISSUE_PAYLOAD).status_code == 401
        assert client.post('/bond/purchase', json={'bondId': 1, 'amount': 10}).status_code == 401
        assert client.post('/bond/sell', json={'bondId': 1, 'amount': 10, 'buyerAddress': '0x' + 'aa' * 20}).status_code == 401
        assert client.post('/bond/redeem', json={'bondId': 1, 'amount': 10}).status_code == 401


# ── Bond CRUD ────────────────────────────────────────────────────────

class TestIssueBond:
    def test_success(self, client, mock_bc):
        m_w3, m_ct = mock_bc
        _mock_tx(m_w3, m_ct, 'issueBond')
        r = client.post('/bond/issue', json=ISSUE_PAYLOAD, headers=AUTH)
        assert r.status_code == 201
        data = json.loads(r.data)
        assert data['message'] == 'Bond issued successfully'
        assert 'tx_hash' in data

    def test_missing_params(self, client):
        r = client.post('/bond/issue', json={"name": "X"}, headers=AUTH)
        assert r.status_code == 400

    def test_event_extraction(self, client, mock_bc):
        m_w3, m_ct = mock_bc
        mock_tx, mock_rx = _mock_tx(m_w3, m_ct, 'issueBond')
        mock_log = Mock()
        m_ct.events.BondIssued.return_value.process_log.return_value = {'args': {'bondId': 42}}
        mock_rx.logs = [mock_log]
        r = client.post('/bond/issue', json=ISSUE_PAYLOAD, headers=AUTH)
        assert json.loads(r.data)['bondId'] == 42


class TestPurchaseBond:
    def test_success(self, client, mock_bc):
        _mock_tx(*mock_bc, 'purchaseBond')
        r = client.post('/bond/purchase', json={'bondId': 1, 'amount': 10}, headers=AUTH)
        assert r.status_code == 200
        assert json.loads(r.data)['message'] == 'Bond purchased successfully'

    def test_missing_params(self, client):
        r = client.post('/bond/purchase', json={'bondId': 1}, headers=AUTH)
        assert r.status_code == 400


class TestSellBond:
    def test_success(self, client, mock_bc):
        _mock_tx(*mock_bc, 'sellBond')
        r = client.post('/bond/sell', json={
            'bondId': 1, 'amount': 5,
            'buyerAddress': '0x' + 'aa' * 20,
        }, headers=AUTH)
        assert r.status_code == 200

    def test_invalid_address(self, client):
        r = client.post('/bond/sell', json={
            'bondId': 1, 'amount': 5, 'buyerAddress': 'bad',
        }, headers=AUTH)
        assert r.status_code == 400


class TestRedeemBond:
    def test_success(self, client, mock_bc):
        _mock_tx(*mock_bc, 'redeemBond')
        r = client.post('/bond/redeem', json={'bondId': 1, 'amount': 10}, headers=AUTH)
        assert r.status_code == 200
        assert json.loads(r.data)['message'] == 'Bond redeemed successfully'


class TestViewEndpoints:
    def test_bond_info(self, client, mock_bc):
        r = client.get('/bond/1/info', headers=AUTH)
        assert r.status_code == 200
        d = json.loads(r.data)
        assert d['name'] == 'Test Bond'

    def test_bond_holders(self, client, mock_bc):
        r = client.get('/bond/1/holders', headers=AUTH)
        assert r.status_code == 200
        assert len(json.loads(r.data)['holders']) == 2

    def test_bond_holder_amount(self, client, mock_bc):
        r = client.get(f'/bond/1/holder/{"0x" + "aa" * 20}/amount', headers=AUTH)
        assert r.status_code == 200
        assert json.loads(r.data)['amount'] == 25

    def test_bond_count(self, client, mock_bc):
        r = client.get('/bond/count', headers=AUTH)
        assert r.status_code == 200
        assert json.loads(r.data)['bondCount'] == 15

    # M-08 FIX: test the new batch endpoint
    def test_bond_all(self, client, mock_bc):
        r = client.get('/bond/all', headers=AUTH)
        assert r.status_code == 200
        d = json.loads(r.data)
        assert 'bonds' in d
        assert 'bondCount' in d


# ── Error Handling ───────────────────────────────────────────────────

class TestErrors:
    def test_disconnected_blockchain(self, client):
        with patch('api.app.w3', None), patch('api.app.contract', None):
            import api.app
            api.app.w3 = None
            api.app.contract = None
            r = client.post('/bond/issue', json=ISSUE_PAYLOAD, headers=AUTH)
            assert r.status_code == 500

    def test_invalid_json(self, client):
        r = client.post('/bond/issue', data='{bad}',
                        content_type='application/json', headers=AUTH)
        assert r.status_code == 400

    def test_generic_error_message(self, client, mock_bc):
        """M-05 FIX: error responses must not leak internal details."""
        m_w3, m_ct = mock_bc
        mock_tx = Mock()
        mock_tx.estimate_gas.return_value = 100000
        mock_tx.transact.side_effect = Exception("Revert: Only owner can call")
        m_ct.functions.issueBond.return_value = mock_tx
        r = client.post('/bond/issue', json=ISSUE_PAYLOAD, headers=AUTH)
        assert r.status_code == 500
        err = json.loads(r.data)['error']
        assert 'Revert' not in err  # must be generic

    def test_missing_params_issue(self, client, mock_bc):
        r = client.post('/bond/issue', json={"name": "X"}, headers=AUTH)
        assert r.status_code == 400

    def test_missing_params_purchase(self, client, mock_bc):
        r = client.post('/bond/purchase', json={"bondId": 1}, headers=AUTH)
        assert r.status_code == 400


# ── Transaction Flow ─────────────────────────────────────────────────

class TestTxFlow:
    def test_order_estimate_transact_wait(self, client, mock_bc):
        m_w3, m_ct = mock_bc
        order = []
        mock_tx = Mock()
        mock_tx.estimate_gas.side_effect = lambda *a, **k: order.append('est') or 100000
        mock_tx.transact.side_effect = lambda *a, **k: order.append('tx') or b'\x00' * 32
        mock_rx = Mock(); mock_rx.status = 1; mock_rx.logs = []
        m_w3.eth.wait_for_transaction_receipt.side_effect = lambda *a: order.append('wait') or mock_rx
        m_ct.functions.issueBond.return_value = mock_tx
        r = client.post('/bond/issue', json=ISSUE_PAYLOAD, headers=AUTH)
        assert r.status_code == 201
        assert order == ['est', 'tx', 'wait']


# ── Security ─────────────────────────────────────────────────────────

class TestSecurity:
    def test_sql_injection_safe(self, client, mock_bc):
        _mock_tx(*mock_bc, 'issueBond')
        payload = {**ISSUE_PAYLOAD, 'name': "'; DROP TABLE bonds; --"}
        r = client.post('/bond/issue', json=payload, headers=AUTH)
        assert r.status_code in (201, 400, 500)  # must not crash

    def test_large_values(self, client, mock_bc):
        payload = {**ISSUE_PAYLOAD, 'faceValue': 2**256 - 1}
        r = client.post('/bond/issue', json=payload, headers=AUTH)
        assert r.status_code in (400, 500)

    def test_negative_values_rejected(self, client):
        payload = {**ISSUE_PAYLOAD, 'faceValue': -1000}
        r = client.post('/bond/issue', json=payload, headers=AUTH)
        assert r.status_code == 400

    def test_zero_amount_rejected(self, client):
        r = client.post('/bond/purchase', json={'bondId': 1, 'amount': 0}, headers=AUTH)
        assert r.status_code == 400

    def test_none_values_rejected(self, client):
        payload = {**ISSUE_PAYLOAD, 'name': None}
        r = client.post('/bond/issue', json=payload, headers=AUTH)
        assert r.status_code == 400

    def test_unicode_safe(self, client, mock_bc):
        _mock_tx(*mock_bc, 'issueBond')
        payload = {**ISSUE_PAYLOAD, 'name': 'Bond ™©®'}
        r = client.post('/bond/issue', json=payload, headers=AUTH)
        assert r.status_code in (201, 400, 500)


# ── OpenAPI / Docs ───────────────────────────────────────────────────

class TestOpenAPI:
    def test_openapi_yaml(self, client):
        r = client.get('/openapi.yaml')
        assert r.status_code == 200

    def test_docs_html(self, client):
        r = client.get('/docs')
        assert r.status_code == 200
        assert 'html' in r.content_type


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
