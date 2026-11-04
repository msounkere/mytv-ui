import { ErreurLecteur, erreurDeStatut } from './errors'
import { cheminContenu } from './identifiants'
import { signalerSiNonAuthentifie } from './session-expiree'
import { ACTION_GUIDE_INDISPONIBLE, CONTEXTE_GUIDE, MESSAGE_GUIDE_INDISPONIBLE } from './messages-guide'

// Le guide des programmes vient du serveur, par fenetre de temps :
//   GET /api/v1/epg/grille?chaines=a,b,c&de=<RFC3339>&a=<RFC3339>
//       tous les programmes qui chevauchent [de, a[ pour plusieurs chaines
//   GET /api/v1/epg/chaines/{id}/maintenant
//       programme en cours et suivant d'UNE chaine
//
// Le XMLTV complet (61 Mo, parse dans un worker, indexe en base locale) a
// disparu : le serveur le fait une fois pour tout le monde. La contrepartie est
// qu'un appel par ligne visible serait deux cents requetes au defilement — d'ou
// ce client, qui demande les chaines VISIBLES en un seul appel, par blocs de temps
// alignes, et ne redemande jamais un bloc qu'il a deja.

export interface Programme {
  /** Identifiant de la chaine (`fournisseur:numero`), celui de l'API. */
  chaine: string
  titre: string
  description?: string
  /** Millisecondes Unix. Le serveur parle UTC ; l'affichage est en heure locale. */
  debut: number
  fin: number
}

interface ProgrammeBrut {
  debut?: string
  fin?: string
  titre?: string
  description?: string
}

/** Programme du contrat → programme de l'interface. Rejette les dates illisibles. */
export function versProgramme(chaine: string, b: ProgrammeBrut | null | undefined): Programme | null {
  if (!b) return null
  const debut = Date.parse(b.debut ?? '')
  const fin = Date.parse(b.fin ?? '')
  if (Number.isNaN(debut) || Number.isNaN(fin) || fin <= debut) return null
  return {
    chaine,
    titre: b.titre?.trim() || 'Programme sans titre',
    description: b.description?.trim() || undefined,
    debut,
    fin,
  }
}

/** Programme en cours dans une grille triee. */
export function programmeEnCours(grille: Programme[], maintenant: number): Programme | undefined {
  return grille.find((p) => p.debut <= maintenant && maintenant < p.fin)
}

/** Premier programme qui commence apres la fin du courant. */
export function programmeSuivant(grille: Programme[], courant: Programme | undefined): Programme | undefined {
  return courant ? grille.find((p) => p.debut >= courant.fin) : undefined
}

// --- Fuseau et alignement ---------------------------------------------------

const MINUTE = 60_000
const HEURE = 60 * MINUTE

/**
 * Debut de la demi-heure LOCALE contenant `t`. POURQUOI pas un simple
 * `floor(t / 30 min)` : sur un fuseau decale de 45 min (Nepal) ou de 30 min
 * (Inde), les epoques UTC tombent a XX:15 ou XX:30 locales, et la regle horaire
 * de la grille afficherait des graduations a 14:15, 14:45.
 */
export function debutDemiHeureLocale(t: number, decalageMinutes = new Date(t).getTimezoneOffset()): number {
  const pas = 30 * MINUTE
  const local = t - decalageMinutes * MINUTE
  return Math.floor(local / pas) * pas + decalageMinutes * MINUTE
}

// --- Limites annoncees par le serveur ---------------------------------------

export interface LimitesEpg {
  /** Nombre maximal de chaines d'un appel `/epg/grille`. */
  chaines: number
  /** Plage maximale d'un appel, en millisecondes. */
  fenetreMs: number
}

/**
 * Valeurs de repli, volontairement inferieures aux defauts du serveur (200
 * chaines, 48 h) : si `/compte` est injoignable, un appel trop gros serait un
 * 400, alors qu'un appel trop petit ne coute qu'une requete de plus.
 */
export const LIMITES_PAR_DEFAUT: LimitesEpg = { chaines: 100, fenetreMs: 6 * HEURE }

export function limitesDepuisCompte(corps: unknown): LimitesEpg {
  const l = (corps as { limites?: { pagination_max?: unknown; grille_fenetre?: unknown } } | null)?.limites
  const chaines = Number(l?.pagination_max)
  const fenetreS = Number(l?.grille_fenetre)
  return {
    chaines: Number.isInteger(chaines) && chaines >= 1 ? chaines : LIMITES_PAR_DEFAUT.chaines,
    fenetreMs: Number.isFinite(fenetreS) && fenetreS >= 60 ? fenetreS * 1000 : LIMITES_PAR_DEFAUT.fenetreMs,
  }
}

// --- Decoupage en blocs -----------------------------------------------------

/** Taille d'un bloc de cache : une soiree entiere tient dans deux blocs. */
export const BLOC_MS = 3 * HEURE
/** Un appel ne depasse jamais l'URL de 4096 caracteres de `chaines`. */
const LONGUEUR_MAX_CHAINES = 3800

