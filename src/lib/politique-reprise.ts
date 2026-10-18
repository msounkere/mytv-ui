import type { Couche } from './errors'

// La politique de reprise, sans reactivite ni minuteur : « apres cette erreur,
// que fait-on ? ». Elle est a part pour etre testee seule, et parce que le
// dossier interdit deux choses opposees — l'ecran noir silencieux ET la
// boucle infinie qui martele un fournisseur a connexion unique.

/** Essais pour une vraie panne (reseau, relais) : trois, puis on nomme la cause. */
export const ESSAIS_MAX = 3
/**
 * Essais quand la place du fournisseur est occupee. Plus patients : ce n'est pas
 * une panne, la place se libere d'elle-meme (le bail de l'autre lecture expire),
 * mais bornes quand meme — au-dela, l'utilisateur doit savoir et decider.
 */
export const ESSAIS_MAX_OCCUPE = 6
/** Attente par defaut avant un nouvel essai, sans indication du serveur. */
export const ATTENTE_DEFAUT = 3
/** Bornes de l'attente annoncee par le serveur : ni boucle serree, ni minutes. */
export const ATTENTE_MIN = 1
export const ATTENTE_MAX = 20

/** Pannes qu'une nouvelle tentative peut lever : inutile de reessayer un EAC3. */
const RECUPERABLE: readonly Couche[] = ['reseau', 'relais', 'limite']

export type MotifReprise = 'occupe' | 'panne'

export type Decision =
  | { action: 'reessayer'; essai: number; total: number; delai: number; motif: MotifReprise }
  | { action: 'abandonner' }

export function borner(secondes: number | undefined): number {
  if (secondes === undefined || !Number.isFinite(secondes)) return ATTENTE_DEFAUT
  return Math.min(ATTENTE_MAX, Math.max(ATTENTE_MIN, Math.round(secondes)))
}

/**
 * @param essaisFaits nombre de reessais deja consommes pour ce contenu
 */
export function decider(erreur: { couche: Couche; attenteSecondes?: number }, essaisFaits: number): Decision {
  if (!RECUPERABLE.includes(erreur.couche)) return { action: 'abandonner' }
  const occupe = erreur.couche === 'limite'
  const total = occupe ? ESSAIS_MAX_OCCUPE : ESSAIS_MAX
  if (essaisFaits >= total) return { action: 'abandonner' }
  return {
    action: 'reessayer',
    essai: essaisFaits + 1,
    total,
    delai: borner(erreur.attenteSecondes),
    motif: occupe ? 'occupe' : 'panne',
  }
}

/** Marge de securite a la reprise : quelques secondes avant la coupure, jamais un trou. */
export const MARGE_REPRISE = 2

/**
 * Ou reprendre un film apres une coupure : a la position ATTEINTE, pas au dernier saut demande.
 * POURQUOI : le « point atteint » ne changeait qu'au deplacement manuel ; quand le navigateur
 * fermait la connexion apres 6 minutes de lecture, la reprise automatique repartait du depart
 * demande (878 s) et rejouait ces 6 minutes (constate en recette reelle : reprise a 878 s alors
 * que la lecture etait vers 1 242 s).
 */
export function pointDeReprise(positionAtteinte: number, dernierPointDemande: number): number {
  if (!Number.isFinite(positionAtteinte) || positionAtteinte <= 0) return dernierPointDemande
  return Math.max(0, positionAtteinte - MARGE_REPRISE)
}

/** Marge sous laquelle un `ended` est une vraie fin : les derniers instants d'un film n'ont pas la seconde pres. */
export const MARGE_FIN = 3

/**
 * Un `ended` recu AVANT la fin annoncee n'est pas une fin : c'est une coupure.
 * POURQUOI : le serveur, quand son remux casse, tronque la reponse. Le navigateur
 * prend alors la fin du corps pour la fin du film et declenche `ended` — a 42 min
 * d'un film de 1 h 37, l'ecran passait a « termine » sans erreur ni reprise.
 * Sans duree connue, on ne sait rien dire : ce n'est pas une coupure.
 */
export function finPrematuree(position: number, duree: number): boolean {
  if (!Number.isFinite(duree) || duree <= 0) return false
  if (!Number.isFinite(position)) return false
  return position < duree - MARGE_FIN
}

/**
 * Ou ouvrir un film, et faut-il proposer « Reprendre / Recommencer » ?
 *
 * POURQUOI : la proposition n'a de sens qu'a la PREMIERE ouverture d'un contenu,
 * quand rien n'a encore ete atteint. Elle etait rejouee a chaque reouverture
 * automatique (coupure, transcodage impose) — la position memorisee toutes les
 * 5 s la nourrissait — et « Reprendre » relancait alors un ffmpeg et une
 * connexion de plus chez un fournisseur qui n'en accorde qu'une. Et plutot que
 * d'ouvrir a 0 puis rouvrir au point sauvegarde, on ouvre directement la : le
 * dialogue ne sert plus qu'a revenir au debut.
 */
export function departDeLecture(opts: {
  premierPassage: boolean
  pointAtteint: number
  sauvegardee: number | undefined
  seuil: number
}): { depart: number; proposer: number | null } {
  const { premierPassage, pointAtteint, sauvegardee, seuil } = opts
  if (!premierPassage || pointAtteint > 0) return { depart: pointAtteint, proposer: null }
  if (sauvegardee === undefined || !Number.isFinite(sauvegardee) || sauvegardee <= seuil) return { depart: 0, proposer: null }
  return { depart: sauvegardee, proposer: sauvegardee }
}
