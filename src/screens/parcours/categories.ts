import { createEffect, createMemo, createSignal } from 'solid-js'
import { db, normaliser, type Categorie, type TypeContenu } from '../../lib/db'
import {
  FRAICHEUR, cles, donneePartagee, invaliderCategories, invaliderEpingles, poserDonnee,
  requete, requeteClefee,
} from '../../lib/requetes'
import { onglet } from '../../etat'
import { emettreToast } from '../../lib/toasts'

// La colonne de Direct : 358 catégories qui sont une vraie taxonomie de pays,
// et le rangement qui les rend parcourables — groupement par pays, replis,
// épingles en tête, masquages persistés. Tout ce fichier décrit UNE liste de
// lignes ; la vue, elle, ne fait que la peindre.

// Les libellés Xtream empilent trois informations dans un même champ :
// « VOD - ACTION [FR] », « |AR| HBO », « SRS - NETFLIX [ES] ». On en extrait le
// pays pour pouvoir regrouper, et le thème pour pouvoir l'afficher seul.
const PREFIXE_TYPE = /^(?:VOD|SRS|SER|SERIES|FILM|MOVIES?)\s*[-–—:]\s*/i
const PAYS_TETE = /^\s*(?:\|([A-Za-z]{2,4})\||([A-Za-z]{2,4})\s*[-–—:])\s*/
const PAYS_QUEUE = /\s*[[(]([A-Za-z]{2,4})[\])]\s*$/

export const NOM_PAYS: Record<string, string> = {
  FR: 'France', BE: 'Belgique', CH: 'Suisse', CA: 'Canada', EU: 'Europe',
  EN: 'Anglophone', UK: 'Royaume-Uni', US: 'États-Unis', ES: 'Espagne',
  PT: 'Portugal', BR: 'Brésil', IT: 'Italie', DE: 'Allemagne', NL: 'Pays-Bas',
  AR: 'Monde arabe', MA: 'Maroc', DZ: 'Algérie', TN: 'Tunisie', TR: 'Turquie',
  PL: 'Pologne', RO: 'Roumanie', RU: 'Russie', IN: 'Inde', AF: 'Afrique',
  LAT: 'Amérique latine', MX: 'Mexique', SE: 'Suède', NO: 'Norvège',
}

const CLE_EPINGLES = 'epingles.live'

interface Decomposition {
  pays?: string
  libelle: string
}

function decomposer(nom: string): Decomposition {
  let reste = nom.replace(PREFIXE_TYPE, '').trim()
  let pays: string | undefined

  const queue = PAYS_QUEUE.exec(reste)
  if (queue) {
    pays = queue[1]
    reste = reste.slice(0, queue.index).trim()
  }
  if (!pays) {
    const tete = PAYS_TETE.exec(reste)
    if (tete) {
      pays = tete[1] ?? tete[2]
      reste = reste.slice(tete[0].length).trim()
    }
  }
  return { pays: pays?.toUpperCase(), libelle: reste || nom.trim() }
}

export interface Fiche {
  cat: Categorie
  pays?: string
  libelle: string
  recherche: string
}

export type LigneColonne =
  | { genre: 'section'; cle: string; libelle: string }
  | { genre: 'groupe'; cle: string; code: string; libelle: string; compte: number; deplie: boolean }
  | { genre: 'cat'; cle: string; fiche: Fiche; retrait: number; pastille: boolean; epinglee: boolean }

export function lireCategories(type: TypeContenu): Promise<Categorie[]> {
  return db.categories.where('type').equals(type).toArray()
}

/**
 * Catégories d'un type, à la clé que tout l'écran partage — la colonne de
 * Direct comme les facettes des films.
 *
 * ATTENTION : à n'appeler que depuis le chargement d'une AUTRE clé. Une requête
 * qui passerait par là pour sa propre clé attendrait sa propre promesse, et
 * resterait en chargement pour toujours.
 */
export function categoriesPartagees(type: TypeContenu): Promise<Categorie[]> {
  return donneePartagee(cles.categories(type), () => lireCategories(type))
}

