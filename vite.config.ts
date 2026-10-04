import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'HERO68_')
  const extraDomains = (env.HERO68_DEV_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean)
  return {
    plugins: [
      react(),
      basicSsl({
        name: 'hero68-dev',
        domains: [...new Set(['localhost', '127.0.0.1', ...extraDomains])],
      }),
    ],
    server: { host: '0.0.0.0', allowedHosts: true },
    preview: { host: '0.0.0.0', allowedHosts: true },
  }
})
