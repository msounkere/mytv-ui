// Le lecteur precedent a ete abandonne parce qu'il affichait « the error did not
// identify a specific codec, container, or network cause ». Toute erreur de cette
// interface nomme donc sa couche et porte une action proposee.

export type Couche = 'reseau' | 'auth' | 'limite' | 'codec' | 'relais' | 'donnees' | 'fournisseur'

export class ErreurLecteur extends Error {
  readonly couche: Couche
  readonly action: string
  readonly detail?: string
  /**
   * Secondes a attendre avant de reessayer, quand le serveur l'a dit
   * (`Retry-After` d'un 503). Absente : la politique de reprise choisit.
   */
  readonly attenteSecondes?: number
  /** Code stable du serveur (`X-Mytv-Erreur`), quand il y en a un. */
  readonly code?: string
  /** Coupure EN COURS de lecture (apres des images) : message et reprise dedies. */
  readonly coupure?: boolean

  constructor(
    couche: Couche, message: string, action: string, detail?: string, attenteSecondes?: number,
    extra: { code?: string; coupure?: boolean } = {},
  ) {
    super(message)
    this.name = 'ErreurLecteur'
    this.couche = couche
    this.action = action
    this.detail = detail
    this.attenteSecondes = attenteSecondes
    this.code = extra.code
    this.coupure = extra.coupure
  }
}

// --- Occupation du compte du fournisseur (une seule connexion autorisee) ---

export const CODE_AILLEURS = 'compte_utilise_ailleurs'
export const CODE_PAR_MYTV = 'compte_utilise_par_mytv'
export const CODE_OCCUPE = 'compte_occupe'
export const CODES_OCCUPATION: readonly string[] = [CODE_AILLEURS, CODE_PAR_MYTV, CODE_OCCUPE]

/** Le fournisseur n'a pas de place pour nous : une ATTENTE, avec reprise automatique. */
export function estOccupation(e: { code?: string } | null | undefined): boolean {
  return !!e?.code && CODES_OCCUPATION.includes(e.code)
}

const MESSAGES_OCCUPATION: Record<string, { message: string; coupure: string }> = {
  [CODE_AILLEURS]: {
    message: 'Le compte IPTV est utilisé sur un autre appareil. Fermez-le pour regarder ici.',
    coupure: 'Lecture interrompue : le compte est utilisé ailleurs.',
  },
  [CODE_PAR_MYTV]: {
    message: 'Une autre fenêtre de MyTV utilise la connexion.',
    coupure: 'Lecture interrompue : une autre fenêtre de MyTV utilise la connexion.',
  },
  [CODE_OCCUPE]: {
    message: 'Connexion du fournisseur occupée, nouvelle tentative automatique…',
    coupure: 'Lecture interrompue : la connexion du fournisseur est occupée.',
  },
}

/** Statuts qu'un fournisseur a connexion unique renvoie quand la place est prise (407 relaye en 503). */
const STATUTS_PLACE_PRISE = [403, 407, 429, 503]

/**
 * Une erreur de place occupee. `coupure` : la lecture avait DEJA donne des
 * images ; sans code du serveur (un 403/407 de segment que hls.js ne decrit
 * pas), la cause la plus probable est le compte repris ailleurs.
 */
export function erreurOccupation(
  code: string, detail?: string, attenteSecondes?: number, coupure = false,
): ErreurLecteur {
  const m = MESSAGES_OCCUPATION[code] ?? MESSAGES_OCCUPATION[CODE_OCCUPE]!
  return new ErreurLecteur(
    'limite',
    coupure ? m.coupure : m.message,
    code === CODE_AILLEURS
      ? 'Reprise automatique dès que la place se libère.'
      : 'Nouvelle tentative automatique ; la lecture reprend seule.',
    detail,
    attenteSecondes,
    { code, coupure },
  )
}

/**
 * Apres des images, une erreur de place prise devient une COUPURE : message
 * dedie (« Lecture interrompue... ») et meme reprise automatique. Les autres
 * erreurs (codec, session expiree...) restent telles quelles.
 */
export function enCoupure(e: ErreurLecteur, statut?: number): ErreurLecteur {
  if (estOccupation(e)) return e.coupure ? e : erreurOccupation(e.code!, e.detail, e.attenteSecondes, true)
  // Le detail porte « HTTP 403 [code] — contexte » : un code connu qui n'est pas
  // une occupation (`segment_expire`...) n'est pas une prise de place.
  const m = /^HTTP (\d{3})(?: ([a-z_]+))?(?: —|$)/.exec(e.detail ?? '')
  const st = statut ?? Number(m?.[1])
  if (!m?.[2] && st !== 429 && STATUTS_PLACE_PRISE.includes(st) && e.couche !== 'codec' && e.couche !== 'fournisseur')
    return erreurOccupation(CODE_AILLEURS, e.detail, e.attenteSecondes, true)
  return e
}

