import { estMobile } from '../../lib/gabarit'
import { ErrorBoundary, Show, createComputed, createMemo, createSignal, onCleanup } from 'solid-js'
import BarreFiltres from '../../components/BarreFiltres'
import Diagnostic from '../../components/Diagnostic'
import GrilleAffiches from '../../components/GrilleAffiches'
import Icone from '../../components/Icone'
import { LIBELLE_ONGLET, onglet } from '../../etat'
import {
  CRITERES_VIDES, construireIndex, estNouveaute, filtrer, nombreDeFiltres, preparerTriTitre,
  type Criteres,
} from '../../lib/facettes'
import { db, type EntreeCatalogue, type TypeContenu } from '../../lib/db'
import { FRAICHEUR, cles, requete, requeteClefee } from '../../lib/requetes'
import { categoriesPartagees } from './categories'
import { FORMAT } from './format'

// Films et Séries : plus de colonne, une barre de filtres au-dessus de la
// grille d'affiches.
//
// Le dossier de conception déclare l'arborescence « catégorie → liste »
// SUPPRIMÉE ici : les 143 catégories de films et les 98 de séries ne sont plus
// un chemin de navigation, elles ne sont que la matière première d'où
// `lib/facettes` extrait genre, langue, pays et service. L'année vient du
// titre, la date d'ajout et la note viennent du relais.

/** Règle de comportement imposée : changer un filtre remet la grille en haut
 *  et montre un squelette le temps que l'œil accepte le remplacement. */
const DUREE_SQUELETTE = 320

const ANNEE_TITRE = /\s*\((19|20)\d{2}\)\s*/
const AJOUT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

/** Ensemble vide partagé : un `new Set()` par filtrage ferait du bruit dans le
 *  tas pour une valeur qui n'est jamais lue. */
const AUCUNE_CLE: Set<string> = new Set()

