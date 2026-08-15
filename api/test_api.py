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
    """Test client for the Flask app.

    M-06: everything the app reads at request time is patched here, so the
    suite runs in a clean environment (no .env, no live node required).
    """
    with patch('api.app.AUTH_TOKEN', 'test-token'),          patch('api.app.w3', None),          patch('api.app.contract', None),          patch('api.app.CONTRACT_ADDRESS', '0x' + '11' * 20),          patch('api.app.COINMARKETCAP_API_KEY', ''):
        from api.app import app
        with app.test_client() as c:
            yield c


@pytest.fixture
def mock_bc():
    """Mock blockchain (w3 + contract) with standard responses."""
    with patch('api.app.AUTH_TOKEN', 'test-token'),          patch('api.app.w3') as m_w3,          patch('api.app.contract') as m_ct,          patch('api.app.CONTRACT_ADDRESS', '0x' + '11' * 20):
        m_w3.eth.default_account = '0x' + '11' * 20
        m_w3.to_checksum_address.return_value = '0x' + '22' * 20
        m_w3.is_connected.return_value = True
        # 8-field tuple (new Bond struct, incl. remainingSupply)
        m_ct.functions.getBondInfo.return_value.call.return_value = (
            "Test Bond", "Test Corp", 1000, 1700000000, 500, 100, 40, True)
        m_ct.functions.getBondHolders.return_value.call.return_value = [
            '0x' + '11' * 20, '0x' + '22' * 20]
        m_ct.functions.getBondHolderAmount.return_value.call.return_value = 25
        m_ct.functions.bondCount.return_value.call.return_value = 15
        # M-02: /bond/all uses the on-chain batch view
        m_ct.functions.getBondsRange.return_value.call.return_value = [
            ("Test Bond", "Test Corp", 1000, 1700000000, 500, 100, 40, True)]
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
        r = client.get('/status', headers=AUTH)
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'blockchain_connected' in data

    def test_contract_address_200(self, client):
        r = client.get('/contract/address', headers=AUTH)
        assert r.status_code == 200
        assert 'contract_address' in json.loads(r.data)

    # H-05: /status and /contract/address used to be public and leaked
    # infrastructure state - they now require the bearer token.
    def test_status_requires_auth(self, client):
        assert client.get('/status').status_code == 401

    def test_contract_address_requires_auth(self, client):
        assert client.get('/contract/address').status_code == 401


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
        # Hermetic (M-06): stub the provider connection too, so the test
        # can't silently reach a real node on 127.0.0.1:8545 (where a tx to
        # the dummy address would actually mine and return 201).
        with patch('api.app.w3', None), patch('api.app.contract', None), \
             patch('api.app.connect_to_blockchain', return_value=None):
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


# ── Hardened behaviour (this audit round) ────────────────────────────

class TestHardenedBehaviour:
    def test_interest_rate_out_of_range(self, client):
        """M-07/M-11: interestRate is basis points, 0-10000."""
        r = client.post('/bond/issue',
                        json={**ISSUE_PAYLOAD, 'interestRate': 20000},
                        headers=AUTH)
        assert r.status_code == 400

    def test_listings_bad_limit_returns_400(self, client):
        """H-06b: ?limit=abc used to raise ValueError → 500."""
        r = client.get('/crypto/listings?limit=abc', headers=AUTH)
        assert r.status_code == 400

    def test_convert_url_is_v1_currency_convert(self, client):
        """H-06: the old code double-versioned the URL (/v1/v1/...) → 404."""
        import api.app as appmod
        fake = Mock()
        fake.json.return_value = {'status': 'success'}
        fake.raise_for_status.return_value = None
        with patch.object(appmod, 'COINMARKETCAP_API_KEY', 'k'),              patch.object(appmod.requests_lib, 'get', return_value=fake) as g:
            r = client.get('/crypto/convert?symbol=BTC&amount=1&convert=USD',
                           headers=AUTH)
        assert r.status_code == 200
        called_url = g.call_args.kwargs.get('url') or g.call_args.args[0]
        assert called_url == 'https://pro-api.coinmarketcap.com/v1/currency/convert'

    def test_trending_url_is_v2_trending(self, client):
        """H-06: the old code resolved trending to /v1/v2/trending → 404."""
        import api.app as appmod
        fake = Mock()
        fake.json.return_value = {'status': 'success', 'data': []}
        fake.raise_for_status.return_value = None
        with patch.object(appmod, 'COINMARKETCAP_API_KEY', 'k'),              patch.object(appmod.requests_lib, 'get', return_value=fake) as g:
            r = client.get('/crypto/trending', headers=AUTH)
        assert r.status_code == 200
        called_url = g.call_args.kwargs.get('url') or g.call_args.args[0]
        assert called_url == 'https://pro-api.coinmarketcap.com/v2/trending'

    def test_news_failure_returns_empty_not_fake_data(self, client):
        """M-04: on feed failure return an empty, labelled feed — no fake news."""
        import api.app as appmod
        with patch.object(appmod.requests_lib, 'get',
                          side_effect=Exception('network down')):
            r = client.get('/crypto/news', headers=AUTH)
        assert r.status_code == 200
        d = json.loads(r.data)
        assert d['data'] == []
        assert d['source'] == 'unavailable'

    def test_429_has_retry_after_header(self, client):
        """L-03: the limiter's `remaining` value is now surfaced (via header)."""
        import api.app as appmod
        # Reset limiter state (the module-level window dict persists across
        # tests and earlier requests in this file already consumed budget)
        with patch.object(appmod, '_rate_limit_window', {}), \
             patch.object(appmod, '_RATE_LIMIT_MAX_REQUESTS', 1):
            r1 = client.get('/crypto/supply', headers=AUTH)
            r2 = client.get('/crypto/supply', headers=AUTH)
        # r1 passes the limiter (then 502s: no CMC key in the test env);
        # r2 is rate-limited
        assert r1.status_code != 429
        assert r2.status_code == 429
        assert int(r2.headers.get('Retry-After', '0')) > 0


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
