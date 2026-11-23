import { For, Show } from 'solid-js'
import { LANGUES } from '../lib/facettes'
import { ecrireLangues, lireLangues } from '../lib/langues-preferees'
import { FRAICHEUR, cles, requete } from '../lib/requetes'
import { emettreToast } from '../lib/toasts'

// Réglages > Catalogue : les langues affichées par CE PROFIL (synchronisées entre ses
// appareils). Point de départ du filtre « Langue » de Films et Séries, et filtre des rangées
// « récemment ajoutés » et « À la une » de l'Accueil. Rien de coché : tout.

export default function LanguesAffichees() {
  const [langues] = requete(cles.languesPreferees, lireLangues, { fraicheur: FRAICHEUR.geste })
  const choisies = () => new Set(langues() ?? [])

  async function basculer(cle: string) {
    const s = new Set(choisies())
    if (s.has(cle)) s.delete(cle)
    else s.add(cle)
    try {
      await ecrireLangues([...s])
    } catch {
      emettreToast({ message: 'Réglage non enregistré, réessayer.', ton: 'erreur' })
    }
  }

  return (
    <section aria-label="Langues affichées" data-role="langues-affichees">
      <h2 style={{ 'margin-top': '24px' }}>Langues affichées</h2>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Pour ce profil, sur tous ses appareils : Films et Séries s’ouvrent filtrés sur ces langues (un geste
        suffit pour tout voir), et l’Accueil ne propose qu’elles. La recherche trouve toujours tout.
        Rien de coché : toutes les langues.
      </p>
      <p data-role="langues-resume" style={{ margin: '0 0 8px', 'font-size': '13px' }}>
        <Show when={choisies().size > 0} fallback={<>Toutes les langues.</>}>
          {LANGUES.filter((l) => choisies().has(l.cle)).map((l) => l.libelle).join(', ')}
        </Show>
      </p>
      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px', margin: '0 0 16px' }}>
        <For each={LANGUES}>
          {(l) => (
            <label
              style={{
                display: 'inline-flex', 'align-items': 'center', gap: '6px', padding: '6px 10px',
                border: `1px solid ${choisies().has(l.cle) ? 'var(--acc)' : 'var(--line)'}`, 'border-radius': 'var(--r-md)',
                cursor: 'pointer', 'font-size': '13px', 'min-height': '36px',
              }}
            >
              <input type="checkbox" checked={choisies().has(l.cle)} onChange={() => void basculer(l.cle)} />
              {l.libelle}
            </label>
          )}
        </For>
      </div>
    </section>
  )
}
