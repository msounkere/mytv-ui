import Dexie, { type Table } from 'dexie'
import { ErreurLecteur, depuisReponse } from './errors'
import { FRAICHEUR, cles, donneePartagee } from './requetes'
import { URL_XMLTV, type ClientXtream } from './xtream'

// TuliProx relaie l EPG du fournisseur par les routes Xtream standard. On ne
// les atteint plus en direct : le service les relaie sous /flux/relais/ et y
// injecte les identifiants, de sorte qu ils ne figurent plus ni dans l URL ni
// en memoire de la page.
//   player_api.php?action=get_short_epg&stream_id=<id>&limit=<n>   → la grille d une chaine
//   player_api.php?action=get_simple_data_table&stream_id=<id>     → idem, format long
//   xmltv.php                                                      → le XMLTV complet

export interface Programme {
  /** `epg_channel_id` du flux, lien avec ChaineXtream.epg_channel_id. */
  chaine: string
  titre: string
  description?: string
  debut: number
  fin: number
}

/** L API Xtream encode titres et descriptions en base64. */
function deBase64(v: string | undefined): string {
  if (!v) return ''
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(v), (c) => c.charCodeAt(0)))
  } catch {
    return v // deja en clair chez certains relais
  }
}

interface EpgCourtBrut {
  epg_listings?: Array<{
    title?: string
    description?: string
    start?: string
    end?: string
    start_timestamp?: string
    stop_timestamp?: string
    channel_id?: string
  }>
}

/** Grille d une seule chaine — suffisant pour « programme en cours » en lecture. */
export async function epgChaine(
  client: ClientXtream,
  streamId: number,
  limite = 12,
  signal?: AbortSignal,
): Promise<Programme[]> {
  const brut = await client.appelBrut<EpgCourtBrut>(
    'get_short_epg',
    { stream_id: streamId, limit: limite },
    signal,
  )
  return (brut.epg_listings ?? []).map((p) => ({
    chaine: p.channel_id ?? String(streamId),
    titre: deBase64(p.title) || 'Programme sans titre',
    description: deBase64(p.description) || undefined,
    debut: horodatage(p.start_timestamp, p.start),
    fin: horodatage(p.stop_timestamp, p.end),
  }))
}

function horodatage(ts: string | undefined, texte: string | undefined): number {
  if (ts) return Number(ts) * 1000
  if (texte) {
    const t = Date.parse(texte.replace(' ', 'T'))
    if (!Number.isNaN(t)) return t
  }
  return 0
}

/**
 * XMLTV complet, pour la grille EPG multi-chaines. Le fichier pese plusieurs
 * dizaines de Mo : il est recupere en flux et parse dans un worker, jamais sur
 * le fil principal.
 */
