import React, { useState, useEffect } from 'react'
import {
  Card,
  Descriptions,
  Table,
  Tag,
  Space,
  Button,
  Spin,
  Alert,
  Typography,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  DollarOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import bondAPI from '../services/api'
import dayjs from 'dayjs'

// M-10 FIX: Configurable block explorer URL (defaults to Etherscan for mainnet)
const BLOCK_EXPLORER = import.meta.env.VITE_BLOCK_EXPLORER || 'https://etherscan.io'

const { Title, Text, Paragraph } = Typography

const BondDetail = () => {
  const { bondId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bond, setBond] = useState(null)
  const [holders, setHolders] = useState([])
  const [holdersLoading, setHoldersLoading] = useState(false)

  const fetchBondInfo = async () => {
    setLoading(true)
    setError(null)
    try {
      const info = await bondAPI.getBondInfo(parseInt(bondId))
      setBond(info)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch bond info')
    } finally {
      setLoading(false)
    }
  }

  const fetchHolders = async () => {
    setHoldersLoading(true)
    try {
      const data = await bondAPI.getBondHolders(parseInt(bondId))
      setHolders(
        data.holders.map((addr, idx) => ({
          key: idx,
          address: addr,
          amount: '--', // Would need separate call to get amount per holder
        }))
      )
    } catch (err) {
      console.error('Failed to fetch holders:', err)
      setHolders([])
    } finally {
      setHoldersLoading(false)
    }
  }

  useEffect(() => {
    fetchBondInfo()
  }, [bondId])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large"><div>Loading bond details...</div></Spin>
      </div>
    )
  }

  if (error && !bond) {
    return (
      <div className="page-container">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/dashboard')}
          style={{ marginBottom: 16 }}
        >
          Back to Dashboard
        </Button>
        <Alert
          message="Error Loading Bond"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      </div>
    )
  }

  if (!bond) return null

  // Calculate maturity date
  const maturityDate = dayjs.unix(bond.maturityDate)
  const daysUntilMaturity = maturityDate.diff(dayjs(), 'day')
  const isMatured = daysUntilMaturity <= 0

  // Total interest calculation
  const totalInterest = bond.faceValue * (bond.interestRate / 100) * (daysUntilMaturity > 0 ? daysUntilMaturity / 365 : 0)

  return (
    <div className="page-container">
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: 16 }}
      >
        Back to Dashboard
      </Button>

      <Title level={2}>{bond.name}</Title>
      <Paragraph type="secondary">
        Bond ID: {bond.bondId}
      </Paragraph>

      {error && (
        <Alert message="Warning" description={error} type="warning" showIcon style={{ marginBottom: 24 }} />
      )}

      {/* Status and Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Status"
              value={bond.isActive ? 'Active' : 'Inactive'}
              prefix={bond.isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              valueStyle={{ color: bond.isActive ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Face Value"
              value={bond.faceValue}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Supply"
              value={bond.totalSupply}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Days to Maturity"
              value={daysUntilMaturity > 0 ? daysUntilMaturity : 0}
              suffix={isMatured ? 'Matured' : 'days'}
              valueStyle={{ color: isMatured ? '#8c8c8c' : '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Bond Details */}
      <Card title="Bond Details" style={{ marginBottom: 24 }}>
        <Descriptions
          bordered
          column={{ lg: 2, md: 2, sm: 1 }}
          size="small"
        >
          <Descriptions.Item label="Bond ID" span={1}>
            {bond.bondId}
          </Descriptions.Item>
          <Descriptions.Item label="Name" span={1}>
            {bond.name}
          </Descriptions.Item>
          <Descriptions.Item label="Issuer" span={1}>
            {bond.issuer}
          </Descriptions.Item>
          <Descriptions.Item label="Face Value" span={1}>
            ${bond.faceValue.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Interest Rate" span={1}>
            {bond.interestRate}%
          </Descriptions.Item>
          <Descriptions.Item label="Total Supply" span={1}>
            {bond.totalSupply.toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="Maturity Date" span={1}>
            {maturityDate.format('DD/MM/YYYY')}
            {isMatured && <Tag color="red" style={{ marginLeft: 8 }}>Matured</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Status" span={1}>
            <Tag color={bond.isActive ? 'green' : 'red'}>
              {bond.isActive ? 'Active' : 'Inactive'}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Holders */}
      <Card
        title="Bond Holders"
        extra={
          <Button
            type="primary"
            icon={<TeamOutlined />}
            onClick={fetchHolders}
            loading={holdersLoading}
            size="small"
          >
            Refresh Holders
          </Button>
        }
      >
        {holders.length > 0 ? (
          <Table
            dataSource={holders}
            pagination={{ pageSize: 10 }}
            size="small"
            rowKey="address"
            columns={[
              {
                title: '#',
                key: 'index',
                render: (_, __, index) => index + 1,
                width: 60,
              },
              {
                title: 'Address',
                dataIndex: 'address',
                key: 'address',
                render: (addr) => (
                  <a
                    href={`${BLOCK_EXPLORER}/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {addr.substr(0, 10)}...{addr.substr(-8)}
                  </a>
                ),
              },
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 24, color: '#8c8c8c' }}>
            No holders found. Click "Refresh Holders" to load.
          </div>
        )}
      </Card>
    </div>
  )
}

export default BondDetail