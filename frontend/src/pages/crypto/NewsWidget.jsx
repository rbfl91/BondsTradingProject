import React from 'react'
import { Card, Typography, Space, Spin } from 'antd'
import { ShareAltOutlined } from '@ant-design/icons'

const { Text } = Typography

/**
 * News feed card (H-09 split from CryptoMarket.jsx).
 * The API returns an empty list + source "unavailable" when the upstream
 * feed cannot be reached — never fake items.
 */
const NewsWidget = ({ news, loading }) => (
  <Card title={<Space><ShareAltOutlined /> Latest News</Space>} size="small">
    {loading ? (
      <Spin size="small" />
    ) : news.length > 0 ? (
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {news.slice(0, 5).map((item) => (
          <div
            key={item.id}
            style={{
              padding: '8px 0',
              borderBottom: '1px solid #f0f0f0',
              cursor: 'pointer',
            }}
          >
            <Text strong style={{ fontSize: 12 }}>{item.title}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {item.source} • {item.time || ''}
            </Text>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ textAlign: 'center', padding: 20, color: '#8c8c8c' }}>
        <Text>No news available</Text>
      </div>
    )}
  </Card>
)

export default NewsWidget
