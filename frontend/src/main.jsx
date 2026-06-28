import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import App from './App'
import './index.css'

const rootElement = document.getElementById('root')

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ConfigProvider locale={ptBR}>
        <App />
      </ConfigProvider>
    </React.StrictMode>,
  )
} catch (err) {
  rootElement.innerHTML = `<div style="padding:40px;background:#fff;color:red;font-family:sans-serif;"><h1>Render Error</h1><pre>${err.message}</pre><pre>${err.stack}</pre></div>`
  console.error('Failed to render App:', err)
}