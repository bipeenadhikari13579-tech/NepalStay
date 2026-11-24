import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the local network too, so phones and other computers on the same
    // Wi-Fi can open the site at http://<this computer's IP>:5173.
    host: true,
    port: 5173,
    strictPort: true,
    // Temporary public test links (localhost.run tunnels) use these addresses.
    allowedHosts: ['.lhr.life', '.localhost.run'],
    // Forward API calls to the Express server so cookies stay same-origin in dev.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
