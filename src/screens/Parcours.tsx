import { Show, createEffect, createSignal, onCleanup } from 'solid-js'
import Couche from '../components/Couche'
import GrilleCartes from '../components/GrilleCartes'
import ListeVirtuelle from '../components/ListeVirtuelle'
import PanneauCoulissant from '../components/PanneauCoulissant'
import Icone from '../components/Icone'
import LigneChaine, { colonnesChaine, HAUTEUR_CHAINE } from '../components/LigneChaine'
import { memoriserDefilement } from '../components/memoireDefilement'
import type { EntreeCatalogue, TypeContenu } from '../lib/db'
import { estMobile, estTablette } from '../lib/gabarit'
import { ecran, onglet, poserOnglet, poserEcran, LIBELLE_ONGLET } from '../etat'
import BarreOutilsDirect, { type ModeDirect } from './parcours/BarreOutilsDirect'
import ColonneCategories from './parcours/ColonneCategories'
import EcranMedia from './parcours/EcranMedia'
import { NOM_PAYS, creerColonneCategories } from './parcours/categories'
import { creerListeChaines } from './parcours/chaines'
import { FORMAT } from './parcours/format'
import { VideChaines } from './parcours/Vide'

// Parcours, version 2 — l'ASSEMBLAGE de deux vues d'un même écran.
//
// Direct garde son arborescence « catégorie → liste » : une chaîne se reconnaît
// à un numéro et à un nom, et ses 358 catégories sont une vraie taxonomie de
// pays (voir `parcours/categories.ts`). Le dossier de conception y ajoute trois
// modes d'affichage, une recherche de catégorie et des épingles persistées.
//
// Films et Séries l'ont perdue : ils se filtrent par facettes (voir
// `parcours/EcranMedia.tsx`).
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html » : colonne
// 276 px, barre d'outils 56 px, en-tête de colonnes 30 px, ligne de chaîne
// 56 px.
//
// Déclinaisons (cahier des charges, section 6) : tablette, colonne de 236 px ;
// mobile, la colonne devient un PANNEAU COULISSANT ouvert par le bouton de la
// barre d'outils, et la liste n'a plus qu'une colonne.

