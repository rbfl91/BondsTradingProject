import React, { useState } from 'react'
import { Card, Row, Col, Input, Select, Button, Typography, Space } from 'antd'
import { SwapOutlined } from '@ant-design/icons'
import { cryptoAPI } from '../../services/api'
import { formatCurrency } from './format'

const { Text } = Typography

/**
 * Crypto→USD converter card (H-09 split from CryptoMarket.jsx).
 * Tries the live convert endpoint first; falls back to local price data.
 */
const CurrencyConverter = ({ coins }) => {
  const [conversionFrom, setConversionFrom] = useState('BTC')
  const [conversionAmount, setConversionAmount] = useState('1')
  const [conversionResult, setConversionResult] = useState(null)
  const [converting, setConverting] = useState(false)

  const handleConversion = async () => {
    setConverting(true)
    try {
      const response = await cryptoAPI.convert(conversionFrom, parseFloat(conversionAmount) || 1, 'USD')
      if (response.data && response.data.quote) {
        setConversionResult({
          amount: parseFloat(conversionAmount),
          from: conversionFrom,
          to: 'USD',
          result: response.data.quote.USD.price,
        })
      }
    } catch {
      const coin = coins.find(c => c.symbol === conversionFrom)
      if (coin) {
        setConversionResult({
          amount: parseFloat(conversionAmount),
          from: conversionFrom,
          to: 'USD',
          result: (parseFloat(coin.quote?.USD?.price || 0) * (parseFloat(conversionAmount) || 1)),
        })
      }
    } finally {
      setConverting(false)
    }
  }

  return (
    <Card title={<Space><SwapOutlined /> Currency Converter</Space>} size="small">
      <Row gutter={[8, 8]}>
        <Col span={12}>
          <Select
            value={conversionFrom}
            onChange={setConversionFrom}
            style={{ width: '100%' }}
            options={coins.slice(0, 20).map(c => ({ label: c.symbol, value: c.symbol }))}
          />
        </Col>
        <Col span={12}>
          <Input
            value={conversionAmount}
            onChange={(e) => setConversionAmount(e.target.value)}
            placeholder="Amount"
            prefix="$"
            type="number"
          />
        </Col>
        <Col span={24}>
          <Button
            icon={<SwapOutlined />}
            onClick={handleConversion}
            loading={converting}
            block
            type="primary"
          >
            Convert
          </Button>
        </Col>
        {conversionResult && (
          <Col span={24}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#1890ff' }}>
              {formatCurrency(conversionResult.result)}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {' '}
              = {conversionResult.amount} {conversionResult.from}
            </Text>
          </Col>
        )}
      </Row>
    </Card>
  )
}

export default CurrencyConverter
