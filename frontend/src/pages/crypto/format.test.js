import { describe, it, expect } from 'vitest'
import { formatNumber, formatCurrency, formatPrice, generateFallbackSeries } from './format'

describe('formatNumber', () => {
  it('abbreviates large values with T/B/M/K suffixes', () => {
    expect(formatNumber(2_500_000_000_000)).toBe('2.50T')
    expect(formatNumber(1_200_000_000)).toBe('1.20B')
    expect(formatNumber(3_400_000)).toBe('3.40M')
    expect(formatNumber(5_600)).toBe('5.60K')
  })

  it('formats small values with the requested precision', () => {
    expect(formatNumber(42, 0)).toBe('42')
    // 42.345 is stored as 42.34499… in binary → toFixed(2) truncates
    expect(formatNumber(42.345)).toBe('42.34')
  })

  it('returns 0 for non-numeric input', () => {
    expect(formatNumber('abc')).toBe('0')
    expect(formatNumber(undefined)).toBe('0')
  })
})

describe('formatCurrency / formatPrice', () => {
  it('formats USD values with fixed decimals', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
    expect(formatCurrency('nope')).toBe('$0.00')
  })

  it('uses more decimals for small prices', () => {
    expect(formatPrice(0.000123)).toMatch(/^\$0\.000123/)
    expect(formatPrice(0.5)).toBe('$0.5000')
    expect(formatPrice(1234.5)).toBe('$1,234.50')
  })
})

describe('generateFallbackSeries', () => {
  it('produces a deterministic series of the requested length', () => {
    const a = generateFallbackSeries({ symbol: 'BTC', price: 100000, days: 7 })
    const b = generateFallbackSeries({ symbol: 'BTC', price: 100000, days: 7 })
    expect(a).toHaveLength(7)
    // Same seed → same shape (dates may differ by ms, so compare prices)
    expect(a.map(p => p.price)).toEqual(b.map(p => p.price))
    for (const point of a) {
      expect(point.price).toMatch(/^\d+(\.\d+)?$/)
      expect(parseFloat(point.price)).toBeGreaterThan(0)
    }
  })

  it('defaults to BTC/50000/7d', () => {
    const series = generateFallbackSeries()
    expect(series).toHaveLength(7)
  })
})
