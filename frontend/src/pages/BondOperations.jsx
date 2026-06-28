import React, { useState, useEffect } from 'react'
import {
  Card,
  Tabs,
  Form,
  Input,
  InputNumber,
  Button,
  Select,
  message,
  Space,
  Descriptions,
  Alert,
  Typography,
  Result,
  Spin,
} from 'antd'
import {
  PlusOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import bondAPI from '../services/api'

const { Title, Text, Paragraph } = Typography

const BondOperations = () => {
  const [activeTab, setActiveTab] = useState('issue')
  const [loading, setLoading] = useState(false)
  const [successResult, setSuccessResult] = useState(null)
  const [error, setError] = useState(null)
  const [bonds, setBonds] = useState([])
  const [form] = Form.useForm()

  // Load bonds list for dropdowns
  const loadBonds = async () => {
    try {
      const allBonds = await bondAPI.getAllBonds()
      setBonds(allBonds)
    } catch (err) {
      console.error('Failed to load bonds:', err)
    }
  }

  useEffect(() => {
    loadBonds()
  }, [])

  const handleSubmit = async (values) => {
    setLoading(true)
    setError(null)
    setSuccessResult(null)

    try {
      let result
      switch (activeTab) {
        case 'issue':
          result = await bondAPI.issueBond(values)
          break
        case 'purchase':
          result = await bondAPI.purchaseBond(values.bondId, values.amount)
          break
        case 'sell':
          result = await bondAPI.sellBond(values.bondId, values.amount, values.buyerAddress)
          break
        case 'redeem':
          result = await bondAPI.redeemBond(values.bondId, values.amount)
          break
        default:
          throw new Error('Unknown operation')
      }

      setSuccessResult({
        success: true,
        data: result,
        operation: activeTab,
      })
      message.success('Operation completed successfully!')
      form.resetFields()
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Operation failed'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setSuccessResult(null)
    setError(null)
    form.resetFields()
  }

  const bondOptions = bonds.map((bond) => ({
    value: bond.bondId,
    label: `${bond.name} (ID: ${bond.bondId})`,
  }))

  // Success Result Component
  if (successResult) {
    return (
      <div className="page-container">
        <Title level={2}>Operation Result</Title>
        <Result
          status="success"
          title={`${getOperationLabel(successResult.operation)} Successfully`}
          subTitle={
            <div>
              <p>Transaction Hash: {successResult.data.tx_hash}</p>
              {successResult.data.bondId && (
                <p>Bond ID: {successResult.data.bondId}</p>
              )}
            </div>
          }
          extra={[
            <Button
              type="primary"
              key="cancel"
              onClick={handleCancel}
            >
              New Operation
            </Button>,
            <Button key="back" onClick={() => window.history.back()}>
              Back to Operations
            </Button>,
          ]}
        />
      </div>
    )
  }

  // Tab definitions
  const tabItems = [
    {
      key: 'issue',
      label: (
        <span>
          <PlusOutlined /> Issue Bond
        </span>
      ),
      children: (
        <IssueBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          error={error}
        />
      ),
    },
    {
      key: 'purchase',
      label: (
        <span>
          <ShoppingCartOutlined /> Purchase Bond
        </span>
      ),
      children: (
        <PurchaseBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          error={error}
          bonds={bondOptions}
        />
      ),
    },
    {
      key: 'sell',
      label: (
        <span>
          <SwapOutlined /> Sell Bond
        </span>
      ),
      children: (
        <SellBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          error={error}
          bonds={bondOptions}
        />
      ),
    },
    {
      key: 'redeem',
      label: (
        <span>
          <ReloadOutlined /> Redeem Bond
        </span>
      ),
      children: (
        <RedeemBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          error={error}
          bonds={bondOptions}
        />
      ),
    },
  ]

  return (
    <div className="page-container">
      <Title level={2}>Bond Operations</Title>
      <Paragraph type="secondary">
        Select an operation type below to interact with the blockchain.
        All operations will be executed as smart contract transactions.
      </Paragraph>

      {error && (
        <Alert
          message="Operation Error"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>
    </div>
  )
}

// ============ Issue Bond Form ============
const IssueBondForm = ({ form, loading, onSubmit, error }) => (
  <Form
    form={form}
    layout="vertical"
    onFinish={onSubmit}
    requiredMark="optional"
  >
    <Form.Item
      name="name"
      label="Bond Name"
      rules={[{ required: true, message: 'Please enter the bond name' }]}
    >
      <Input placeholder="e.g., Corporate Bond A" size="large" />
    </Form.Item>

    <Form.Item
      name="issuer"
      label="Issuer"
      rules={[{ required: true, message: 'Please enter the issuer name' }]}
    >
      <Input placeholder="e.g., Acme Corporation" size="large" />
    </Form.Item>

    <Form.Item
      name="faceValue"
      label="Face Value"
      rules={[{ required: true, message: 'Please enter the face value' }]}
    >
      <InputNumber
        placeholder="e.g., 1000"
        style={{ width: '100%' }}
        min={1}
        size="large"
        addonAfter="USD"
      />
    </Form.Item>

    <Form.Item
      name="maturityDate"
      label="Maturity Date (Unix Timestamp)"
      rules={[{ required: true, message: 'Please enter the maturity date' }]}
    >
      <InputNumber
        placeholder="e.g., 1893456000 (01/01/2030)"
        style={{ width: '100%' }}
        min={Math.floor(Date.now() / 1000)}
        size="large"
        addonAfter="Unix Timestamp"
      />
    </Form.Item>

    <Form.Item
      name="interestRate"
      label="Annual Interest Rate (%)"
      rules={[
        { required: true, message: 'Please enter the interest rate' },
        { type: 'number', min: 0, max: 100, message: 'Rate must be between 0 and 100' },
      ]}
    >
      <InputNumber
        placeholder="e.g., 5.5"
        style={{ width: '100%' }}
        min={0}
        max={100}
        precision={2}
        size="large"
        addonAfter="%"
      />
    </Form.Item>

    <Form.Item
      name="supply"
      label="Total Supply (Number of Bonds)"
      rules={[{ required: true, message: 'Please enter the total supply' }]}
    >
      <InputNumber
        placeholder="e.g., 10000"
        style={{ width: '100%' }}
        min={1}
        size="large"
      />
    </Form.Item>

    <Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        icon={<PlusOutlined />}
        loading={loading}
        size="large"
        block
      >
        Issue Bond on Blockchain
      </Button>
    </Form.Item>
  </Form>
)

// ============ Purchase Bond Form ============
const PurchaseBondForm = ({ form, loading, onSubmit, error, bonds }) => (
  <Form
    form={form}
    layout="vertical"
    onFinish={onSubmit}
    requiredMark="optional"
  >
    <Form.Item
      name="bondId"
      label="Bond ID"
      rules={[{ required: true, message: 'Please select a bond' }]}
    >
      <Select
        placeholder="Select a bond to purchase"
        size="large"
        options={bonds}
        loading={bonds.length === 0}
      />
    </Form.Item>

    <Form.Item
      name="amount"
      label="Amount"
      rules={[{ required: true, message: 'Please enter the amount' }]}
    >
      <InputNumber
        placeholder="e.g., 100"
        style={{ width: '100%' }}
        min={1}
        size="large"
      />
    </Form.Item>

    <Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        icon={<ShoppingCartOutlined />}
        loading={loading}
        size="large"
        block
      >
        Purchase Bond
      </Button>
    </Form.Item>
  </Form>
)

// ============ Sell Bond Form ============
const SellBondForm = ({ form, loading, onSubmit, error, bonds }) => (
  <Form
    form={form}
    layout="vertical"
    onFinish={onSubmit}
    requiredMark="optional"
  >
    <Form.Item
      name="bondId"
      label="Bond ID"
      rules={[{ required: true, message: 'Please select a bond' }]}
    >
      <Select
        placeholder="Select a bond to sell"
        size="large"
        options={bonds}
        loading={bonds.length === 0}
      />
    </Form.Item>

    <Form.Item
      name="amount"
      label="Amount"
      rules={[{ required: true, message: 'Please enter the amount' }]}
    >
      <InputNumber
        placeholder="e.g., 50"
        style={{ width: '100%' }}
        min={1}
        size="large"
      />
    </Form.Item>

    <Form.Item
      name="buyerAddress"
      label="Buyer Address (Ethereum Address)"
      rules={[
        { required: true, message: 'Please enter the buyer address' },
        {
          pattern: /^0x[a-fA-F0-9]{40}$/,
          message: 'Please enter a valid Ethereum address',
        },
      ]}
    >
      <Input
        placeholder="0x..."
        size="large"
        prefix="0x"
      />
    </Form.Item>

    <Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        icon={<SwapOutlined />}
        loading={loading}
        size="large"
        block
      >
        Sell Bond
      </Button>
    </Form.Item>
  </Form>
)

// ============ Redeem Bond Form ============
const RedeemBondForm = ({ form, loading, onSubmit, error, bonds }) => (
  <Form
    form={form}
    layout="vertical"
    onFinish={onSubmit}
    requiredMark="optional"
  >
    <Form.Item
      name="bondId"
      label="Bond ID"
      rules={[{ required: true, message: 'Please select a bond' }]}
    >
      <Select
        placeholder="Select a bond to redeem"
        size="large"
        options={bonds}
        loading={bonds.length === 0}
      />
    </Form.Item>

    <Form.Item
      name="amount"
      label="Amount"
      rules={[{ required: true, message: 'Please enter the amount' }]}
    >
      <InputNumber
        placeholder="e.g., 100"
        style={{ width: '100%' }}
        min={1}
        size="large"
      />
    </Form.Item>

    <Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        icon={<ReloadOutlined />}
        loading={loading}
        size="large"
        block
      >
        Redeem Bond
      </Button>
    </Form.Item>
  </Form>
)

// Helper function for operation labels
function getOperationLabel(op) {
  const labels = {
    issue: 'Bond Issued',
    purchase: 'Bond Purchased',
    sell: 'Bond Sold',
    redeem: 'Bond Redeemed',
  }
  return labels[op] || 'Operation'
}

export default BondOperations