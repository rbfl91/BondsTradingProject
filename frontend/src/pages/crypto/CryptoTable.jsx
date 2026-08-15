import React from 'react'
import { Card, Table, Space, Input, Button, Typography, Image } from 'antd'
import { SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, StarFilled, StarOutlined } from '@ant-design/icons'
import { CMC_LOGO_BASE } from './constants'
import { formatNumber, formatPrice } from './format'
import PriceChange from './PriceChange'

const { Title, Text } = Typography
const { Search: SearchInput } = Input

/**
 * Main sortable/searchable listings table (H-09 split from
 * CryptoMarket.jsx).
 */
const CryptoTable = ({
  data,
  searchTerm,
  onSearch,
  sortBy,
  sortOrder,
  onSort,
  watchlist,
  onToggleWatch,
  onCoinClick,
}) => {
  const getSortIndicator = (key) => {
    if (sortBy !== key) return null
    if (sortOrder === 'asc') return <ArrowUpOutlined />
    return <ArrowDownOutlined />
  }

  const columns = [
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('cmc_rank')}># {getSortIndicator('cmc_rank')}</span>,
      dataIndex: 'cmc_rank',
      key: 'cmc_rank',
      width: 60,
      sorter: true,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('name')}>Name {getSortIndicator('name')}</span>,
      key: 'name',
      render: (_, record) => (
        <Space>
          <Image
            src={CMC_LOGO_BASE + '/' + record.symbol + '.png'}
            fallback={null}
            style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const fallback = e.currentTarget.parentElement?.querySelector('.coin-logo-fallback')
              if (fallback) fallback.style.display = 'flex'
            }}
          />
          <div className="coin-logo-fallback" style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#1890ff',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 11,
            fontWeight: 'bold',
            flexShrink: 0,
          }}>
            {record.symbol?.charAt(0) || '?'}
          </div>
          <Button
            type="text"
            icon={watchlist.includes(record.id) ? <StarFilled /> : <StarOutlined />}
            onClick={(e) => { e.stopPropagation(); onToggleWatch(record.id) }}
            style={{ color: watchlist.includes(record.id) ? '#faad14' : '#d9d9d9' }}
          />
          <Space direction="vertical" size={0}>
            <Text strong>{record.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.symbol}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('price')}>Price {getSortIndicator('price')}</span>,
      dataIndex: 'quote',
      key: 'price',
      render: (_, record) => formatPrice(record.quote.USD.price),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('priceChange1h')}>1h % {getSortIndicator('priceChange1h')}</span>,
      dataIndex: 'quote',
      key: 'priceChange1h',
      render: (_, record) => <PriceChange value={record.quote.USD.percent_change_1h} />,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('priceChange24h')}>24h % {getSortIndicator('priceChange24h')}</span>,
      dataIndex: 'quote',
      key: 'priceChange24h',
      render: (_, record) => <PriceChange value={record.quote.USD.percent_change_24h} />,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('priceChange7d')}>7d % {getSortIndicator('priceChange7d')}</span>,
      dataIndex: 'quote',
      key: 'priceChange7d',
      render: (_, record) => <PriceChange value={record.quote.USD.percent_change_7d} />,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('marketCap')}>Market Cap {getSortIndicator('marketCap')}</span>,
      dataIndex: 'quote',
      key: 'marketCap',
      render: (_, record) => '$' + formatNumber(record.quote.USD.market_cap),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('volume24h')}>Volume (24h) {getSortIndicator('volume24h')}</span>,
      dataIndex: 'quote',
      key: 'volume24h',
      render: (_, record) => '$' + formatNumber(record.quote.USD.volume_24h),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => onSort('circulatingSupply')}>Circulating Supply {getSortIndicator('circulatingSupply')}</span>,
      dataIndex: 'circulating_supply',
      key: 'circulatingSupply',
      render: (value) => formatNumber(value, 0),
    },
  ]

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>All Cryptocurrencies</Title>
        <SearchInput
          placeholder="Search by name or symbol"
          prefix={<SearchOutlined />}
          style={{ width: 300 }}
          value={searchTerm}
          onChange={(e) => onSearch(e.target.value)}
          allowClear
        />
      </div>
      <Table
        dataSource={data}
        pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (total) => `Total ${total} cryptocurrencies` }}
        rowKey="id"
        columns={columns}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => onCoinClick(record),
        })}
        scroll={{ x: 1200 }}
      />
    </Card>
  )
}

export default CryptoTable
