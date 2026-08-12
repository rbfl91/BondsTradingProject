import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, Table, Space, Input, Select, Button, Typography, Row, Col, Statistic, Spin, Alert, Image, Tag, Tabs, Drawer } from 'antd'
import { SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, StarOutlined, StarFilled, SyncOutlined, GlobalOutlined, LineChartOutlined, WarningOutlined, CheckCircleOutlined, FireOutlined, ExperimentOutlined, ThunderboltOutlined, ArrowLeftOutlined, LinkOutlined, DollarOutlined, SwapOutlined, TrophyOutlined, BarChartOutlined, WalletOutlined, ClockCircleOutlined, ShareAltOutlined } from '@ant-design/icons'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { cryptoAPI } from '../services/api'

// H-09 NOTE: This file is ~1,165 lines. It should be split into sub-components:
//   CryptoTable, CryptoChart, CryptoDrawer, Watchlist, Converter, NewsWidget, TrendingWidget.
//   This refactor is tracked as a medium-term task.

const { Title, Text, Paragraph } = Typography
const { Search: SearchInput } = Input
const CMC_LOGO_BASE = 'https://static.coinmarketcap.com/static-coins/icons/64px'

const CATEGORY_TAGS = {
  'DeFi': { color: 'orange', icon: <WalletOutlined /> },
  'Layer-1': { color: 'blue', icon: <ExperimentOutlined /> },
  'Smart Contracts': { color: 'purple', icon: <ExperimentOutlined /> },
  'NFT': { color: 'magenta', icon: <BarChartOutlined /> },
  'Exchange-based': { color: 'gold', icon: <TrophyOutlined /> },
  'Privacy': { color: 'cyan', icon: <ClockCircleOutlined /> },
  'Meme': { color: 'volcano', icon: <FireOutlined /> },
  'Gaming': { color: 'green', icon: <ExperimentOutlined /> },
  'Storage': { color: 'geekblue', icon: <LinkOutlined /> },
  'AI': { color: 'pink', icon: <ThunderboltOutlined /> },
}

