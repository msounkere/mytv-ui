import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// L'interface est servie sous /app/ par le meme service que l'API (`mytv`), donc
// sur la meme origine : aucun CORS, et aucun identifiant de fournisseur ne
// peut quitter le serveur. En developpement, le proxy reproduit cette origine
// unique : `/api` est renvoye vers un `mytv` local (ou le harnais `mytv-dev`).
const API = process.env.MYTV_API ?? 'http://127.0.0.1:8080'

export default defineConfig({
  base: '/app/',
  plugins: [solid()],
  // Vite peut pre-bundler une seconde copie de solid-js via ses dependances :
  // deux instances cassent silencieusement la reactivite entre modules.
  resolve: { dedupe: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  // @tanstack/solid-virtual doit resoudre LA MEME copie de solid-js que
  // l'application : pre-bundle, il embarque la sienne, et son createStore ne
  // reveille alors aucun <For> cote application.
  optimizeDeps: { exclude: ['solid-js', 'solid-js/web', '@tanstack/solid-virtual'] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': { target: API, changeOrigin: true, secure: false } },
  },
  build: {
    target: 'es2022',
    // hls.js pese ~230 ko : on l'isole pour qu'il ne bloque pas le premier rendu.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('hls.js') ? 'hls' : undefined),
      },
    },
  },
})