export function creerColonneCategories() {
  // La catégorie choisie survit aux détours par Films, Séries ou l'Accueil :
  // revenir sur Direct doit retrouver la catégorie qu'on parcourait. Un seul
  // signal, et non une entrée par onglet : Films et Séries ne se rangent pas
  // par catégorie — ils ont des filtres — et faire dépendre cette valeur de
  // l'onglet suffisait à relancer toutes les lectures ci-dessous à chaque
  // aller-retour.
  const [categorieActive, poserCategorieActive] = createSignal<string | null>(null)
  const [replies, poserReplies] = createSignal<Record<string, boolean>>({})
  const [afficherMasquees, poserAfficherMasquees] = createSignal(false)
  const [recherche, poserRecherche] = createSignal('')

  // Lues à la PREMIERE visite de Direct, et plus jamais : l'écran reste monté,
  // donc une source qui redevient vide sous Films ferait relire les 358
  // catégories — pour les jeter — à chaque retour.
  const liveVisite = createMemo((vu: boolean) => vu || onglet() === 'live', false)
  const [categories, { refetch: recharger }] = requeteClefee(
    (t: TypeContenu) => cles.categories(t),
    () => (liveVisite() ? ('live' as const) : undefined),
    // Lecture directe, et non `categoriesPartagees` : c'est CETTE clé que la
    // requête occupe, elle ne peut pas s'attendre elle-même.
    lireCategories,
    // Le diagnostic « Lecture des catégories » attend que l'erreur remonte.
    { propager: true },
  )

  // Les épingles survivent à la session, et désormais au changement de machine :
  // la synchronisation périme cette clé quand une autre machine en pose une.
  const [epinglesLues] = requete(
    cles.epingles,
    () => db.reglages.get(CLE_EPINGLES).then((r) => (Array.isArray(r?.valeur) ? (r.valeur as string[]) : [])),
    { fraicheur: FRAICHEUR.geste },
  )
  const epingles = () => epinglesLues() ?? []

  const fiches = createMemo<Fiche[]>(() =>
    (categories() ?? []).map((cat) => {
      const d = decomposer(cat.nom)
      return { cat, ...d, recherche: normaliser(`${d.libelle} ${cat.nom}`) }
    }),
  )

  const masquees = createMemo(() => fiches().filter((f) => f.cat.masquee).length)

  const retenues = createMemo(() =>
    afficherMasquees() ? fiches() : fiches().filter((f) => !f.cat.masquee),
  )

  const correspondantes = createMemo(() => {
    const q = normaliser(recherche().trim())
    return q ? retenues().filter((f) => f.recherche.includes(q)) : retenues()
  })

  const epinglees = createMemo(() => new Set(epingles()))

  // Direct regroupe par pays : 358 catégories dont une poignée seulement
  // concerne le spectateur, les autres se replient derrière leur drapeau.
  const lignes = createMemo<LigneColonne[]>(() => {
    const liste = correspondantes()
    const enRecherche = recherche().trim().length > 0
    const posees = epinglees()
    const out: LigneColonne[] = []

    const ligneCat = (fiche: Fiche, retrait: number, pastille: boolean): LigneColonne => ({
      genre: 'cat',
      cle: `${retrait === 10 ? 'e' : 'c'}:${fiche.cat.cle}`,
      fiche,
      retrait,
      pastille,
      epinglee: posees.has(fiche.cat.id),
    })

    // Les épinglées restent en tête, hors de leur pays : c'est la raison d'être
    // d'une épingle que de court-circuiter le rangement.
    const aEpingler = liste.filter((f) => posees.has(f.cat.id))
    if (aEpingler.length > 0) {
      out.push({ genre: 'section', cle: 's:epingles', libelle: 'Épinglées' })
      for (const f of aEpingler) out.push(ligneCat(f, 10, true))
    }

    const paquets = new Map<string, Fiche[]>()
    for (const fiche of liste) {
      const code = fiche.pays ?? '—'
      const existant = paquets.get(code)
      if (existant) existant.push(fiche)
      else paquets.set(code, [fiche])
    }

    const groupes = [...paquets.entries()]
      .map(([code, membres]) => ({
        code,
        membres,
        compte: membres.reduce((t, f) => t + f.cat.compte, 0),
      }))
      .sort((a, b) => (a.code === '—' ? 1 : b.code === '—' ? -1 : b.compte - a.compte))

    if (groupes.length > 0) out.push({ genre: 'section', cle: 's:pays', libelle: 'Pays' })

    groupes.forEach((g, i) => {
      // Sans choix explicite, seul le premier groupe est ouvert : la colonne
      // s'ouvre sur du contenu sans dérouler les 358 catégories. En recherche,
      // tout s'ouvre — masquer les résultats derrière un chevron serait absurde.
      const deplie = enRecherche || (replies()[g.code] ?? i === 0)
      const connu = NOM_PAYS[g.code]
      out.push({
        genre: 'groupe',
        cle: `g:${g.code}`,
        // Sans nom de pays connu, le code sert de libellé : le répéter en
        // pastille afficherait « NA NA ».
        code: connu ? g.code : '',
        libelle: g.code === '—' ? 'Autres' : (connu ?? g.code),
        compte: g.compte,
        deplie,
      })
      if (!deplie) return
      for (const fiche of g.membres) out.push(ligneCat(fiche, 34, false))
    })
    return out
  })

  // Première catégorie visible : la maquette n'a jamais d'écran vide côté droit.
  createEffect(() => {
    if (categorieActive()) return
    const premiere = lignes().find((l) => l.genre === 'cat')
    if (premiere?.genre === 'cat') poserCategorieActive(premiere.fiche.cat.id)
  })

  const ficheActive = createMemo(() => fiches().find((f) => f.cat.id === categorieActive()))

  function basculerGroupe(code: string, deplieActuel: boolean) {
    poserReplies((r) => ({ ...r, [code]: !deplieActuel }))
  }

  async function basculerEpingle(id: string) {
    const liste = epingles().includes(id)
      ? epingles().filter((x) => x !== id)
      : [...epingles(), id]
    // Posée dans le cache AVANT l'écriture : l'épingle doit suivre le clic, pas
    // l'aller-retour vers la base.
    poserDonnee(cles.epingles, liste)
    await db.reglages.put({ cle: CLE_EPINGLES, valeur: liste })
    await invaliderEpingles()
  }

  // Masquer est un confort durable — trois cents catégories étrangères ne
  // servent à personne — mais jamais une perte : le choix se reprend ici même,
  // dans les Réglages (liste des masquées), ou tout de suite par « Annuler ».
  // La catégorie masquée RESTE affichée tant qu'on ne la quitte pas (A UX11) :
  // changer de catégorie sans prévenir désorientait.
  async function basculerMasquage(fiche: Fiche, { annonce = true } = {}) {
    const masquer = fiche.cat.masquee === 0
    await db.categories.update(fiche.cat.cle, { masquee: masquer ? 1 : 0 })
    // La colonne de Direct ET l'index de facettes des films lisent cette
    // table : les deux doivent repartir de la base.
    void invaliderCategories('live')
    if (!annonce) return
    emettreToast({
      message: masquer ? `${fiche.libelle} · catégorie masquée` : `${fiche.libelle} · catégorie réaffichée`,
      ton: 'ok',
      action: () => basculerMasquage({ ...fiche, cat: { ...fiche.cat, masquee: masquer ? 1 : 0 } }, { annonce: false }),
    })
  }

  return {
    categorieActive, poserCategorieActive,
    recherche, poserRecherche,
    afficherMasquees, poserAfficherMasquees,
    categories, recharger,
    correspondantes, masquees, lignes, ficheActive,
    basculerGroupe, basculerEpingle, basculerMasquage,
  }
}

export type ColonneCategories = ReturnType<typeof creerColonneCategories>
