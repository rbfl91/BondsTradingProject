import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from 'antd'
import Dashboard from './pages/Dashboard'
import BondOperations from './pages/BondOperations'
import BondDetail from './pages/BondDetail'
import CryptoMarket from './pages/CryptoMarket'
import Header from './components/Header'
import AuthGate from './components/AuthGate'
import './App.css'

const { Content } = Layout

const App = () => {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header />
        {/* H-04: prompts for the operator token on 401 (fail-closed API) */}
        <AuthGate />
        <Content style={{ padding: '24px', margin: '0 0', minHeight: 280, background: '#f0f2f5' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/operations" element={<BondOperations />} />
            <Route path="/bond/:bondId" element={<BondDetail />} />
            <Route path="/crypto-market" element={<CryptoMarket />} />
          </Routes>
        </Content>
      </Layout>
    </Router>
  )
}

export default App