/** Libelle court affiche en tete d'un panneau d'erreur. */
export const LIBELLE_COUCHE: Record<Couche, string> = {
  reseau: 'Reseau',
  auth: 'Authentification',
  limite: 'Limite de connexions',
  codec: 'Format non lisible',
  relais: 'Relais',
  donnees: 'Donnees',
  fournisseur: 'Fournisseur',
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

/** Codes d'un fournisseur qui REFUSE (et non en panne) : ils ne se soignent pas en reessayant. */
export const CODE_COMPTE_INVALIDE = 'fournisseur_compte_invalide'
export const CODE_ADRESSE_REFUSEE = 'fournisseur_adresse_refusee'

/** « 18 octobre 2026 » : la date d'expiration, dans la langue et le fuseau du navigateur. */
export function dateLongue(iso: string): string | undefined {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return undefined
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Le fournisseur a refuse le COMPTE (abonnement expire, identifiants refuses) ou
 * l'ADRESSE du serveur. `undefined` pour tout autre code : l'appelant traduit alors
 * le statut comme avant. La date n'est ajoutee que si le serveur l'a donnee.
 */
export function erreurFournisseur(
  code: string | null | undefined,
  expiration?: string | null,
  detail?: string,
  maintenantMs = Date.now(),
): ErreurLecteur | undefined {
  if (code === CODE_COMPTE_INVALIDE) {
    const jour = expiration ? dateLongue(expiration) : undefined
    const precision = jour ? (Date.parse(expiration!) > maintenantMs ? ` (échéance le ${jour})` : ` (expiré le ${jour})`) : ''
    return new ErreurLecteur(
      'fournisseur',
      `Abonnement expiré ou refusé par le fournisseur${precision}.`,
      'Renouveler l’abonnement auprès du fournisseur, ou prévenir l’administrateur du serveur.',
      detail,
    )
  }
  if (code === CODE_ADRESSE_REFUSEE)
    return new ErreurLecteur(
      'fournisseur',
      'Adresse du serveur refusée par le fournisseur.',
      'Le fournisseur n’accepte pas l’adresse de ce serveur : prévenir l’administrateur.',
      detail,
    )
  return undefined
}

export interface InfosStatut {
  /** Valeur brute de `Retry-After`. */
  retryAfter?: string | null
  /** `code` du corps d'erreur du serveur (`format_non_lisible`...) ou de l'en-tete `X-Mytv-Erreur`. */
  code?: string
  /** Date d'expiration de l'abonnement (corps ou en-tete `X-Mytv-Expiration`), si connue. */
  expiration?: string | null
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
  // Un 502 dont le code dit « compte » ou « adresse » n'est pas une panne du serveur.
  if (statut === 502) {
    const f = erreurFournisseur(infos.code, infos.expiration, detail, infos.maintenantMs)
    if (f) return f
  }
  // Place du fournisseur prise : message propre a chaque cause (le code prime sur le statut).
  if (infos.code && CODES_OCCUPATION.includes(infos.code) && STATUTS_PLACE_PRISE.includes(statut))
    return erreurOccupation(infos.code, detail, lireRetryAfter(infos.retryAfter, infos.maintenantMs))
  switch (true) {
    case statut === 401:
      return new ErreurLecteur('auth', 'La session a expiré.', 'Se reconnecter, puis relancer la lecture.', detail)
    case statut === 403:
      return new ErreurLecteur('relais', 'Le serveur a refusé l’accès à ce flux.', 'Réessayer ; si cela persiste, se reconnecter.', detail)
    case statut === 404:
      return new ErreurLecteur(
        'donnees', 'Ce contenu n’existe plus au catalogue.', 'Actualiser le catalogue, ou choisir un autre contenu.', detail,
      )
    case statut === 415 && infos.code === 'format_hevc_non_lisible':
      // Une chaine (ou un film) en HEVC que le serveur refuse de convertir (4K).
      return new ErreurLecteur(
        'codec',
        'Chaîne en 4K/HEVC : non lisible, essayez une autre chaîne.',
        'Choisir une autre chaîne (ou la diffuser vers un téléviseur).',
        detail,
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

// Codes de MediaError (recopies : ce module est aussi execute hors navigateur par les tests).
const MEDIA_ABORTED = 1
const MEDIA_NETWORK = 2
const MEDIA_DECODE = 3
const MEDIA_SRC_NOT_SUPPORTED = 4

/**
 * Classe l'erreur d'un <video>. POURQUOI le texte compte : quand la REQUETE du film echoue
 * (502, coupure, annulation), Firefox rend « source non prise en charge » avec le message
 * « Request failed » — ce n'est pas un probleme de format, et l'accuser envoyait
 * l'utilisateur vers « diffuser vers un televiseur » alors qu'il suffisait de reessayer
 * (constate en recette reelle sur une reprise de serie).
 */
export function erreurDeMedia(code: number | undefined, message?: string): ErreurLecteur {
  switch (code) {
    case MEDIA_NETWORK:
      return new ErreurLecteur('reseau', 'Le telechargement du flux a echoue.', 'Reessayer.', message)
    case MEDIA_DECODE:
      return new ErreurLecteur(
        'codec',
        'Le navigateur ne decode pas ce format — typiquement une piste audio EAC3.',
        'Diffuser vers un televiseur, qui decodera la piste.',
        message,
      )
    case MEDIA_SRC_NOT_SUPPORTED:
      if (message && /request failed|network|reseau|load failed|http/i.test(message))
        return new ErreurLecteur(
          'reseau',
          'Le telechargement du film a echoue.',
          'Reessayer ; la lecture reprendra a la meme position.',
          message,
        )
      return new ErreurLecteur(
        'codec',
        'Conteneur ou codec non pris en charge par ce navigateur.',
        'Diffuser vers un televiseur, ou choisir une autre version du contenu.',
        message,
      )
    case MEDIA_ABORTED:
      return new ErreurLecteur('reseau', 'Lecture interrompue.', 'Relancer la lecture.', message)
    default:
      return new ErreurLecteur('relais', 'Lecture impossible.', 'Reessayer.', message)
  }
}