export function tailleBloc(limites: LimitesEpg): number {
  return Math.max(MINUTE, Math.min(BLOC_MS, limites.fenetreMs))
}

/** Debuts des blocs alignes (UTC) qui couvrent [debut, fin[. */
export function blocsCouvrant(debut: number, fin: number, taille: number): number[] {
  if (!(fin > debut)) return []
  const out: number[] = []
  for (let b = Math.floor(debut / taille) * taille; b < fin && out.length < 64; b += taille) out.push(b)
  return out
}

/** Paquets de `taille` elements au plus. */
export function paquets<T>(liste: readonly T[], taille: number): T[][] {
  const n = Math.max(1, taille)
  const out: T[][] = []
  for (let i = 0; i < liste.length; i += n) out.push(liste.slice(i, i + n))
  return out
}

/** Un programme a cheval sur deux blocs revient dans les deux : on ne le garde qu'une fois. */
export function fusionner(listes: Programme[][]): Programme[] {
  const vus = new Set<string>()
  const out: Programme[] = []
  for (const l of listes)
    for (const p of l) {
      const k = `${p.debut}|${p.fin}|${p.titre}`
      if (!vus.has(k)) {
        vus.add(k)
        out.push(p)
      }
    }
  return out.sort((a, b) => a.debut - b.debut || a.fin - b.fin)
}

// --- Client -----------------------------------------------------------------

/** Un bloc deja passe ne change plus ; le bloc du moment, si (mise a jour du guide). */
const VALIDITE_BLOC_PASSE = 60 * MINUTE
const VALIDITE_BLOC_COURANT = 10 * MINUTE
const VALIDITE_MAINTENANT_MAX = 5 * MINUTE
const VALIDITE_MAINTENANT_VIDE = 2 * MINUTE
/** Plafond de blocs gardes : un guide parcouru pendant des heures reste borne. */
const BLOCS_MAX = 4000

interface BlocGarde {
  programmes: Programme[]
  charge: number
  fin: number
}

export interface EnCours {
  courant: Programme | undefined
  suivant: Programme | undefined
}

export interface OptionsClientEpg {
  fetch?: typeof fetch
  maintenant?: () => number
}

