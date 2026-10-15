// Enregistre ce que le lecteur subit vraiment, pour le comparer a ce que voit
// le serveur. Les journaux du serveur montrent des segments servis en ~1 s sans
// erreur alors que l'utilisateur voit « Connexion interrompue » : la cause est
// dans le navigateur, que seul un enregistreur cote client peut observer.
//
// Les evenements sont regroupes et envoyes toutes les 5 s au serveur
// (POST /api/v1/diagnostic/evenements), qui masque identifiants et jetons avant
// d'ecrire. On masque aussi de notre cote (`masquerUrl`) : un jeton de segment
// n'a aucune raison de quitter la page, meme vers notre propre serveur.

import { signalerSiNonAuthentifie } from './session-expiree'

const URL_EVENEMENTS = '/api/v1/diagnostic/evenements'

type Evenement = Record<string, string | number | boolean | null | undefined>

const CLE_APPAREIL = 'mytv.appareil'
const INTERVALLE_ENVOI_MS = 5000
const TAILLE_MAX_TAMPON = 200

function identifiantAppareil(): string {
  try {
    let id = localStorage.getItem(CLE_APPAREIL)
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      localStorage.setItem(CLE_APPAREIL, id)
    }
    return id
  } catch {
    return 'sans-stockage'
  }
}

const tampon: Evenement[] = []
let minuteur: ReturnType<typeof setInterval> | undefined
const appareil = identifiantAppareil()
const debut = performance.now()

/**
 * Retire d'une URL ce qui ne doit pas etre journalise : la requete, le fragment
 * et le jeton signe d'un segment (`/live/<chaine>/seg/<jeton>`). Indefini reste
 * indefini : l'appelant passe souvent un champ optionnel.
 */
export function masquerUrl(url: string | undefined): string | undefined {
  if (!url) return url
  const sans = url.split(/[?#]/, 1)[0] ?? ''
  return sans.replace(/(\/seg\/)[^/]+/, '$1…')
}

export function noter(type: string, details: Evenement = {}): void {
  if (tampon.length >= TAILLE_MAX_TAMPON) tampon.shift()
  tampon.push({ type, t: Math.round(performance.now() - debut) / 1000, ...details })
  armer()
}

/**
 * Un lot en forme de contrat (`EnvoiEvenements`) : `type` obligatoire et borne
 * a 40 caracteres, le reste libre. Pure, pour etre testee sans reseau.
 */
export function construireEnvoi(
  lot: Evenement[],
  appareil: string,
  agent: string,
): { appareil: string; agent: string; evenements: Array<Evenement & { type: string }> } {
  return {
    appareil: appareil.slice(0, 80),
    agent: agent.slice(0, 300),
    evenements: lot.map((e) => ({ ...e, type: String(e['type'] ?? 'inconnu').slice(0, 40) })),
  }
}

/**
 * Le serveur limite le debit par session (429) : au-dela, on jette le lot au
 * lieu de le remettre en file — une collecte qui insiste aggraverait ce qu'elle
 * mesure.
 */
async function envoyer(fermeture = false): Promise<void> {
  if (tampon.length === 0) return
  const lot = tampon.splice(0, 80)
  const corps = JSON.stringify(construireEnvoi(lot, appareil, navigator.userAgent))
  try {
    if (fermeture && navigator.sendBeacon) {
      navigator.sendBeacon(URL_EVENEMENTS, new Blob([corps], { type: 'application/json' }))
      return
    }
    const r = await fetch(URL_EVENEMENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corps,
      keepalive: true,
      credentials: 'same-origin',
    })
    signalerSiNonAuthentifie(r.status)
  } catch {
    // La collecte ne doit jamais gener la lecture : on abandonne ce lot.
  }
}

function armer(): void {
  if (minuteur) return
  minuteur = setInterval(() => void envoyer(), INTERVALLE_ENVOI_MS)
  if (typeof addEventListener === 'function')
    addEventListener('pagehide', () => void envoyer(true), { once: true })
}

/**
 * Branche l'observation sur une lecture : evenements de l'element video, et
 * un echantillon d'etat toutes les 5 s (tampon, position, images perdues).
 * Renvoie la fonction qui debranche tout.
 */
export function observerVideo(video: HTMLVideoElement, contexte: Evenement = {}): () => void {
  const etat = (): Evenement => ({
    pos: Math.round(video.currentTime * 10) / 10,
    avance: video.buffered.length
      ? Math.round((video.buffered.end(video.buffered.length - 1) - video.currentTime) * 10) / 10
      : 0,
    etatPret: video.readyState,
    etatReseau: video.networkState,
    pause: video.paused,
  })
  const types = ['waiting', 'stalled', 'playing', 'pause', 'seeking', 'emptied', 'error', 'ended', 'suspend'] as const
  const ecouteurs = types.map((nom) => {
    const f = () => noter('video:' + nom, { ...contexte, ...etat(), code: video.error?.code })
    video.addEventListener(nom, f)
    return [nom, f] as const
  })
  // Images reellement affichees : un retour en arriere du temps de media, un
  // trou ou une image presentee deux fois trahissent une boucle visible que ni la
  // position de lecture ni le tampon ne montrent.
  let derniere = -1
  let retours = 0
  let trous = 0
  let doublons = 0
  let pireRetour = 0
  let actif = true
  const suivreImages = (_now: number, meta: { mediaTime: number }) => {
    if (!actif) return
    if (derniere >= 0) {
      const d = meta.mediaTime - derniere
      if (d < -0.05) {
        retours++
        pireRetour = Math.min(pireRetour, d)
        noter('image:retour', { ...contexte, ...etat(), saut: Math.round(d * 1000) / 1000, de: Math.round(derniere * 100) / 100 })
      } else if (d > 0.5) {
        trous++
        noter('image:trou', { ...contexte, ...etat(), saut: Math.round(d * 1000) / 1000, de: Math.round(derniere * 100) / 100 })
      } else if (d === 0) doublons++
    }
    derniere = meta.mediaTime
    video.requestVideoFrameCallback(suivreImages)
  }
  video.requestVideoFrameCallback?.(suivreImages)
  const echantillon = setInterval(() => {
    const q = video.getVideoPlaybackQuality?.()
    noter('echantillon', {
      ...contexte, ...etat(), perdues: q?.droppedVideoFrames, total: q?.totalVideoFrames,
      retours, trous, doublons, pireRetour: Math.round(pireRetour * 1000) / 1000,
    })
  }, INTERVALLE_ENVOI_MS)
  noter('lecture:debut', { ...contexte })
  return () => {
    for (const [nom, f] of ecouteurs) video.removeEventListener(nom, f)
    actif = false
    clearInterval(echantillon)
    noter('lecture:fin', { ...contexte })
  }
}
