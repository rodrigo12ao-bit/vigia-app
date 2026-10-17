import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {defineConfig} from 'vite';
const publicAssets=createRequire(import.meta.url)(path.resolve('scripts/copy-public-assets.cjs'));

export default defineConfig(({mode}) => {
  const shellFiles=new Set(['index.html','icons/icon.svg','manifest.webmanifest']);
  const report:{mode:string;chunks:any[];precache:string[]}={mode,chunks:[],precache:[]};
  const writeReport=()=>{fs.mkdirSync('.tools/build',{recursive:true});fs.writeFileSync(`.tools/build/graph-${mode}.json`,JSON.stringify(report,null,2));};
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {name:'vigia-copy-public-assets',writeBundle(options){
        publicAssets.copyPublicAssets(path.resolve('public'),path.resolve(options.dir||'dist/public'));
      }},
      {name:'vigia-loading-graph',generateBundle(_options,bundle){
        report.chunks=Object.values(bundle).filter(item=>item.type==='chunk').map(item=>({fileName:item.fileName,name:item.name,isEntry:item.isEntry,imports:item.imports,dynamicImports:item.dynamicImports,modules:Object.keys(item.modules).map(id=>id.replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/')+'/',''))}));
        const collect=(name:string)=>{if(shellFiles.has(name))return;shellFiles.add(name);const item=bundle[name];if(item?.type==='chunk'){for(const dependency of item.imports)collect(dependency);for(const css of (item as any).viteMetadata?.importedCss||[])shellFiles.add(css);}};
        for(const item of Object.values(bundle))if(item.type==='chunk'&&item.isEntry)collect(item.fileName);
        writeReport();
      }},
      VitePWA({
        registerType: 'prompt', // Solicita atualização quando há nova versão
        includeAssets: ['icons/icon.svg', 'robots.txt'], // Assets estáticos para cache
        manifest: {
          name: 'Vigia',
          short_name: 'Vigia',
          description: 'Aprendizado e prevenção com a Vigia. Acesso exclusivo para adultos de 18 anos ou mais.',
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
          // Install only the entry's static dependency graph. Features are saved
          // when visited, rather than all competing with the first screen.
          manifestTransforms:[async entries=>{
            const manifest=entries.filter(entry=>shellFiles.has(entry.url));
            report.precache=manifest.map(entry=>entry.url);writeReport();
            return {manifest,warnings:[]};
          }],
          navigateFallback:'index.html',
          navigateFallbackDenylist:[/^\/api(?:\/|$)/],
          runtimeCaching: [
            {
              urlPattern:({url,sameOrigin})=>sameOrigin&&url.pathname.startsWith('/assets/')&&!url.pathname.includes('/graphics-')&&/\.(?:js|css)$/.test(url.pathname),
              handler:'CacheFirst',
              options:{cacheName:'vigia-public-assets-v1',cacheableResponse:{statuses:[200]},expiration:{maxEntries:80,maxAgeSeconds:60*60*24*30}},
            },
            {
              urlPattern:({url,sameOrigin})=>sameOrigin&&/^\/model\/(?:avatar-preview-(?:female|male)|vigia-original-(?:preview|head))\.png$/.test(url.pathname),
              handler:'StaleWhileRevalidate',
              options:{cacheName:'vigia-avatar-previews-v1',cacheableResponse:{statuses:[200]},expiration:{maxEntries:4,maxAgeSeconds:60*60*24*30}},
            },
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
      copyPublicDir: false,
      outDir: 'dist/public',
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,

          chunkFileNames: chunk => chunk.name !== 'vendor-react' && chunk.moduleIds.some(id => id.includes('/three/') || id.includes('@react-three/') || id.includes('@dimforge/')) ? 'assets/graphics-[name]-[hash].js' : 'assets/[name]-[hash].js',
          manualChunks(id) {
            if (id.includes('commonjsHelpers')) return 'vendor-utils';
            if (id.includes('node_modules')) {
              if (/node_modules\/(react|react-dom|scheduler)\//.test(id) && !id.includes('/node_modules/@react-three/')) return 'vendor-react';

              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('firebase')) {
                if(/(?:@firebase|firebase)\/auth(?:\/|\b)/.test(id))return 'vendor-firebase-auth';
                if(/(?:@firebase|firebase)\/firestore(?:\/|\b)/.test(id)||id.includes('@firebase/webchannel-wrapper'))return 'vendor-firebase-store';
                return 'vendor-firebase-core';
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
