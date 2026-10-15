import { Show, createEffect, createSignal, on } from 'solid-js'
import Icone from './Icone'
import ResultatsRecherche from './ResultatsRecherche'
import type { EntreeCatalogue } from '../lib/db'
import { demarrerIndex } from '../lib/recherche-client'
import { retenirRecherche } from '../lib/recherches-recentes'

// Écran de résultats. Il ne possède plus de champ : la recherche se saisit dans
// l'en-tête, disponible sur tous les écrans, et cet écran n'est que la vue
// complète de ce que le panneau de suggestions a résumé. Garder un second champ
// ici obligeait à retaper la requête après l'avoir déjà écrite une fois.

export default function Recherche(props: {
  surOuvrir: (e: EntreeCatalogue) => void
  /** Requête transmise par l'en-tête ou l'Accueil. */
  requeteInitiale?: string
}) {
  const [requete, poserRequete] = createSignal(props.requeteInitiale ?? '')

  createEffect(
    on(
      () => props.requeteInitiale ?? '',
      (q) => {
        poserRequete(q)
        if (q.trim()) retenirRecherche(q)
      },
    ),
  )

  // L'index sert aussi au panneau de l'en-tête : le demander ici ne fait que
  // garantir qu'arriver directement sur cet écran ne laisse pas une page vide.
  void demarrerIndex()

  return (
    <Show
      when={requete().trim()}
      fallback={
        <div class="tertiaire" style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '10px', padding: '56px 16px', 'text-align': 'center' }}>
          <Icone nom="search" taille={36} />
          <div style={{ 'font-size': '16px', 'font-weight': '600', color: 'var(--fg)' }}>Rien à chercher pour l’instant</div>
          <div>Tapez dans le champ de l’en-tête, ou appuyez sur « / ».</div>
        </div>
      }
    >
      <ResultatsRecherche requete={requete()} surOuvrir={props.surOuvrir} />
    </Show>
  )
}
