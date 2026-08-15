import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios BEFORE importing the service under test. vi.hoisted keeps the
// mocks available inside the hoisted vi.mock factory (ESM imports run first).
const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post,
      get,
      defaults: {},
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

import bondAPI, { cryptoAPI } from './api'

describe('services/api', () => {
  beforeEach(() => {
    post.mockReset()
    get.mockReset()
  })

  it('issueBond POSTs to /bond/issue with the payload', async () => {
    post.mockResolvedValue({ data: { txHash: '0xabc' } })
    await bondAPI.issueBond({ name: 'X', interestRate: 550 })
    expect(post).toHaveBeenCalledWith('/bond/issue', { name: 'X', interestRate: 550 })
  })

  it('purchaseBond maps (bondId, amount) into the JSON body', async () => {
    post.mockResolvedValue({ data: {} })
    await bondAPI.purchaseBond(3, 10)
    expect(post).toHaveBeenCalledWith('/bond/purchase', { bondId: 3, amount: 10 })
  })

  it('sellBond maps (bondId, amount, buyerAddress) into the JSON body', async () => {
    post.mockResolvedValue({ data: {} })
    await bondAPI.sellBond(3, 5, '0xabc')
    expect(post).toHaveBeenCalledWith('/bond/sell', { bondId: 3, amount: 5, buyerAddress: '0xabc' })
  })

  it('getAllBonds hits the batch endpoint /bond/all', async () => {
    get.mockResolvedValue({ data: { bonds: [], bondCount: 0 } })
    const res = await bondAPI.getAllBonds()
    expect(get).toHaveBeenCalledWith('/bond/all')
    expect(res).toEqual({ bonds: [], bondCount: 0 })
  })

  it('getBondHolders hits /bond/<id>/holders', async () => {
    get.mockResolvedValue({ data: { holders: [] } })
    await bondAPI.getBondHolders(1)
    expect(get).toHaveBeenCalledWith('/bond/1/holders')
  })

  it('cryptoAPI.getOHLC passes symbol and days as params', async () => {
    get.mockResolvedValue({ data: {} })
    await cryptoAPI.getOHLC('BTC', 7)
    expect(get).toHaveBeenCalledWith('/crypto/ohlc', { params: { symbol: 'BTC', days: 7 } })
  })
})
