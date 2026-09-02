import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Silently keeps the cached app shell current; the app doesn't currently interrupt the
// user with an "update available" prompt, so a fresh build just takes over on next load.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true })
}