const CryptoMarket = () => {
  const [loading, setLoading] = useState(true)
  const [cryptoData, setCryptoData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('cmc_rank')
  const [sortOrder, setSortOrder] = useState('asc')
  const [watchlist, setWatchlist] = useState([])
  const [selectedCrypto, setSelectedCrypto] = useState(null)
  const [chartData, setChartData] = useState([])
  const [timeRange, setTimeRange] = useState('7d')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [chartError, setChartError] = useState(false)
  const [cmcKeyStatus, setCmcKeyStatus] = useState(null)
  const [globalMetrics, setGlobalMetrics] = useState(null)
  const [topGainers, setTopGainers] = useState([])
  const [topLosers, setTopLosers] = useState([])
  const [chartLoading, setChartLoading] = useState(false)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerChartData, setDrawerChartData] = useState([])
  const [drawerChartError, setDrawerChartError] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')
  const [conversionFrom, setConversionFrom] = useState('BTC')
  const [conversionAmount, setConversionAmount] = useState('1')
  const [conversionResult, setConversionResult] = useState(null)
  const [converting, setConverting] = useState(false)
  const [newsData, setNewsData] = useState([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [trendingData, setTrendingData] = useState([])
  const [allTags, setAllTags] = useState([])
  const [supplyData, setSupplyData] = useState(null)

  useEffect(() => {
    fetchData()
    fetchGlobalData()
    fetchNews()
    fetchTrending()
    const savedWatchlist = localStorage.getItem('cryptoWatchlist')
    if (savedWatchlist) {
      setWatchlist(JSON.parse(savedWatchlist))
    }
  }, [])

  useEffect(() => {
    const tagSet = new Set()
    cryptoData.forEach(c => (c.tags || []).forEach(t => tagSet.add(t)))
    setAllTags(Array.from(tagSet).sort())
  }, [cryptoData])

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
          await fetchChartData(data[0].symbol, 7)
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

  const fetchChartData = async (symbol, days = 7) => {
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
      // OHLC fetch failed — generating fallback chart data
      setChartData(generateChartData(days))
      setChartError(true)
    } finally {
      setChartLoading(false)
    }
  }

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

  const handleColumnSort = (key) => {
    if (sortBy === key) {
      if (sortOrder === 'asc') setSortOrder('desc')
      else { setSortBy('cmc_rank'); setSortOrder('asc') }
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  const getSortIndicator = (key) => {
    if (sortBy !== key) return null
    if (sortOrder === 'asc') return <ArrowUpOutlined />
    return <ArrowDownOutlined />
  }

  const toggleWatchlist = (cryptoId) => {
    let newWatchlist
    if (watchlist.includes(cryptoId)) {
      newWatchlist = watchlist.filter((id) => id !== cryptoId)
    } else {
      newWatchlist = [...watchlist, cryptoId]
    }
    setWatchlist(newWatchlist)
    localStorage.setItem('cryptoWatchlist', JSON.stringify(newWatchlist))
  }

  const handleCryptoSelect = async (crypto) => {
    setSelectedCrypto(crypto)
    const days = timeRange === '24h' ? 1 : timeRange === '30d' ? 30 : 7
    await fetchChartData(crypto.symbol, days)
  }

  const handleTimeRangeChange = async (range) => {
    setTimeRange(range)
    if (selectedCrypto) {
      const days = range === '24h' ? 1 : range === '30d' ? 30 : 7
      await fetchChartData(selectedCrypto.symbol, days)
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
      const days = timeRange === '24h' ? 1 : timeRange === '30d' ? 30 : 7
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
      // OHLC failed for drawer — generating fallback chart data
      setDrawerChartData(generateChartDataForDrawer(crypto))
      setDrawerChartError(true)
    } finally {
      setDrawerLoading(false)
    }
  }

  const generateChartDataForDrawer = (crypto) => {
    const data = []
    const symbol = crypto?.symbol || 'BTC'
    const basePrice = crypto ? parseFloat(crypto.quote?.USD?.price || 50000) : 50000
    let price = basePrice
    let hash = 0
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
    }
    const random = (() => {
      let x = Math.abs(hash) || 12345
      return () => {
        x = (x * 16807) % 2147483647
        return (x - 1) / 2147483646
      }
    })()
    const days = timeRange === '24h' ? 1 : timeRange === '30d' ? 30 : 7
    for (let i = 0; i < days; i++) {
      price = price + (random() * price * 0.05 - price * 0.025)
      data.push({
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
        price: Math.abs(price).toFixed(2),
        volume: Math.floor(random() * 1000000000 + 500000000),
      })
    }
    return data
  }

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
      const coin = cryptoData.find(c => c.symbol === conversionFrom)
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

  const generateChartData = useCallback((days = 7) => {
    const data = []
    const seed = selectedCrypto?.symbol || 'BTC'
    const basePrice = selectedCrypto ? parseFloat(selectedCrypto.quote?.USD?.price || 50000) : 50000
    let price = basePrice
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash)
    }
    const random = (() => {
      let x = Math.abs(hash) || 12345
      return () => {
        x = (x * 16807) % 2147483647
        return (x - 1) / 2147483646
      }
    })()
    for (let i = 0; i < days; i++) {
      price = price + (random() * price * 0.05 - price * 0.025)
      data.push({
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
        price: Math.abs(price).toFixed(2),
        volume: Math.floor(random() * 1000000000 + 500000000),
      })
    }
    return data
  }, [selectedCrypto])

  const formatNumber = (num, decimals = 2) => {
    const value = parseFloat(num)
    if (isNaN(value)) return '0'
    if (value >= 1e12) return (value / 1e12).toFixed(decimals) + 'T'
    if (value >= 1e9) return (value / 1e9).toFixed(decimals) + 'B'
    if (value >= 1e6) return (value / 1e6).toFixed(decimals) + 'M'
    if (value >= 1e3) return (value / 1e3).toFixed(decimals) + 'K'
    return value.toFixed(decimals)
  }

  const formatCurrency = (value) => {
    const num = parseFloat(value)
    if (isNaN(num)) return '$0.00'
    return '$' + num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const formatPrice = (value) => {
    const num = parseFloat(value)
    if (isNaN(num)) return '$0.00'
    if (num < 0.01) return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
    if (num < 1) return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

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

  const columns = [
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('cmc_rank')}># {getSortIndicator('cmc_rank')}</span>,
      dataIndex: 'cmc_rank',
      key: 'cmc_rank',
      width: 60,
      sorter: true,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('name')}>Name {getSortIndicator('name')}</span>,
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
            onClick={(e) => { e.stopPropagation(); toggleWatchlist(record.id) }}
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
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('price')}>Price {getSortIndicator('price')}</span>,
      dataIndex: 'quote',
      key: 'price',
      render: (_, record) => formatPrice(record.quote.USD.price),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('priceChange1h')}>1h % {getSortIndicator('priceChange1h')}</span>,
      dataIndex: 'quote',
      key: 'priceChange1h',
      render: (_, record) => <PriceChange value={record.quote.USD.percent_change_1h} />,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('priceChange24h')}>24h % {getSortIndicator('priceChange24h')}</span>,
      dataIndex: 'quote',
      key: 'priceChange24h',
      render: (_, record) => <PriceChange value={record.quote.USD.percent_change_24h} />,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('priceChange7d')}>7d % {getSortIndicator('priceChange7d')}</span>,
      dataIndex: 'quote',
      key: 'priceChange7d',
      render: (_, record) => <PriceChange value={record.quote.USD.percent_change_7d} />,
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('marketCap')}>Market Cap {getSortIndicator('marketCap')}</span>,
      dataIndex: 'quote',
      key: 'marketCap',
      render: (_, record) => '$' + formatNumber(record.quote.USD.market_cap),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('volume24h')}>Volume (24h) {getSortIndicator('volume24h')}</span>,
      dataIndex: 'quote',
      key: 'volume24h',
      render: (_, record) => '$' + formatNumber(record.quote.USD.volume_24h),
    },
    {
      title: <span style={{ cursor: 'pointer' }} onClick={() => handleColumnSort('circulatingSupply')}>Circulating Supply {getSortIndicator('circulatingSupply')}</span>,
      dataIndex: 'circulating_supply',
      key: 'circulatingSupply',
      render: (value) => formatNumber(value, 0),
    },
  ]

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

      {/* Market Category Tabs */}
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          activeKey={activeCategory}
          onChange={setActiveCategory}
          items={[
            { key: 'all', label: <span><BarChartOutlined /> Overview</span> },
            ...allTags.slice(0, 12).map(tag => {
              const catStyle = CATEGORY_TAGS[tag]
              return {
                key: tag,
                label: <span><Tag color={catStyle?.color || 'blue'}>{catStyle?.icon || <ExperimentOutlined />} {tag}</Tag></span>,
              }
            }),
          ]}
        />
      </Card>

      {/* Trending & Conversion Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Card title={<Space><FireOutlined style={{ color: '#ff4d4f' }} /> Trending</Space>} size="small">
            {trendingData.length > 0 ? (
              <Row gutter={[8, 8]}>
                {trendingData.slice(0, 5).map((coin) => (
                  <Col span={12} key={coin.id || coin.symbol}>
                    <div
                      style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 8, cursor: 'pointer' }}
                      onClick={() => openCoinDetail(coin)}
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
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<Space><SwapOutlined /> Currency Converter</Space>} size="small">
            <Row gutter={[8, 8]}>
              <Col span={12}>
                <Select
                  value={conversionFrom}
                  onChange={setConversionFrom}
                  style={{ width: '100%' }}
                  options={cryptoData.slice(0, 20).map(c => ({ label: c.symbol, value: c.symbol }))}
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
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<Space><ShareAltOutlined /> Latest News</Space>} size="small">
            {newsLoading ? (
              <Spin size="small" />
            ) : newsData.length > 0 ? (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {newsData.slice(0, 5).map((news) => (
                  <div
                    key={news.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid #f0f0f0',
                      cursor: 'pointer',
                    }}
                  >
                    <Text strong style={{ fontSize: 12 }}>{news.title}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {news.source} • {news.time || ''}
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
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title={<Space><LineChartOutlined /> {selectedCrypto?.name} Price Chart</Space>}
            extra={
              <Select
                value={timeRange}
                onChange={handleTimeRangeChange}
                style={{ width: 120 }}
                options={[
                  { value: '24h', label: '24H' },
                  { value: '7d', label: '7D' },
                  { value: '30d', label: '30D' },
                ]}
              />
            }
          >
            {cmcKeyStatus === 'missing' && (
              <Alert
                message="Live chart data unavailable"
                description="Configurate a CoinMarketCap API key to see real price charts. Showing estimated data based on current price."
                type="warning"
                showIcon
                closable
                style={{ marginBottom: 16 }}
              />
            )}
            {chartError && cmcKeyStatus !== 'missing' && (
              <Alert
                message="Live chart data unavailable"
                description="Showing estimated price movement. Check your API connection for real data."
                type="warning"
                showIcon
                closable
                style={{ marginBottom: 16 }}
              />
            )}
            {chartLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large"><div>Loading chart...</div></Spin>
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(val) => `${val}`} />
                  <Line type="monotone" dataKey="price" stroke="#1890ff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>No chart data available</div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title={<Space><ArrowUpOutlined style={{ color: '#52c41a' }} /> Top Gainers</Space>} size="small" style={{ marginBottom: 16 }}>
            <Table
              dataSource={topGainers.length > 0 ? topGainers : filteredData.slice(0, 5).map(c => ({ ...c, _type: 'fallback' }))}
              pagination={false}
              size="small"
              rowKey="id"
              onRow={(record) => ({
                style: { cursor: 'pointer' },
                onClick: () => openCoinDetail(record),
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
                          background: '#52c41a',
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

          <Card title={<Space><ArrowDownOutlined style={{ color: '#ff4d4f' }} /> Top Losers</Space>} size="small" style={{ marginBottom: 16 }}>
            <Table
              dataSource={topLosers.length > 0 ? topLosers : filteredData.slice(5, 10).map(c => ({ ...c, _type: 'fallback' }))}
              pagination={false}
              size="small"
              rowKey="id"
              onRow={(record) => ({
                style: { cursor: 'pointer' },
                onClick: () => openCoinDetail(record),
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
                          background: '#ff4d4f',
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

          <Card title="Watchlist" size="small">
             {watchlist.length > 0 ? (
               <Table
                 dataSource={cryptoData.filter((c) => watchlist.includes(c.id))}
                pagination={false}
                size="small"
                rowKey="id"
                onRow={(record) => ({
                  style: { cursor: 'pointer' },
                  onClick: () => openCoinDetail(record),
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
                          toggleWatchlist(record.id)
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
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>All Cryptocurrencies</Title>
          <SearchInput
            placeholder="Search by name or symbol"
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
          />
        </div>
        <Table
          dataSource={filteredData}
          pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (total) => `Total ${total} cryptocurrencies` }}
          rowKey="id"
          columns={columns}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => openCoinDetail(record),
          })}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Coin Detail Drawer */}
      <Drawer
        title={
          <Space>
            <Image
              src={CMC_LOGO_BASE + '/' + (selectedCrypto?.symbol || '') + '.png'}
              fallback={null}
              style={{ width: 24, height: 24, borderRadius: '50%' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <Text strong>{selectedCrypto?.name}</Text>
            <Text type="secondary">{selectedCrypto?.symbol}</Text>
            <Tag color="blue">Rank #{selectedCrypto?.cmc_rank}</Tag>
          </Space>
        }
        placement="right"
        onClose={handleDrawerClose}
        open={drawerVisible}
        width={480}
      >
        {selectedCrypto && (
          <div>
            {/* Price Header */}
            <div style={{ marginBottom: 24, padding: '16px', background: '#f6f8fa', borderRadius: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selectedCrypto.symbol}/USD Price
              </Text>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                <Title level={3} style={{ margin: 0 }}>
                  {formatPrice(selectedCrypto.quote?.USD?.price)}
                </Title>
                <PriceChange value={selectedCrypto.quote?.USD?.percent_change_24h} />
              </div>
            </div>

            {/* Time Range Selector */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
              {['24h', '7d', '30d'].map((range) => (
                <Button
                  key={range}
                  type={timeRange === range ? 'primary' : 'default'}
                  onClick={() => handleTimeRangeChange(range)}
                  size="small"
                >
                  {range}
                </Button>
              ))}
            </div>

            {/* Chart */}
            <Card size="small" style={{ marginBottom: 16 }}>
              {drawerLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Spin size="large"><div>Loading chart...</div></Spin>
                </div>
              ) : (
                <>
                  {drawerChartError && cmcKeyStatus !== 'missing' && (
                    <Alert
                      message="Using estimated data"
                      type="warning"
                      showIcon
                      closable
                      style={{ marginBottom: 16 }}
                    />
                  )}
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={drawerChartData}>
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
                  ['Market Cap', '$' + formatNumber(selectedCrypto.quote?.USD?.market_cap)],
                  ['24h Volume', '$' + formatNumber(selectedCrypto.quote?.USD?.volume_24h)],
                  ['24h High', formatPrice(selectedCrypto.quote?.USD?.high_24h)],
                  ['24h Low', formatPrice(selectedCrypto.quote?.USD?.low_24h)],
                  ['Circulating Supply', formatNumber(selectedCrypto.circulating_supply, 0)],
                  ['Total Supply', formatNumber(selectedCrypto.total_supply, 0)],
                  ['Max Supply', selectedCrypto.max_supply ? formatNumber(selectedCrypto.max_supply, 0) : '∞'],
                  ['Volume/MCap', selectedCrypto.quote?.USD?.market_cap
                    ? ((selectedCrypto.quote.USD.volume_24h / selectedCrypto.quote.USD.market_cap) * 100).toFixed(2) + '%'
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
                      <PriceChange value={selectedCrypto.quote?.USD?.[key]} />
                    </div>
                  </Col>
                ))}
              </Row>
            </Card>

            {/* All-Time High */}
            <Card size="small" title="All-Time High" style={{ marginBottom: 16 }}>
              <div>
                <Text strong>{formatPrice(selectedCrypto.quote?.USD?.ath)}</Text>
                <br />
                <Text type="secondary">
                  {selectedCrypto.quote?.USD?.ath_date
                    ? new Date(selectedCrypto.quote.USD.ath_date).toLocaleDateString()
                    : 'N/A'}
                </Text>
                <br />
                <PriceChange value={selectedCrypto.quote?.USD?.percent_from_ath} />
              </div>
            </Card>

            {/* Tags */}
            {selectedCrypto.tags && selectedCrypto.tags.length > 0 && (
              <Card size="small" title="Categories" style={{ marginBottom: 16 }}>
                <Space wrap>
                  {selectedCrypto.tags.map((tag) => {
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
                  window.open(`https://coinmarketcap.com/currency/${selectedCrypto.slug || selectedCrypto.symbol.toLowerCase()}/`, '_blank')
                }}>
                  View on CoinMarketCap
                </Button>
                {selectedCrypto.quote?.USD?.fully_diluted_market_cap && (
                  <Button block icon={<BarChartOutlined />}>
                    Market Cap Rank: #{selectedCrypto.cmc_rank}
                  </Button>
                )}
              </Space>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default CryptoMarket
