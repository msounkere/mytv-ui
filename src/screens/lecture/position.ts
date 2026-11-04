import { cheminContenu, idServeurDeCle, serieDeCle } from '../../lib/identifiants'
import { signalerSiNonAuthentifie } from '../../lib/session-expiree'

// Position de sortie du lecteur (US-45 CA1). La memorisation locale passe par
// `preferences.noterPosition` (IndexedDB + journal) ; le journal, lui, ne part
// au serveur que 30 s plus tard. A l'ARRET, a la PAUSE et a la FERMETURE de la
// page, la position part donc aussi tout de suite, en `keepalive` : regarder dix
// minutes sur le telephone puis allumer la television doit donner la bonne
// reprise, pas celle d'il y a trente secondes.
//
// La partie pure (le corps du PUT) est testee seule ; l'envoi est un `fetch`
// idempotent sur la meme route que la synchronisation (`PUT /profil/historique/{id}`),
// que le journal rejouera sans dommage.

export interface CorpsPosition {
  chemin: string
  corps: { position: number; duree: number; serie?: string }
}

/**
 * Corps de `PUT /profil/historique/{id}` pour une position de sortie, ou
 * `undefined` quand il n'y a rien d'envoyable : duree inconnue, ou episode dont
 * la serie n'est pas connue (le contrat refuse l'ecriture sans elle).
 */
export function corpsPosition(cle: string, position: number, duree: number, serie?: string): CorpsPosition | undefined {
  if (!Number.isFinite(duree) || duree <= 0 || !Number.isFinite(position)) return undefined
  const id = idServeurDeCle(cle)
  let chemin: string
  try {
    chemin = cheminContenu(id)
  } catch {
    return undefined
  }
  const s = serieDeCle(id, serie ? idServeurDeCle(serie) : undefined)
  if (s === 'requise') return undefined
  const corps: CorpsPosition['corps'] = {
    position: Math.max(0, Math.floor(Math.min(position, duree))),
    duree: Math.max(0, Math.floor(duree)),
  }
  if (s !== undefined) corps.serie = s
  return { chemin: `/api/v1/profil/historique/${chemin}`, corps }
}

/**
 * Envoi immediat, sans attente : `keepalive` laisse partir la requete meme si
 * la page se ferme juste apres (`pagehide`). Un echec n'est pas grave, le
 * journal de synchronisation porte la meme position.
 */
export function envoyerPosition(cle: string, position: number, duree: number, serie?: string, fetchImpl: typeof fetch = fetch): boolean {
  const c = corpsPosition(cle, position, duree, serie)
  if (!c) return false
  try {
    void fetchImpl(c.chemin, {
      method: 'PUT',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c.corps),
    })
      .then((r) => signalerSiNonAuthentifie(r.status))
      .catch(() => {})
  } catch {
    return false
  }
  return true
}