export async function telechargerXmltv(
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  let r: Response
  try {
    // Le service comprime sa reponse : les 61 Mo du guide arrivent en 12 Mo,
    // et le navigateur les decomprime au fil de la lecture du flux.
    r = await fetch(URL_XMLTV, { signal, credentials: 'same-origin' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ErreurLecteur(
      'reseau',
      'Le guide des programmes est injoignable.',
      'Reessayer ; la navigation reste utilisable sans EPG.',
      String(e),
    )
  }
  if (!r.ok) throw depuisReponse(r, 'xmltv.php')
  if (!r.body)
    throw new ErreurLecteur(
      'donnees',
      'Le relais a renvoye un guide vide.',
      'Verifier qu une source EPG est configuree dans TuliProx.',
    )
  return r.body
}

/** Programme en cours dans une grille triee. */
export function programmeEnCours(grille: Programme[], maintenant: number): Programme | undefined {
  return grille.find((p) => p.debut <= maintenant && maintenant < p.fin)
}

// ─────────────────────────────────────────────────────────────────────────────
// Base dediee a la grille EPG
// ─────────────────────────────────────────────────────────────────────────────
// Le XMLTV du relais pese 61,5 Mo pour 200 050 programmes repartis sur 2 950
// chaines, soit environ deux jours de grille. On le parse une fois dans un
// worker puis on l interroge par index : la grille multi-chaines a besoin d un
// acces aleatoire (n importe quelle chaine, n importe quelle heure, en arriere
// comme en avant), ce que `get_short_epg` ne sait pas faire — il ne rend que
// les prochains programmes d UNE chaine, au prix d un aller-retour HTTP par
// ligne visible, sur le meme relais que la video.
//
// Base distincte de `mytv` (db.ts) a dessein : le schema du catalogue est
// partage, celui du guide est jetable — on peut le vider et le recharger sans
// toucher aux favoris ni aux reprises.

/** Lien stream_id ↔ identifiant XMLTV, etabli depuis `get_live_streams`. */
export interface ChaineGuide {
  streamId: number
  /** `epg_channel_id` — cle de jointure avec les programmes. */
  epg: string
  nom: string
  icone?: string
}

interface ProgrammeStocke extends Programme {
  /** Cle auto-incrementee ; absente a l insertion. */
  n?: number
}

interface MetaGuide {
  cle: string
  valeur: unknown
}

export const dbEpg = new Dexie('mytv-epg') as Dexie & {
  programmes: Table<ProgrammeStocke, number>
  chaines: Table<ChaineGuide, number>
  meta: Table<MetaGuide, string>
}

dbEpg.version(1).stores({
  // `[chaine+debut]` est le seul acces utile : « cette chaine, entre t0 et t1 ».
  programmes: '++n, [chaine+debut]',
  chaines: 'streamId, epg',
  meta: 'cle',
})

export interface EtatGuide {
  /** Horodatage du dernier import XMLTV reussi, absent si jamais charge. */
  chargeLe?: number
  /**
   * Faux tant qu un import n a pas ete mene a son terme. Un rechargement de
   * page pendant l import tue le worker : la base garde alors des programmes
   * sans table de chaines, et doit se declarer incomplete plutot que de
   * laisser l ecran afficher « 0 chaine » sans explication.
   */
  complet: boolean
  chaines: number
  programmes: number
}

/** Pose au debut de l import, remplace par `complet` a la toute fin. */
export const MARQUEUR_EN_COURS = 'en-cours'
export const MARQUEUR_COMPLET = 'complet'

export async function etatGuide(): Promise<EtatGuide> {
  const [horodatage, marqueur, chaines, programmes] = await Promise.all([
    dbEpg.meta.get('chargeLe'),
    dbEpg.meta.get('etat'),
    dbEpg.chaines.count(),
    dbEpg.programmes.count(),
  ])
  const v = horodatage?.valeur
  return {
    chargeLe: typeof v === 'number' ? v : undefined,
    complet: marqueur?.valeur === MARQUEUR_COMPLET && chaines > 0,
    chaines,
    programmes,
  }
}

/** Les chaines pour lesquelles le XMLTV contient reellement des programmes. */
export function chainesGuide(): Promise<ChaineGuide[]> {
  return dbEpg.chaines.toArray()
}

/**
 * Meme table, mais lue UNE fois pour toute l'application.
 *
 * POURQUOI : ces 4 048 lignes etaient relues par chaque appelant -- trois
 * rangees de l'Accueil, la colonne de Direct, les lignes du Guide --, soit cinq
 * lectures de la meme table pour peindre un seul ecran. La table ne change
 * qu'au rechargement du guide, et c'est `invaliderGuide` qui la perime.
 */
export function chainesGuidePartagees(): Promise<ChaineGuide[]> {
  return donneePartagee(cles.epgChaines, chainesGuide, FRAICHEUR.guide)
}

/**
 * Un programme peut avoir commence bien avant la fenetre affichee : on remonte
 * la borne basse de la requete pour ne pas perdre la case en cours.
 */
const DEBORDEMENT = 8 * 3_600_000

/** Grilles de plusieurs chaines sur une fenetre temporelle, en une requete. */
export async function grillesFenetre(
  epgs: string[],
  debut: number,
  fin: number,
): Promise<Map<string, Programme[]>> {
  const par = new Map<string, Programme[]>()
  for (const e of epgs) par.set(e, [])
  if (epgs.length === 0 || fin <= debut) return par

  const lignes = await dbEpg.programmes
    .where('[chaine+debut]')
    .inAnyRange(
      epgs.map((e) => [
        [e, debut - DEBORDEMENT],
        [e, fin],
      ]),
      { includeUppers: false },
    )
    .toArray()

  for (const p of lignes) {
    if (p.fin <= debut) continue // deborde par le bas : deja termine
    par.get(p.chaine)?.push({
      chaine: p.chaine,
      titre: p.titre,
      description: p.description,
      debut: p.debut,
      fin: p.fin,
    })
  }
  for (const liste of par.values()) liste.sort((a, b) => a.debut - b.debut)
  return par
}

/**
 * Horodatage XMLTV : « 20261011040000 +0000 ». Le fuseau est porte par la
 * valeur elle-meme ; l ignorer decalerait la grille de plusieurs heures.
 */
export function horodatageXmltv(v: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/.exec(v)
  if (!m) return 0
  const base = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  )
  if (!m[7]) return base
  const decalage = (Number(m[8]) * 60 + Number(m[9])) * 60_000
  return m[7] === '+' ? base - decalage : base + decalage
}
