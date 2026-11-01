import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import ALaUne from '../components/ALaUne'
import CarteAffiche, { SqueletteAffiche } from '../components/CarteAffiche'
import CarteChaineFavorite from '../components/CarteChaineFavorite'
import CarteDirect from '../components/CarteDirect'
import CarteReprise from '../components/CarteReprise'
import MenuContextuel, { type EntreeMenu } from '../components/MenuContextuel'
import RangeeHorizontale from '../components/RangeeHorizontale'
import type { ProgrammeCourant } from '../components/PlaqueChaine'
import { anneeDuTitre, titreCourt } from '../components/titres'
import { ecran, poserEcran, poserOnglet } from '../etat'
import { listeAVoirAccueil } from '../lib/a-voir'
import { libellePreparation, resumeSerie } from '../lib/a-voir-regles'
import { db, type EntreeCatalogue, type TypeContenu } from '../lib/db'
import { clesAJoindre, joindreReprises } from '../lib/reprises-accueil'
import { chainesAvecGuide, programmesEnCours as programmesDuMoment } from '../lib/chaines-guide'
import { basculerFavori, marquerVu, oublierReprise, oublierReprisesDeSerie } from '../lib/preferences'
import { gabarit as gabaritCoque } from '../lib/gabarit'
import {
  FRAICHEUR, cles, donneePartagee, requete,
} from '../lib/requetes'

// Accueil V2. La règle structurante du dossier : « une rangée vide n'est jamais
// affichée ». Chaque section est donc une ressource indépendante qui se rend
// seule quand elle a du contenu — l'écran se remplit au fur et à mesure plutôt
// que d'attendre la plus lente, et un compte neuf n'affiche que « À la une ».

// Bornes des rangées, reprises de la maquette.
const LIMITE_REPRISES = 12
const LIMITE_CHAINES = 20
const LIMITE_DIRECT = 20
const LIMITE_AFFICHES = 20
const LIMITE_SIMILAIRES = 16
const NB_A_LA_UNE = 5

/** Candidats interrogés pour « En direct maintenant » avant filtrage par l'EPG. */
const CANDIDATS_DIRECT = 160

/**
 * Le catalogue local ne porte pas la date d'ajout : `versEntree` n'enregistre
 * ni `added` ni `last_modified`. En revanche le fournisseur expose la nouveauté
 * sous forme de catégories dédiées — « VOD - NEW ADDED [EN] », « VOD -
 * RÉCEMMENT AJOUTER [FR] », « SRS - NEW ADDED [EN] ». Ce sont elles qui
 * alimentent les rangées « récemment ajoutés », et non un tri inventé.
 */
const CATEGORIES_RECENTES = /(new\s*added|r[ée]cemment\s*ajout|nouveaut)/i

/** Suffixes techniques des flux dupliqués : douze « TF1 » n'aident personne. */
const DOUBLON_TECHNIQUE = /\s[(\[]?(HD|FHD|UHD|4K|SD|HEVC|H265|\+1|BACKUP|LOW|MULTI)[)\]]?$/i

const LIBELLE_TYPE: Record<TypeContenu, string> = { live: 'Direct', vod: 'Film', series: 'Série' }

interface Reprise {
  entree: EntreeCatalogue
  progression: number
  reste: string
  sousTitre: string
  /** Cle de la position memorisee : celle de l'EPISODE quand la carte est une serie. */
  cleReprise: string
}

interface ChaineFavorite {
  entree: EntreeCatalogue
  sousTitre: string
  programme?: ProgrammeCourant
}

interface Direct {
  entree: EntreeCatalogue
  programme: ProgrammeCourant
}

interface Affiche {
  entree: EntreeCatalogue
  meta?: string
  nouveau: boolean
}

interface Similaires {
  reference: string
  affiches: Affiche[]
}

// ─── Lecture du catalogue ───────────────────────────────────────────────────

