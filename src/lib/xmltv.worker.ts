/// <reference lib="webworker" />
import { ClientXtream } from './xtream'
import { ErreurLecteur } from './errors'
import {
  dbEpg,
  telechargerXmltv,
  horodatageXmltv,
  MARQUEUR_COMPLET,
  MARQUEUR_EN_COURS,
  type ChaineGuide,
} from './epg'

// 61,5 Mo de XML, 200 050 programmes. Les parser sur le fil principal figerait
// l'onglet plusieurs secondes, et `DOMParser` n'existe pas dans un worker :
// on balaie donc le flux par morceaux, élément par élément, sans jamais
// construire d'arbre ni garder les 61 Mo décodés en mémoire.

export interface AvancementGuide {
  etape: string
  /** 0 → 1, indicatif : le relais ne renvoie pas de Content-Length. */
  part: number
}

export type VersXmltv = { type: 'charger' }

export type DepuisXmltv =
  | { type: 'avancement'; avancement: AvancementGuide }
  | { type: 'fini'; chargeLe: number; chaines: number; programmes: number }
  | { type: 'erreur'; couche: string; message: string; action: string; detail?: string }

/** Taille observée du XMLTV du relais, pour donner une progression crédible. */
const OCTETS_ATTENDUS = 61_500_000
const LOT_ECRITURE = 10_000
/** Les descriptions longues triplent le poids en base sans servir la grille. */
const DESCRIPTION_MAX = 600

self.onmessage = async (e: MessageEvent<VersXmltv>) => {
  if (e.data.type !== 'charger') return
  try {
    await charger()
  } catch (err) {
    const e2 =
      err instanceof ErreurLecteur
        ? err
        : new ErreurLecteur('donnees', String(err), 'Réessayer le chargement du guide.')
    post({
      type: 'erreur',
      couche: e2.couche,
      message: e2.message,
      action: e2.action,
      detail: e2.detail,
    })
  }
}

async function charger(): Promise<void> {
  avancer('Liste des chaînes', 0.02)

  // Le catalogue stocké (db.ts) ne retient pas `epg_channel_id` : la table de
  // correspondance stream_id ↔ identifiant XMLTV se relit donc ici, et elle
  // sert aussi à ne garder du XMLTV que les chaînes réellement abonnées.
  const client = new ClientXtream()
  const brutes = await client.chaines()
  const parEpg = new Map<string, ChaineGuide[]>()
  for (const c of brutes) {
    const epg = (c.epg_channel_id ?? '').trim()
    if (!epg) continue
    const entree: ChaineGuide = { streamId: c.stream_id, epg, nom: c.name, icone: c.stream_icon }
    const liste = parEpg.get(epg)
    if (liste) liste.push(entree)
    else parEpg.set(epg, [entree])
  }

  avancer('Téléchargement du guide', 0.05)
  const flux = await telechargerXmltv()

  // On vide avant d'écrire : une grille à moitié remplacée afficherait des
  // horaires d'hier à côté de ceux d'aujourd'hui. Et on pose tout de suite un
  // marqueur « en cours » : si la page est rechargée pendant les 40 s d'import,
  // le worker meurt avec elle et la base reste à moitié écrite — elle doit
  // alors se dire incomplète, pas se faire passer pour un guide chargé.
  await dbEpg.transaction('rw', dbEpg.programmes, dbEpg.chaines, dbEpg.meta, async () => {
    await dbEpg.programmes.clear()
    await dbEpg.chaines.clear()
    await dbEpg.meta.clear()
    await dbEpg.meta.put({ cle: 'etat', valeur: MARQUEUR_EN_COURS })
  })

  const vus = new Set<string>()
  let tampon: Array<{ chaine: string; titre: string; description?: string; debut: number; fin: number }> = []
  let total = 0
  let octets = 0

  const vider = async () => {
    if (tampon.length === 0) return
    await dbEpg.programmes.bulkAdd(tampon)
    tampon = []
  }

  const lecteur = flux.getReader()
  const decodeur = new TextDecoder('utf-8')
  let reste = ''

  for (;;) {
    const { value, done } = await lecteur.read()
    if (done) break
    octets += value.byteLength
    reste += decodeur.decode(value, { stream: true })

    const { consomme, elements } = decouper(reste)
    reste = reste.slice(consomme)

    for (const el of elements) {
      const p = lireProgramme(el, parEpg)
      if (!p) continue
      vus.add(p.chaine)
      tampon.push(p)
      total += 1
    }

    if (tampon.length >= LOT_ECRITURE) {
      await vider()
      // Progression bornée : si le fichier grossit, on ne dépasse pas 0,97.
      avancer(
        `${(octets / 1_048_576).toFixed(0)} Mo lus · ${total.toLocaleString('fr-FR')} programmes`,
        0.05 + Math.min(0.92, octets / OCTETS_ATTENDUS) * 0.9,
      )
    }
  }

  reste += decodeur.decode()
  for (const el of decouper(reste).elements) {
    const p = lireProgramme(el, parEpg)
    if (!p) continue
    vus.add(p.chaine)
    tampon.push(p)
    total += 1
  }
  await vider()

  // Seules les chaînes effectivement présentes dans le XMLTV sont retenues :
  // afficher une ligne vide pour les 2 500 autres serait un mensonge d'écran.
  const chaines: ChaineGuide[] = []
  for (const epg of vus) for (const c of parEpg.get(epg) ?? []) chaines.push(c)

  avancer('Enregistrement des chaînes', 0.98)
  const chargeLe = Date.now()
  await dbEpg.transaction('rw', dbEpg.chaines, dbEpg.meta, async () => {
    await dbEpg.chaines.bulkPut(chaines)
    await dbEpg.meta.bulkPut([
      { cle: 'chargeLe', valeur: chargeLe },
      { cle: 'epgDistincts', valeur: vus.size },
      // Écrit en dernier, dans la même transaction que les chaînes : c'est
      // lui seul qui fait foi côté écran.
      { cle: 'etat', valeur: MARQUEUR_COMPLET },
    ])
  })

  post({ type: 'fini', chargeLe, chaines: chaines.length, programmes: total })
}

