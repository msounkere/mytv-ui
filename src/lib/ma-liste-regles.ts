// Regles PURES de « Ma liste » (lot 10, ex-« À voir » du lot 9) : etats de
// preparation rendus par le serveur (contrat US-44), libelles exacts du modele
// cible (rapport C §5.5, qui fait foi), ordre, element suivant. Aucune
// dependance : ce module se teste sous node, et c'est lui que les ecrans
// appellent -- l'Accueil, l'ecran « Ma liste », le lecteur, les fiches et les
// cartes doivent dire la meme chose du meme etat.

/** Cle de journal qui dit « l'ordre de la liste a change » : un seul PUT de la liste entiere. */
export const CLE_ORDRE = '*ordre*'

/** Etats du moteur de preparation (contrat US-42 CA2). */
export type EtatPreparation = 'attente' | 'en_cours' | 'pret' | 'echec'

/** Pourquoi un fichier attend (contrat US-44 CA1). */
export type RaisonAttente = 'lecture_en_cours' | 'file' | 'budget_plein' | 'reprise_apres'

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
  raison?: RaisonAttente
  /** `file` : position 1-based dans la file. */
  position?: number
  /** Echec transitoire : instant RFC 3339 de la prochaine tentative automatique. */
  reessai?: string
}

/** Etat de preparation d'un element de la liste, tel que `GET /profil/a_voir` le rend. */
export interface Preparation {
  etat: EtatPreparation
  octets?: number
  total?: number
  debitKbps?: number
  /** Cause assainie d'un echec (jamais une adresse ni un identifiant de compte). */
  cause?: string
  raison?: RaisonAttente
  position?: number
  reessai?: string
  /** Serie : les `episodes_avance` episodes concernes, dans l'ordre de lecture. */
  episodes?: PreparationEpisode[]
}

/** Budget de preparation du serveur (US-44 CA4), en octets. */
export interface Budget {
  utilise: number
  total: number
}

// --- Libelles exacts (rapport C §5.5) -----------------------------------------

export const LIBELLES = {
  liste: 'Ma liste',
  ajouter: '+ Ma liste',
  ajouterAria: 'Ajouter à Ma liste',
  ajouterInfobulle: 'Préparé d’avance sur le serveur pour une lecture sans coupure',
  present: '✓ Dans ma liste',
  presentAria: 'Retirer de Ma liste',
  retirer: 'Retirer de Ma liste',
  aPartirDici: 'Ma liste à partir d’ici',
  pointDeDepart: 'Point de départ',
  nePlusPartirDici: 'Ne plus partir d’ici',
  reessayer: 'Réessayer',
  vide: 'Votre liste est vide',
  videDetail: 'Ajoutez un film ou une série avec “+ Ma liste” : le serveur le préparera d’avance pour une lecture sans coupure.',
  reprendre: 'Reprendre',
  marquerVu: 'Marquer comme vu',
  marquerNonVu: 'Marquer comme non vu',
  marquerSaisonVue: 'Marquer la saison comme vue',
  marquerSaisonNonVue: 'Marquer la saison comme non vue',
  retirerDeReprendre: 'Retirer de Reprendre',
  vu: '✓ Vu',
  regarderANouveau: 'Regarder à nouveau',
  prochainDansListe: 'Prochain dans Ma liste',
  sondeFluide: 'Lecture fluide',
  sondeLente: 'Risque de coupures — préparer d’avance ?',
  sondePret: '● Prêt · préparé sur le serveur',
} as const

/** Symbole de chaque etat, tel que le modele cible l'ecrit devant la phrase. */
export const SYMBOLE_ETAT: Record<EtatPreparation, string> = {
  attente: '○',
  en_cours: '⟳',
  pret: '●',
  echec: '✕',
}

/** Mot de l'etat, majuscule initiale : « En attente », « En préparation », « Prêt », « Échec ». */
export const LIBELLE_ETAT: Record<EtatPreparation, string> = {
  attente: 'En attente',
  en_cours: 'En préparation',
  pret: 'Prêt',
  echec: 'Échec',
}

/** Minuscule, pour une phrase : « S02E05 prêt ». UN seul mot par etat (C9). */
export const ETAT_PHRASE: Record<EtatPreparation, string> = {
  attente: 'en attente',
  en_cours: 'en préparation',
  pret: 'prêt',
  echec: 'échec',
}

