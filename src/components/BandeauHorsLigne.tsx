import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { liveQuery } from 'dexie'
import Icone from './Icone'
import { db } from '../lib/db'
import { horsLigne, phraseHorsLigne } from '../lib/reseau'

// Bandeau discret et PERSISTANT « Hors ligne », sur tous les ecrans (US-47
// CA4). Il ne bloque rien : le catalogue, les favoris et l'historique sont en
// base locale et restent utilisables. Il compte les gestes du journal de
// synchronisation qui attendent le reseau, pour que « j'ai ajoute a Ma liste,
// il ne s'est rien passe » ait une reponse visible.

export default function BandeauHorsLigne() {
  const [enAttente, poserEnAttente] = createSignal(0)

  createEffect(() => {
    if (!horsLigne()) return
    const abonnement = liveQuery(() => db.journal.count()).subscribe({
      next: poserEnAttente,
      // Base locale indisponible (navigation privee) : rien a compter, le
      // bandeau se contente de dire « hors ligne ».
      error: () => poserEnAttente(0),
    })
    onCleanup(() => abonnement.unsubscribe())
  })

  return (
    <Show when={horsLigne()}>
      <div
        role="status"
        aria-live="polite"
        data-role="hors-ligne"
        style={{
          display: 'flex', 'align-items': 'center', gap: '8px',
          padding: '4px 16px', 'font-size': '12px', 'line-height': '16px',
          background: 'var(--lim-bg)', color: 'var(--lim)', 'border-bottom': '1px solid var(--line)',
        }}
      >
        <Icone nom="cloud_off" taille={14} />
        <span class="tronque">{phraseHorsLigne(enAttente())}</span>
      </div>
    </Show>
  )
}