export default function Parcours(props: { surOuvrir: (e: EntreeCatalogue) => void }) {
  const [filtre, poserFiltre] = createSignal('')
  const [mode, poserMode] = createSignal<ModeDirect>('liste')
  const [maintenant, poserMaintenant] = createSignal(Date.now())

  const colonne = creerColonneCategories()
  const chaines = creerListeChaines({ categorieActive: colonne.categorieActive, filtre })

  // L'horloge ne bat que sur Direct : le surlignage « en cours » et les jauges
  // n'existent nulle part ailleurs, et un minuteur qui tourne sous Films ne
  // ferait que réveiller le fil principal pour rien.
  // L'écran reste monté quand on le quitte : la condition porte donc aussi sur
  // ce qui est AFFICHÉ, sinon le minuteur réveillerait le fil principal pendant
  // qu'on est sur l'Accueil. Au retour, l'heure est reprise immédiatement —
  // trente secondes de surlignage faux seraient visibles.
  createEffect(() => {
    if (onglet() !== 'live' || ecran() !== 'parcours') return
    poserMaintenant(Date.now())
    const t = setInterval(() => poserMaintenant(Date.now()), 30_000)
    onCleanup(() => clearInterval(t))
  })

  function choisirOnglet(t: TypeContenu) {
    poserOnglet(t)
    poserFiltre('')
  }

  const [panneau, poserPanneau] = createSignal(false)

  // Quitter Direct ou changer de gabarit referme le panneau : monté mais hors
  // champ, il rouvrirait tout seul au retour.
  createEffect(() => {
    if (onglet() !== 'live' || ecran() !== 'parcours' || !estMobile()) poserPanneau(false)
  })

  function choisirCategorie(id: string) {
    colonne.poserCategorieActive(id)
    poserFiltre('')
    // Choisir une catégorie est le but de l'ouverture : on referme.
    poserPanneau(false)
  }

  function choisirMode(cle: string) {
    // « Guide TV » n'est pas un troisième rendu de cette liste : le dossier en
    // fait un raccourci vers l'écran Guide, qui a déjà sa grille et son worker
    // XMLTV. En monter une seconde copie ici ferait tourner deux imports.
    if (cle === 'guide') poserEcran('guide')
    else poserMode(cle as ModeDirect)
  }

  const titreDirect = () => {
    const f = colonne.ficheActive()
    if (!f) return LIBELLE_ONGLET.live
    if (!f.pays) return f.libelle
    return `${NOM_PAYS[f.pays] ?? f.pays} · ${f.libelle}`
  }

  const compteChaines = () => {
    const total = (chaines.chaines() ?? []).length
    const vus = chaines.filtrees().length
    const pluriel = vus > 1 ? 's' : ''
    return vus === total
      ? `${FORMAT.format(total)} chaîne${pluriel}`
      : `${FORMAT.format(vus)} chaîne${pluriel} sur ${FORMAT.format(total)}`
  }

  /** Une vue par catégorie ET par mode, comme l'exigent les règles. */
  const cleVue = () => {
    const id = colonne.categorieActive()
    return id ? `live:${mode()}:${id}` : null
  }

  const [zoneListe, poserZoneListe] = createSignal<HTMLDivElement | null>(null)
  memoriserDefilement({
    hote: zoneListe,
    cle: () => (mode() === 'liste' ? cleVue() : null),
    pret: () => chaines.filtrees().length > 0,
  })

  return (
    // Direct d'un côté, Films/Séries de l'autre : deux VUES d'un même écran, et
    // non deux écrans. Chacune reste montée dès sa première visite — basculer
    // entre les onglets du rail ne reconstruit donc plus ni la liste des
    // chaînes ni la grille d'affiches.
    <div style={{ position: 'relative', height: '100%', 'min-height': '0', 'min-width': '0' }}>
      <Couche visible={onglet() === 'live'}>
        <div
          style={{
            // Un enfant de grille par piste : mobile n'en a plus qu'un (la
            // colonne est dans le panneau), tablette et bureau en ont deux.
            display: 'grid',
            'grid-template-columns': estMobile()
              ? 'minmax(0, 1fr)'
              : `${estTablette() ? 236 : 276}px minmax(0, 1fr)`,
            height: '100%',
            'min-height': '0',
            position: 'relative',
            // Le panneau fermé est repoussé hors de la zone : seul le mobile en a.
            overflow: estMobile() ? 'hidden' : undefined,
          }}
        >
          <Show
            when={estMobile()}
            fallback={
              <ColonneCategories
                etat={colonne}
                surOnglet={choisirOnglet}
                surCategorie={choisirCategorie}
              />
            }
          >
            <PanneauCoulissant ouvert={panneau()} surFermer={() => poserPanneau(false)} etiquette="Catégories">
              <div style={{ position: 'relative', padding: '12px 12px 0', 'flex': 'none' }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: '22px', top: '26px',
                    display: 'flex', color: 'var(--fg3)', 'pointer-events': 'none',
                  }}
                >
                  <Icone nom="filter_list" taille={16} />
                </span>
                {/* Le champ « Filtrer cette liste » n'a pas sa place dans la
                    barre d'outils à 390 px : il vit ici, avec le choix de la
                    catégorie qu'il filtre. */}
                <input
                  value={filtre()}
                  onInput={(e) => poserFiltre(e.currentTarget.value)}
                  placeholder="Filtrer cette liste"
                  aria-label="Filtrer les chaînes de cette liste"
                  style={{
                    width: '100%', height: '44px', padding: '0 10px 0 32px',
                    'border-radius': 'var(--r-sm)', border: '1px solid var(--line2)',
                    'border-bottom-color': 'var(--fg3)', background: 'var(--elev)', 'font-size': '14px',
                  }}
                />
              </div>
              <ColonneCategories
                etat={colonne}
                surOnglet={choisirOnglet}
                surCategorie={choisirCategorie}
              />
            </PanneauCoulissant>
          </Show>

          <section
            style={{ display: 'flex', 'flex-direction': 'column', 'min-height': '0', 'min-width': '0' }}
          >
            <BarreOutilsDirect
              titre={titreDirect()}
              compte={compteChaines()}
              filtre={filtre()}
              surFiltre={poserFiltre}
              masquee={
                colonne.ficheActive() ? colonne.ficheActive()!.cat.masquee === 1 : undefined
              }
              surMasquer={() => {
                const f = colonne.ficheActive()
                if (f) void colonne.basculerMasquage(f)
              }}
              mode={mode()}
              surMode={choisirMode}
              surCategories={() => poserPanneau(true)}
            />

            <Show
              when={mode() === 'liste'}
              fallback={
                <GrilleCartes
                  elements={chaines.filtrees()}
                  surOuvrir={props.surOuvrir}
                  programme={chaines.programmeDe}
                  maintenant={maintenant()}
                  cleVue={cleVue() ?? undefined}
                  vide={<VideChaines filtre={filtre()} />}
                />
              }
            >
              {/* Mobile : une ligne n'a plus de colonnes à titrer. */}
              <Show when={!estMobile()}>
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': colonnesChaine(),
                  gap: '12px',
                  'align-items': 'center',
                  height: '30px',
                  padding: estTablette() ? '0 16px' : '0 20px',
                  'border-bottom': '1px solid var(--line)',
                  'font-size': '11px',
                  'line-height': '14px',
                  'font-weight': 'var(--w-strong)',
                  'letter-spacing': '.04em',
                  'text-transform': 'uppercase',
                  color: 'var(--fg3)',
                  'flex': 'none',
                }}
              >
                <span style={{ 'text-align': 'right' }}>N°</span>
                <span />
                <span>Chaîne</span>
                <span>En ce moment</span>
              </div>
              </Show>

              <div ref={poserZoneListe} style={{ flex: '1', 'min-height': '0' }}>
                <ListeVirtuelle
                  elements={chaines.filtrees()}
                  hauteurLigne={HAUTEUR_CHAINE}
                  marge={6}
                  vide={<VideChaines filtre={filtre()} />}
                  ligne={(e, i) => (
                    <LigneChaine
                      numero={i + 1}
                      entree={e}
                      programme={chaines.programmeDe(e)}
                      maintenant={maintenant()}
                      surOuvrir={() => props.surOuvrir(e)}
                    />
                  )}
                />
              </div>
            </Show>
          </section>
        </div>
      </Couche>

      <Couche visible={onglet() !== 'live'}>
        <EcranMedia surOuvrir={props.surOuvrir} />
      </Couche>
    </div>
  )
}