/** La raison d'une attente, en clair (§5.5). */
export function phraseRaison(raison: RaisonAttente | undefined, position?: number): string | undefined {
  switch (raison) {
    case 'lecture_en_cours':
      return 'une lecture est en cours'
    case 'file':
      return position !== undefined && position > 0 ? `${ordinal(position)} dans la file` : 'dans la file'
    case 'budget_plein':
      return 'disque plein'
    case 'reprise_apres':
      return 'reprend après la lecture'
    default:
      return undefined
  }
}

/** « 1er », « 2e », « 3e »… */
export function ordinal(n: number): string {
  return n === 1 ? '1er' : `${n}e`
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

/**
 * Temps restant estime d'une preparation en cours, en secondes :
 * `(total - octets) / debit` (CA7). `undefined` sans debit ni total.
 */
export function secondesRestantes(p: Pick<Preparation, 'octets' | 'total' | 'debitKbps'>): number | undefined {
  if (p.total === undefined || p.octets === undefined || !(p.total > 0)) return undefined
  if (p.debitKbps === undefined || !(p.debitKbps > 0)) return undefined
  const restant = Math.max(0, p.total - p.octets)
  return (restant * 8) / (p.debitKbps * 1000)
}

/** « ~6 min », « ~2 h 05 », « ~30 s ». */
export function dureeApproximative(secondes: number): string {
  const s = Math.max(0, Math.round(secondes))
  if (s < 60) return `~${Math.max(1, s)} s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  if (h > 0) return `~${h} h ${String(m).padStart(2, '0')}`
  return `~${m} min`
}

export function repere(saison: number, episode: number): string {
  return `S${String(saison).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

/** « 4,2 Go », « 850 Mo ». */
export function octetsLisibles(octets: number): string {
  if (!Number.isFinite(octets) || octets < 0) return '0 Mo'
  const go = octets / 1_073_741_824
  if (go >= 1) return `${go.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`
  return `${Math.round(octets / 1_048_576)} Mo`
}

/** « 4,2 Go sur 10 Go ». */
export function phraseBudget(b: Budget | undefined): string | undefined {
  if (!b || !(b.total > 0)) return undefined
  return `${octetsLisibles(b.utilise)} sur ${octetsLisibles(b.total)}`
}

// --- Phrases d'etat -----------------------------------------------------------

export interface MorceauxEtat {
  etat: EtatPreparation
  symbole: string
  /** « En attente », « En préparation »… */
  mot: string
  /** Complements apres le mot : raison, pourcentage, temps restant, cause. */
  details: string[]
  /** Vrai quand « Réessayer » a sa place a cote. */
  reessayable: boolean
}

type Etatable = Pick<Preparation, 'etat' | 'octets' | 'total' | 'debitKbps' | 'cause' | 'raison' | 'position' | 'reessai'>

/** Decompose un etat en morceaux ; les ecrans les assemblent selon leur place. */
export function morceauxEtat(p: Etatable): MorceauxEtat {
  const details: string[] = []
  if (p.etat === 'attente') {
    const r = phraseRaison(p.raison, p.position)
    if (r) details.push(r)
  } else if (p.etat === 'en_cours') {
    const pc = pourcentage(p.octets, p.total)
    if (pc !== undefined) details.push(`${pc} %`)
    const s = secondesRestantes(p)
    if (s !== undefined) details.push(dureeApproximative(s))
  } else if (p.etat === 'echec') {
    if (p.cause) details.push(p.cause)
  }
  return { etat: p.etat, symbole: SYMBOLE_ETAT[p.etat], mot: LIBELLE_ETAT[p.etat], details, reessayable: p.etat === 'echec' }
}

/**
 * La phrase du chip d'etat (§5.5) : `○ En attente · une lecture est en cours`,
 * `⟳ En préparation · 42 % · ~6 min`, `● Prêt`, `✕ Échec · disque plein`.
 * Sans etat connu (serveur jamais joint) : `○ État inconnu`.
 */
export function phraseEtat(p: Etatable | undefined): string {
  if (!p) return '○ État inconnu'
  const m = morceauxEtat(p)
  return [`${m.symbole} ${m.mot}`, ...m.details].join(' · ')
}

/** Le badge de coin d'une carte (§5.4) : `Prêt`, `⟳ 42 %`, `En attente`, `✕ Échec`. */
export function badgeEtat(p: Etatable | undefined): string | undefined {
  if (!p) return undefined
  if (p.etat === 'pret') return 'Prêt'
  if (p.etat === 'en_cours') {
    const pc = pourcentage(p.octets, p.total)
    return pc === undefined ? '⟳' : `⟳ ${pc} %`
  }
  if (p.etat === 'echec') return '✕ Échec'
  return 'En attente'
}

/** Compat lot 9 : la ligne d'etat d'un element, sans symbole (`En préparation · 42 % · ~6 min`). */
export function libellePreparation(p: Etatable | undefined): string {
  if (!p) return 'État inconnu'
  const m = morceauxEtat(p)
  return [m.mot, ...m.details].join(' · ')
}

/** Phrase minuscule d'un episode : « prêt », « en préparation · 42 % », « échec · disque plein ». */
function phraseEpisode(e: PreparationEpisode): string {
  const m = morceauxEtat(e)
  return [ETAT_PHRASE[e.etat], ...m.details].join(' · ')
}

/**
 * Une serie tient en UNE ligne (§5.5) : `● S01E02 prêt · S01E03 en préparation`,
 * `○ S02E01 en attente · suivant en attente`. Le premier episode concerne porte
 * l'etat de l'element, le second dit ce qui vient. Sans episodes : la phrase de
 * l'element.
 */
export function resumeSerie(p: Preparation | undefined): string {
  const eps = p?.episodes ?? []
  const premier = eps[0]
  if (!premier) return phraseEtat(p)
  const parts = [`${SYMBOLE_ETAT[premier.etat]} ${repere(premier.saison, premier.episode)} ${phraseEpisode(premier)}`]
  const second = eps[1]
  if (second) parts.push(`${repere(second.saison, second.episode)} ${ETAT_PHRASE[second.etat]}`)
  return parts.join(' · ')
}

/** Version courte pour le telephone : `● S01E02 prêt · suivant ⟳`. */
export function resumeSerieCourt(p: Preparation | undefined): string {
  const eps = p?.episodes ?? []
  const premier = eps[0]
  if (!premier) return phraseEtat(p)
  const parts = [`${SYMBOLE_ETAT[premier.etat]} ${repere(premier.saison, premier.episode)} ${ETAT_PHRASE[premier.etat]}`]
  const second = eps[1]
  if (second) parts.push(`suivant ${SYMBOLE_ETAT[second.etat]}`)
  return parts.join(' · ')
}

/** `5 titres · 2 prêts · 1 en préparation · 4,2 Go sur 10 Go` (ecran) ; vide : `Votre liste est vide`. */
export function enTeteListe(elements: Array<{ preparation?: Preparation }>, budget?: Budget): string {
  const n = elements.length
  if (n === 0) return LIBELLES.vide
  const prets = elements.filter((e) => e.preparation?.etat === 'pret').length
  const enCours = elements.filter((e) => e.preparation?.etat === 'en_cours').length
  const parts = [`${n} titre${n > 1 ? 's' : ''}`]
  if (prets) parts.push(`${prets} prêt${prets > 1 ? 's' : ''}`)
  if (enCours) parts.push(`${enCours} en préparation`)
  const b = phraseBudget(budget)
  if (b) parts.push(b)
  return parts.join(' · ')
}

/** `5 · 2 prêts` (rangee de l'Accueil) ; `5` sans aucun pret. */
export function compteurRangee(elements: Array<{ preparation?: Preparation }>): string {
  const n = elements.length
  const prets = elements.filter((e) => e.preparation?.etat === 'pret').length
  return prets ? `${n} · ${prets} prêt${prets > 1 ? 's' : ''}` : String(n)
}

/** Version telephone de l'en-tete : `5 · 2 prêts · 4,2/10 Go`. */
export function enTeteListeCourt(elements: Array<{ preparation?: Preparation }>, budget?: Budget): string {
  const n = elements.length
  if (n === 0) return LIBELLES.vide
  const parts = [compteurRangee(elements)]
  if (budget && budget.total > 0) parts.push(`${octetsLisibles(budget.utilise).replace(' Go', '').replace(' Mo', ' Mo')}/${octetsLisibles(budget.total)}`)
  return parts.join(' · ')
}

/** Compat lot 9 : les prets d'abord, puis l'ordre de la liste. Tri stable. */
export function trierPretsDabord<T extends { rang: number; preparation?: Preparation }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => {
    const pa = a.preparation?.etat === 'pret' ? 0 : 1
    const pb = b.preparation?.etat === 'pret' ? 0 : 1
    return pa - pb || a.rang - b.rang
  })
}

/**
 * Element qui suit `cleCourante` dans la liste ordonnee (fin de lecture ->
 * proposer le prochain). Un contenu absent de la liste propose le premier
 * element ; JAMAIS le contenu courant lui-meme ; `undefined` si rien d'autre.
 */
export function prochainDansListe<T extends { cle: string }>(liste: T[], cleCourante: string): T | undefined {
  return prochainApres(liste, cleCourante).suivant
}

/**
 * Meme chose, en disant si le contenu courant etait DANS la liste : hors liste,
 * le calque de fin ne doit pas dire « suivant » (C19) mais « Prochain dans Ma
 * liste » -- un seul libelle, `LIBELLES.prochainDansListe`, dans les deux cas.
 */
export function prochainApres<T extends { cle: string }>(liste: T[], cleCourante: string): { suivant: T | undefined; enListe: boolean } {
  const i = liste.findIndex((e) => e.cle === cleCourante)
  const candidats = i < 0 ? liste : [...liste.slice(i + 1), ...liste.slice(0, i)]
  return { suivant: candidats.find((e) => e.cle !== cleCourante), enListe: i >= 0 }
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

/** Bornes de « Préparer N épisodes d'avance » (§5.5 : 1 à 5). */
export const EPISODES_AVANCE_MIN = 1
export const EPISODES_AVANCE_MAX = 5

/** `Préparer 2 épisodes d'avance` ; non modifie : `Préparer 2 (réglage du serveur) épisodes d'avance`. */
export function libelleEpisodesAvance(valeur: number | undefined, defautServeur: number): string {
  const n = valeur ?? defautServeur
  const chiffre = valeur === undefined ? `${n} (réglage du serveur)` : String(n)
  return `Préparer ${chiffre} épisode${n > 1 ? 's' : ''} d’avance`
}

// --- Sonde de disponibilite (US-42 CA6, US-43 CA5, lot 10 CA7) ------------------

export interface Disponibilite {
  etat: 'pret' | 'immediat' | 'lent' | 'inconnu'
  debit_kbps: number
  mesure?: string | null
  /** Debit du fichier retenu par la sonde (demande de contrat ui-5 ; facultatif). */
  requis_kbps?: number
}

export interface LibelleDisponibilite {
  /** Premiere ligne, humaine : jamais de Mbit/s (§5.2 regle 8). */
  texte: string
  /** Detail : `2,7 Mbit/s mesurés pour 4,4 nécessaires`. */
  detail?: string
  /** Vrai quand la fiche doit proposer « + Ma liste » a cote du message. */
  proposerAVoir: boolean
  ton: 'ok' | 'pret' | 'lent'
}

/**
 * `Lecture fluide` · `Risque de coupures — préparer d'avance ?` · `● Prêt ·
 * préparé sur le serveur`. `inconnu` (une lecture est en cours cote serveur)
 * n'affiche rien. Le debit n'est qu'un detail.
 */
export function libelleDisponibilite(d: Disponibilite | undefined): LibelleDisponibilite | undefined {
  if (!d) return undefined
  if (d.etat === 'pret') return { texte: LIBELLES.sondePret, proposerAVoir: false, ton: 'pret' }
  if (d.etat === 'immediat') {
    const mesure = mbps(d.debit_kbps)
    return { texte: LIBELLES.sondeFluide, detail: mesure ? `${mesure} mesurés` : undefined, proposerAVoir: false, ton: 'ok' }
  }
  if (d.etat === 'lent') {
    const mesure = mbps(d.debit_kbps)
    const requis = mbps(d.requis_kbps)
    const detail = mesure ? `${mesure} mesurés${requis ? ` pour ${requis.replace(' Mbit/s', '')} nécessaires` : ''}` : undefined
    return { texte: LIBELLES.sondeLente, detail, proposerAVoir: true, ton: 'lent' }
  }
  return undefined
}
