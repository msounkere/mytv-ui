import { ErrorBoundary, Show, Suspense, createEffect, createSignal, lazy, on, onCleanup, onMount, type JSX } from 'solid-js'
import { Navigate, Route, Router, useLocation, useNavigate, useSearchParams } from '@solidjs/router'
import type { RouteSectionProps } from '@solidjs/router'
import { profilActif, session } from './lib/auth'
import {
  LIBELLE_ONGLET, arreterLecture, quitterLecteur, barreDeployee, brancherRouteur, changerDeChaine, cleArretee, cleFiche,
  cleFicheFilm, cleLecture, ecran, episodeSuivant, filmOuvert, ouvrirDetails, poserFilmOuvert, lireEpisode, oublierContenuOuvert, onglet, ouvrir, lire,
  ouvrirRecherche, poserEcran, poserOnglet, poserSelection, poserSerieOuverte, revenirAuLecteur, revenirEnArriere,
  selection, serieOuverte, urlEpisode, lectureEnCours,
} from './etat'
import { db } from './lib/db'
import { gabarit } from './lib/gabarit'
import { estPret } from './lib/a-voir-serveur'
import { noter } from './lib/diagnostic'
import { horsLigne } from './lib/reseau'
import { brancherNavigationClavier, focaliserActionPrincipale } from './lib/navigation-clavier'
import BarreLaterale, { type ClefNav } from './components/BarreLaterale'
import BandeauAbonnement from './components/BandeauAbonnement'
import BandeauHorsLigne from './components/BandeauHorsLigne'
import BandeauImport from './components/BandeauImport'
import Couche from './components/Couche'
import EnTete from './components/EnTete'
import PanneauSuggestions from './components/PanneauSuggestions'
import Parcours from './screens/Parcours'
import ToastHote from './components/Toast'

const Lecture = lazy(() => import('./screens/Lecture'))
const Recherche = lazy(() => import('./components/Recherche'))
const Accueil = lazy(() => import('./screens/Accueil'))
const FicheSerie = lazy(() => import('./screens/FicheSerie'))
const FicheFilm = lazy(() => import('./screens/FicheFilm'))
const Guide = lazy(() => import('./screens/Guide'))
const Reglages = lazy(() => import('./screens/Reglages'))
// Lot 10 : l'ecran « À voir » est devenu « Ma liste » (screens/MaListe.tsx).
const MaListe = lazy(() => import('./screens/MaListe'))

// Coque permanente : rail de navigation, en-tête, surface unique. Changer
// d'écran ne recharge jamais la page — le zapping doit rester sous la seconde.
//
// CE QUE LE ROUTEUR APPORTE ICI, et qui manquait : l'URL décrit l'écran, donc
// le bouton retour du navigateur fonctionne, un lien se partage et un
// rechargement retombe où l'on était. CE QU'IL NE FAIT PAS : démonter les
// écrans coûteux. Accueil, Parcours et Guide sont rendus par la coque dans des
// couches préservées (voir Couche.tsx) ; leurs routes ne déclarent qu'une URL.

/** Base servie par Caddy (`/app/`), déjà connue de Vite : pas de second réglage. */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

/**
 * Chemin tel que les routes le déclarent, c'est-à-dire SANS la base.
 * `useLocation().pathname` rend l'adresse complète — `/app/guide` et non
 * `/guide` — et la base y passerait pour le nom de l'écran.
 */
function cheminInterne(complet: string): string {
  const reste = complet.startsWith(BASE) ? complet.slice(BASE.length) : complet
  return reste || '/'
}

/** Écrans que le routeur monte et démonte lui-même : quelques nœuds chacun. */
const ECRANS_LEGERS: ReadonlySet<string> = new Set(['recherche', 'serie', 'film', 'reglages', 'a_voir'])

function Chargement() {
  return <p class="tertiaire" style={{ padding: '16px' }}>Chargement…</p>
}

/**
 * Un ecran charge a la demande qui n'a pas pu l'etre (reseau coupe avant la
 * premiere visite) : un message et « Réessayer », jamais l'ecran blanc du
 * portail (US-47 CA4, audit B bug 9). Le module n'est pas garde en echec par
 * Solid : reessayer relance vraiment l'import.
 */
