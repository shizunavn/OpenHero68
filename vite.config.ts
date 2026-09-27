import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    basicSsl({
      name: 'hero68-dev',
      domains: [
        'shizuna.ddns.net',
        'shizuna.duckdns.org',
        '192.168.1.123',
        'localhost',
      ],
    }),
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
