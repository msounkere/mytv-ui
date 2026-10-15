import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// L'interface est servie par Caddy sous https://mytv.msocasa.com/app/, donc sur
// la meme origine que le relais TuliProx : aucun CORS, et les identifiants ne
// quittent jamais le domaine. En developpement, /player_api.php et les routes de
// flux sont renvoyes vers le relais par le proxy ci-dessous.
// En developpement on vise TuliProx en direct sur le LAN : plein debit, et on
// ne fait pas transiter les tests par le tunnel Cloudflare (~10 Mbit/s).
const RELAIS = process.env.MYTV_RELAIS ?? 'http://192.168.50.9:8901'
// Le service de remux est servi sous /flux/* sur la meme origine en production
// (Caddy). En developpement le proxy reproduit cette origine unique : le code
// de l'interface n'a donc jamais d'adresse de service a connaitre.
const FLUX = process.env.MYTV_FLUX ?? 'http://127.0.0.1:8099'

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
    proxy: {
      ...Object.fromEntries(
        ['/player_api.php', '/xmltv.php', '/live', '/movie', '/series', '/images', '/resource'].map((route) => [
          route,
          { target: RELAIS, changeOrigin: true, secure: false },
        ]),
      ),
      '/flux': { target: FLUX, changeOrigin: true, secure: false },
    },
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