export function creerClientEpg(opts: OptionsClientEpg = {}) {
  const appel = (...a: Parameters<typeof fetch>) => (opts.fetch ?? fetch)(...a)
  const horloge = opts.maintenant ?? Date.now

  const blocs = new Map<string, BlocGarde>()
  const enVol = new Map<string, Promise<void>>()
  const courants = new Map<string, { valeur: EnCours; expire: number }>()
  const courantsEnVol = new Map<string, Promise<EnCours>>()
  let limites: Promise<LimitesEpg> | undefined

  async function json(url: string, signal?: AbortSignal): Promise<unknown> {
    let r: Response
    try {
      r = await appel(url, { credentials: 'same-origin', signal })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      throw new ErreurLecteur('reseau', MESSAGE_GUIDE_INDISPONIBLE, ACTION_GUIDE_INDISPONIBLE, String(e))
    }
    if (!r.ok) {
      signalerSiNonAuthentifie(r.status)
      let code: string | undefined
      try {
        code = ((await r.json()) as { code?: string }).code
      } catch {
        // Corps absent ou illisible : le statut suffit.
      }
      throw erreurDeStatut(r.status, {
        retryAfter: r.headers.get('Retry-After'), code, expiration: r.headers.get('X-Mytv-Expiration'), contexte: CONTEXTE_GUIDE,
      })
    }
    return r.json()
  }

  /** `/compte` une fois : les bornes du serveur ne changent pas en cours de session. */
  function lireLimites(): Promise<LimitesEpg> {
    limites ??= json('/api/v1/compte')
      .then(limitesDepuisCompte)
      .catch(() => {
        limites = undefined // un echec n'est pas un verdict : on reessaiera
        return LIMITES_PAR_DEFAUT
      })
    return limites
  }

  function elaguer() {
    // Map conserve l'ordre d'insertion : on retire les plus anciens.
    for (const k of blocs.keys()) {
      if (blocs.size <= BLOCS_MAX) break
      blocs.delete(k)
    }
  }

  const cleBloc = (id: string, debut: number) => `${id}|${debut}`

  function frais(id: string, debut: number, taille: number): boolean {
    const b = blocs.get(cleBloc(id, debut))
    if (!b) return false
    const maintenant = horloge()
    const validite = debut + taille <= maintenant ? VALIDITE_BLOC_PASSE : VALIDITE_BLOC_COURANT
    return maintenant - b.charge < validite
  }

  /** UN appel serveur : des chaines, UN bloc. */
  async function chargerBloc(ids: string[], debut: number, taille: number, signal?: AbortSignal): Promise<void> {
    const fin = debut + taille
    const url =
      '/api/v1/epg/grille?' +
      new URLSearchParams({
        chaines: ids.join(','),
        de: new Date(debut).toISOString(),
        a: new Date(fin).toISOString(),
      }).toString()
    const corps = (await json(url, signal)) as { chaines?: Record<string, ProgrammeBrut[]> }
    const charge = horloge()
    for (const id of ids) {
      const liste = (corps.chaines?.[id] ?? [])
        .map((b) => versProgramme(id, b))
        .filter((p): p is Programme => p !== null)
      // Une chaine sans programme est gardee VIDE : sans cela, chaque
      // defilement la redemanderait.
      blocs.set(cleBloc(id, debut), { programmes: liste, charge, fin })
    }
    elaguer()
  }

  /**
   * Programmes de plusieurs chaines sur [debut, fin[, tries par debut.
   * Ne demande au serveur que les (chaine, bloc) absents ou perimes.
   */
  async function grille(
    ids: readonly string[],
    debut: number,
    fin: number,
    signal?: AbortSignal,
  ): Promise<Map<string, Programme[]>> {
    const uniques = [...new Set(ids)]
    const lim = await lireLimites()
    const taille = tailleBloc(lim)
    const debuts = blocsCouvrant(debut, fin, taille)
    const maxId = uniques.reduce((m, id) => Math.max(m, id.length), 1)
    const parAppel = Math.max(1, Math.min(lim.chaines, Math.floor(LONGUEUR_MAX_CHAINES / (maxId + 1))))

    const taches: Promise<void>[] = []
    for (const d of debuts) {
      const manquantes = uniques.filter((id) => !frais(id, d, taille))
      for (const lot of paquets(manquantes, parAppel)) {
        // Un meme lot demande deux fois en meme temps (defilement rapide) ne
        // part qu'une fois.
        const cle = `${d}|${lot.join(',')}`
        let p = enVol.get(cle)
        if (!p) {
          p = chargerBloc(lot, d, taille, signal).finally(() => enVol.delete(cle))
          enVol.set(cle, p)
        }
        taches.push(p)
      }
    }
    await Promise.all(taches)

    const out = new Map<string, Programme[]>()
    for (const id of uniques) {
      const morceaux = debuts.map((d) => blocs.get(cleBloc(id, d))?.programmes ?? [])
      out.set(id, fusionner(morceaux).filter((p) => p.fin > debut && p.debut < fin))
    }
    return out
  }

  /** Programme en cours et suivant d'une chaine (`/maintenant`), mis en cache. */
  async function maintenant(id: string, signal?: AbortSignal): Promise<EnCours> {
    const t = horloge()
    const gardee = courants.get(id)
    if (gardee && t < gardee.expire) return gardee.valeur
    let p = courantsEnVol.get(id)
    if (!p) {
      p = json(`/api/v1/epg/chaines/${cheminContenu(id)}/maintenant`, signal)
        .then((corps) => {
          const c = corps as { courant?: ProgrammeBrut | null; suivant?: ProgrammeBrut | null }
          const valeur: EnCours = {
            courant: versProgramme(id, c.courant) ?? undefined,
            suivant: versProgramme(id, c.suivant) ?? undefined,
          }
          // Expire quand le programme finit : l'affichage ne ment pas apres la coupure.
          const maintenantMs = horloge()
          const expire = valeur.courant
            ? Math.min(valeur.courant.fin, maintenantMs + VALIDITE_MAINTENANT_MAX)
            : maintenantMs + VALIDITE_MAINTENANT_VIDE
          courants.set(id, { valeur, expire })
          return valeur
        })
        .finally(() => courantsEnVol.delete(id))
      courantsEnVol.set(id, p)
    }
    return p
  }

  /**
   * En cours / suivant de PLUSIEURS chaines en UN appel de grille (mini-guide,
   * accueil) : huit appels `/maintenant` pour huit lignes visibles seraient
   * exactement l'appel-par-chaine que le dossier interdit.
   */
  async function enCoursPour(
    ids: readonly string[],
    signal?: AbortSignal,
    /** Combien de temps regarder devant soi pour trouver le « suivant ». */
    horizonMs = 3 * HEURE,
  ): Promise<Map<string, EnCours>> {
    const t = horloge()
    const g = await grille(ids, t, t + horizonMs, signal)
    const out = new Map<string, EnCours>()
    for (const [id, liste] of g) {
      const courant = programmeEnCours(liste, t)
      out.set(id, { courant, suivant: courant ? programmeSuivant(liste, courant) : liste.find((p) => p.debut >= t) })
    }
    return out
  }

  function vider() {
    blocs.clear()
    courants.clear()
    limites = undefined
  }

  return { grille, maintenant, enCoursPour, vider, lireLimites }
}

export const epg = creerClientEpg()

/** Grille de plusieurs chaines sur une fenetre (compatible avec l'ancien nom). */
export const grillesFenetre = epg.grille

// L'ancienne base locale du guide (XMLTV indexe) n'est plus lue par personne :
// on la supprime pour rendre ses ~200 000 lignes au navigateur.
if (typeof indexedDB !== 'undefined') {
  try {
    indexedDB.deleteDatabase('mytv-epg')
  } catch {
    // Mode prive : rien a purger.
  }
}
