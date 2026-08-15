import React, { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Space,
  Statistic,
  Spin,
  Alert,
  Typography,
  Button,
} from 'antd'
import {
  DollarOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  BookOutlined,
} from '@ant-design/icons'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import bondAPI from '../services/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const Dashboard = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [apiStatus, setApiStatus] = useState(null)
  const [bonds, setBonds] = useState([])
  const [bondCount, setBondCount] = useState(0)
  const [chartData, setChartData] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    setRefreshing(true)
    try {
      setError(null)

      // Get API status
      const status = await bondAPI.getStatus()
      setApiStatus(status)

      // Get all bonds via batch endpoint (M-08 fix — single call instead of N+1)
      const allBondsData = await bondAPI.getAllBonds()
      const bondsList = allBondsData.bonds || []
      setBonds(bondsList)
      setBondCount(allBondsData.bondCount || bondsList.length)

      // Generate chart data from bond info
      // interestRate arrives in basis points (500 = 5.00%); chart in percent
      const chartData = bondsList.map((bond) => ({
        name: bond.name,
        faceValue: bond.faceValue,
        interestRate: (bond.interestRate || 0) / 100,
        supply: bond.totalSupply,
      }))
      setChartData(chartData)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleRefresh = () => {
    fetchData()
  }

  // Calculate summary metrics
  const totalFaceValue = bonds.reduce((sum, b) => sum + (b.faceValue || 0), 0)
  const totalSupply = bonds.reduce((sum, b) => sum + (b.totalSupply || 0), 0)
  // Avg. interest in percent (values arrive in basis points)
  const avgInterestRate =
    bonds.length > 0
      ? bonds.reduce((sum, b) => sum + (b.interestRate || 0), 0) / bonds.length / 100
      : 0

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large"><div>Loading dashboard...</div></Spin>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2}>Dashboard</Title>
        <Button
          icon={refreshing ? <SyncOutlined spin /> : <SyncOutlined />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      {/* API Status */}
      {apiStatus && (
        <Card size="small" style={{ marginBottom: 24 }}>
          <Space>
            <Text>
              Blockchain:{' '}
              <Tag color={apiStatus.blockchain_connected ? 'green' : 'red'}>
                {apiStatus.blockchain_connected ? 'Connected' : 'Disconnected'}
              </Tag>
            </Text>
            <Text>
              Contract:{' '}
              <Tag color={apiStatus.contract_deployed ? 'green' : 'red'}>
                {apiStatus.contract_deployed ? 'Deployed' : 'Not Deployed'}
              </Tag>
            </Text>
            {apiStatus.contract_address && (
              <Text ellipsis style={{ width: 200 }}>
                Address: {apiStatus.contract_address}
              </Text>
            )}
          </Space>
        </Card>
      )}

      {/* Summary Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Bonds Issued"
              value={bondCount}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Face Value"
              value={totalFaceValue}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a' }}
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Supply"
              value={totalSupply}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Avg. Interest Rate"
              value={avgInterestRate}
              suffix="%"
              valueStyle={{ color: '#13c2c2' }}
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      {/* Bond Overview Chart */}
      <Card title="Bond Overview" style={{ marginBottom: 24 }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="faceValue"
                stroke="#1890ff"
                fill="#1890ff33"
                name="Face Value"
              />
              <Area
                type="monotone"
                dataKey="interestRate"
                stroke="#52c41a"
                fill="#52c41a33"
                name="Interest Rate"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>
            No bonds issued yet. Go to "Bond Operations" to issue your first bond.
          </div>
        )}
      </Card>

      {/* Bonds Table */}
      {bonds.length > 0 && (
        <Card title="All Bonds" style={{ marginBottom: 24 }}>
          <Table
            dataSource={bonds}
            pagination={{ pageSize: 10 }}
            rowKey="bondId"
            size="small"
            onRow={(record) => ({
              style: { cursor: 'pointer' },
              onClick: () => window.open(`#/bond/${record.bondId}`, '_blank'),
            })}
            columns={[
              { title: 'ID', dataIndex: 'bondId', key: 'bondId', width: 80 },
              { title: 'Name', dataIndex: 'name', key: 'name' },
              { title: 'Issuer', dataIndex: 'issuer', key: 'issuer' },
              {
                title: 'Face Value',
                dataIndex: 'faceValue',
                key: 'faceValue',
                render: (val) => val.toLocaleString(),
              },
              {
                title: 'Interest Rate',
                dataIndex: 'interestRate',
                key: 'interestRate',
                render: (val) => `${(val / 100).toFixed(2)}%`,
              },
              {
                title: 'Supply',
                dataIndex: 'totalSupply',
                key: 'totalSupply',
                render: (val) => val.toLocaleString(),
              },
              {
                title: 'Maturity',
                dataIndex: 'maturityDate',
                key: 'maturityDate',
                render: (val) => dayjs.unix(val).format('DD/MM/YYYY'),
              },
              {
                title: 'Status',
                dataIndex: 'isActive',
                key: 'isActive',
                render: (active) => (
                  <Tag color={active ? 'green' : 'red'}>
                    {active ? 'Active' : 'Inactive'}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* H-11 FIX: Removed mock operations history — it showed fake tx hashes
          as if they were real blockchain events, misleading users. */}
    </div>
  )
}

export default Dashboard
