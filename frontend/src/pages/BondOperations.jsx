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
  DatePicker,
  Alert,
  Typography,
  Result,
} from 'antd'
import {
  PlusOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import bondAPI from '../services/api'
import dayjs from 'dayjs'

const { Title, Paragraph } = Typography

const BondOperations = () => {
  const [activeTab, setActiveTab] = useState('issue')
  const [loading, setLoading] = useState(false)
  const [successResult, setSuccessResult] = useState(null)
  const [error, setError] = useState(null)
  const [bonds, setBonds] = useState([])
  const [form] = Form.useForm()

  // Load bonds list via batch endpoint
  const loadBonds = async () => {
    try {
      const data = await bondAPI.getAllBonds()
      setBonds(data.bonds || [])
    } catch {
      // Silently fail — dropdown will just be empty
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
          // M-09 FIX: Convert DatePicker value to Unix timestamp for the API
          // M-07 FIX: the form collects a percent (0-100); the API/contract
          // use basis points, so convert here (5.5% -> 550 bps)
          result = await bondAPI.issueBond({
            ...values,
            maturityDate: values.maturityDate?.unix(),
            interestRate: Math.round(Number(values.interestRate) * 100),
          })
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

  const tabItems = [
    {
      key: 'issue',
      label: <span><PlusOutlined /> Issue Bond</span>,
      children: (
        <IssueBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
        />
      ),
    },
    {
      key: 'purchase',
      label: <span><ShoppingCartOutlined /> Purchase Bond</span>,
      children: (
        <PurchaseBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
          bonds={bondOptions}
        />
      ),
    },
    {
      key: 'sell',
      label: <span><SwapOutlined /> Sell Bond</span>,
      children: (
        <SellBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
          bonds={bondOptions}
        />
      ),
    },
    {
      key: 'redeem',
      label: <span><ReloadOutlined /> Redeem Bond</span>,
      children: (
        <RedeemBondForm
          form={form}
          loading={loading}
          onSubmit={handleSubmit}
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
const IssueBondForm = ({ form, loading, onSubmit }) => (
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

    {/* M-09 FIX: Use DatePicker instead of raw Unix timestamp input */}
    <Form.Item
      name="maturityDate"
      label="Maturity Date"
      rules={[{ required: true, message: 'Please select the maturity date' }]}
    >
      <DatePicker
        placeholder="Select maturity date"
        style={{ width: '100%' }}
        size="large"
        disabledDate={(current) => current && current.isBefore(dayjs().endOf('day'))}
      />
    </Form.Item>

    <Form.Item
      name="interestRate"
      label="Annual Interest Rate (%)"
      extra="Stored on-chain in basis points: 5.5% is sent as 550 bps (500 = 5.00%)"
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
const PurchaseBondForm = ({ form, loading, onSubmit, bonds }) => (
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
const SellBondForm = ({ form, loading, onSubmit, bonds }) => (
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
const RedeemBondForm = ({ form, loading, onSubmit, bonds }) => (
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
