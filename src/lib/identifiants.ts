// Identifiants de contenu de l'API v1 (contrat, schema `ContenuID`) :
// `iptva:845410` (chaine, film), `iptva:s77` (serie), `iptva:77123.mkv` (episode).
// Ils sont OPAQUES : aucun code ne doit en lire le numero, seulement le motif.
// Module PUR : aucune dependance, il se teste sous node.

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

// --- Cle locale <-> identifiant serveur ---------------------------------------
// La cle locale d'un contenu est `${type}:${idServeur}` (`vod:iptva:5521`) : le
// type en prefixe evite qu'une serie et un film de meme numero se confondent
// dans les tables locales. Le SERVEUR, lui, range favoris et historique par
// identifiant seul -- c'est donc a cette frontiere (et seulement la) qu'on
// traduit.

export const TYPES_CONTENU = ['live', 'vod', 'series'] as const
export type TypeCle = (typeof TYPES_CONTENU)[number]

export function cleDe(type: TypeCle, idServeur: string): string {
  return `${type}:${idServeur}`
}

/** `vod:iptva:5521` -> `iptva:5521` ; une chaine sans prefixe de type est rendue telle quelle. */
export function idServeurDeCle(cle: string): string {
  const i = cle.indexOf(':')
  return i > 0 && (TYPES_CONTENU as readonly string[]).includes(cle.slice(0, i)) ? cle.slice(i + 1) : cle
}

/**
 * Cles locales candidates pour un identifiant recu du serveur. Un episode est
 * toujours `series` ; sinon le type est inconnu (le serveur ne le dit pas) et
 * c'est le catalogue local qui tranche -- voir `synchro.ts`.
 */
export function clesCandidates(idServeur: string): string[] {
  return estIdentifiantEpisode(idServeur)
    ? [cleDe('series', idServeur)]
    : TYPES_CONTENU.map((t) => cleDe(t, idServeur))
}

// --- Liste « À voir » (US-42 CA1 / US-43 CA1) ---------------------------------
// Le serveur range cette liste par identifiant TYPE : `vod:iptva:5521` pour un
// film, `serie:iptva:s77` pour une serie (lot9.md). C'est presque la cle locale,
// a un `s` pres : on traduit a la frontiere, comme pour les favoris.

const MOTIF_A_VOIR = /^(vod|serie):[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_.-]{1,64}$/

/** `vod:iptva:5521` -> `vod:iptva:5521` ; `series:iptva:s77` -> `serie:iptva:s77`. */
export function idAVoirDeCle(cle: string): string {
  const i = cle.indexOf(':')
  const type = cle.slice(0, i)
  const id = cle.slice(i + 1)
  if (type === 'vod' && estIdentifiantValide(id) && !estIdentifiantEpisode(id)) return `vod:${id}`
  if (type === 'series' && estIdentifiantValide(id) && !estIdentifiantEpisode(id)) return `serie:${id}`
  throw new Error(`cle sans place dans « À voir » : ${cle}`)
}

/** Inverse : identifiant du serveur -> cle locale ; `undefined` si la forme est inconnue. */
export function cleDeIdAVoir(id: string): string | undefined {
  if (!MOTIF_A_VOIR.test(id)) return undefined
  const i = id.indexOf(':')
  return `${id.slice(0, i) === 'vod' ? 'vod' : 'series'}:${id.slice(i + 1)}`
}

/** Segment de chemin de `/profil/a_voir/{id}` : la forme est verifiee, rien n'est encode. */
export function cheminAVoir(id: string): string {
  if (!MOTIF_A_VOIR.test(id)) throw new Error(`identifiant « À voir » invalide : ${id}`)
  return id
}
