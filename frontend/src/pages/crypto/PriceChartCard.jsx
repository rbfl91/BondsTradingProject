import React from 'react'
import { Card, Select, Alert, Spin } from 'antd'
import { LineChartOutlined } from '@ant-design/icons'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const TIME_RANGE_OPTIONS = [
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
]

/**
 * Main price chart card (H-09 split from CryptoMarket.jsx).
 * `chartData` is live OHLC when available, otherwise estimated data
 * (`estimated` flag drives the warning banner).
 */
const PriceChartCard = ({
  crypto,
  chartData,
  chartLoading,
  chartError,
  cmcKeyStatus,
  timeRange,
  onTimeRangeChange,
}) => (
  <Card
    title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LineChartOutlined /> {crypto?.name} Price Chart</span>}
    extra={
      <Select
        value={timeRange}
        onChange={onTimeRangeChange}
        style={{ width: 120 }}
        options={TIME_RANGE_OPTIONS}
      />
    }
  >
    {cmcKeyStatus === 'missing' && (
      <Alert
        message="Live chart data unavailable"
        description="Configure a CoinMarketCap API key to see real price charts. Showing estimated data based on current price."
        type="warning"
        showIcon
        closable
        style={{ marginBottom: 16 }}
      />
    )}
    {chartError && cmcKeyStatus !== 'missing' && (
      <Alert
        message="Live chart data unavailable"
        description="Showing estimated price movement. Check your API connection for real data."
        type="warning"
        showIcon
        closable
        style={{ marginBottom: 16 }}
      />
    )}
    {chartLoading ? (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large"><div>Loading chart...</div></Spin>
      </div>
    ) : chartData.length > 0 ? (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(val) => `${val}`} />
          <Line type="monotone" dataKey="price" stroke="#1890ff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    ) : (
      <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No chart data available</div>
    )}
  </Card>
)

export default PriceChartCard
