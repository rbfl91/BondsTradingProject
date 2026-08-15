import React from 'react'
import { Space, Typography } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'

const { Text } = Typography

/** Colored % change with direction arrow (H-09 split from CryptoMarket.jsx). */
const PriceChange = ({ value }) => {
  const numValue = parseFloat(value)
  if (isNaN(numValue)) return <Text type="secondary">-</Text>
  const icon = numValue >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />
  const color = numValue >= 0 ? '#52c41a' : '#ff4d4f'
  return (
    <Space>
      {icon}
      <Text style={{ color }} strong>
        {Math.abs(numValue).toFixed(2)}%
      </Text>
    </Space>
  )
}

export default PriceChange
