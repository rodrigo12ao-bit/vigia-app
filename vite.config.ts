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
        includeAssets: ['icons/icon.svg', 'robots.txt'], // Assets estáticos para cache
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
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          globIgnores: ['**/vendor-three-*.js', '**/graphics-*.js', '**/Avatar3D-*.js', '**/EscapeGame-*.js'],
          // Permite cachear o modelo 3D pesado
          maximumFileSizeToCacheInBytes: 2 * 1024 * 1024, // 15MB limite
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
    build: {
      outDir: 'dist/public',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,

          chunkFileNames: chunk => chunk.name !== 'vendor-react' && chunk.moduleIds.some(id => id.includes('/three/') || id.includes('@react-three/') || id.includes('@dimforge/')) ? 'assets/graphics-[name]-[hash].js' : 'assets/[name]-[hash].js',
          manualChunks(id) {
            if (id.includes('commonjsHelpers')) return 'vendor-utils';
            if (id.includes('node_modules')) {
              if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';

              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
