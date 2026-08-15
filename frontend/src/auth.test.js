import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  onUnauthorized,
  markUnauthorized,
  clearUnauthorized,
  requestTokenPrompt,
  onTokenPrompt,
} from './auth'

// H-04: the operator token is stored per browser (localStorage), never in the
// bundle. These tests cover the store/clear semantics and the 401 / prompt
// event channels the AuthGate relies on.
describe('auth (H-04 runtime operator token)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    clearUnauthorized()
  })

  it('stores and reads the token from localStorage', () => {
    expect(getAuthToken()).toBe('')
    setAuthToken('secret-123')
    expect(getAuthToken()).toBe('secret-123')
    expect(window.localStorage.getItem('bond_dashboard_api_token')).toBe('secret-123')
  })

  it('clearAuthToken forgets the token', () => {
    setAuthToken('secret-123')
    clearAuthToken()
    expect(getAuthToken()).toBe('')
    expect(window.localStorage.getItem('bond_dashboard_api_token')).toBeNull()
  })

  it('setAuthToken("") clears the stored token', () => {
    setAuthToken('secret-123')
    setAuthToken('')
    expect(getAuthToken()).toBe('')
  })

  it('notifies onUnauthorized subscribers when markUnauthorized fires', () => {
    let calls = 0
    const off = onUnauthorized(() => calls++)
    markUnauthorized()
    markUnauthorized()
    expect(calls).toBe(2)
    off()
    markUnauthorized()
    expect(calls).toBe(2)
  })

  it('late subscribers are told if a 401 already happened', () => {
    markUnauthorized()
    let calls = 0
    onUnauthorized(() => calls++)
    expect(calls).toBe(1)
  })

  it('clearUnauthorized stops the "already unauthorized" replay', () => {
    markUnauthorized()
    clearUnauthorized()
    let calls = 0
    onUnauthorized(() => calls++)
    expect(calls).toBe(0)
  })

  it('requestTokenPrompt notifies onTokenPrompt subscribers', () => {
    let calls = 0
    const off = onTokenPrompt(() => calls++)
    requestTokenPrompt()
    expect(calls).toBe(1)
    off()
    requestTokenPrompt()
    expect(calls).toBe(1)
  })
})
