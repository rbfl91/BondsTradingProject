import React from 'react'
import { Card, Row, Col, Typography, Space } from 'antd'
import { FireOutlined } from '@ant-design/icons'

const { Text } = Typography

/** Trending coins card (H-09 split from CryptoMarket.jsx). */
const TrendingWidget = ({ data, onCoinClick }) => (
  <Card title={<Space><FireOutlined style={{ color: '#ff4d4f' }} /> Trending</Space>} size="small">
    {data.length > 0 ? (
      <Row gutter={[8, 8]}>
        {data.slice(0, 5).map((coin) => (
          <Col span={12} key={coin.id || coin.symbol}>
            <div
              style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 8, cursor: 'pointer' }}
              onClick={() => onCoinClick(coin)}
            >
              <Text strong>{coin.symbol || coin.name}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {coin.name || coin.symbol}
              </Text>
            </div>
          </Col>
        ))}
      </Row>
    ) : (
      <div style={{ textAlign: 'center', padding: 20, color: '#8c8c8c' }}>
        <Text>Loading trending coins...</Text>
      </div>
    )}
  </Card>
)

export default TrendingWidget