function EcranIndisponible(props: { erreur: unknown; surReessayer: () => void }) {
  const message = () =>
    horsLigne()
      ? 'Écran indisponible hors ligne'
      : 'Cet écran n’a pas pu se charger'
  return (
    <div
      role="alert"
      data-role="ecran-indisponible"
      data-detail={String(props.erreur).slice(0, 200)}
      style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '10px', padding: '56px 16px', 'text-align': 'center' }}
    >
      <div style={{ 'font-size': '16px', 'font-weight': 'var(--w-strong)' }}>{message()}</div>
      <div class="tertiaire" style={{ 'font-size': '13px', 'max-width': '40ch' }}>
        {horsLigne()
          ? 'Cette partie de l’application n’a pas encore été téléchargée sur cet appareil. Elle sera disponible au retour du réseau.'
          : 'Vérifiez la liaison avec le serveur, puis réessayez.'}
      </div>
      <button
        onClick={() => props.surReessayer()}
        style={{ border: '1px solid var(--line2)', padding: '0 16px', 'min-height': '44px', 'font-weight': 'var(--w-strong)' }}
      >
        Réessayer
      </button>
      <Show when={import.meta.env.DEV}>
        <pre class="tertiaire" style={{ 'font-size': '11px' }}>{String(props.erreur)}</pre>
      </Show>
    </div>
  )
}

/** Frontiere d'erreur + suspension d'un ecran : le chargement et son echec restent locaux. */
function Ecran(props: { children: JSX.Element }) {
  return (
    <ErrorBoundary fallback={(e, reset) => <EcranIndisponible erreur={e} surReessayer={reset} />}>
      <Suspense fallback={<Chargement />}>{props.children}</Suspense>
    </ErrorBoundary>
  )
}

/**
 * Teinte stable tirée d'un nom : le même compte garde son avatar d'une session
 * à l'autre sans qu'on ait à stocker une couleur.
 */
