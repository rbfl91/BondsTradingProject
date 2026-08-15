import React from 'react'
import { Layout, Menu, Typography, Space, Badge, Button, Tooltip } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import {
  DashboardOutlined,
  TransactionOutlined,
  ApiOutlined,
  PieChartOutlined,
  KeyOutlined,
} from '@ant-design/icons'
import { requestTokenPrompt } from '../auth'

const { Header: AntHeader } = Layout

const Header = () => {
  const location = useLocation()

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">Dashboard</Link>,
    },
    {
      key: '/operations',
      icon: <TransactionOutlined />,
      label: <Link to="/operations">Operations</Link>,
    },
    {
      key: '/crypto-market',
      icon: <PieChartOutlined />,
      label: <Link to="/crypto-market">Crypto Market</Link>,
    },
  ]

  return (
    <AntHeader
      style={{
        background: '#fff',
        padding: '0 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
      }}
    >
      <Space size="large" align="center">
        <Typography.Title level={4} style={{ margin: 0, color: '#1890ff' }}>
          <ApiOutlined /> Bond Trading
        </Typography.Title>
        <Menu
          theme="light"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ border: 'none', fontSize: '14px' }}
        />
      </Space>
      <Space size="middle" align="center">
        {/* H-04: operator can (re)enter the runtime API token */}
        <Tooltip title="Enter the operator API token (stored in this browser only)">
          <Button
            icon={<KeyOutlined />}
            onClick={() => requestTokenPrompt()}
            aria-label="API token"
          >
            API Token
          </Button>
        </Tooltip>
        <Badge count="Live" size="small" color="green" />
      </Space>
    </AntHeader>
  )
}

export default Header