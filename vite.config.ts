import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt', // Solicita atualização quando há nova versão
        includeAssets: ['icons/icon.svg', 'model/vigia_dog_premium.glb', 'robots.txt'], // Assets estáticos para cache
        manifest: {
          name: 'Vigia',
          short_name: 'Vigia',
          description: 'Assistente Inteligente Educativo para crianças.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'icons/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,glb,ts,tsx}'],
          // Permite cachear o modelo 3D pesado
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15MB limite
          runtimeCaching: [
            {
              // Não cachear as rotas da API Gemini ou Firebase Firestore para garantir dados frescos/segurança
              urlPattern: /^https:\/\/(firestore\.googleapis\.com|generativelanguage\.googleapis\.com)\/.*/i,
              handler: 'NetworkOnly',
              options: {
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              // Cache de fontes
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
