import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

// Puerto del backend en desarrollo: 3000 por defecto; con otro (p. ej. PORT=3100 npm run dev en la raíz) arrancar Vite con
// VITE_BACKEND_PORT=3100 npm run dev. El mismo valor llega al código del panel como import.meta.env.VITE_BACKEND_PORT.
const backendPort = Number(process.env.VITE_BACKEND_PORT || process.env.PORT) || 3000
const backend = `http://localhost:${backendPort}`

export default defineConfig({
  define: { 'import.meta.env.VITE_BACKEND_PORT': JSON.stringify(String(backendPort)) },
  plugins: [
    react(),
    obfuscatorPlugin({
      include: ['src/**/*.js', 'src/**/*.jsx'],
      exclude: [/node_modules/],
      apply: 'build', 
      debugger: false,
      options: {
        compact: true,
        controlFlowFlattening: true, 
        deadCodeInjection: true,     
        stringArray: true,        
        stringArrayEncoding: ['base64']
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true
      },
      '/overlays': {
        target: backend,
        changeOrigin: true
      },
      '/sounds': {
        target: backend,
        changeOrigin: true
      },
      '/socket.io': {
        target: backend,
        ws: true
      }
    }
  },
})