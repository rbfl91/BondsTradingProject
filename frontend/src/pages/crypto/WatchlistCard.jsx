import React from 'react'
import { Card, Table, Space, Typography, Button } from 'antd'
import { StarFilled } from '@ant-design/icons'
import { formatPrice } from './format'

const { Text } = Typography

/**
 * User watchlist card, persisted via localStorage (H-09 split from
 * CryptoMarket.jsx).
 */
const WatchlistCard = ({ coins, watchlist, onToggle, onCoinClick }) => (
  <Card title="Watchlist" size="small">
    {watchlist.length > 0 ? (
      <Table
        dataSource={coins.filter((c) => watchlist.includes(c.id))}
        pagination={false}
        size="small"
        rowKey="id"
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => onCoinClick(record),
        })}
        columns={[
          {
            title: 'Name',
            render: (_, record) => (
              <Space direction="vertical" size={0}>
                <Space>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#faad14',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}>
                    {record.symbol?.charAt(0) || '?'}
                  </div>
                  <Text strong>{record.name}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 11 }}>{record.symbol}</Text>
              </Space>
            ),
          },
          {
            title: 'Price',
            render: (_, record) => formatPrice(record.quote?.USD?.price),
          },
          {
            title: '',
            render: (_, record) => (
              <Button
                type="text"
                icon={<StarFilled />}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(record.id)
                }}
                style={{ color: '#faad14' }}
              />
            ),
          },
        ]}
      />
    ) : (
      <div style={{ textAlign: 'center', padding: 20, color: '#8c8c8c' }}>
        <Text>Click the star icon to add cryptos to your watchlist</Text>
      </div>
    )}
  </Card>
)

export default WatchlistCard
