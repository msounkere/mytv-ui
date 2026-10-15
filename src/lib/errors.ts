// Le lecteur precedent a ete abandonne parce qu'il affichait « the error did not
// identify a specific codec, container, or network cause ». Toute erreur de cette
// interface nomme donc sa couche et porte une action proposee.

export type Couche = 'reseau' | 'auth' | 'limite' | 'codec' | 'relais' | 'donnees'

export class ErreurLecteur extends Error {
  readonly couche: Couche
  readonly action: string
  readonly detail?: string

  constructor(couche: Couche, message: string, action: string, detail?: string) {
    super(message)
    this.name = 'ErreurLecteur'
    this.couche = couche
    this.action = action
    this.detail = detail
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
 * Traduit un echec HTTP en erreur nommee. Aucun code n'est « inconnu » : le
 * statut brut est conserve dans `detail` pour que rien ne se perde.
 */
export function depuisReponse(r: Response, contexte: string): ErreurLecteur {
  const detail = `HTTP ${r.status} ${r.statusText} — ${contexte}`
  // Ce 401 vient desormais du SERVICE, qui garde les identifiants du relais :
  // il ne dit plus « mauvais mot de passe du fournisseur » mais « plus de
  // session ». Renvoyer l utilisateur vers une saisie qui n existe plus
  // l enverrait chercher une case a remplir introuvable.
  if (r.status === 401 || r.status === 403)
    return new ErreurLecteur(
      'auth',
      'La session de l application a expire.',
      'Se reconnecter, puis reessayer.',
      detail,
    )
  if (r.status === 429)
    return new ErreurLecteur(
      'limite',
      'Le relais signale trop de requetes simultanees.',
      'Patienter quelques secondes, puis reessayer.',
      detail,
    )
  if (r.status >= 500)
    return new ErreurLecteur(
      'relais',
      'Le relais a repondu par une erreur interne.',
      'Reessayer ; si cela persiste, verifier que TuliProx tourne.',
      detail,
    )
  return new ErreurLecteur(
    'relais',
    `Reponse inattendue du relais (${r.status}).`,
    'Reessayer, ou verifier l adresse du relais dans les Reglages.',
    detail,
  )
}