/** Nom de catégorie par entrée : le seul sous-titre que le catalogue sait donner. */
async function nomsCategories(entrees: EntreeCatalogue[]): Promise<Map<string, string>> {
  const cles = [...new Set(entrees.filter((e) => e.categorie).map((e) => `${e.type}:${e.categorie}`))]
  const par = new Map<string, string>()
  if (cles.length === 0) return par
  for (const c of await db.categories.bulkGet(cles)) if (c) par.set(c.cle, c.nom)
  return par
}

/** « FR · VOD - ACTION [FR] » : pays du préfixe puis catégorie du fournisseur. */
function sousTitreChaine(e: EntreeCatalogue, cats: Map<string, string>): string {
  const cat = e.categorie ? cats.get(`${e.type}:${e.categorie}`) : undefined
  return [e.pays, cat].filter(Boolean).join(' · ') || LIBELLE_TYPE[e.type]
}

// Les rangées se lancent toutes en parallèle : ce qu'elles partagent est mis en
// cache par la PROMESSE et non par le résultat (voir `donneePartagee`), faute
// de quoi chacune trouverait un cache encore vide et relirait la base.

/**
 * Identifiants des catégories « nouveautés » du fournisseur.
 *
 * Le cache est maintenant celui de l'application, et non plus une promesse
 * mémorisée dans ce module : l'Accueil est monté au démarrage, donc AVANT tout
 * import, et une promesse retenue à ce moment-là figeait un résultat vide pour
 * toute la session. Cette clé-ci se périme avec l'import.
 */
function categoriesNouveautes(type: TypeContenu): Promise<string[]> {
  return categoriesDe(type).then((t) =>
    t.filter((c) => CATEGORIES_RECENTES.test(c.nom)).map((c) => c.id),
  )
}

/** Catégories d'un type. MÊME clé que Parcours : les 358 catégories du direct
 *  et les 143 des films ne sont lues qu'une fois pour toute l'application. */
function categoriesDe(type: TypeContenu) {
  return donneePartagee(cles.categories(type), () =>
    db.categories.where('type').equals(type).toArray(),
  )
}

/** Rangée « récemment ajoutés », lue depuis le cache de l'écran.
 *  N'est appelée que par « À la une », qui a sa propre clé : une requête ne
 *  peut pas attendre la sienne. */
function recentsPartages(type: TypeContenu): Promise<EntreeCatalogue[]> {
  return donneePartagee(cles.recents(type, LIMITE_AFFICHES), () =>
    recemmentAjoutes(type, LIMITE_AFFICHES),
  )
}

/**
 * Les plus récemment ajoutés d'un type, par date réelle. L'import conserve
 * désormais le champ `added` du relais sur 100 % du catalogue, et l'index
 * `[type+ajouteLe]` rend la requête immédiate : plus besoin de deviner la
 * fraîcheur d'après le nom des catégories du fournisseur.
 */
async function recemmentAjoutes(type: TypeContenu, limite: number): Promise<EntreeCatalogue[]> {
  const parDate = await db.catalogue
    .where('[type+ajouteLe]')
    .between([type, 1], [type, Infinity])
    .reverse()
    .limit(limite)
    .toArray()
  if (parDate.length > 0) return parDate

  // Repli pour un catalogue importé avant que la date soit conservée : on
  // retombe sur les catégories « nouveautés » du fournisseur.
  const cats = await categoriesNouveautes(type)
  if (cats.length === 0) return []
  const cles = (await db.catalogue
    .where('[type+categorie]')
    .anyOf(cats.map((c) => [type, c]))
    .primaryKeys()) as string[]
  const entrees = (await db.catalogue.bulkGet(cles)).filter((e): e is EntreeCatalogue => e !== undefined)
  return recentsDabord(entrees).slice(0, limite)
}

/**
 * Les plus recents d'abord. Les identifiants sont OPAQUES (`iptva:s77`,
 * `iptva:845410`) : on ne les compare plus comme des nombres, ce qui servait
 * autrefois a deviner la fraicheur. Le tri est stable : sans date, l'ordre du
 * catalogue (celui du fournisseur) est conserve.
 */
function recentsDabord(entrees: EntreeCatalogue[]): EntreeCatalogue[] {
  return [...entrees].sort((a, b) => (b.ajouteLe ?? 0) - (a.ajouteLe ?? 0))
}

