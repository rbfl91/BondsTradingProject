import React, { useMemo } from 'react'
import { Card, Row, Col, Statistic } from 'antd'
import { formatNumber } from './format'

/**
 * Global market stat cards (H-09 split from CryptoMarket.jsx).
 * Prefers real global-metrics data; falls back to values derived from the
 * fetched listings (or neutral placeholders when nothing is available).
 */
const MarketStats = ({ cryptoData, globalMetrics }) => {
  const marketStats = useMemo(() => {
    if (globalMetrics) {
      return {
        totalMarketCap: globalMetrics.totalMarketCap || 0,
        totalVolume: globalMetrics.totalVolume24h || 0,
        btcDominance: globalMetrics.btcDominance ? parseFloat(globalMetrics.btcDominance).toFixed(1) : '0',
        ethDominance: globalMetrics.ethDominance ? parseFloat(globalMetrics.ethDominance).toFixed(1) : '0',
      }
    }
    if (cryptoData.length === 0) {
      return { totalMarketCap: 0, totalVolume: 0, btcDominance: '45.2', ethDominance: '18.5' }
    }
    const usd = (c) => c.quote?.USD || {}
    const totalMarketCap = cryptoData.reduce((sum, c) => sum + (parseFloat(usd(c).market_cap) || 0), 0)
    const totalVolume = cryptoData.reduce((sum, c) => sum + (parseFloat(usd(c).volume_24h) || 0), 0)
    const btc = cryptoData.find((c) => c.symbol === 'BTC')
    const eth = cryptoData.find((c) => c.symbol === 'ETH')
    const btcDominance = totalMarketCap > 0 && btc ? ((usd(btc).market_cap || 0) / totalMarketCap * 100).toFixed(1) : '45.2'
    const ethDominance = totalMarketCap > 0 && eth ? ((usd(eth).market_cap || 0) / totalMarketCap * 100).toFixed(1) : '18.5'
    return { totalMarketCap, totalVolume, btcDominance, ethDominance }
  }, [cryptoData, globalMetrics])

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="Global Market Cap"
            value={marketStats.totalMarketCap}
            precision={2}
            valueStyle={{ color: '#1890ff' }}
            formatter={(val) => '$' + formatNumber(val)}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic
            title="24h Volume"
            value={marketStats.totalVolume}
            precision={2}
            valueStyle={{ color: '#52c41a' }}
            formatter={(val) => '$' + formatNumber(val)}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="BTC Dominance" value={marketStats.btcDominance} suffix="%" valueStyle={{ color: '#faad14' }} />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card>
          <Statistic title="ETH Dominance" value={marketStats.ethDominance} suffix="%" valueStyle={{ color: '#722ed1' }} />
        </Card>
      </Col>
    </Row>
  )
}

export default MarketStats
