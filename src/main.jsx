import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import './styles.css'
import { AuthProvider } from './auth'
import { ConfigGate } from './app/ConfigGate'
import { HubDataProvider } from './app/HubDataProvider'
import { createAppRouter } from './app/router'
import ErrorBoundary from './components/ErrorBoundary'

const router = createAppRouter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ConfigGate>
        <AuthProvider>
          <HubDataProvider>
            <RouterProvider router={router} />
          </HubDataProvider>
        </AuthProvider>
      </ConfigGate>
    </ErrorBoundary>
  </StrictMode>
)
