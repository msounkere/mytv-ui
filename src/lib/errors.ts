// Le lecteur precedent a ete abandonne parce qu'il affichait « the error did not
// identify a specific codec, container, or network cause ». Toute erreur de cette
// interface nomme donc sa couche et porte une action proposee.

export type Couche = 'reseau' | 'auth' | 'limite' | 'codec' | 'relais' | 'donnees'

export class ErreurLecteur extends Error {
  readonly couche: Couche
  readonly action: string
  readonly detail?: string
  /**
   * Secondes a attendre avant de reessayer, quand le serveur l'a dit
   * (`Retry-After` d'un 503). Absente : la politique de reprise choisit.
   */
  readonly attenteSecondes?: number

  constructor(couche: Couche, message: string, action: string, detail?: string, attenteSecondes?: number) {
    super(message)
    this.name = 'ErreurLecteur'
    this.couche = couche
    this.action = action
    this.detail = detail
    this.attenteSecondes = attenteSecondes
  }
}

/** Libelle court affiche en tete d'un panneau d'erreur. */
export const LIBELLE_COUCHE: Record<Couche, string> = {
  reseau: 'Reseau',
  auth: 'Authentification',
  limite: 'Limite de connexions',
  codec: 'Format non lisible',
  relais: 'Relais',
  donnees: 'Donnees',
}

/**
 * `Retry-After` : un nombre de secondes, ou une date HTTP. Le serveur de mytv
 * n'emet que des secondes, mais un intermediaire peut reecrire l'en-tete. Une
 * valeur absente, negative ou illisible donne `undefined` : la politique de
 * reprise prend alors son delai par defaut, plutot qu'une attente de 0 s qui
 * transformerait la patience en boucle serree.
 */
export function lireRetryAfter(valeur: string | null | undefined, maintenantMs = Date.now()): number | undefined {
  if (!valeur) return undefined
  const v = valeur.trim()
  if (/^\d+$/.test(v)) return Number(v)
  const date = Date.parse(v)
  if (Number.isNaN(date)) return undefined
  const s = Math.ceil((date - maintenantMs) / 1000)
  return s > 0 ? s : undefined
}

export interface InfosStatut {
  /** Valeur brute de `Retry-After`. */
  retryAfter?: string | null
  /** `code` du corps d'erreur du serveur (`format_non_lisible`...). */
  code?: string
  /** Ce qu'on tentait, pour le diagnostic. */
  contexte?: string
  /** `maintenant` injectable pour les tests. */
  maintenantMs?: number
}

/**
 * Traduit un statut HTTP du serveur mytv en erreur nommee. Aucun code n'est
 * « inconnu » : le statut brut est conserve dans `detail` pour que rien ne se
 * perde. Fonction pure : les effets (retour a la connexion) sont laisses a
 * l'appelant.
 */
export function erreurDeStatut(statut: number, infos: InfosStatut = {}): ErreurLecteur {
  const detail = `HTTP ${statut}${infos.code ? ` ${infos.code}` : ''}${infos.contexte ? ` — ${infos.contexte}` : ''}`
  switch (true) {
    case statut === 401:
      return new ErreurLecteur('auth', 'La session a expiré.', 'Se reconnecter, puis relancer la lecture.', detail)
    case statut === 403:
      return new ErreurLecteur('relais', 'Le serveur a refusé l’accès à ce flux.', 'Réessayer ; si cela persiste, se reconnecter.', detail)
    case statut === 404:
      return new ErreurLecteur(
        'donnees', 'Ce contenu n’existe plus au catalogue.', 'Actualiser le catalogue, ou choisir un autre contenu.', detail,
      )
    case statut === 415:
      // Seule la VOD peut repondre 415 : un film dont la video (HEVC en pratique)
      // n'est lisible dans aucun navigateur, et que le serveur ne reencode pas.
      return new ErreurLecteur(
        'codec',
        'Ce film est dans un format (HEVC) que ce navigateur ne sait pas lire.',
        'Le diffuser vers un téléviseur, qui le décodera, ou choisir une autre version.',
        detail,
      )
    case statut === 416:
      return new ErreurLecteur('relais', 'Position demandée hors du fichier.', 'Revenir au début, puis réessayer.', detail)
    case statut === 429:
      return new ErreurLecteur(
        'limite', 'Trop de requêtes simultanées.', 'Patienter quelques secondes.', detail,
        lireRetryAfter(infos.retryAfter, infos.maintenantMs),
      )
    case statut === 501:
      return new ErreurLecteur('relais', 'Cette fonction n’est pas activée sur le serveur.', 'Voir l’administrateur du serveur.', detail)
    case statut === 503:
      // La place du fournisseur est prise (une seule connexion simultanee) :
      // ce n'est pas une panne, c'est une attente.
      return new ErreurLecteur(
        'limite',
        'Place occupée chez le fournisseur.',
        'Nouvelle tentative automatique ; fermer l’autre lecture si elle dure.',
        detail,
        lireRetryAfter(infos.retryAfter, infos.maintenantMs),
      )
    case statut >= 500:
      return new ErreurLecteur('relais', 'Le serveur a répondu par une erreur.', 'Réessayer ; si cela persiste, prévenir l’administrateur.', detail)
    default:
      return new ErreurLecteur('relais', `Réponse inattendue du serveur (${statut}).`, 'Réessayer.', detail)
  }
}

/**
 * Traduit une reponse `fetch` en erreur nommee (voir `erreurDeStatut`). Signature
 * conservee pour les appelants de la couche de donnees.
 */
export function depuisReponse(r: Response, contexte: string): ErreurLecteur {
  return erreurDeStatut(r.status, { retryAfter: r.headers.get('Retry-After'), contexte })
}
