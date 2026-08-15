import { useState } from 'react'

const STORAGE_KEY = 'cryptoWatchlist'

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

/**
 * Watchlist persisted in localStorage (H-09 split from CryptoMarket.jsx).
 * Returns [ids, toggle].
 */
export const useWatchlist = () => {
  const [watchlist, setWatchlist] = useState(load)

  const toggle = (cryptoId) => {
    setWatchlist((prev) => {
      const next = prev.includes(cryptoId)
        ? prev.filter((id) => id !== cryptoId)
        : [...prev, cryptoId]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return [watchlist, toggle]
}
