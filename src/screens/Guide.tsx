import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js'
import ListeVirtuelle from '../components/ListeVirtuelle'
import SubstitutLogo from '../components/SubstitutLogo'
import Icone from '../components/Icone'
import EtiquettePays from '../components/EtiquettePays'
import { db, normaliser, type EntreeCatalogue } from '../lib/db'
import {
  chainesGuidePartagees,
  etatGuide,
  grillesFenetre,
  programmeEnCours,
  type ChaineGuide,
  type Programme,
} from '../lib/epg'
import type { AvancementGuide, DepuisXmltv, VersXmltv } from '../lib/xmltv.worker'
import { cles, invaliderGuide, requete } from '../lib/requetes'
import { ecran } from '../etat'
import { estBureau, estMobile } from '../lib/gabarit'

// Grille EPG : lignes = chaînes (virtualisées), colonnes = temps.
//
// Choix d'architecture — le XMLTV complet est parsé une fois dans un worker et
// indexé en base, plutôt que d'appeler `get_short_epg` chaîne par chaîne pour
// les lignes visibles. Deux raisons tranchent :
//   • une grille affiche 20 lignes à la fois et défile ; le chargement à la
//     demande ferait 20 requêtes HTTP par cran de molette, sur le même relais
//     que la vidéo en cours de lecture ;
//   • `get_short_epg` ne rend que les prochains programmes d'une chaîne, donc
//     aucun défilement vers l'heure passée, qui est la moitié d'un guide.
// Une fois en base, une fenêtre de 2 h sur 25 chaînes se lit en une requête
// indexée, sous la milliseconde, et le fil principal ne parse jamais de XML.

/** Hauteur de ligne imposée par le brief. */
const HAUTEUR_LIGNE = 56
// Mobile : colonne de chaînes de 132 px et 3 px/min, mesurés sur la maquette ;
// bureau et tablette gardent la grille du bureau (la tablette la fait défiler
// au doigt). Ce sont des fonctions : le gabarit change quand on tourne l'appareil.
const largeurChaine = () => (estMobile() ? 132 : 236)
/** Largeur de l'ascenseur vertical (tokens.css) : aligne la règle sur les lignes. */
const LARGEUR_BARRE = 10
/** 6 px/min : un programme de 30 min fait 180 px, lisible sans survol. */
const pxMinute = () => (estMobile() ? 3 : 6)
/** Hauteur de la règle horaire : 44 px au doigt, car « Maintenant » y loge. */
const hauteurRegle = () => (estMobile() ? 44 : 26)
const MINUTE = 60_000
const PAS = 30 * MINUTE

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const DATE_COURTE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

interface Ligne {
  chaine: ChaineGuide
  entree: EntreeCatalogue
}

