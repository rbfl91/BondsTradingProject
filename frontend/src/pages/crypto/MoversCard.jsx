import React from 'react'
import { Card, Table, Space, Typography } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import PriceChange from './PriceChange'

const { Text } = Typography

/**
 * Top gainers / top losers card (H-09 split from CryptoMarket.jsx).
 * `kind` = 'gainers' | 'losers'. Falls back to the first/next slice of the
 * visible listings when the movers endpoint returned nothing.
 */
const MoversCard = ({ kind, data, fallback, onCoinClick }) => {
  const isGainers = kind === 'gainers'
  const color = isGainers ? '#52c41a' : '#ff4d4f'
  const rows = data.length > 0 ? data : fallback.map(c => ({ ...c, _type: 'fallback' }))

  return (
    <Card
      title={
        <Space>
          {isGainers
            ? <ArrowUpOutlined style={{ color: '#52c41a' }} />
            : <ArrowDownOutlined style={{ color: '#ff4d4f' }} />}
          {isGainers ? 'Top Gainers' : 'Top Losers'}
        </Space>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Table
        dataSource={rows}
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
                    background: color,
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
            title: '24h',
            render: (_, record) => <PriceChange value={record.quote?.USD?.percent_change_24h || record.percent_change_24h} />,
          },
        ]}
      />
    </Card>
  )
}

export default MoversCard
