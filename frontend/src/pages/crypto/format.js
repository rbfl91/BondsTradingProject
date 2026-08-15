// Formatting + deterministic fallback-data helpers (H-09 split from
// CryptoMarket.jsx). Pure functions — safe to unit test.

export const formatNumber = (num, decimals = 2) => {
  const value = parseFloat(num)
  if (isNaN(value)) return '0'
  if (value >= 1e12) return (value / 1e12).toFixed(decimals) + 'T'
  if (value >= 1e9) return (value / 1e9).toFixed(decimals) + 'B'
  if (value >= 1e6) return (value / 1e6).toFixed(decimals) + 'M'
  if (value >= 1e3) return (value / 1e3).toFixed(decimals) + 'K'
  return value.toFixed(decimals)
}

export const formatCurrency = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '$0.00'
  return '$' + num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export const formatPrice = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '$0.00'
  if (num < 0.01)
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
  if (num < 1)
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Deterministic pseudo-random price series (seeded by symbol) used as a
 * FALLBACK when the live OHLC endpoint is unavailable. The series is clearly
 * estimated — callers show a warning alert when they render it.
 */
export const generateFallbackSeries = ({ symbol = 'BTC', price = 50000, days = 7 } = {}) => {
  const data = []
  let current = price
  let hash = 0
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
  }
  let x = Math.abs(hash) || 12345
  const random = () => {
    x = (x * 16807) % 2147483647
    return (x - 1) / 2147483646
  }
  for (let i = 0; i < days; i++) {
    current = current + (random() * current * 0.05 - current * 0.025)
    data.push({
      date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
      price: Math.abs(current).toFixed(2),
      volume: Math.floor(random() * 1000000000 + 500000000),
    })
  }
  return data
}