export default function Guide(props: {
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  const [maintenant, poserMaintenant] = createSignal(Date.now())
  const [debutFenetre, poserDebutFenetre] = createSignal(alignerSurPas(Date.now() - 15 * MINUTE))
  const [largeur, poserLargeur] = createSignal(0)
  const [filtre, poserFiltre] = createSignal('')
  const [avancement, poserAvancement] = createSignal<AvancementGuide | null>(null)
  const [echec, poserEchec] = createSignal<string | null>(null)

  const finFenetre = createMemo(() => debutFenetre() + (largeur() / pxMinute()) * MINUTE)

  // Le surlignage « en cours » et le trait de l'heure courante ne valent que
  // s'ils avancent : une grille figée sur l'heure du chargement ment.
  // L'écran reste monté quand on le quitte (voir Couche.tsx) : le minuteur
  // suit donc ce qui est AFFICHÉ, et reprend l'heure à l'instant du retour
  // plutôt que de laisser trente secondes de trait faux.
  createEffect(() => {
    if (ecran() !== 'guide') return
    poserMaintenant(Date.now())
    const t = setInterval(() => poserMaintenant(Date.now()), 30_000)
    onCleanup(() => clearInterval(t))
  })

  // La base du guide n'est écrite QUE par le worker XMLTV, au clic sur
  // « Charger le guide » : ces trois lectures n'ont aucune raison de se
  // revalider seules, et c'est la fin de l'import qui les périme.
  const [etat] = requete(cles.epgEtat, etatGuide)
  const [lignes] = requete(cles.epgLignes, chargerLignes)
  const [totalLive] = requete(cles.nombre('live'), () =>
    db.catalogue.where('type').equals('live').count(),
  )

  const lignesFiltrees = createMemo(() => {
    const f = normaliser(filtre().trim())
    const liste = lignes() ?? []
    return f ? liste.filter((l) => l.entree.recherche.includes(f)) : liste
  })

  // ── Chargement du guide (worker) ───────────────────────────────────────────
  let worker: Worker | undefined

  function arreterWorker() {
    worker?.terminate()
    worker = undefined
  }

  function chargerGuide() {
    if (avancement()) return
    poserEchec(null)
    poserAvancement({ etape: 'Démarrage', part: 0 })
    arreterWorker()
    worker = new Worker(new URL('../lib/xmltv.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DepuisXmltv>) => {
      const m = e.data
      if (m.type === 'avancement') return poserAvancement(m.avancement)
      // L'écran n'est plus démonté en quittant le Guide : c'est donc ici, et
      // non dans `onCleanup`, que le worker XMLTV doit rendre sa mémoire.
      arreterWorker()
      if (m.type === 'fini') {
        poserAvancement(null)
        viderCache()
        // 201 315 programmes et 4 048 chaînes viennent de remplacer les
        // précédents : l'état du guide, ses lignes, la jointure que Direct
        // utilise et les deux rangées de chaînes de l'Accueil parlaient tous de
        // la base d'avant.
        void invaliderGuide()
      } else {
        poserAvancement(null)
        poserEchec(`${m.message} — ${m.action}`)
      }
    }
    worker.postMessage({ type: 'charger' } satisfies VersXmltv)
  }

  onCleanup(arreterWorker)

  // ── Grilles des lignes visibles ────────────────────────────────────────────
  // Chaque ligne montée s'inscrit ; une requête groupée, débouncée, sert tout
  // le lot. Interroger la base ligne par ligne au défilement multiplierait les
  // transactions pour exactement le même résultat.
  const inscrites = new Map<string, number>()
  const [visibles, poserVisibles] = createSignal<string[]>([])
  let minuterie: ReturnType<typeof setTimeout> | undefined

  function publier() {
    clearTimeout(minuterie)
    minuterie = setTimeout(() => poserVisibles([...inscrites.keys()]), 60)
  }

  function inscrire(epg: string) {
    inscrites.set(epg, (inscrites.get(epg) ?? 0) + 1)
    publier()
    onCleanup(() => {
      const n = (inscrites.get(epg) ?? 1) - 1
      if (n <= 0) inscrites.delete(epg)
      else inscrites.set(epg, n)
      publier()
    })
  }

  let cache = new Map<string, Programme[]>()
  let cleCache = ''
  const [revision, poserRevision] = createSignal(0)

  function viderCache() {
    cache = new Map()
    cleCache = ''
    poserRevision((v) => v + 1)
  }

  /** Lecture réactive : `revision` republie les grilles arrivées de la base. */
  function grilleDe(epg: string): Programme[] {
    revision()
    return cache.get(epg) ?? []
  }

  createEffect(() => {
    const t0 = debutFenetre()
    const t1 = finFenetre()
    const epgs = visibles()
    if (t1 <= t0 || epgs.length === 0) return

    // Changer de fenêtre invalide tout : les cases mémorisées ne couvrent plus
    // l'intervalle affiché.
    const cle = `${t0}|${Math.round(t1)}`
    if (cle !== cleCache) {
      cleCache = cle
      cache = new Map()
    }
    const manquants = epgs.filter((e) => !cache.has(e))
    if (manquants.length === 0) return

    let annule = false
    onCleanup(() => {
      annule = true
    })
    void grillesFenetre(manquants, t0, t1).then((m) => {
      if (annule || cleCache !== cle) return
      for (const [k, v] of m) cache.set(k, v)
      poserRevision((v) => v + 1)
    })
  })

  // ── Navigation temporelle ──────────────────────────────────────────────────
  function decaler(ms: number) {
    poserDebutFenetre((t) => t + ms)
  }

  function revenirMaintenant() {
    poserMaintenant(Date.now())
    poserDebutFenetre(alignerSurPas(Date.now() - 15 * MINUTE))
  }

  function molette(e: WheelEvent) {
    // Intention horizontale seulement : le défilement vertical reste celui de
    // la liste virtualisée.
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
    if (dx === 0) return
    e.preventDefault()
    decaler((dx / pxMinute()) * MINUTE)
  }

  const graduations = createMemo(() => {
    const t0 = debutFenetre()
    const t1 = finFenetre()
    const out: number[] = []
    for (let t = Math.ceil(t0 / PAS) * PAS; t < t1 && out.length < 64; t += PAS) out.push(t)
    return out
  })

  const positionMaintenant = createMemo(() => {
    const x = ((maintenant() - debutFenetre()) / MINUTE) * pxMinute()
    return x >= 0 && x <= largeur() ? x : null
  })

  // ── Glissement au doigt (tablette, mobile) ────────────────────────────────
  // Pendant le geste, seul un décalage CSS bouge : changer la fenêtre à chaque
  // pixel viderait le cache des grilles et ferait clignoter « Aucun programme ».
  // La fenêtre n'est déplacée qu'au relâchement, du même nombre de minutes.
  let zone: HTMLDivElement | undefined
  let departX: number | null = null
  let glisseX = 0

  function poserGlisse(px: number) {
    glisseX = px
    zone?.style.setProperty('--glisse', `${px}px`)
  }
  function debutGlisse(e: PointerEvent) {
    if (e.pointerType === 'mouse') return
    departX = e.clientX
  }
  function glisse(e: PointerEvent) {
    if (departX === null) return
    poserGlisse(e.clientX - departX)
  }
  function finGlisse() {
    if (departX === null) return
    const minutes = Math.round(-glisseX / pxMinute())
    departX = null
    // Le décalage CSS et la nouvelle fenêtre s'annulent exactement : on rend
    // les deux dans la même passe pour qu'aucune image intermédiaire ne saute.
    poserGlisse(0)
    if (minutes !== 0) decaler(minutes * MINUTE)
  }

  let mesure: HTMLDivElement | undefined
  onMount(() => {
    if (!mesure) return
    const el = mesure
    const observateur = new ResizeObserver(() => poserLargeur(el.clientWidth))
    observateur.observe(el)
    poserLargeur(el.clientWidth)
    onCleanup(() => observateur.disconnect())
  })

  // Seul le marqueur de fin d'import fait foi. Compter les programmes
  // laisserait un import interrompu passer pour un guide complet : la base
  // contient alors des dizaines de milliers de programmes et aucune chaîne.
  const guideCharge = () => etat()?.complet === true
  const guideIncomplet = () => etat() !== undefined && !guideCharge() && (etat()?.programmes ?? 0) > 0

  /** Cible tactile de 44 px sur mobile (cahier des charges, §6). */
  const btn = () => ({ ...BTN, ...(estMobile() ? { 'min-height': '44px', 'flex': '0 0 auto' } : {}) })

  // Sur mobile « Maintenant » est dans la règle horaire, toujours à l'écran.
  const BoutonsNavigation = () => (
    <>
      <button onClick={() => decaler(-3 * 60 * MINUTE)} title="Reculer de 3 heures" style={btn()}>
        ⏪ 3 h
      </button>
      <button onClick={() => decaler(-PAS)} title="Reculer de 30 minutes" style={btn()}>
        ◀ 30 min
      </button>
      <Show when={!estMobile()}>
        <button onClick={revenirMaintenant} style={{ ...btn(), color: 'var(--acc-fg)', background: 'var(--acc-bg)' }}>
          Maintenant
        </button>
      </Show>
      <button onClick={() => decaler(PAS)} title="Avancer de 30 minutes" style={btn()}>
        30 min ▶
      </button>
      <button onClick={() => decaler(3 * 60 * MINUTE)} title="Avancer de 3 heures" style={btn()}>
        3 h ⏩
      </button>
      <span class="secondaire" style={{ 'margin-left': '8px', 'font-size': '13px', 'white-space': 'nowrap' }}>
        {JOUR.format(new Date(debutFenetre()))}
      </span>
    </>
  )

  return (
    // Colonne flex et non grille à pistes nommées : le bandeau d'erreur est
    // conditionnel, et une piste « 1fr » calée sur un rang fixe se décale dès
    // qu'un enfant manque — la zone de grille se retrouvait alors haute de 0 px.
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', 'min-height': 0 }}>
      <header
        style={{
          display: 'flex', 'align-items': 'center', gap: '8px', flex: '0 0 auto',
          padding: '8px 12px', 'border-bottom': '1px solid var(--line)',
          // Tablette : la barre passe à la ligne plutôt que de déborder.
          // Mobile : deux rangées, dont la seconde défile au doigt.
          'flex-wrap': estBureau() ? undefined : 'wrap',
        }}
      >
        <h2 style={{ 'margin-right': '4px' }}>Guide</h2>
        <Show when={!estMobile()}>
          <BoutonsNavigation />
        </Show>
        <input
          value={filtre()}
          onInput={(e) => poserFiltre(e.currentTarget.value)}
          placeholder="Filtrer les chaînes"
          aria-label="Filtrer les chaînes"
          style={{
            'margin-left': estMobile() ? 0 : 'auto', padding: '5px 8px', 'font-size': '13px',
            ...(estMobile()
              ? { flex: 1, 'min-width': 0, height: '44px' }
              : { width: '220px' }),
          }}
        />
        <Show when={estMobile()}>
          <div
            style={{
              display: 'flex', 'align-items': 'center', gap: '8px', flex: '1 1 100%',
              'overflow-x': 'auto', 'scrollbar-width': 'none',
            }}
          >
            <BoutonsNavigation />
            <Show when={guideCharge() && !avancement()}>
              <button onClick={chargerGuide} style={{ ...btn(), border: '1px solid var(--line2)' }}>
                Recharger le guide
              </button>
            </Show>
          </div>
        </Show>
      </header>

      {/* Mobile : une fois le guide chargé, cette rangée ne sert plus qu'à le
          recharger, et ce bouton file dans la barre de navigation — la grille
          gagne ainsi 56 px sur un écran qui n'en a que 844. */}
      <Show when={!estMobile() || !guideCharge() || !!avancement()}>
      <div
        style={{
          display: 'flex', 'align-items': 'center', gap: '10px', flex: '0 0 auto',
          padding: '6px 12px', 'border-bottom': '1px solid var(--line)',
        }}
      >
        <p
          class="tertiaire num"
          style={{
            margin: 0, 'font-size': '12px',
            ...(estBureau() ? {} : { flex: 1, 'min-width': 0, overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }),
          }}
        >
          <Show when={!lignes.loading} fallback="Lecture du guide en base…">
            {lignesFiltrees().length.toLocaleString('fr-FR')} chaîne(s) affichée(s) ·{' '}
            {(lignes()?.length ?? 0).toLocaleString('fr-FR')} avec guide sur{' '}
            {(totalLive() ?? 0).toLocaleString('fr-FR')} chaînes en direct
          </Show>
          <Show when={etat()?.chargeLe}>
            {(t) => (
              <> · guide du {DATE_COURTE.format(new Date(t()))} ·{' '}
                {(etat()?.programmes ?? 0).toLocaleString('fr-FR')} programmes</>
            )}
          </Show>
        </p>
        <Show
          when={avancement()}
          fallback={
            <button onClick={chargerGuide} style={{ ...btn(), 'margin-left': 'auto', border: '1px solid var(--line2)' }}>
              {guideCharge() ? 'Recharger le guide' : guideIncomplet() ? 'Reprendre le chargement' : 'Charger le guide'}
            </button>
          }
        >
          {(a) => (
            <span class="num secondaire" style={{ 'margin-left': 'auto', 'font-size': '12px' }}>
              {a().etape} — {Math.round(a().part * 100)} %
            </span>
          )}
        </Show>
      </div>
      </Show>

      <Show when={echec()}>
        {(m) => (
          <p
            role="alert"
            style={{
              margin: 0, padding: '8px 12px', 'font-size': '13px', flex: '0 0 auto',
              color: 'var(--err)', background: 'var(--err-bg)',
            }}
          >
            {m()}
          </p>
        )}
      </Show>

      {/* Règle horaire : même gabarit que les lignes, à l'ascenseur près. */}
      <div
        style={{
          display: 'grid', 'grid-template-rows': 'auto minmax(0, 1fr)',
          flex: '1 1 auto', 'min-height': 0,
        }}
      >
        <div
          style={{
            display: 'flex', height: `${hauteurRegle()}px`, 'border-bottom': '1px solid var(--line)',
            'padding-right': `${LARGEUR_BARRE}px`, background: 'var(--panel)',
          }}
        >
          {/* « Maintenant » vit dans le coin de la règle sur mobile : la barre
              d'en-tête défile, ce bouton-là ne doit jamais sortir de l'écran. */}
          <div style={{ width: `${largeurChaine()}px`, 'flex': '0 0 auto', display: 'flex' }}>
            <Show when={estMobile()}>
              <button
                onClick={revenirMaintenant}
                aria-label="Revenir à maintenant"
                style={{
                  flex: 1, 'min-width': 0, display: 'flex', 'align-items': 'center', gap: '6px',
                  padding: '0 10px', 'font-size': '12px', 'font-weight': 'var(--w-strong)',
                  color: 'var(--acc-fg)', 'border-radius': 0,
                }}
              >
                <Icone nom="schedule" taille={16} />
                <span class="tronque">Maintenant</span>
              </button>
            </Show>
          </div>
          <div ref={mesure} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <For each={graduations()}>
              {(t) => (
                <span
                  class="num tertiaire"
                  style={{
                    position: 'absolute', top: 0, left: `${((t - debutFenetre()) / MINUTE) * pxMinute()}px`,
                    transform: 'translateX(var(--glisse, 0px))',
                    height: '100%', 'padding-left': '5px', 'font-size': '11px',
                    'line-height': `${hauteurRegle()}px`, 'border-left': '1px solid var(--line2)',
                  }}
                >
                  {HEURE.format(new Date(t))}
                </span>
              )}
            </For>
          </div>
        </div>

        <div
          ref={zone}
          style={{
            position: 'relative', 'min-height': 0,
            // `pan-y` laisse le navigateur gérer le défilement vertical de la
            // liste ; le glissement horizontal, lui, nous revient.
            'touch-action': estBureau() ? undefined : 'pan-y',
          }}
          onWheel={molette}
          onPointerDown={debutGlisse}
          onPointerMove={glisse}
          onPointerUp={finGlisse}
          onPointerCancel={finGlisse}
        >
          <Show
            when={guideCharge()}
            fallback={
              <div style={{ padding: '24px', 'max-width': '560px' }}>
                <Show
                  when={guideIncomplet()}
                  fallback={
                    <p class="secondaire" style={{ 'margin-top': 0 }}>
                      Le guide n'est pas encore en base. Le relais publie un XMLTV de 61 Mo
                      couvrant environ deux jours ; il est téléchargé et indexé une fois,
                      hors du fil principal.
                    </p>
                  }
                >
                  <p style={{ 'margin-top': 0, color: 'var(--lim)' }}>
                    Import interrompu : la base contient{' '}
                    <span class="num">{(etat()?.programmes ?? 0).toLocaleString('fr-FR')}</span>{' '}
                    programmes mais aucune table de chaînes. L'import dure environ
                    40 s et ne survit pas à un rechargement de page.
                  </p>
                </Show>
                <button onClick={chargerGuide} style={{ ...BTN, border: '1px solid var(--line2)' }}>
                  {guideIncomplet() ? 'Reprendre le chargement' : 'Charger le guide'}
                </button>
              </div>
            }
          >
            <ListeVirtuelle
              elements={lignesFiltrees()}
              hauteurLigne={HAUTEUR_LIGNE}
              marge={4}
              vide={
                <p class="tertiaire" style={{ padding: '16px' }}>
                  Aucune chaîne ne correspond — ou le catalogue n'est pas importé.
                </p>
              }
              ligne={(l) => (
                <LigneChaine
                  ligne={l}
                  debut={debutFenetre()}
                  fin={finFenetre()}
                  maintenant={maintenant()}
                  grille={grilleDe}
                  inscrire={inscrire}
                  surOuvrir={props.surOuvrir}
                />
              )}
            />
            {/* Trait de l'heure courante, au-dessus des lignes et inerte. */}
            {/* Le trait est rogné à la zone des programmes : tiré au doigt vers la
                gauche, il passerait sinon par-dessus la colonne des chaînes. */}
            <Show when={positionMaintenant()}>
              {(x) => (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${largeurChaine()}px`, right: 0,
                    overflow: 'hidden', 'pointer-events': 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute', top: 0, bottom: 0, left: `${x()}px`, width: '2px',
                      transform: 'translateX(var(--glisse, 0px))', background: 'var(--acc)',
                    }}
                  />
                </div>
              )}
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}

function LigneChaine(props: {
  ligne: Ligne
  debut: number
  fin: number
  maintenant: number
  grille: (epg: string) => Programme[]
  inscrire: (epg: string) => void
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  // L'inscription vit le temps de la ligne montée : le lot interrogé suit
  // exactement la fenêtre visible du virtualiseur.
  props.inscrire(props.ligne.chaine.epg)

  const programmes = () => props.grille(props.ligne.chaine.epg)
  const courant = () => programmeEnCours(programmes(), props.maintenant)

  return (
    <div style={{ display: 'flex', height: '100%', 'border-bottom': '1px solid var(--line)' }}>
      <button
        onClick={() => props.surOuvrir(props.ligne.entree)}
        title={`${props.ligne.entree.nom} — ouvrir`}
        style={{
          width: `${largeurChaine()}px`, flex: '0 0 auto', display: 'flex',
          'align-items': 'center', gap: '8px', padding: '0 10px', height: '100%',
          'text-align': 'left', 'border-right': '1px solid var(--line)', 'border-radius': 0,
          // Les programmes glissent sous la colonne des chaînes, qui doit les masquer.
          ...(estBureau() ? {} : { position: 'relative', 'z-index': 2, background: 'var(--bg)' }),
        }}
      >
        <SubstitutLogo nom={props.ligne.entree.nom} src={props.ligne.entree.icone} taille={30} />
        <Show when={!estMobile()}>
          <EtiquettePays pays={props.ligne.entree.pays} />
        </Show>
        <span class="tronque" style={{ flex: 1, 'font-size': '13px' }}>{props.ligne.entree.nom}</span>
      </button>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
       <div style={{ position: 'absolute', inset: 0, transform: 'translateX(var(--glisse, 0px))' }}>
        <Show
          when={programmes().length > 0}
          fallback={
            <span class="tertiaire" style={{ 'font-size': '12px', 'line-height': `${HAUTEUR_LIGNE}px`, 'padding-left': '8px' }}>
              Aucun programme sur cette plage
            </span>
          }
        >
          <For each={programmes()}>
            {(p) => {
              const gauche = () => ((Math.max(p.debut, props.debut) - props.debut) / MINUTE) * pxMinute()
              const largeur = () =>
                ((Math.min(p.fin, props.fin) - Math.max(p.debut, props.debut)) / MINUTE) * pxMinute()
              const enCours = () => courant() === p
              const passe = () => p.fin <= props.maintenant
              return (
                <Show when={largeur() > 1}>
                  <button
                    onClick={() => props.surOuvrir(props.ligne.entree)}
                    title={`${HEURE.format(new Date(p.debut))} – ${HEURE.format(new Date(p.fin))} · ${p.titre}${p.description ? `\n\n${p.description}` : ''}`}
                    style={{
                      position: 'absolute', top: '3px', height: `${HAUTEUR_LIGNE - 7}px`,
                      left: `${gauche()}px`, width: `${Math.max(0, largeur() - 2)}px`,
                      padding: '0 8px', 'text-align': 'left', overflow: 'hidden',
                      display: 'flex', 'flex-direction': 'column', 'justify-content': 'center',
                      'border-radius': 'var(--r-sm)',
                      // Le flux contient des programmes qui se chevauchent
                      // (deux sources EPG fusionnées) : la case en cours doit
                      // rester au-dessus, sinon la mise en avant disparaît.
                      'z-index': enCours() ? 1 : 0,
                      background: enCours() ? 'var(--acc-bg)' : 'var(--elev)',
                      'box-shadow': enCours() ? 'inset 2px 0 0 var(--acc)' : 'none',
                      color: enCours() ? 'var(--acc-fg)' : passe() ? 'var(--fg3)' : 'var(--fg2)',
                      'font-weight': enCours() ? 'var(--w-strong)' : '400',
                    }}
                  >
                    <span class="tronque" style={{ width: '100%', 'font-size': '13px' }}>{p.titre}</span>
                    <span class="num tronque" style={{ width: '100%', 'font-size': '11px', opacity: 0.75 }}>
                      {HEURE.format(new Date(p.debut))} – {HEURE.format(new Date(p.fin))}
                    </span>
                  </button>
                </Show>
              )
            }}
          </For>
        </Show>
       </div>
      </div>
    </div>
  )
}

const BTN = {
  padding: '5px 10px',
  'font-size': '13px',
  'white-space': 'nowrap',
} as const

/** La fenêtre commence toujours sur une demi-heure : la règle reste lisible. */
function alignerSurPas(t: number): number {
  return Math.floor(t / PAS) * PAS
}

/**
 * Les chaînes affichables sont l'intersection de trois choses : le catalogue
 * importé, les flux porteurs d'un `epg_channel_id`, et le XMLTV qui en parle
 * vraiment. Les deux dernières sont déjà réduites par le worker.
 */
async function chargerLignes(): Promise<Ligne[]> {
  const chaines = await chainesGuidePartagees()
  if (chaines.length === 0) return []
  const entrees = await db.catalogue.bulkGet(chaines.map((c) => `live:${c.streamId}`))

  const lignes: Ligne[] = []
  for (const [i, c] of chaines.entries()) {
    const e = entrees[i]
    if (!e) continue // flux disparu du catalogue depuis le dernier import
    lignes.push({ chaine: c, entree: e })
  }
  lignes.sort((a, b) => a.entree.nom.localeCompare(b.entree.nom, 'fr'))
  return lignes
}
