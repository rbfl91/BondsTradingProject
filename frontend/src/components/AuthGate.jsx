import React, { useEffect, useState } from 'react'
import { Modal, Input, Alert, Space } from 'antd'
import {
  onUnauthorized,
  onTokenPrompt,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  clearUnauthorized,
} from '../auth'

// H-04: runtime, per-operator token prompt. The API is fail-closed (401 when
// no token is configured), so when the dashboard is used against a directly
// exposed API (no server-side token injection), the operator pastes the
// dashboard token here once. It is stored in localStorage for this browser —
// never in the JS bundle.
const AuthGate = () => {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [stored, setStored] = useState(false)

  useEffect(() => {
    setStored(Boolean(getAuthToken()))
    const off401 = onUnauthorized(() => setOpen(true))
    const offPrompt = onTokenPrompt(() => setOpen(true))
    return () => {
      off401()
      offPrompt()
    }
  }, [])

  const handleConnect = () => {
    const token = value.trim()
    if (!token) return
    setAuthToken(token)
    clearUnauthorized()
    setValue('')
    setStored(true)
    setOpen(false)
  }

  const handleDisconnect = () => {
    clearAuthToken()
    setValue('')
    setStored(false)
    setOpen(false)
  }

  return (
    <Modal
      title="API token required"
      open={open}
      okText="Connect"
      onOk={handleConnect}
      okButtonProps={{ disabled: !value.trim() }}
      cancelText={stored ? 'Disconnect' : 'Cancel'}
      onCancel={stored ? handleDisconnect : () => setOpen(false)}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type={stored ? 'warning' : 'info'}
          showIcon
          message={
            stored
              ? 'The stored token was rejected by the API. Enter a new token, or disconnect to remove the stored one.'
              : 'This dashboard needs the operator API token (AUTH_TOKEN). It is injected server-side in dev/production; enter it here only when the API is reached directly.'
          }
        />
        <Input.Password
          placeholder="Paste the dashboard API token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPressEnter={handleConnect}
          autoFocus
        />
      </Space>
    </Modal>
  )
}

export default AuthGate
