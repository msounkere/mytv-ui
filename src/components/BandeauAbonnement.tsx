import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { alerteAbonnement, oublierAbonnement, PERIODE_RELECTURE_MS, rafraichirAbonnement } from '../lib/abonnement'
import { session } from '../lib/auth'

// Bandeau de l'ADMINISTRATEUR : l'abonnement du fournisseur expire bientot, ou
// le fournisseur refuse le compte / l'adresse. Visible de tous les ecrans, comme
// le bandeau d'import. Masquable (jusqu'a ce que la situation change) : l'alerte
// dure des jours, elle ne doit pas gener a chaque ecran.

const CLE_MASQUE = 'mytv.bandeau-abonnement-masque'

function lireMasque(): string | null {
  try {
    return localStorage.getItem(CLE_MASQUE)
  } catch {
    return null
  }
}

function ecrireMasque(cle: string): void {
  try {
    localStorage.setItem(CLE_MASQUE, cle)
  } catch {
    // Stockage indisponible : le bandeau reviendra a la prochaine ouverture.
  }
}

export default function BandeauAbonnement() {
  const [masque, poserMasque] = createSignal<string | null>(lireMasque())

  // Seul un administrateur interroge le serveur (la route lui est reservee).
  createEffect(() => {
    if (!session()?.admin) return oublierAbonnement()
    const arret = new AbortController()
    void rafraichirAbonnement(arret.signal)
    const minuteur = setInterval(() => void rafraichirAbonnement(arret.signal), PERIODE_RELECTURE_MS)
    onCleanup(() => {
      arret.abort()
      clearInterval(minuteur)
    })
  })

  return (
    <Show when={alerteAbonnement()}>
      {(a) => (
        <Show when={masque() !== a().cle}>
          <div
            role="status"
            aria-live="polite"
            data-testid="bandeau-abonnement"
            data-niveau={a().niveau}
            style={{
              display: 'flex', gap: '10px', 'align-items': 'center',
              padding: '6px 16px', 'font-size': '12px',
              background: a().niveau === 'proche' ? 'var(--lim-bg)' : 'var(--err-bg)',
              color: a().niveau === 'proche' ? 'var(--lim)' : 'var(--err)',
              'border-bottom': '1px solid var(--line)',
            }}
          >
            <span style={{ flex: '1 1 auto' }}>{a().texte}</span>
            <button
              data-testid="bandeau-abonnement-masquer"
              onClick={() => {
                ecrireMasque(a().cle)
                poserMasque(a().cle)
              }}
              style={{ border: '1px solid var(--line2)', padding: '2px 10px', color: 'inherit' }}
            >
              Masquer
            </button>
          </div>
        </Show>
      )}
    </Show>
  )
}
