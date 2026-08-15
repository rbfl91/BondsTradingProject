import React from 'react'
import {
  Card, Drawer, Table, Row, Col, Space, Button, Alert, Spin, Tag, Typography, Image,
} from 'antd'
import { ShareAltOutlined, BarChartOutlined, ExperimentOutlined } from '@ant-design/icons'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CMC_LOGO_BASE, CATEGORY_TAGS } from './constants'
import { formatNumber, formatPrice } from './format'
import PriceChange from './PriceChange'

const { Title, Text } = Typography

const TIME_RANGES = ['24h', '7d', '30d']

/**
 * Coin detail drawer (H-09 split from CryptoMarket.jsx).
 * `chartData` is live OHLC when available, otherwise estimated data
 * (`chartError` flag drives the warning banner).
 */
const CoinDrawer = ({
  open,
  crypto,
  timeRange,
  onTimeRangeChange,
  chartData,
  chartLoading,
  chartError,
  cmcKeyStatus,
  onClose,
}) => (
  <Drawer
    title={
      <Space>
        <Image
          src={CMC_LOGO_BASE + '/' + (crypto?.symbol || '') + '.png'}
          fallback={null}
          style={{ width: 24, height: 24, borderRadius: '50%' }}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <Text strong>{crypto?.name}</Text>
        <Text type="secondary">{crypto?.symbol}</Text>
        <Tag color="blue">Rank #{crypto?.cmc_rank}</Tag>
      </Space>
    }
    placement="right"
    onClose={onClose}
    open={open}
    width={480}
  >
    {crypto && (
      <div>
        {/* Price Header */}
        <div style={{ marginBottom: 24, padding: '16px', background: '#f6f8fa', borderRadius: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {crypto.symbol}/USD Price
          </Text>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
            <Title level={3} style={{ margin: 0 }}>
              {formatPrice(crypto.quote?.USD?.price)}
            </Title>
            <PriceChange value={crypto.quote?.USD?.percent_change_24h} />
          </div>
        </div>

        {/* Time Range Selector */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          {TIME_RANGES.map((range) => (
            <Button
              key={range}
              type={timeRange === range ? 'primary' : 'default'}
              onClick={() => onTimeRangeChange(range)}
              size="small"
            >
              {range}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <Card size="small" style={{ marginBottom: 16 }}>
          {chartLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large"><div>Loading chart...</div></Spin>
            </div>
          ) : (
            <>
              {chartError && cmcKeyStatus !== 'missing' && (
                <Alert
                  message="Using estimated data"
                  type="warning"
                  showIcon
                  closable
                  style={{ marginBottom: 16 }}
                />
              )}
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1890ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val) => `$${val}`} />
                  <Area type="monotone" dataKey="price" stroke="#1890ff" fill="url(#priceGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </Card>

        {/* Market Stats */}
        <Card size="small" title="Market Statistics" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Market Cap', '$' + formatNumber(crypto.quote?.USD?.market_cap)],
              ['24h Volume', '$' + formatNumber(crypto.quote?.USD?.volume_24h)],
              ['24h High', formatPrice(crypto.quote?.USD?.high_24h)],
              ['24h Low', formatPrice(crypto.quote?.USD?.low_24h)],
              ['Circulating Supply', formatNumber(crypto.circulating_supply, 0)],
              ['Total Supply', formatNumber(crypto.total_supply, 0)],
              ['Max Supply', crypto.max_supply ? formatNumber(crypto.max_supply, 0) : '∞'],
              ['Volume/MCap', crypto.quote?.USD?.market_cap
                ? ((crypto.quote.USD.volume_24h / crypto.quote.USD.market_cap) * 100).toFixed(2) + '%'
                : '-'],
            ].map(([label, value]) => (
              <div key={label}>
                <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                <br />
                <Text strong style={{ fontSize: 13 }}>{value}</Text>
              </div>
            ))}
          </div>
        </Card>

        {/* % Changes */}
        <Card size="small" title="Price Changes" style={{ marginBottom: 16 }}>
          <Row gutter={[8, 8]}>
            {[
              ['1h', 'percent_change_1h'],
              ['24h', 'percent_change_24h'],
              ['7d', 'percent_change_7d'],
              ['30d', 'percent_change_30d'],
              ['60d', 'percent_change_60d'],
              ['90d', 'percent_change_90d'],
            ].map(([label, key]) => (
              <Col span={8} key={label}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
                  <br />
                  <PriceChange value={crypto.quote?.USD?.[key]} />
                </div>
              </Col>
            ))}
          </Row>
        </Card>

        {/* All-Time High */}
        <Card size="small" title="All-Time High" style={{ marginBottom: 16 }}>
          <div>
            <Text strong>{formatPrice(crypto.quote?.USD?.ath)}</Text>
            <br />
            <Text type="secondary">
              {crypto.quote?.USD?.ath_date
                ? new Date(crypto.quote.USD.ath_date).toLocaleDateString()
                : 'N/A'}
            </Text>
            <br />
            <PriceChange value={crypto.quote?.USD?.percent_from_ath} />
          </div>
        </Card>

        {/* Tags */}
        {crypto.tags && crypto.tags.length > 0 && (
          <Card size="small" title="Categories" style={{ marginBottom: 16 }}>
            <Space wrap>
              {crypto.tags.map((tag) => {
                const catStyle = CATEGORY_TAGS[tag]
                return (
                  <Tag key={tag} color={catStyle?.color || 'blue'}>
                    {catStyle?.icon || <ExperimentOutlined />} {tag}
                  </Tag>
                )
              })}
            </Space>
          </Card>
        )}

        {/* External Links */}
        <Card size="small" title="External Links">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button block icon={<ShareAltOutlined />} onClick={() => {
              window.open(`https://coinmarketcap.com/currency/${crypto.slug || crypto.symbol.toLowerCase()}/`, '_blank')
            }}>
              View on CoinMarketCap
            </Button>
            {crypto.quote?.USD?.fully_diluted_market_cap && (
              <Button block icon={<BarChartOutlined />}>
                Market Cap Rank: #{crypto.cmc_rank}
              </Button>
            )}
          </Space>
        </Card>
      </div>
    )}
  </Drawer>
)

export default CoinDrawer
