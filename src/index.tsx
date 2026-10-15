/* @refresh reload */
import { ErrorBoundary } from 'solid-js'
import { render } from 'solid-js/web'
import { QueryClientProvider } from '@tanstack/solid-query'
import { clientRequetes } from './lib/requetes'
import './styles/tokens.css'
import './styles/base.css'
// Porte d'entree : la coque de l'application n'est montee qu'une fois la
// session ouverte (voir Portail.tsx).
import Portail from './Portail'
// Importe pour son effet : la reprise de l'etat personnel d'une machine a
// l'autre doit demarrer meme si l'ecran ouvert ne lit ni favori ni historique.
import './lib/synchro'

// Le client vit dans `lib/requetes.ts` avec les clefs, les durees de
// fraicheur et les invalidations : l invalidation part de modules sans
// composant (preferences, synchro), qui ne peuvent pas lire un contexte Solid.
const racine = document.getElementById('root')
if (!racine) throw new Error('#root introuvable')

render(
  () => (
    <ErrorBoundary
      fallback={(e: unknown) => (
        <div style={{ padding: '24px', 'font-family': 'var(--moov-font-mono)', 'font-size': '13px', color: 'var(--err)' }}>
          <h1 style={{ color: 'var(--err)' }}>L'interface n'a pas pu démarrer</h1>
          <p>{e instanceof Error ? `${e.name}: ${e.message}` : String(e)}</p>
          <pre style={{ 'white-space': 'pre-wrap', color: 'var(--fg3)' }}>
            {e instanceof Error ? e.stack : ''}
          </pre>
        </div>
      )}
    >
      <QueryClientProvider client={clientRequetes}>
        <Portail />
      </QueryClientProvider>
    </ErrorBoundary>
  ),
  racine,
)
