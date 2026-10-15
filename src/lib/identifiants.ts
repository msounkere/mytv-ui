// Identifiants de contenu de l'API v1 : `fournisseur:numero` (contrat, schema
// `ContenuID`). Module PUR : aucune dependance, il se teste sous node.

/** Exactement le motif du contrat : rien d'autre ne doit finir dans une URL. */
const MOTIF = /^[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_.-]{1,64}$/

export function estIdentifiantValide(id: string): boolean {
  return MOTIF.test(id)
}

/**
 * Segment de chemin pour un identifiant. Les `:` et `.` sont valides dans un
 * chemin et le contrat les attend tels quels ; on NE les encode pas (un `%3A`
 * depend du decodage du serveur) mais on refuse tout identifiant hors motif,
 * ce qui garantit qu'aucun separateur ni caractere de controle ne s'y glisse.
 */
export function cheminContenu(id: string): string {
  if (!estIdentifiantValide(id)) throw new Error(`identifiant de contenu invalide : ${id}`)
  return id
}

/** Un episode se reconnait a l'extension qui suit son numero (`iptva:77123.mkv`). */
export function estIdentifiantEpisode(id: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(id.slice(id.indexOf(':') + 1))
}

/**
 * Valeur du champ `serie` d'une ecriture d'historique : REQUIS pour un episode,
 * INTERDIT pour le reste (400). Renvoie `'requise'` quand c'est un episode dont
 * la serie est inconnue -- rien d'envoyable, mieux vaut ne rien envoyer que
 * recevoir un 400 a chaque synchronisation.
 */
export function serieDeCle(id: string, serie: string | undefined): string | undefined | 'requise' {
  if (!estIdentifiantEpisode(id)) return undefined
  return serie && estIdentifiantValide(serie) ? serie : 'requise'
}
