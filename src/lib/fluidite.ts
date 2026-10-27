// Score de fluidite et choix de la variante (US-39 CA2, CA3, CA5).
//
// Le lecteur note deja tout ce qu'il subit (diagnostic.ts : segments et debit,
// blocages `video:waiting`, erreurs hls.js, reprises). Ce module ECOUTE ces
// notes sur la page, les agrege par lecture et les garde dans IndexedDB (table
// `lectures`, fenetre glissante de 14 jours). De la sort une note par variante,
// dans le contexte de CET appareil et de la classe de debit de la liaison :
// « FR - TF1 FHD » bloque trois fois par heure a 5 Mbit/s mais jamais a 30.
//
// Aucune connexion de plus au fournisseur : on ne mesure que ce qui est lu.
// Les decisions (score, agregation, choix) sont PURES et testees seules ; la
// base et le stockage du choix explicite sont a la fin.

import { createSignal } from 'solid-js'
import { db, type EntreeCatalogue, type LectureMesuree } from './db'
import { abonnerEvenements } from './diagnostic'
import { annonceHevc, qualiteDe, LIBELLE_QUALITE, RANG_QUALITE, type Qualite } from './variantes'

export type { LectureMesuree }
export type ClasseDebit = NonNullable<LectureMesuree['classe']>

/** Fenetre glissante : au-dela, une lecture ne compte plus. */
export const FENETRE_MS = 14 * 24 * 3_600_000
/** En deca de cette duree cumulee, aucune note : trois secondes ne disent rien. */
export const DUREE_MIN_NOTE_S = 60
/** Une lecture plus courte n'est pas enregistree (un zapping n'est pas une mesure). */
export const DUREE_MIN_LECTURE_S = 5

/** Classe de debit d'une liaison : < 5, 5-15, > 15 Mbit/s. */
export function classeDebit(mbps: number | undefined): ClasseDebit | undefined {
  if (mbps === undefined || !Number.isFinite(mbps) || mbps < 0) return undefined
  return mbps < 5 ? 'faible' : mbps <= 15 ? 'moyen' : 'eleve'
}

export function mediane(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const t = [...xs].sort((a, b) => a - b)
  const m = Math.floor(t.length / 2)
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2
}

// --- Agregation et score ----------------------------------------------------

export interface StatsVariante {
  lectures: number
  dureeS: number
  blocages: number
  erreurs: number
  redemarrages: number
  /** Debit median observe, en kbit/s (indefini sans segment). */
  debitKbps?: number
}

const STATS_VIDES: StatsVariante = { lectures: 0, dureeS: 0, blocages: 0, erreurs: 0, redemarrages: 0 }

/**
 * Cumule les lectures d'une variante dans la fenetre et, si une classe de debit
 * est donnee, dans cette classe seulement (une lecture sans classe compte
 * toujours : mieux vaut une note approximative qu'aucune).
 */
export function agregerLectures(
  lectures: readonly LectureMesuree[],
  opts: { maintenant: number; classe?: ClasseDebit; fenetreMs?: number },
): StatsVariante {
  const fenetre = opts.fenetreMs ?? FENETRE_MS
  const s = { ...STATS_VIDES }
  const debits: number[] = []
  for (const l of lectures) {
    if (l.debut < opts.maintenant - fenetre || l.debut > opts.maintenant) continue
    if (opts.classe && l.classe && l.classe !== opts.classe) continue
    s.lectures++
    s.dureeS += l.dureeS
    s.blocages += l.blocages
    s.erreurs += l.erreurs
    s.redemarrages += l.redemarrages
    if (l.debitKbps > 0) debits.push(l.debitKbps)
  }
  if (debits.length) s.debitKbps = Math.round(mediane(debits))
  return s
}

/** Poids par incident et par heure de lecture : un blocage visible, une erreur, une reprise. */
export const POIDS = { blocage: 15, erreur: 25, redemarrage: 10 } as const

/**
 * Note de 0 a 100 : 100 sans incident, moins `POIDS` par incident et par heure
 * de lecture. Trois blocages par heure donnent 55, un flux impeccable 100.
 * Indefinie sous une minute cumulee.
 */
export function scoreFluidite(s: StatsVariante): number | undefined {
  if (s.dureeS < DUREE_MIN_NOTE_S) return undefined
  const heures = s.dureeS / 3600
  const penalite = (s.blocages * POIDS.blocage + s.erreurs * POIDS.erreur + s.redemarrages * POIDS.redemarrage) / heures
  return Math.round(Math.max(0, Math.min(100, 100 - penalite)))
}