export default function EcranMedia(props: { surOuvrir: (e: EntreeCatalogue) => void }) {
  // La vue reste montée pendant qu'on parcourt Direct : sans mémoire du dernier
  // onglet média, son index se reconstruirait sur le catalogue des 21 791
  // chaînes, qui n'a rien à faire dans une grille d'affiches.
  // `createComputed` : la valeur doit précéder la ressource ci-dessous.
  const [typeRetenu, poserTypeRetenu] = createSignal<Exclude<TypeContenu, 'live'>>('vod')
  createComputed(() => {
    const t = onglet()
    if (t !== 'live') poserTypeRetenu(t)
  })
  const type = typeRetenu

  const [criteres, poserCriteres] = createSignal<Record<string, Criteres>>({
    vod: { ...CRITERES_VIDES },
    series: { ...CRITERES_VIDES },
  })
  const [squelette, poserSquelette] = createSignal(false)
  const [generation, poserGeneration] = createSignal(0)

  // LE RÉSIDU DE L'ÉTAPE 1, ET LA RAISON DE CELLE-CI. Cette lecture était
  // clefée sur le type de contenu : basculer Films → Séries la relançait, donc
  // `index.loading` repassait à vrai, donc le `Show` plus bas démontait la
  // grille — 1 427 nœuds reconstruits à chaque aller-retour, mesurés. Avec une
  // clé par type dans un cache partagé, la seconde bascule rend l'index déjà
  // construit DANS LE MÊME RENDU : il n'y a plus d'état de chargement à
  // traverser, donc plus rien à démonter.
  //
  // Les deux index restent en mémoire (107 204 films et 25 111 séries), ce qui
  // est le prix assumé : les tableaux typés d'ordre de tri valent 4 octets par
  // entrée, et les entrées elles-mêmes sont partagées avec le reste du cache.
  //
  // `propager` : une erreur de lecture doit atteindre l'`ErrorBoundary` qui
  // affiche le diagnostic « Lecture du catalogue », comme le faisait la lecture
  // d'une ressource Solid en échec.
  const [index, { refetch: rechargerIndex }] = requeteClefee(
    (t: Exclude<TypeContenu, 'live'>) => cles.index(t),
    type,
    async (t) => {
      const [entrees, categories] = await Promise.all([
        db.catalogue.where('type').equals(t).toArray(),
        categoriesPartagees(t),
      ])
      const idx = construireIndex(entrees, categories)
      preparerTriTitre(idx)
      return idx
    },
    { propager: true },
  )

  // Les deux bascules qui ne tiennent pas dans l'index : elles dépendent de ce
  // que l'utilisateur a fait, pas de ce que le fournisseur a nommé. Périmées à
  // chaque geste, donc toujours justes — y compris quand l'étoile a été cochée
  // depuis le lecteur ou depuis une autre machine.
  const [favoris] = requete(
    cles.favorisCles,
    async () => new Set((await db.favoris.toArray()).map((f) => f.cle)),
    { fraicheur: FRAICHEUR.geste },
  )
  const [reprises] = requete(
    cles.reprisesCles,
    async () => new Set((await db.reprises.toArray()).map((r) => r.cle)),
    { fraicheur: FRAICHEUR.geste },
  )

  const critereActif = () => criteres()[type()] ?? CRITERES_VIDES

  let minuteur: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(minuteur))

  function appliquer(c: Criteres) {
    const t = type()
    poserCriteres((m) => ({ ...m, [t]: c }))
    // Règle de comportement : la grille repart du haut et montre un squelette
    // 320 ms. Le compteur de génération sert aussi de clé de défilement.
    poserGeneration((n) => n + 1)
    poserSquelette(true)
    clearTimeout(minuteur)
    minuteur = setTimeout(() => poserSquelette(false), DUREE_SQUELETTE)
  }

  const resultats = createMemo<EntreeCatalogue[]>(() => {
    const idx = index()
    if (!idx) return []
    // Le budget est explicite — 107 159 films filtrés sans bloquer le rendu —
    // donc il est mesuré en place plutôt que supposé : la trace reste lisible
    // dans l'onglet « Performance » du navigateur.
    const debut = performance.now()
    // Les deux ensembles ne sont LUS que si le filtre les demande : sans ce
    // garde-fou, cocher une étoile dans le lecteur périmerait les favoris,
    // donc relancerait un filtrage des 107 204 films — pendant la lecture, et
    // pour un résultat identique neuf fois sur dix.
    const c = critereActif()
    const out = filtrer(
      idx,
      c,
      c.favoris ? (favoris() ?? AUCUNE_CLE) : AUCUNE_CLE,
      c.enCours ? (reprises() ?? AUCUNE_CLE) : AUCUNE_CLE,
    )
    performance.measure('mytv:filtrage', { start: debut, end: performance.now() })
    return out
  })

  const total = () => index()?.entrees.length ?? 0
  const unite = () => (type() === 'vod' ? 'film' : 'série')

  const compte = () => {
    const vus = resultats().length
    const pluriel = vus > 1 ? 's' : ''
    return vus === total()
      ? `${FORMAT.format(vus)} ${unite()}${pluriel}`
      : `${FORMAT.format(vus)} ${unite()}${pluriel} sur ${FORMAT.format(total())}`
  }

  // Le titre porte déjà l'année entre parenthèses : la répéter sous l'affiche
  // ferait doublon, la déplacer en métadonnée suit la carte de la maquette.
  const titreCarte = (e: EntreeCatalogue) => e.nom.replace(ANNEE_TITRE, ' ').trim() || e.nom
  const legende = (e: EntreeCatalogue) => {
    const an = ANNEE_TITRE.exec(e.nom)
    return [an ? an[0].trim().slice(1, 5) : '', (e.extension ?? '').toUpperCase()]
      .filter(Boolean)
      .join(' · ')
  }
  // La date d'ajout mérite d'être lisible mais pas de manger la légende : sous
  // une affiche de 155 px, « Ajouté le 11 oct. 2026 » ne tient pas sans couper
  // l'année et le format. Elle passe donc en infobulle.
  const infobulle = (e: EntreeCatalogue) =>
    e.ajouteLe !== undefined ? `${e.nom} — ajouté le ${AJOUT.format(e.ajouteLe)}` : e.nom

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': '0' }}>
      <BarreFiltres
        titre={LIBELLE_ONGLET[type()]}
        compte={index.loading ? 'Chargement…' : compte()}
        vocabulaire={index()?.vocabulaire ?? { genres: [], langues: [], pays: [], services: [], annees: [] }}
        criteres={critereActif()}
        sonLisible={type() === 'vod'}
        nbResultats={resultats().length}
        surCriteres={appliquer}
        surEffacerTout={() => appliquer({ ...CRITERES_VIDES, tri: critereActif().tri })}
      />

      <ErrorBoundary
        fallback={(e) => <Diagnostic titre="Lecture du catalogue" erreur={e} surReessayer={rechargerIndex} />}
      >
        <Show
          when={!index.loading}
          fallback={<p class="tertiaire" style={{ padding: '16px 20px' }}>Chargement du catalogue…</p>}
        >
          <GrilleAffiches
            elements={resultats()}
            surOuvrir={props.surOuvrir}
            titre={titreCarte}
            legende={legende}
            note={(e) => (e.note !== undefined ? e.note.toFixed(1) : undefined)}
            infobulle={infobulle}
            marque={(e) => {
              const idx = index()
              return idx && estNouveaute(idx, e) ? 'Nouveau' : undefined
            }}
            chargement={squelette()}
            cleVue={type()}
            remiseAZero={generation()}
            vide={
              <Aucun
                filtre={nombreDeFiltres(critereActif()) > 0}
                surEffacer={() => appliquer({ ...CRITERES_VIDES, tri: critereActif().tri })}
              />
            }
          />
        </Show>
      </ErrorBoundary>
    </div>
  )
}

/** État vide du dossier de conception : le message nomme la cause, l'action la
 *  défait. Sans filtre posé, le catalogue est simplement vide. */
function Aucun(props: { filtre: boolean; surEffacer: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        gap: '10px',
        padding: '80px 24px',
        'text-align': 'center',
        color: 'var(--fg3)',
      }}
    >
      <Icone nom="filter_alt_off" taille={36} />
      <div style={{ 'font-family': 'var(--moov-font-heading)', 'font-size': '16px', 'font-weight': 'var(--w-strong)', color: 'var(--fg)' }}>
        Aucun résultat
      </div>
      <div style={{ 'max-width': '380px' }}>
        {props.filtre
          ? 'Aucun titre ne correspond à tous ces filtres. Retirez-en un ou effacez-les.'
          : 'Importez le catalogue depuis les Réglages pour parcourir les films et les séries.'}
      </div>
      <Show when={props.filtre}>
        <button
          onClick={props.surEffacer}
          style={{
            'margin-top': '6px',
            height: estMobile() ? '44px' : '32px',
            padding: '0 14px',
            'border-radius': 'var(--r-btn-sm)',
            border: '1px solid var(--line2)',
            color: 'var(--fg)',
            'font-weight': 'var(--w-strong)',
          }}
        >
          Effacer les filtres
        </button>
      </Show>
    </div>
  )
}
