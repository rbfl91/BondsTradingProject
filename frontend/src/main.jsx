import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App'
import './index.css'

const rootElement = document.getElementById('root')

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {/* N-16 FIX: the UI copy is English (post L-07), so the pt_BR locale
          override (Portuguese dates/tooltips/pagination) was dropped — antd
          defaults to English, matching the visible copy. */}
      <ConfigProvider>
        <App />
      </ConfigProvider>
    </React.StrictMode>,
  )
} catch (err) {
  // L-02: show a generic message (no stack/inner details in the page);
  // the full error still goes to the browser console for developers.
  rootElement.innerHTML = `<div style="padding:40px;background:#fff;color:red;font-family:sans-serif;"><h1>Render Error</h1><p>The application failed to start. Check the browser console for details and reload the page.</p></div>`
  console.error('Failed to render App:', err)
}