// --- Choix de la variante (CA3) --------------------------------------------

export interface VarianteNotee {
  entree: EntreeCatalogue
  qualite: Qualite
  /** Flux annonce HEVC (ou 4K) : illisible sans la capacite `hevc`. */
  hevc: boolean
  score?: number
}

/** Debit (Mbit/s) a partir duquel une definition est tenable : 4K >= 20, FHD >= 8, HD >= 4, sinon SD. */
export const DEBIT_REQUIS: Record<Qualite, number> = { '4K': 20, FHD: 8, HD: 4, inconnue: 4, SD: 0 }
/** Sans mesure, on suppose une liaison moyenne (10 Mbit/s) : la FHD passe, pas la 4K. */
export const DEBIT_SUPPOSE_MBPS = 10
/** Sous cette note, une variante est dite « bloque souvent ». */
export const SEUIL_FLUIDE = 60

export interface ContexteChoix {
  /** Le navigateur decode l'HEVC (capacite annoncee, non defaillante). */
  capHevc: boolean
  /** Debit mesure courant, Mbit/s ; absent : hypothese `DEBIT_SUPPOSE_MBPS`. */
  debitMbps?: number
  /** Cle de catalogue de la variante choisie explicitement pour ce groupe. */
  choixExplicite?: string
}

export type RaisonChoix = 'explicite' | 'score' | 'debit' | 'seule'

export interface Choix {
  recommandee: VarianteNotee
  /** La variante a ouvrir : le choix explicite s'il existe, sinon la recommandee. */
  choisie: VarianteNotee
  raison: RaisonChoix
  /** Variantes ecartees, avec le motif affichable. */
  deconseillees: Array<{ variante: VarianteNotee; motif: string }>
}

export function preparerVariantes(entrees: readonly EntreeCatalogue[], scores?: ReadonlyMap<string, number>): VarianteNotee[] {
  return entrees.map((entree) => ({ entree, qualite: qualiteDe(entree.nom), hevc: annonceHevc(entree.nom), score: scores?.get(entree.cle) }))
}

function plusHauteDefinition(vs: readonly VarianteNotee[]): VarianteNotee {
  return vs.reduce((a, b) => (RANG_QUALITE[b.qualite] > RANG_QUALITE[a.qualite] ? b : a))
}

