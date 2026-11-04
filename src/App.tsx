import { Show, Suspense, createEffect, createSignal, lazy, on, onCleanup } from 'solid-js'
import { Navigate, Route, Router, useLocation, useNavigate, useSearchParams } from '@solidjs/router'
import type { RouteSectionProps } from '@solidjs/router'
import { profilActif, session } from './lib/auth'
import {
  LIBELLE_ONGLET, arreterLecture, quitterLecteur, barreDeployee, brancherRouteur, changerDeChaine, cleArretee, cleFiche,
  cleFicheFilm, cleLecture, ecran, episodeSuivant, filmOuvert, ouvrirDetails, poserFilmOuvert, lireEpisode, oublierContenuOuvert, onglet, ouvrir,
  ouvrirRecherche, poserEcran, poserOnglet, poserSelection, poserSerieOuverte, revenirAuLecteur, revenirEnArriere,
  selection, serieOuverte, urlEpisode,
} from './etat'
import { db } from './lib/db'
import { gabarit } from './lib/gabarit'
import { estPret } from './lib/a-voir-serveur'
import { noter } from './lib/diagnostic'
import BarreLaterale, { type ClefNav } from './components/BarreLaterale'
import BandeauAbonnement from './components/BandeauAbonnement'
import BandeauImport from './components/BandeauImport'
import Couche from './components/Couche'
import EnTete from './components/EnTete'
import PanneauSuggestions from './components/PanneauSuggestions'
import Parcours from './screens/Parcours'

const Lecture = lazy(() => import('./screens/Lecture'))
const Recherche = lazy(() => import('./components/Recherche'))
const Accueil = lazy(() => import('./screens/Accueil'))
const FicheSerie = lazy(() => import('./screens/FicheSerie'))
const FicheFilm = lazy(() => import('./screens/FicheFilm'))
const Guide = lazy(() => import('./screens/Guide'))
const Reglages = lazy(() => import('./screens/Reglages'))
const AVoir = lazy(() => import('./screens/AVoir'))

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
  return <Recherche surOuvrir={ouvrir} requeteInitiale={parametres.q ?? ''} />
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
          surLire={ouvrir}
          // On revient la OU l'on etait (l'accueil, le plus souvent) ; sans historique
          // (lien direct, rechargement), la liste des films.
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
      <Route path="/a-voir" component={() => <AVoir surOuvrir={ouvrir} surDetails={ouvrirDetails} />} />
      {/* Une adresse inconnue ne doit pas donner un écran vide. */}
      <Route path="*" component={() => <Navigate href="/" />} />
    </Router>
  )
}

function Coque(props: RouteSectionProps) {
  const emplacement = useLocation()
  const naviguer = useNavigate()
  // Branché AVANT tout rendu d'écran : `ecran()` et `onglet()` lisent le chemin.
  brancherRouteur(() => cheminInterne(emplacement.pathname), (href, options) => naviguer(href, options))

  const [calque, poserCalque] = createSignal<'lecteur' | 'profil' | null>(null)

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

  // Arrivée par un lien, un favori ou un rechargement : l'URL ne porte qu'une
  // clé, on relit l'entrée dans le catalogue.
  //
  // LE GARDE-FOU SUR LA CLÉ DÉJÀ SÉLECTIONNÉE EST ESSENTIEL : sans lui, zapper
  // relirait l'entrée, et le lecteur recevant un nouvel objet pour la même
  // chaîne rouvrirait le flux — sur un abonnement à une connexion, c'est une
  // coupure.
  createEffect(() => {
    const cle = cleLecture()
    if (!cle || selection()?.cle === cle) return
    // STUB ui-6 (contrat ui-8) : un contenu qu'on vient d'ARRETER n'est pas relu
    // pendant que l'URL /lecture/<cle> est encore la (le retour d'historique suit).
    if (cle === cleArretee()) return
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
    if (cle === 'accueil' || cle === 'guide' || cle === 'reglages' || cle === 'a_voir') poserEcran(cle)
    else poserOnglet(cle)
  }

  // L'entrée active doit survivre aux écrans qui n'en sont pas un : une fiche
  // série reste « Séries », une lecture reste l'onglet de son contenu.
  function navActive(): ClefNav | undefined {
    const e = ecran()
    if (e === 'accueil' || e === 'guide' || e === 'reglages' || e === 'a_voir') return e
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
    if (e === 'a_voir') return 'À voir'
    if (e === 'recherche') return 'Recherche'
    const s = selection()
    return s ? { live: 'Direct', vod: 'Film', series: 'Série' }[s.type] : 'Lecture'
  }

  // Quitter le lecteur ne coupe pas la lecture : seul l'arrêt explicite libère
  // la connexion. C'est ce qui rend honnêtes le point bleu de la barre et le
  // compteur « 1/1 » — ils décrivent un flux que le relais tient vraiment.
  const enLecture = () => ecran() === 'lecture'
  const surRoute = () => ECRANS_LEGERS.has(ecran())

  return (
    <div
      class="coque"
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
          profil={profil()}
          calqueForce={calque()}
          surCalque={poserCalque}
        />
        {/* En position fixe : seul le propriétaire Solid compte, pas sa place
            dans l'arbre. Il s'accroche au champ de l'en-tête par le DOM — et il
            ne compte donc pas comme une piste de la grille ci-dessus. */}
        <PanneauSuggestions surOuvrir={ouvrir} surVoirTout={ouvrirRecherche} />

        {/* Toujours present (piste `auto` : 0 px quand il est vide), pour que la
            grille garde ses trois pistes que le bandeau soit affiche ou non. */}
        <div><BandeauAbonnement /><BandeauImport /></div>

        <main style={{ position: 'relative', 'min-height': 0, 'min-width': 0, overflow: 'hidden' }}>
          {/* Les trois écrans coûteux. Chacun a sa propre frontière de
              suspension : la première ouverture du Guide ne doit pas faire
              clignoter l'Accueil déjà monté à côté. */}
          <Couche visible={ecran() === 'accueil'}>
            <Suspense fallback={<Chargement />}>
              <Accueil surOuvrir={ouvrir} surDetails={ouvrirDetails} surRechercher={ouvrirRecherche} />
            </Suspense>
          </Couche>

          <Couche visible={ecran() === 'parcours'}>
            <Parcours surOuvrir={ouvrir} />
          </Couche>

          <Couche visible={ecran() === 'guide'}>
            <Suspense fallback={<Chargement />}>
              <Guide surOuvrir={ouvrir} />
            </Suspense>
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
            <Suspense fallback={<Chargement />}>{props.children}</Suspense>
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
                <Suspense fallback={<Chargement />}>
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
                    surSuivantListe={ouvrir}
                    surChanger={changerDeChaine}
                    surFermer={arreterLecture}
                    surRetour={quitterLecteur}
                  />
                </Suspense>
              </div>
            )}
          </Show>
        </main>
      </div>
    </div>
  )
}

/** Où renvoyer une clé de lecture que le catalogue ne connaît pas : la fiche de
 *  la série de l'épisode si la reprise l'a retenue, sinon l'accueil. */
async function repliDe(cle: string): Promise<string> {
  const serie = (await db.reprises.get(cle))?.serie
  return serie ? `/serie/${serie}` : '/'
}