// ─── Balayage incrémental ────────────────────────────────────────────────────
// Le flux arrive en morceaux arbitraires, et ce XMLTV n'a aucun retour à la
// ligne : on découpe sur les balises, pas sur les lignes, et tout élément
// tronqué par la frontière d'un morceau reste dans le tampon.

const OUVERTURE = '<programme '
const FERMETURE = '</programme>'

function decouper(tampon: string): { consomme: number; elements: string[] } {
  const elements: string[] = []
  let pos = 0
  for (;;) {
    const debut = tampon.indexOf(OUVERTURE, pos)
    if (debut < 0) {
      // Rien d'exploitable : on ne conserve que de quoi recoller une balise
      // coupée en deux par la frontière du morceau.
      pos = Math.max(pos, tampon.length - OUVERTURE.length)
      break
    }
    const fin = tampon.indexOf(FERMETURE, debut)
    if (fin < 0) {
      pos = debut
      break
    }
    elements.push(tampon.slice(debut, fin))
    pos = fin + FERMETURE.length
  }
  return { consomme: pos, elements }
}

const ATTR_DEBUT = /\sstart="([^"]*)"/
const ATTR_FIN = /\sstop="([^"]*)"/
const ATTR_CHAINE = /\schannel="([^"]*)"/
const TITRE = /<title[^>]*>([\s\S]*?)<\/title>/
const DESC = /<desc[^>]*>([\s\S]*?)<\/desc>/

function lireProgramme(
  el: string,
  connues: Map<string, unknown>,
): { chaine: string; titre: string; description?: string; debut: number; fin: number } | undefined {
  const chaine = ATTR_CHAINE.exec(el)?.[1]
  // Filtrer ici, et pas après : écrire en base les programmes des chaînes
  // absentes de l'abonnement coûterait plusieurs dizaines de milliers
  // d'enregistrements pour rien.
  if (!chaine || !connues.has(chaine)) return undefined

  const debut = horodatageXmltv(ATTR_DEBUT.exec(el)?.[1] ?? '')
  const fin = horodatageXmltv(ATTR_FIN.exec(el)?.[1] ?? '')
  if (!debut || fin <= debut) return undefined

  const description = decoder(DESC.exec(el)?.[1] ?? '').slice(0, DESCRIPTION_MAX)
  return {
    chaine,
    titre: decoder(TITRE.exec(el)?.[1] ?? '') || 'Programme sans titre',
    description: description || undefined,
    debut,
    fin,
  }
}

const ENTITES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

function decoder(v: string): string {
  if (!v.includes('&')) return v.trim()
  return v
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (brut, corps: string) => {
      if (corps.startsWith('#x') || corps.startsWith('#X'))
        return String.fromCodePoint(Number.parseInt(corps.slice(2), 16))
      if (corps.startsWith('#')) return String.fromCodePoint(Number(corps.slice(1)))
      return ENTITES[corps] ?? brut
    })
    .trim()
}

function avancer(etape: string, part: number) {
  post({ type: 'avancement', avancement: { etape, part } })
}

function post(m: DepuisXmltv) {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
}