function formaterMbps(m: number): string {
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace('.', ',')} Mbit/s`
}

/**
 * La variante recommandee : la meilleure note parmi celles LISIBLES par le
 * navigateur (HEVC refuse sans la capacite) et TENABLES au debit courant ; sans
 * historique, la plus haute definition tenable. Pure.
 */
export function choisirVariante(variantes: readonly VarianteNotee[], ctx: ContexteChoix): Choix {
  if (variantes.length === 0) throw new Error('aucune variante')
  const deconseillees: Choix['deconseillees'] = []
  let lisibles = variantes.filter((v) => !v.hevc || ctx.capHevc)
  for (const v of variantes) if (!lisibles.includes(v)) deconseillees.push({ variante: v, motif: `${LIBELLE_QUALITE[v.qualite]} déconseillée : HEVC non lisible par ce navigateur` })
  // Rien de lisible : le serveur convertira peut-etre ; on choisit quand meme.
  if (lisibles.length === 0) lisibles = [...variantes]

  const debit = ctx.debitMbps ?? DEBIT_SUPPOSE_MBPS
  const libelleDebit = ctx.debitMbps === undefined ? 'débit non mesuré' : `liaison à ${formaterMbps(ctx.debitMbps)}`
  let tenables = lisibles.filter((v) => debit >= DEBIT_REQUIS[v.qualite])
  for (const v of lisibles) if (!tenables.includes(v)) deconseillees.push({ variante: v, motif: `${LIBELLE_QUALITE[v.qualite]} déconseillée : ${libelleDebit}` })
  if (tenables.length === 0) {
    const basse = lisibles.reduce((a, b) => (RANG_QUALITE[b.qualite] < RANG_QUALITE[a.qualite] ? b : a))
    tenables = [basse]
  }

  const notees = tenables.filter((v) => v.score !== undefined)
  let recommandee: VarianteNotee
  let raison: RaisonChoix
  if (notees.length > 0) {
    recommandee = notees.reduce((a, b) =>
      b.score! > a.score! || (b.score === a.score && RANG_QUALITE[b.qualite] > RANG_QUALITE[a.qualite]) ? b : a,
    )
    raison = 'score'
    for (const v of notees) if (v !== recommandee && v.score! < SEUIL_FLUIDE) deconseillees.push({ variante: v, motif: `${LIBELLE_QUALITE[v.qualite]} bloque souvent ici (note ${v.score}/100)` })
  } else {
    recommandee = plusHauteDefinition(tenables)
    raison = variantes.length === 1 ? 'seule' : 'debit'
  }
  const explicite = ctx.choixExplicite ? variantes.find((v) => v.entree.cle === ctx.choixExplicite) : undefined
  const choisie = explicite ?? recommandee
  if (explicite && explicite !== recommandee) raison = 'explicite'
  return { recommandee, choisie, raison, deconseillees }
}

/** Ligne affichee dans le lecteur : « Recommandé : HD — fluide sur cette liaison. 4K déconseillée : liaison à 10 Mbit/s ». */
export function expliquerChoix(c: Choix, ctx: ContexteChoix): string {
  const lib = LIBELLE_QUALITE[c.recommandee.qualite]
  let tete: string
  if (c.raison === 'seule') tete = 'Une seule variante de cette chaîne.'
  else if (c.recommandee.score !== undefined) tete = `Recommandé : ${lib} — ${c.recommandee.score >= SEUIL_FLUIDE ? 'fluide' : 'la moins hachée'} sur cette liaison (note ${c.recommandee.score}/100).`
  else tete = `Recommandé : ${lib} — la plus haute définition pour ${ctx.debitMbps === undefined ? 'un débit non mesuré' : formaterMbps(ctx.debitMbps)}.`
  const reste = c.deconseillees
    .filter((d) => d.variante !== c.recommandee)
    .map((d) => d.motif)
  return [tete, ...reste].join(' ')
}

// --- Collecte sur la page (CA2) --------------------------------------------

type Details = Record<string, unknown>

interface LectureEnCours {
  chaine: string
  debut: number
  debits: number[]
  segments: number
  blocages: number
  erreurs: number
  redemarrages: number
  /** Des images ont ete affichees : les `waiting` suivants sont des blocages. */
  joue: boolean
}

/** Evenements qui comptent comme une reprise de la lecture. */
const REDEMARRAGES = new Set(['hls:recuperation', 'lecture:reessai', 'occupation:reprise'])

/**
 * Agrege les evenements d'UNE lecture de direct a la fois (`lecture:debut` ->
 * `lecture:fin`). Pur : l'horloge et l'ecriture sont injectees.
 */
export function creerCollecteur(opts: {
  appareil: string
  maintenant: () => number
  ecrire: (l: LectureMesuree) => void
  /** Dernier debit estime (kbit/s), a chaque segment. */
  surDebit?: (kbps: number) => void
}) {
  let courante: LectureEnCours | undefined

  function clore(): void {
    if (!courante) return
    const l = courante
    courante = undefined
    const dureeS = Math.round((opts.maintenant() - l.debut) / 1000)
    if (dureeS < DUREE_MIN_LECTURE_S) return
    const debitKbps = Math.round(mediane(l.debits))
    opts.ecrire({
      chaine: l.chaine, appareil: opts.appareil, debut: l.debut, dureeS, segments: l.segments, debitKbps,
      classe: l.debits.length ? classeDebit(debitKbps / 1000) : undefined,
      blocages: l.blocages, erreurs: l.erreurs, redemarrages: l.redemarrages,
    })
  }

  return {
    recevoir(type: string, d: Details = {}): void {
      if (type === 'lecture:debut') {
        clore()
        const chaine = typeof d['chaine'] === 'string' ? d['chaine'] : undefined
        if (chaine) courante = { chaine, debut: opts.maintenant(), debits: [], segments: 0, blocages: 0, erreurs: 0, redemarrages: 0, joue: false }
        return
      }
      if (type === 'lecture:fin') return clore()
      if (type === 'hls:segment') {
        const kbps = typeof d['debitKbps'] === 'number' ? d['debitKbps'] : undefined
        if (kbps !== undefined && kbps > 0) opts.surDebit?.(kbps)
        if (!courante) return
        courante.segments++
        if (kbps !== undefined && kbps > 0) courante.debits.push(kbps)
        return
      }
      if (!courante) return
      if (type === 'video:playing') courante.joue = true
      else if (type === 'video:waiting') { if (courante.joue) courante.blocages++ }
      else if (type === 'hls:erreur') { if (d['fatale'] === true) courante.erreurs++ }
      else if (REDEMARRAGES.has(type)) courante.redemarrages++
    },
    enCours: () => courante?.chaine,
    clore,
  }
}

// --- Branchement, base, choix memorise -------------------------------------

const [dernierDebit, poserDernierDebit] = createSignal<{ kbps: number; a: number } | undefined>(undefined)
/** Validite du dernier debit mesure par le lecteur : au-dela, une sonde ou rien. */
const VALIDITE_DEBIT_MS = 10 * 60_000

/** Debit (Mbit/s) mesure par le lecteur sur un segment recent, s'il y en a un. */
export function debitLecteurMbps(maintenant = Date.now()): number | undefined {
  const d = dernierDebit()
  return d && maintenant - d.a < VALIDITE_DEBIT_MS ? d.kbps / 1000 : undefined
}

function identifiantAppareil(): string {
  try {
    return localStorage.getItem('mytv.appareil') ?? 'sans-stockage'
  } catch {
    return 'sans-stockage'
  }
}

let branche = false
/** A appeler une fois au demarrage : ecoute la telemetrie et remplit `lectures`. */
export function demarrerCollecte(): void {
  if (branche) return
  branche = true
  const collecteur = creerCollecteur({
    appareil: identifiantAppareil(),
    maintenant: () => Date.now(),
    ecrire: (l) => {
      void db.lectures.add(l).then(() => purger()).catch(() => {})
    },
    surDebit: (kbps) => poserDernierDebit({ kbps, a: Date.now() }),
  })
  abonnerEvenements((type, d) => collecteur.recevoir(type, d))
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => collecteur.clore())
}

/** Les lectures hors fenetre ne servent plus a rien : on les efface au fil de l'eau. */
async function purger(): Promise<void> {
  try {
    await db.lectures.where('debut').below(Date.now() - FENETRE_MS).delete()
  } catch {
    /* la purge est un confort */
  }
}

/** Numero de chaine d'une entree, tel que la telemetrie le note (`{chaine}` de l'adresse). */
export function numeroChaine(e: Pick<EntreeCatalogue, 'lecture' | 'idServeur'>): string {
  const m = /\/live\/([A-Za-z0-9_-]{1,64})\.m3u8/.exec(e.lecture ?? '')
  return m?.[1] ?? e.idServeur.slice(e.idServeur.lastIndexOf(':') + 1)
}

/** Notes des variantes depuis les lectures enregistrees, dans la classe de debit donnee. */
export async function scoresPour(
  variantes: readonly EntreeCatalogue[],
  ctx: { classe?: ClasseDebit; maintenant?: number } = {},
): Promise<Map<string, number>> {
  const maintenant = ctx.maintenant ?? Date.now()
  const scores = new Map<string, number>()
  if (variantes.length === 0) return scores
  const numeros = variantes.map(numeroChaine)
  let lectures: LectureMesuree[]
  try {
    lectures = await db.lectures.where('chaine').anyOf(numeros).and((l) => l.debut >= maintenant - FENETRE_MS).toArray()
  } catch {
    return scores
  }
  variantes.forEach((v, i) => {
    const n = numeros[i]!
    const s = scoreFluidite(agregerLectures(lectures.filter((l) => l.chaine === n), { maintenant, classe: ctx.classe }))
    if (s !== undefined) scores.set(v.cle, s)
  })
  return scores
}

const PREFIXE_CHOIX = 'mytv.variante.'

/** Variante choisie explicitement pour un groupe (cle de catalogue), memorisee sur l'appareil. */
export function choixMemorise(groupe: string): string | undefined {
  try {
    return localStorage.getItem(PREFIXE_CHOIX + groupe) ?? undefined
  } catch {
    return undefined
  }
}

export function memoriserChoix(groupe: string, cle: string | null): void {
  try {
    if (cle) localStorage.setItem(PREFIXE_CHOIX + groupe, cle)
    else localStorage.removeItem(PREFIXE_CHOIX + groupe)
  } catch {
    /* confort seulement */
  }
}

/** Toutes les variantes d'un groupe, par l'index `groupe` du catalogue (une requete). */
export async function variantesDuGroupe(groupe: string | undefined): Promise<EntreeCatalogue[]> {
  if (!groupe) return []
  try {
    return await db.catalogue.where('groupe').equals(groupe).toArray()
  } catch {
    return []
  }
}