function teinteDe(nom: string): number {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** La requête voyage dans l'URL : `?q=` est ce qui rend un résultat partageable. */
function EcranRecherche() {
  const [parametres] = useSearchParams<{ q?: string }>()
  // Un resultat s'OUVRE sur sa fiche (modele cible) ; une chaine se lit.
  return <Recherche surOuvrir={ouvrirDetails} requeteInitiale={parametres.q ?? ''} />
}

function EcranFiche() {
  // L'URL fait foi : montrer la fiche précédente pendant qu'on relit le
  // catalogue donnerait une page qui ne correspond pas à son adresse.
  const fiche = () => (serieOuverte()?.cle === cleFiche() ? serieOuverte() : null)
  return (
    <Show when={fiche()} fallback={<Chargement />}>
      {(s) => (
        <FicheSerie
          serie={s()}
          surLire={lireEpisode}
          // Retour = l'ecran precedent, comme la fiche film (audit B, bug 4).
          surRetour={() => revenirEnArriere('/')}
        />
      )}
    </Show>
  )
}

function EcranFicheFilm() {
  const fiche = () => (filmOuvert()?.cle === cleFicheFilm() ? filmOuvert() : null)
  return (
    <Show when={fiche()} fallback={<Chargement />}>
      {(f) => (
        <FicheFilm
          film={f()}
          surLire={lire}
          // On revient la OU l'on etait ; sans historique (lien direct,
          // rechargement), l'accueil.
          surRetour={() => revenirEnArriere('/')}
        />
      )}
    </Show>
  )
}

export default function App() {
  return (
    <Router base={BASE} root={Coque}>
      {/* Écrans préservés : la coque les monte et ne les démonte plus. Ces
          routes ne déclarent donc qu'un chemin — leur sortie est vide, et
          c'est voulu. */}
      <Route path="/" />
      <Route path="/direct" />
      <Route path="/films" />
      <Route path="/series" />
      <Route path="/guide" />
      {/* Le lecteur aussi est préservé, pour que la lecture survive à la
          navigation. L'identifiant du contenu est dans l'URL. */}
      <Route path="/lecture/:cle" />
      {/* Écrans légers, montés à la demande. */}
      <Route path="/recherche" component={EcranRecherche} />
      <Route path="/serie/:cle" component={EcranFiche} />
      <Route path="/film/:cle" component={EcranFicheFilm} />
      <Route path="/reglages" component={() => <Reglages />} />
      <Route path="/ma-liste" component={() => <MaListe surOuvrir={ouvrir} surDetails={ouvrirDetails} />} />
      {/* Ancien chemin de « Ma liste » : les liens gardes continuent d'ouvrir l'ecran. */}
      <Route path="/a-voir" component={() => <Navigate href="/ma-liste" />} />
      {/* Une adresse inconnue ne doit pas donner un écran vide. */}
      <Route path="*" component={() => <Navigate href="/" />} />
    </Router>
  )
}

function Coque(props: RouteSectionProps) {
  const emplacement = useLocation()
  const naviguer = useNavigate()
  // Branché AVANT tout rendu d'écran : `ecran()` et `onglet()` lisent le chemin.
  brancherRouteur(
    () => cheminInterne(emplacement.pathname),
    (href, options) => naviguer(href, options),
    () => emplacement.search,
  )

  const [calque, poserCalque] = createSignal<'lecteur' | 'profil' | null>(null)
  let zoneContenu: HTMLElement | undefined

  // Démonter la coque, c'est se déconnecter : ce qui était ouvert ne doit pas
  // attendre la session suivante pour se rouvrir de lui-même.
  onCleanup(oublierContenuOuvert)

  // L'identité montrée est celle du PROFIL actif (c'est lui qui porte les
  // favoris et l'historique), à défaut le nom du compte saisi à la connexion.
  const profil = () => {
    const nom = profilActif()?.nom.trim() || session()?.identifiant.trim() || 'Invité'
    return { nom, initiale: nom.slice(0, 1).toUpperCase(), teinte: teinteDe(nom) }
  }

  // Un calque ouvert ne survit pas au changement d'écran, d'où qu'il vienne —
  // y compris du bouton retour du navigateur, que le rail ne voit pas passer.
  createEffect(on(() => emplacement.pathname, () => poserCalque(null), { defer: true }))

  // Fleches ← → ↑ ↓ entre les cartes et les rangees de la zone de contenu (CA7).
  onMount(() => onCleanup(brancherNavigationClavier(() => zoneContenu ?? null)))

  // Une fiche s'ouvre avec le focus sur son action principale (CA7) : sans
  // cela, douze tabulations separent la telecommande de « Regarder ».
  createEffect(
    on(
      () => ecran(),
      (e) => {
        if (e !== 'film' && e !== 'serie') return
        onCleanup(focaliserActionPrincipale(() => zoneContenu ?? null))
      },
    ),
  )

  // Arrivée par un lien, un favori ou un rechargement : l'URL ne porte qu'une
  // clé, on relit l'entrée dans le catalogue.
  //
  // LE GARDE-FOU SUR LA CLÉ DÉJÀ SÉLECTIONNÉE EST ESSENTIEL : sans lui, zapper
  // relirait l'entrée, et le lecteur recevant un nouvel objet pour la même
  // chaîne rouvrirait le flux — sur un abonnement à une connexion, c'est une
  // coupure. Le second garde-fou, sur la cle qu'on vient d'ARRETER, evite la
  // meme reouverture pendant l'instant ou l'URL du lecteur est encore la.
  createEffect(() => {
    const cle = cleLecture()
    if (!cle || selection()?.cle === cle) return
    if (cle === cleArretee()) {
      // L'arret recule d'un pas dans l'historique (`revenirEnArriere`) : l'adresse
      // change a la tache suivante, pas tout de suite. Naviguer ici vers le repli
      // remplacerait l'entree courante PENDANT ce recul et l'annulerait (le
      // « Arrêter » depuis le Direct finissait sur l'accueil en CI). Le repli ne
      // sert que si, un instant plus tard, rien n'a bouge.
      const minuterie = setTimeout(() => {
        if (cleLecture() !== cle || selection()) return
        void repliDe(cle).then((chemin) => cleLecture() === cle && !selection() && naviguer(chemin, { replace: true }))
      }, 600)
      onCleanup(() => clearTimeout(minuterie))
      return
    }
    void db.catalogue.get(cle).then((e) => {
      if (cleLecture() !== cle) return
      if (e) poserSelection(e)
      // Un épisode (`iptva:77123.mkv`) n'est pas au catalogue : seule sa fiche
      // sait donner son adresse de lecture, on y renvoie plutôt que d'afficher
      // un lecteur sans source.
      else void repliDe(cle).then((chemin) => cleLecture() === cle && naviguer(chemin, { replace: true }))
    })
  })

  createEffect(() => {
    const cle = cleFicheFilm()
    if (!cle || filmOuvert()?.cle === cle) return
    void db.catalogue.get(cle).then((e) => {
      if (cleFicheFilm() !== cle) return
      if (e) poserFilmOuvert(e)
      else naviguer('/', { replace: true })
    })
  })

  createEffect(() => {
    const cle = cleFiche()
    if (!cle || serieOuverte()?.cle === cle) return
    void db.catalogue.get(cle).then((e) => {
      if (cleFiche() !== cle) return
      if (e) poserSerieOuverte(e)
      else naviguer('/', { replace: true })
    })
  })

  // Direct, Films et Séries ne sont pas des écrans distincts : ce sont les trois
  // onglets de Parcours. Le rail les présente séparément parce que c'est ainsi
  // que l'utilisateur les cherche, pas parce que le code les sépare.
  function naviguerRail(cle: ClefNav) {
    if (cle === 'recherche') {
      // Onglet « Recherche » de la barre basse : l'ecran de resultats, et le
      // champ de l'en-tete pret a recevoir la saisie.
      ouvrirRecherche('')
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.entete-recherche input')?.focus())
      return
    }
    if (cle === 'accueil' || cle === 'guide' || cle === 'reglages' || cle === 'a_voir') poserEcran(cle)
    else poserOnglet(cle)
  }

  // L'entrée active doit survivre aux écrans qui n'en sont pas un : une fiche
  // série reste « Séries », une lecture reste l'onglet de son contenu.
  function navActive(): ClefNav | undefined {
    const e = ecran()
    if (e === 'accueil' || e === 'guide' || e === 'reglages' || e === 'a_voir' || e === 'recherche') return e
    if (e === 'parcours') return onglet()
    if (e === 'serie') return 'series'
    if (e === 'film') return 'vod'
    if (e === 'lecture') return selection()?.type
    return undefined
  }

  function titre(): string {
    const e = ecran()
    if (e === 'accueil') return 'Accueil'
    if (e === 'parcours') return LIBELLE_ONGLET[onglet()]
    if (e === 'serie') return 'Séries'
    if (e === 'film') return 'Films'
    if (e === 'guide') return 'Guide'
    if (e === 'reglages') return 'Réglages'
    if (e === 'a_voir') return 'Ma liste'
    if (e === 'recherche') return 'Recherche'
    const s = selection()
    return s ? { live: 'Direct', vod: 'Film', series: 'Série' }[s.type] : 'Lecture'
  }

  // Quitter le lecteur ne coupe pas la lecture : seul l'arrêt explicite libère
  // la connexion. C'est ce qui rend honnête le point bleu de la barre — il
  // décrit un flux que le relais tient vraiment.
  const enLecture = () => ecran() === 'lecture'
  const surRoute = () => ECRANS_LEGERS.has(ecran())
  // Mini-lecteur affiche (lecture en cours hors de son ecran) : le contenu lui
  // reserve sa hauteur, sinon la derniere ligne d'une liste reste dessous (D20).
  const miniLecteur = () => lectureEnCours() !== null && !enLecture()

  return (
    <div
      class="coque"
      data-mini-lecteur={miniLecteur() ? '1' : '0'}
      // Largeur de la barre : la valeur inline n'existe qu'au bureau, où elle
      // suit le choix de l'utilisateur. Tablette et mobile la fixent en CSS,
      // car la barre n'y est plus une colonne que l'on déploie.
      style={
        gabarit() === 'bureau'
          ? { 'grid-template-columns': `${barreDeployee() ? 220 : 72}px minmax(0, 1fr)` }
          : undefined
      }
    >
      <BarreLaterale
        actif={navActive() ?? 'accueil'}
        surNaviguer={naviguerRail}
        profil={profil()}
        surProfil={() => poserCalque((c) => (c === 'profil' ? null : 'profil'))}
      />

      <div
        class="coque-contenu"
        style={{ display: 'grid', 'grid-template-rows': '52px auto minmax(0, 1fr)', 'min-width': 0, 'min-height': 0 }}
      >
        <EnTete
          titre={titre()}
          afficherRecherche
          surRechercher={ouvrirRecherche}
          surRetourLecteur={revenirAuLecteur}
          surQuitterLecteur={quitterLecteur}
          auLecteur={enLecture()}
          surReglages={() => naviguer('/reglages')}
          surNaviguer={naviguerRail}
          profil={profil()}
          calqueForce={calque()}
          surCalque={poserCalque}
        />
        {/* En position fixe : seul le propriétaire Solid compte, pas sa place
            dans l'arbre. Il s'accroche au champ de l'en-tête par le DOM — et il
            ne compte donc pas comme une piste de la grille ci-dessus. Une
            suggestion s'OUVRE (fiche d'un film ou d'une serie, lecture d'une
            chaine) : jamais une lecture depuis le champ (CA1). */}
        <PanneauSuggestions surOuvrir={ouvrirDetails} surVoirTout={ouvrirRecherche} />

        {/* Toujours present (piste `auto` : 0 px quand il est vide), pour que la
            grille garde ses trois pistes que le bandeau soit affiche ou non. */}
        <div><BandeauHorsLigne /><BandeauAbonnement /><BandeauImport /></div>

        <main ref={zoneContenu} style={{ position: 'relative', 'min-height': 0, 'min-width': 0, overflow: 'hidden' }}>
          {/* Les trois écrans coûteux. Chacun a sa propre frontière de
              suspension : la première ouverture du Guide ne doit pas faire
              clignoter l'Accueil déjà monté à côté. */}
          <Couche visible={ecran() === 'accueil'}>
            <Ecran>
              <Accueil surOuvrir={ouvrir} surDetails={ouvrirDetails} surRechercher={ouvrirRecherche} />
            </Ecran>
          </Couche>

          <Couche visible={ecran() === 'parcours'}>
            <Parcours surOuvrir={ouvrir} />
          </Couche>

          <Couche visible={ecran() === 'guide'}>
            <Ecran>
              <Guide surOuvrir={ouvrir} />
            </Ecran>
          </Couche>

          {/* Sortie du routeur. Montée dès le départ et non sous un `Show` : le
              routeur attache son contexte à cette sortie. C'est `surRoute()`
              qui la rend inerte quand aucun écran léger n'est affiché. */}
          <div
            class="couche-ecran"
            aria-hidden={!surRoute()}
            style={{
              visibility: surRoute() ? undefined : 'hidden',
              'pointer-events': surRoute() ? undefined : 'none',
              'z-index': surRoute() ? undefined : -1,
            }}
          >
            <Ecran>{props.children}</Ecran>
          </div>

          <Show when={selection()}>
            {(e) => (
              // Masqué par `visibility` et non par `display` : le lecteur
              // garde une taille réelle, donc sa liste de zapping virtualisée
              // reste mesurable et se réaffiche peuplée au retour.
              //
              // POURQUOI aussi `opacity: 0` et un décalage hors de l'écran :
              // `visibility` seul ne suffit pas partout. Constaté sur Firefox
              // (Windows, vidéo décodée en matériel) : après « Retour », le
              // lecteur entier restait peint par-dessus l'Accueil alors que les
              // styles calculés le disaient masqué. Une vidéo composée dans une
              // surface matérielle peut ignorer `visibility` ; rien n'ignore une
              // position hors de la fenêtre, et l'opacité nulle n'est pas
              // « ressuscitable » par un enfant, contrairement à `visibility`.
              <div
                class="couche-lecteur"
                aria-hidden={!enLecture()}
                style={{
                  visibility: enLecture() ? undefined : 'hidden',
                  opacity: enLecture() ? undefined : 0,
                  transform: enLecture() ? undefined : 'translateX(-200vw)',
                  'pointer-events': enLecture() ? undefined : 'none',
                  'z-index': enLecture() ? undefined : -1,
                }}
              >
                <Ecran>
                  <Lecture
                    entree={e()}
                    urlForcee={urlEpisode()}
                    suivant={
                      episodeSuivant()
                        ? {
                            titre: episodeSuivant()!.nom,
                            // Le serveur tient-il deja l'episode suivant ? Le decompte le dit (US-43 CA4).
                            pret: estPret(episodeSuivant()!.cle),
                            lire: () => {
                              const vers = episodeSuivant()!
                              // Telemetrie : identifiants seulement (US-43 CA5).
                              noter('enchainement:suivant', { de: e().cle, vers: vers.cle, pret: estPret(vers.cle) })
                              lireEpisode(vers)
                            },
                          }
                        : undefined
                    }
                    surSuivantListe={lire}
                    surChanger={changerDeChaine}
                    surFermer={arreterLecture}
                    surRetour={quitterLecteur}
                  />
                </Ecran>
              </div>
            )}
          </Show>
        </main>
      </div>
      {/* Hote unique des toasts (ui-7) : monte par la coque pour exister sur tous les ecrans. */}
      <ToastHote basPx={miniLecteur() && gabarit() === 'mobile' ? 48 : 0} />
    </div>
  )
}

/** Où renvoyer une clé de lecture que le catalogue ne connaît pas : la fiche de
 *  la série de l'épisode si la reprise l'a retenue, sinon l'accueil. */
async function repliDe(cle: string): Promise<string> {
  const serie = (await db.reprises.get(cle))?.serie
  return serie ? `/serie/${serie}` : '/'
}
