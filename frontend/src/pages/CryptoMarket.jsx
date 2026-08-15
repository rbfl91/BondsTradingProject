import React, { useState, useEffect } from 'react'
import { Button, Typography, Spin, Alert, Row, Col, Space } from 'antd'
import {
  GlobalOutlined, SyncOutlined, WarningOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { cryptoAPI } from '../services/api'
import { useWatchlist } from './crypto/useWatchlist'
import { generateFallbackSeries } from './crypto/format'
import MarketStats from './crypto/MarketStats'
import CategoryTabs from './crypto/CategoryTabs'
import TrendingWidget from './crypto/TrendingWidget'
import CurrencyConverter from './crypto/CurrencyConverter'
import NewsWidget from './crypto/NewsWidget'
import PriceChartCard from './crypto/PriceChartCard'
import MoversCard from './crypto/MoversCard'
import WatchlistCard from './crypto/WatchlistCard'
import CryptoTable from './crypto/CryptoTable'
import CoinDrawer from './crypto/CoinDrawer'

const { Title } = Typography

const RANGE_TO_DAYS = { '24h': 1, '7d': 7, '30d': 30 }

/**
 * Cryptocurrency market page (H-09: split into focused sub-components
 * under ./crypto — this file only owns page-level state and data
 * fetching and composes the widgets).
 */
const CryptoMarket = () => {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [cmcKeyStatus, setCmcKeyStatus] = useState(null)

  const [cryptoData, setCryptoData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('cmc_rank')
  const [sortOrder, setSortOrder] = useState('asc')
  const [activeCategory, setActiveCategory] = useState('all')
  const [allTags, setAllTags] = useState([])

  const [selectedCrypto, setSelectedCrypto] = useState(null)
  const [timeRange, setTimeRange] = useState('7d')
  const [chartData, setChartData] = useState([])
  const [chartError, setChartError] = useState(false)
  const [chartLoading, setChartLoading] = useState(false)

  const [globalMetrics, setGlobalMetrics] = useState(null)
  const [topGainers, setTopGainers] = useState([])
  const [topLosers, setTopLosers] = useState([])
  const [newsData, setNewsData] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [trendingData, setTrendingData] = useState([])

  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerChartData, setDrawerChartData] = useState([])
  const [drawerChartError, setDrawerChartError] = useState(false)

  const [watchlist, toggleWatchlist] = useWatchlist()

  // ── Data fetching ───────────────────────────────────────────────────

  const fetchGlobalData = async () => {
    try {
      const statusRes = await cryptoAPI.getStatus()
      if (statusRes && statusRes.cmc_api_configured !== undefined) {
        setCmcKeyStatus(statusRes.cmc_api_configured ? 'configured' : 'missing')
      }
    } catch {
      // Status check failed — will rely on error from actual API calls
    }

    try {
      const metricsRes = await cryptoAPI.getGlobalMetrics()
      if (metricsRes.data && metricsRes.data.data && metricsRes.data.data.length > 0) {
        const metrics = metricsRes.data.data[0]
        setGlobalMetrics({
          totalMarketCap: metrics.total_market_cap?.USD,
          totalVolume24h: metrics.total_volume?.USD,
          btcDominance: metrics.market_cap_percentage?.btc,
          ethDominance: metrics.market_cap_percentage?.eth,
          totalCryptos: metrics.active_cryptocurrencies,
          totalExchanges: metrics.exchanges,
        })
      }
    } catch {
      // Global metrics fetch failed — non-critical
    }

    try {
      const moversRes = await cryptoAPI.getMoversGainers()
      if (moversRes.data && moversRes.data.gainers) {
        setTopGainers(moversRes.data.gainers.slice(0, 5))
      }
      if (moversRes.data && moversRes.data.losers) {
        setTopLosers(moversRes.data.losers.slice(0, 5))
      }
    } catch {
      // Movers fetch failed — non-critical
    }
  }

  const fetchNews = async () => {
    setNewsLoading(true)
    try {
      const response = await cryptoAPI.getNews()
      if (response.data && response.data.length > 0) {
        setNewsData(response.data)
      }
    } catch {
      // News fetch failed — non-critical
    } finally {
      setNewsLoading(false)
    }
  }

  const fetchTrending = async () => {
    try {
      const response = await cryptoAPI.getTrending()
      if (response.data && response.data.length > 0) {
        setTrendingData(response.data)
      }
    } catch {
      // Trending fetch failed — non-critical
    }
  }

  const fetchChartData = async (symbol, days = 7, crypto = null) => {
    setChartLoading(true)
    try {
      const response = await cryptoAPI.getOHLC(symbol, days)
      if (response.data && response.data.ohlc && response.data.ohlc.length > 0) {
        const formatted = response.data.ohlc.map((item) => ({
          date: new Date(item.timestamp).toLocaleDateString(),
          price: item.quote.USD.price.toFixed(2),
          volume: item.quote.USD.volume.toFixed(0),
        }))
        setChartData(formatted)
        setChartError(false)
      } else {
        throw new Error('No OHLC data returned')
      }
    } catch {
      // OHLC fetch failed — showing clearly-labelled estimated data
      setChartData(generateFallbackSeries({
        symbol: crypto?.symbol || symbol || 'BTC',
        price: crypto ? parseFloat(crypto.quote?.USD?.price || 50000) : 50000,
        days,
      }))
      setChartError(true)
    } finally {
      setChartLoading(false)
    }
  }

  const fetchData = async () => {
    setRefreshing(true)
    try {
      setError(null)
      setChartError(false)
      const response = await cryptoAPI.getListings(100)
      const data = response.data || []
      if (data.length === 0 && response.error) {
        setError(response.error)
        if (response.error && response.error.includes('API key')) {
          setCmcKeyStatus('missing')
        }
      } else {
        setCryptoData(data)
        setFilteredData(data)
        if (data.length > 0) {
          setSelectedCrypto(data[0])
          await fetchChartData(data[0].symbol, 7, data[0])
        }
      }
    } catch (err) {
      if (err.response?.data?.error && err.response.data.error.includes('API key')) {
        setError(err.response.data.error)
        setCmcKeyStatus('missing')
      } else {
        setError('Failed to fetch real cryptocurrency data. Please try again later.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // ── Mount + derived state ───────────────────────────────────────────

  useEffect(() => {
    fetchData()
    fetchGlobalData()
    fetchNews()
    fetchTrending()
  }, [])

  useEffect(() => {
    const tagSet = new Set()
    cryptoData.forEach(c => (c.tags || []).forEach(t => tagSet.add(t)))
    setAllTags(Array.from(tagSet).sort())
  }, [cryptoData])

  useEffect(() => {
    let filtered = [...cryptoData]
    if (activeCategory !== 'all') {
      filtered = filtered.filter(c => (c.tags || []).includes(activeCategory))
    }
    if (searchTerm) {
      filtered = filtered.filter(
        (crypto) =>
          crypto.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          crypto.symbol.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    filtered.sort((a, b) => {
      const getVal = (item, key) => {
        if (key === 'cmc_rank') return parseInt(item[key], 10) || 0
        if (key === 'price') return parseFloat(item.quote?.USD?.price) || 0
        if (key.includes('percent_change')) return parseFloat(item.quote?.USD?.[key]) || 0
        if (key === 'marketCap') return parseFloat(item.quote?.USD?.market_cap) || 0
        if (key === 'volume24h') return parseFloat(item.quote?.USD?.volume_24h) || 0
        if (key === 'circulatingSupply') return parseFloat(item[key]) || 0
        if (key === 'name') return item[key] || ''
        return item[key]
      }
      let aVal = getVal(a, sortBy)
      let bVal = getVal(b, sortBy)
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      if (sortOrder === 'asc') {
        return aVal - bVal
      }
      return bVal - aVal
    })
    setFilteredData(filtered)
  }, [searchTerm, sortBy, sortOrder, cryptoData, activeCategory])

  // ── Interactions ────────────────────────────────────────────────────

  const handleColumnSort = (key) => {
    if (sortBy === key) {
      if (sortOrder === 'asc') setSortOrder('desc')
      else { setSortBy('cmc_rank'); setSortOrder('asc') }
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  const handleTimeRangeChange = async (range) => {
    setTimeRange(range)
    if (selectedCrypto) {
      const days = RANGE_TO_DAYS[range] ?? 7
      await fetchChartData(selectedCrypto.symbol, days, selectedCrypto)
    }
  }

  const handleDrawerClose = () => {
    setDrawerVisible(false)
    setDrawerChartData([])
    setDrawerChartError(false)
  }

  const openCoinDetail = async (crypto) => {
    setSelectedCrypto(crypto)
    setDrawerVisible(true)
    setDrawerLoading(true)
    setDrawerChartError(false)
    try {
      const days = RANGE_TO_DAYS[timeRange] ?? 7
      const response = await cryptoAPI.getOHLC(crypto.symbol, days)
      if (response.data && response.data.ohlc && response.data.ohlc.length > 0) {
        const formatted = response.data.ohlc.map((item) => ({
          date: new Date(item.timestamp).toLocaleDateString(),
          price: item.quote.USD.price.toFixed(2),
          volume: item.quote.USD.volume.toFixed(0),
        }))
        setDrawerChartData(formatted)
      } else {
        throw new Error('No OHLC data')
      }
    } catch {
      // OHLC failed for drawer — showing clearly-labelled estimated data
      setDrawerChartData(generateFallbackSeries({
        symbol: crypto?.symbol || 'BTC',
        price: crypto ? parseFloat(crypto.quote?.USD?.price || 50000) : 50000,
        days: RANGE_TO_DAYS[timeRange] ?? 7,
      }))
      setDrawerChartError(true)
    } finally {
      setDrawerLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 64 }}>
        <Spin size="large"><div>Loading market data...</div></Spin>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <GlobalOutlined /> Cryptocurrency Market
          {cmcKeyStatus === 'configured' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
          {cmcKeyStatus === 'missing' && <WarningOutlined style={{ color: '#faad14', fontSize: 16 }} />}
          {cmcKeyStatus === null && <Spin size="small" />}
        </Title>
        <Button icon={<SyncOutlined spin={refreshing} />} onClick={() => { fetchData(); fetchNews(); fetchTrending(); }} loading={refreshing}>
          Refresh
        </Button>
      </div>

      {cmcKeyStatus === 'missing' && (
        <Alert
          message="CoinMarketCap API Key Not Configured"
          description="The crypto market data is showing estimated values. To see real market data, obtain a free API key from https://coinmarketcap.com/api/ and set COINMARKETCAP_API_KEY in your .env file."
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 24 }}
          icon={<WarningOutlined />}
        />
      )}

      {error && (
        <Alert message="Error" description={error} type="error" showIcon closable style={{ marginBottom: 24 }} />
      )}

      <MarketStats cryptoData={cryptoData} globalMetrics={globalMetrics} />

      <CategoryTabs
        allTags={allTags}
        activeCategory={activeCategory}
        onChange={setActiveCategory}
      />

      {/* Trending & Conversion Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <TrendingWidget data={trendingData} onCoinClick={openCoinDetail} />
        </Col>
        <Col xs={24} lg={8}>
          <CurrencyConverter coins={cryptoData} />
        </Col>
        <Col xs={24} lg={8}>
          <NewsWidget news={newsData} loading={newsLoading} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <PriceChartCard
            crypto={selectedCrypto}
            chartData={chartData}
            chartLoading={chartLoading}
            chartError={chartError}
            cmcKeyStatus={cmcKeyStatus}
            timeRange={timeRange}
            onTimeRangeChange={handleTimeRangeChange}
          />
        </Col>

        <Col xs={24} lg={8}>
          <MoversCard
            kind="gainers"
            data={topGainers}
            fallback={filteredData.slice(0, 5)}
            onCoinClick={openCoinDetail}
          />
          <MoversCard
            kind="losers"
            data={topLosers}
            fallback={filteredData.slice(5, 10)}
            onCoinClick={openCoinDetail}
          />
          <WatchlistCard
            coins={cryptoData}
            watchlist={watchlist}
            onToggle={toggleWatchlist}
            onCoinClick={openCoinDetail}
          />
        </Col>
      </Row>

      <CryptoTable
        data={filteredData}
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleColumnSort}
        watchlist={watchlist}
        onToggleWatch={toggleWatchlist}
        onCoinClick={openCoinDetail}
      />

      <CoinDrawer
        open={drawerVisible}
        crypto={selectedCrypto}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        chartData={drawerChartData}
        chartLoading={drawerLoading}
        chartError={drawerChartError}
        cmcKeyStatus={cmcKeyStatus}
        onClose={handleDrawerClose}
      />
    </div>
  )
}

export default CryptoMarket
