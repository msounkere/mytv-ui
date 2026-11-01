// Regles PURES de la liste « À voir » (US-43) : etats de preparation rendus par
// le serveur (US-42), ordre d'affichage, element suivant, libelles. Aucune
// dependance : ce module se teste sous node, et c'est lui que les ecrans
// appellent -- l'Accueil, l'ecran « À voir », le lecteur et les fiches doivent
// dire la meme chose du meme etat.

/** Cle de journal qui dit « l'ordre de la liste a change » : un seul PUT de la liste entiere. */
export const CLE_ORDRE = '*ordre*'

/** Etats du moteur de preparation (contrat US-42 CA2). */
export type EtatPreparation = 'attente' | 'en_cours' | 'pret' | 'echec'

export interface PreparationEpisode {
  /** Identifiant serveur de l'episode (`iptva:77123.mkv`). */
  contenu: string
  saison: number
  episode: number
  etat: EtatPreparation
  octets?: number
  total?: number
  debitKbps?: number
  cause?: string
}

/** Etat de preparation d'un element de la liste, tel que `GET /profil/a_voir` le rend. */
export interface Preparation {
  etat: EtatPreparation
  octets?: number
  total?: number
  debitKbps?: number
  /** Cause assainie d'un echec (jamais une adresse ni un identifiant de compte). */
  cause?: string
  /** Serie : les `episodes_avance` episodes concernes, dans l'ordre de lecture. */
  episodes?: PreparationEpisode[]
}

export const LIBELLE_ETAT: Record<EtatPreparation, string> = {
  attente: 'En attente',
  en_cours: 'En cours',
  pret: 'Prêt',
  echec: 'Échec',
}

/** Minuscule, pour une phrase : « S02E05 · prêt ». */
const ETAT_PHRASE: Record<EtatPreparation, string> = {
  attente: 'en attente',
  en_cours: 'en préparation',
  pret: 'prêt',
  echec: 'en échec',
}

/** `2700` -> « 2,7 Mbit/s ». */
export function mbps(kbps: number | undefined): string | undefined {
  if (kbps === undefined || !Number.isFinite(kbps) || kbps <= 0) return undefined
  return `${(kbps / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mbit/s`
}

export function pourcentage(octets: number | undefined, total: number | undefined): number | undefined {
  if (octets === undefined || total === undefined || !(total > 0)) return undefined
  return Math.max(0, Math.min(100, Math.round((octets / total) * 100)))
}

export function repere(saison: number, episode: number): string {
  return `S${String(saison).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

/**
 * Une ligne d'etat pour un element : « En cours · 42 % · 2,1 Mbit/s », « Prêt »,
 * « Échec : disque plein », « En attente ». Sans etat connu (serveur jamais
 * joint) : « État inconnu ».
 */
export function libellePreparation(p: Pick<Preparation, 'etat' | 'octets' | 'total' | 'debitKbps' | 'cause'> | undefined): string {
  if (!p) return 'État inconnu'
  if (p.etat === 'en_cours') {
    const parts = [LIBELLE_ETAT.en_cours]
    const pc = pourcentage(p.octets, p.total)
    if (pc !== undefined) parts.push(`${pc} %`)
    const d = mbps(p.debitKbps)
    if (d) parts.push(d)
    return parts.join(' · ')
  }
  if (p.etat === 'echec') return p.cause ? `${LIBELLE_ETAT.echec} : ${p.cause}` : LIBELLE_ETAT.echec
  return LIBELLE_ETAT[p.etat]
}

/**
 * Une serie se resume en UNE ligne (CA2) : « S02E05 · prêt · suivant en
 * préparation », jamais ses douze episodes. Le premier episode concerne porte
 * l'etat de l'element, le second dit ce qui vient.
 */
export function resumeSerie(p: Preparation | undefined): string {
  const eps = p?.episodes ?? []
  const premier = eps[0]
  if (!premier) return libellePreparation(p)
  const parts = [repere(premier.saison, premier.episode), premier.etat === 'en_cours' ? libellePreparation(premier).toLowerCase() : ETAT_PHRASE[premier.etat]]
  const second = eps[1]
  if (second) parts.push(`suivant ${ETAT_PHRASE[second.etat]}`)
  return parts.join(' · ')
}

/** Accueil (CA3) : les prets d'abord, puis l'ordre de la liste. Tri stable. */
export function trierPretsDabord<T extends { rang: number; preparation?: Preparation }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => {
    const pa = a.preparation?.etat === 'pret' ? 0 : 1
    const pb = b.preparation?.etat === 'pret' ? 0 : 1
    return pa - pb || a.rang - b.rang
  })
}

/**
 * Element qui suit `cleCourante` dans la liste ordonnee (CA4 : film termine ->
 * proposer le prochain). Un contenu absent de la liste propose le premier
 * element ; jamais le contenu courant lui-meme ; `undefined` si rien d'autre.
 */
export function prochainDansListe<T extends { cle: string }>(liste: T[], cleCourante: string): T | undefined {
  const i = liste.findIndex((e) => e.cle === cleCourante)
  const candidats = i < 0 ? liste : [...liste.slice(i + 1), ...liste.slice(0, i)]
  return candidats.find((e) => e.cle !== cleCourante)
}

/** Monter (`-1`) ou descendre (`+1`) l'element `index` ; hors bornes : liste inchangee. */
export function deplacer<T>(liste: T[], index: number, sens: -1 | 1): T[] {
  const cible = index + sens
  if (index < 0 || index >= liste.length || cible < 0 || cible >= liste.length) return liste
  const copie = [...liste]
  const [e] = copie.splice(index, 1)
  copie.splice(cible, 0, e as T)
  return copie
}

// --- Sonde de disponibilite (US-42 CA6, US-43 CA5) ---------------------------

export interface Disponibilite {
  etat: 'pret' | 'immediat' | 'lent' | 'inconnu'
  debit_kbps: number
  mesure?: string | null
  /** Debit du fichier retenu par la sonde (demande de contrat ui-5 ; facultatif). */
  requis_kbps?: number
}

export interface LibelleDisponibilite {
  texte: string
  /** Vrai quand la fiche doit proposer « À voir » a cote du message. */
  proposerAVoir: boolean
  ton: 'ok' | 'pret' | 'lent'
}

/**
 * « Disponible immédiatement », « Lent (2,7 Mbit/s pour 4,4 nécessaires) :
 * préparer d'avance ? » ou « Prêt ». `inconnu` (une lecture est en cours cote
 * serveur) n'affiche rien.
 */
export function libelleDisponibilite(d: Disponibilite | undefined): LibelleDisponibilite | undefined {
  if (!d) return undefined
  if (d.etat === 'pret') return { texte: 'Prêt', proposerAVoir: false, ton: 'pret' }
  if (d.etat === 'immediat') return { texte: 'Disponible immédiatement', proposerAVoir: false, ton: 'ok' }
  if (d.etat === 'lent') {
    const mesure = mbps(d.debit_kbps)
    const requis = mbps(d.requis_kbps)
    const detail = mesure ? ` (${mesure}${requis ? ` pour ${requis.replace(' Mbit/s', '')} nécessaires` : ''})` : ''
    return { texte: `Lent${detail} : préparer d'avance ?`, proposerAVoir: true, ton: 'lent' }
  }
  return undefined
}
