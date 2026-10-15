import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { fileURLToPath } from 'node:url'

// Construit les pages d'essai des tests de parcours : elles montent un ecran REEL
// (Lecture, Guide) sans la coque ni l'authentification, pour tester la lecture et
// le guide contre le faux serveur. Rien de ceci n'entre dans `dist`.
const ici = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: ici + 'harnais',
  base: './',
  plugins: [solid()],
  resolve: { dedupe: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  optimizeDeps: { exclude: ['solid-js', 'solid-js/web', '@tanstack/solid-virtual'] },
  build: {
    outDir: ici + '.dist-harnais',
    emptyOutDir: true,
    target: 'es2022',
    // hls.js reste un chunk a part, comme dans l'application.
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('hls.js') ? 'hls' : undefined) } },
  },
})