function versAffiche(entrees: EntreeCatalogue[], nouveau: boolean): Affiche[] {
  return entrees.map((entree) => ({ entree, meta: anneeDuTitre(entree.nom), nouveau }))
}

function formaterDuree(secondes: number): string {
  const s = Math.max(0, Math.round(secondes))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

/** Positions mémorisées encore utiles, jointes au catalogue. */
async function aReprendre(): Promise<Reprise[]> {
  // On ratisse plus large que la limite : les contenus terminés à plus de 95 %
  // sont écartés comme dans `reprisePour`, et videraient sinon la rangée.
  const lignes = await db.reprises.orderBy('vuLe').reverse().limit(LIMITE_REPRISES * 3).toArray()
  // Un episode n'est pas dans le catalogue : il est joint par sa serie (lib/reprises-accueil).
  const cles = clesAJoindre(lignes)
  const trouvees = await db.catalogue.bulkGet(cles)
  const entrees = new Map<string, EntreeCatalogue>()
  trouvees.forEach((e, i) => { if (e) entrees.set(cles[i]!, e) })
  return joindreReprises(lignes, entrees, LIMITE_REPRISES).map(({ entree, ligne, episode }) => ({
    entree,
    cleReprise: ligne.cle,
    progression: ligne.position / ligne.duree,
    reste: `Reste ${formaterDuree(ligne.duree - ligne.position)}`,
    sousTitre: [LIBELLE_TYPE[entree.type], episode ? 'épisode en cours' : anneeDuTitre(entree.nom)].filter(Boolean).join(' · '),
  }))
}

async function favorisTries(): Promise<{ chaines: EntreeCatalogue[]; medias: EntreeCatalogue[]; cles: Set<string> }> {
  const lignes = await db.favoris.orderBy('ajouteLe').reverse().toArray()
  const entrees = (await db.catalogue.bulkGet(lignes.map((l) => l.cle)))
    .filter((e): e is EntreeCatalogue => e !== undefined)
  return {
    chaines: entrees.filter((e) => e.type === 'live').slice(0, LIMITE_CHAINES),
    medias: entrees.filter((e) => e.type !== 'live'),
    cles: new Set(lignes.map((l) => l.cle)),
  }
}

// ─── Guide ──────────────────────────────────────────────────────────────────

/**
 * Programmes en cours d'un lot de chaînes, demandés au serveur en UN appel de
 * grille (voir `lib/chaines-guide`). Sans réponse, les cartes s'affichent sans
 * programme : l'accueil ne dépend jamais du guide pour se peindre.
 */
async function programmesEnCours(chaines: EntreeCatalogue[]): Promise<Map<string, ProgrammeCourant>> {
  try {
    return await programmesDuMoment(chaines)
  } catch {
    return new Map()
  }
}

async function chainesFavorites(): Promise<ChaineFavorite[]> {
  const { chaines } = await favorisTries()
  if (chaines.length === 0) return []
  const [programmes, cats] = await Promise.all([programmesEnCours(chaines), nomsCategories(chaines)])
  return chaines.map((entree) => ({
    entree,
    sousTitre: sousTitreChaine(entree, cats),
    programme: programmes.get(entree.cle),
  }))
}

/**
 * Les chaînes rouvertes récemment. Une chaîne du direct ne laisse aucune trace
 * ailleurs sur cet écran : elle n'a pas de position de reprise comme un film,
 * et elle ne figure dans les favorites que si on l'a marquée. Or le brief
 * rappelle que le zapping réel porte sur très peu de chaînes — les retrouver
 * sans les chercher est le gain le plus direct de l'accueil.
 */
async function chainesRecentes(): Promise<ChaineFavorite[]> {
  const lignes = await db.historique.orderBy('ouvertLe').reverse().limit(40).toArray()
  const entrees = await db.catalogue.bulkGet(lignes.map((l) => l.cle))
  const chaines = entrees.filter(
    (e): e is EntreeCatalogue => e !== undefined && e.type === 'live',
  )
  // Doublons possibles : la même chaîne rouverte plusieurs fois.
  const vues = new Set<string>()
  const uniques = chaines.filter((e) => !vues.has(e.cle) && vues.add(e.cle)).slice(0, 12)
  if (uniques.length === 0) return []
  const [programmes, cats] = await Promise.all([
    programmesEnCours(uniques),
    nomsCategories(uniques),
  ])
  return uniques.map((entree) => ({
    entree,
    sousTitre: sousTitreChaine(entree, cats),
    programme: programmes.get(entree.cle),
  }))
}

/**
 * « En direct maintenant » n'a de sens que pour les chaînes dont on connaît le
 * programme : on part donc du guide, pas du catalogue. Les favorites et les
 * chaînes déjà ouvertes passent devant, le reste suit l'ordre du fournisseur,
 * qui place les généralistes en tête.
 */
async function enDirectMaintenant(): Promise<Direct[]> {
  const avecGuide = await chainesAvecGuide()
  if (avecGuide.length === 0) return []
  const prioritaires = new Set<string>()
  for (const f of await db.favoris.toArray()) prioritaires.add(f.cle)
  for (const h of await db.historique.orderBy('ouvertLe').reverse().limit(40).toArray()) prioritaires.add(h.cle)

  const entrees = avecGuide
    .filter((c) => !DOUBLON_TECHNIQUE.test(c.nom))
    .sort((a, b) => Number(prioritaires.has(b.cle)) - Number(prioritaires.has(a.cle)))
    .slice(0, CANDIDATS_DIRECT)
  const programmes = await programmesEnCours(entrees)
  return entrees
    .flatMap((entree) => {
      const programme = programmes.get(entree.cle)
      return programme ? [{ entree, programme }] : []
    })
    .slice(0, LIMITE_DIRECT)
}

// ─── Recommandation ─────────────────────────────────────────────────────────

/**
 * « Parce que vous avez regardé… » s'appuie sur le dernier film ou la dernière
 * série vus. Sans genre ni popularité dans le catalogue local, le voisinage
 * disponible est la catégorie du fournisseur — qui EST un genre chez lui
 * (« VOD - CRIME-THRILLER [FR] »). C'est donc elle qui sert de proximité.
 */
async function parceQue(): Promise<Similaires | undefined> {
  const lignes = await db.historique.orderBy('ouvertLe').reverse().limit(60).toArray()
  const entrees = await db.catalogue.bulkGet(lignes.map((l) => l.cle))
  // Les catégories « nouveautés » ne disent rien d'un goût : s'en servir
  // recopierait mot pour mot la rangée « récemment ajoutés » juste au-dessus.
  const sansGenre = new Set([
    ...(await categoriesNouveautes('vod')),
    ...(await categoriesNouveautes('series')),
  ])
  const reference = entrees.find(
    (e): e is EntreeCatalogue =>
      e !== undefined && e.type !== 'live' && !!e.categorie && !sansGenre.has(e.categorie),
  )
  if (!reference) return undefined
  const cles = (await db.catalogue
    .where('[type+categorie]')
    .equals([reference.type, reference.categorie!])
    .primaryKeys()) as string[]
  const voisines = cles.filter((c) => c !== reference.cle)
  if (voisines.length === 0) return undefined
  const proches = recentsDabord(
    (await db.catalogue.bulkGet(voisines)).filter((e): e is EntreeCatalogue => e !== undefined),
  ).slice(0, LIMITE_SIMILAIRES)
  return { reference: titreCourt(reference.nom), affiches: versAffiche(proches, false) }
}

/** Cinq contenus récents en alternant films et séries, comme la maquette.
 *  Les deux listes sont celles des rangées « récemment ajoutés » juste en
 *  dessous — mêmes clés de cache, donc une seule lecture pour les deux. */
async function alaUne(): Promise<EntreeCatalogue[]> {
  const [films, series] = await Promise.all([
    recentsPartages('vod'),
    recentsPartages('series'),
  ])
  const melange: EntreeCatalogue[] = []
  for (let i = 0; i < NB_A_LA_UNE; i++) {
    const f = films[i]
    const s = series[i]
    if (f) melange.push(f)
    if (s) melange.push(s)
  }
  return melange.slice(0, NB_A_LA_UNE)
}

// ─── Gabarit responsive ─────────────────────────────────────────────────────

interface Mesures {
  padding: string
  ecartSections: string
  ecartCartes: number
  affiche: number
  reprise: number
  chaine: number
  direct: number
}

const BUREAU: Mesures = { padding: '24px 32px 64px', ecartSections: '32px', ecartCartes: 14, affiche: 156, reprise: 304, chaine: 280, direct: 272 }
const TABLETTE: Mesures = { padding: '20px 20px 56px', ecartSections: '24px', ecartCartes: 14, affiche: 136, reprise: 272, chaine: 280, direct: 272 }
const MOBILE: Mesures = { padding: '12px 12px 40px', ecartSections: '24px', ecartCartes: 10, affiche: 116, reprise: 240, chaine: 240, direct: 232 }

// Le gabarit vient du signal partagé de la coque : une seule définition des
// seuils (1100 / 700), donc l'Accueil ne peut pas basculer à une autre largeur
// que la barre latérale ou les @media.
const MESURES = { bureau: BUREAU, tablette: TABLETTE, mobile: MOBILE } as const
const mesures = () => MESURES[gabaritCoque()]

export default function Accueil(props: {
  surOuvrir: (e: EntreeCatalogue) => void
  /** "Voir les details" de l'encart : la fiche d'un film avant de le lire. */
  surDetails?: (e: EntreeCatalogue) => void
  surRechercher: (requete: string) => void
}) {
  const [menu, poserMenu] = createSignal<{ entree: EntreeCatalogue; cleReprise?: string; x: number; y: number } | null>(null)

  // Neuf rangées, neuf clés de cache. Celles qui décrivent un GESTE sont
  // périmées par le geste lui-même (`lib/preferences.ts`), celles qui décrivent
  // le catalogue ne bougent qu'à l'import, et « En direct maintenant » suit
  // l'horloge. L'Accueil ne relit donc plus rien de lui-même.
  const [lesReprises] = requete(cles.aReprendre, aReprendre, { fraicheur: FRAICHEUR.geste })
  const [lesFavoris] = requete(cles.favorisTries, favorisTries, { fraicheur: FRAICHEUR.geste })
  const [lesChaines] = requete(cles.chainesFavorites, chainesFavorites, { fraicheur: FRAICHEUR.geste })
  const [lesRecentes] = requete(cles.chainesRecentes, chainesRecentes, { fraicheur: FRAICHEUR.geste })
  const [leDirect] = requete(cles.epgEnDirect, enDirectMaintenant, { fraicheur: FRAICHEUR.horloge })
  const [lesFilms] = requete(cles.recents('vod', LIMITE_AFFICHES), () => recemmentAjoutes('vod', LIMITE_AFFICHES))
  const [lesSeries] = requete(cles.recents('series', LIMITE_AFFICHES), () => recemmentAjoutes('series', LIMITE_AFFICHES))
  const [lesSimilaires] = requete(cles.recommandation, parceQue)
  const [laUne] = requete(cles.aLaUne, alaUne)
  // US-43 CA3 : « À voir », les prets d'abord puis l'ordre de la liste ; perimee
  // au geste et a chaque relecture de l'etat de preparation.
  const [laListeAVoir] = requete(cles.aVoirAccueil, listeAVoirAccueil, { fraicheur: FRAICHEUR.geste })

  // Le badge « / » du champ de recherche vit désormais dans l'en-tête ; le
  // raccourci, lui, reste transverse (dossier, section 2).
  function auClavier(e: KeyboardEvent) {
    // L'écran reste monté quand on le quitte : sans ce garde-fou, « / » tapé
    // depuis Direct basculerait sur la recherche parce que l'Accueil écoute
    // encore la fenêtre.
    if (ecran() !== 'accueil') return
    const c = e.target as HTMLElement | null
    if (e.key !== '/') return
    if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) return
    e.preventDefault()
    props.surRechercher('')
  }
  onMount(() => {
    window.addEventListener('keydown', auClavier)
  })
  onCleanup(() => {
    window.removeEventListener('keydown', auClavier)
  })

  const estFavori = (cle: string) => lesFavoris()?.cles.has(cle) ?? false

  // Plus de relecture à demander : `basculerFavori` périme la table des
  // favoris, et tout ce qui l'affiche se remet à jour — ici comme ailleurs.
  async function basculer(e: EntreeCatalogue) {
    await basculerFavori(e.cle)
  }

  // POURQUOI `cleReprise` : la carte d'une serie en cours porte la cle de la SERIE,
  // mais la position memorisee est celle de l'EPISODE (trou vu en reel le 31/10 :
  // « marquer comme vu » et « retirer » n'agissaient sur rien).
  function entreesMenu(entree: EntreeCatalogue, cleReprise = entree.cle): EntreeMenu[] {
    const serieEnCours = entree.type === 'series' && cleReprise !== entree.cle
    return [
      { icone: 'play_arrow', libelle: 'Reprendre', action: () => props.surOuvrir(entree) },
      {
        icone: 'check_circle',
        libelle: 'Marquer comme vu',
        action: async () => {
          await marquerVu(cleReprise)
        },
      },
      {
        icone: 'delete',
        libelle: 'Retirer de la liste',
        action: async () => {
          if (serieEnCours) await oublierReprisesDeSerie(entree.cle)
          else await oublierReprise(cleReprise)
        },
      },
    ]
  }

  const affiche = (a: Affiche) => (
    <CarteAffiche
      entree={a.entree}
      meta={a.meta}
      nouveau={a.nouveau}
      favori={estFavori(a.entree.cle)}
      surOuvrir={props.surOuvrir}
      surLire={props.surOuvrir}
      surFavori={basculer}
    />
  )

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div
        style={{
          'max-width': '1560px', margin: '0 auto', padding: mesures().padding,
          display: 'flex', 'flex-direction': 'column', gap: mesures().ecartSections,
        }}
      >
        <Show
          when={(laUne()?.length ?? 0) > 0}
          fallback={
            <Show when={!laUne.loading}>
              <p style={{ margin: 0, color: 'var(--fg3)' }}>
                Rien à mettre à la une — importer le catalogue depuis les Réglages.
              </p>
            </Show>
          }
        >
          <ALaUne
            elements={laUne() ?? []}
            estFavori={estFavori}
            surOuvrir={props.surDetails ?? props.surOuvrir}
            surLire={props.surOuvrir}
            surBasculerFavori={basculer}
          />
        </Show>

        <RangeeHorizontale
          titre="À voir"
          compteur={`${laListeAVoir()?.length ?? 0} à préparer`}
          surToutVoir={() => poserEcran('a_voir')}
          elements={laListeAVoir() ?? []}
          largeurCarte={mesures().affiche}
          ecart={mesures().ecartCartes}
          gabarit={(j) => (
            <CarteAffiche
              entree={j.entree}
              meta={j.entree.type === 'series' ? resumeSerie(j.element.preparation) : libellePreparation(j.element.preparation)}
              pret={j.element.preparation?.etat === 'pret'}
              favori={estFavori(j.entree.cle)}
              // La carte ouvre la fiche ; « lecture rapide » passe par le lecteur habituel :
              // aucune adresse speciale, le serveur choisit la source (CA3).
              surOuvrir={props.surDetails ?? props.surOuvrir}
              surLire={props.surOuvrir}
              surFavori={basculer}
            />
          )}
        />

        <RangeeHorizontale
          titre="Continuer à regarder"
          compteur={`${lesReprises()?.length ?? 0} en cours`}
          elements={lesReprises() ?? []}
          largeurCarte={mesures().reprise}
          ecart={mesures().ecartCartes}
          gabarit={(r) => (
            <CarteReprise
              entree={r.entree}
              progression={r.progression}
              sousTitre={r.sousTitre}
              reste={r.reste}
              surOuvrir={props.surOuvrir}
              surMenu={(entree, p) => poserMenu({ entree, cleReprise: r.cleReprise, ...p })}
            />
          )}
        />

        <RangeeHorizontale
          titre="Chaînes récemment regardées"
          compteur={`${lesRecentes()?.length ?? 0} chaîne${(lesRecentes()?.length ?? 0) > 1 ? 's' : ''}`}
          elements={lesRecentes() ?? []}
          largeurCarte={mesures().chaine}
          ecart={mesures().ecartCartes}
          gabarit={(c) => (
            <CarteChaineFavorite entree={c.entree} sousTitre={c.sousTitre} programme={c.programme} surOuvrir={props.surOuvrir} />
          )}
        />

        <RangeeHorizontale
          titre="Mes chaînes favorites"
          compteur={`${lesChaines()?.length ?? 0} chaîne${(lesChaines()?.length ?? 0) > 1 ? 's' : ''}`}
          surToutVoir={() => poserOnglet('live')}
          elements={lesChaines() ?? []}
          largeurCarte={mesures().chaine}
          ecart={mesures().ecartCartes}
          gabarit={(c) => (
            <CarteChaineFavorite entree={c.entree} sousTitre={c.sousTitre} programme={c.programme} surOuvrir={props.surOuvrir} />
          )}
        />

        <RangeeHorizontale
          titre="En direct maintenant"
          elements={leDirect() ?? []}
          largeurCarte={mesures().direct}
          ecart={mesures().ecartCartes}
          gabarit={(d) => <CarteDirect entree={d.entree} programme={d.programme} surOuvrir={props.surOuvrir} />}
        />

        <Show when={lesFilms.loading}>
          <Chargement titre="Films récemment ajoutés" largeur={mesures().affiche} ecart={mesures().ecartCartes} />
        </Show>
        <RangeeHorizontale
          titre="Films récemment ajoutés"
          surToutVoir={() => poserOnglet('vod')}
          elements={versAffiche(lesFilms() ?? [], true)}
          largeurCarte={mesures().affiche}
          ecart={mesures().ecartCartes}
          gabarit={affiche}
        />

        <RangeeHorizontale
          titre="Séries récemment ajoutées"
          surToutVoir={() => poserOnglet('series')}
          elements={versAffiche(lesSeries() ?? [], true)}
          largeurCarte={mesures().affiche}
          ecart={mesures().ecartCartes}
          gabarit={affiche}
        />

        <RangeeHorizontale
          titre={`Parce que vous avez regardé « ${lesSimilaires()?.reference ?? ''} »`}
          elements={lesSimilaires()?.affiches ?? []}
          largeurCarte={mesures().affiche}
          ecart={mesures().ecartCartes}
          gabarit={affiche}
        />

        <RangeeHorizontale
          titre="Films et séries favoris"
          compteur={String(lesFavoris()?.medias.length ?? 0)}
          elements={versAffiche(lesFavoris()?.medias ?? [], false)}
          largeurCarte={mesures().affiche}
          ecart={mesures().ecartCartes}
          gabarit={affiche}
        />
      </div>

      <Show when={menu()}>
        {(m) => (
          <MenuContextuel
            x={m().x}
            y={m().y}
            entrees={entreesMenu(m().entree, m().cleReprise)}
            surFermer={() => poserMenu(null)}
          />
        )}
      </Show>
    </div>
  )
}

/** Squelette de rangée : le dossier impose un repère visible pendant l'attente. */
function Chargement(props: { titre: string; largeur: number; ecart: number }) {
  return (
    <section style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'min-width': 0 }} aria-busy="true">
      <h2 style={{ margin: 0, 'font-family': 'var(--moov-font-heading)', 'font-size': '18px', 'line-height': '24px', 'font-weight': 'var(--w-strong)' }}>
        {props.titre}
      </h2>
      <div style={{ display: 'flex', gap: `${props.ecart}px`, padding: '4px 2px 8px', overflow: 'hidden' }}>
        <For each={Array.from({ length: 9 })}>
          {() => (
            <div style={{ width: `${props.largeur}px`, flex: 'none' }}>
              <SqueletteAffiche />
            </div>
          )}
        </For>
      </div>
    </section>
  )
}
