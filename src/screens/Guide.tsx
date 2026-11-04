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
import { debutDemiHeureLocale, epg, programmeEnCours, type Programme } from '../lib/epg'
import { chainesAvecGuide } from '../lib/chaines-guide'
import { idServeurDe } from '../lib/source-lecture'
import { ErreurLecteur } from '../lib/errors'
import { cles, requete } from '../lib/requetes'
import { ecran } from '../etat'
import { estBureau, estMobile } from '../lib/gabarit'

// Grille EPG : lignes = chaînes (virtualisées), colonnes = temps.
//
// Choix d'architecture — le serveur détient le guide, l'interface ne demande que
// ce qu'elle montre. Les lignes visibles s'inscrivent (virtualisation), puis UN
// appel `/epg/grille` — débouncé, par blocs de temps alignés et mis en cache
// (`lib/epg`) — sert tout le lot : jamais un appel par chaîne visible, et faire
// glisser la fenêtre ne redemande que les blocs qu'on n'a pas encore. Le XMLTV
// complet (61 Mo, parsé dans un worker) a disparu.
//
// Heures : le serveur parle UTC, l'affichage est en heure locale du navigateur
// (Intl sans fuseau imposé), et les graduations tombent sur les demi-heures
// LOCALES, y compris sur un fuseau décalé de 30 ou 45 minutes.

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

interface Ligne {
  /** Identifiant API de la chaîne : la clé de la grille. */
  id: string
  entree: EntreeCatalogue
}

export default function Guide(props: {
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  const [maintenant, poserMaintenant] = createSignal(Date.now())
  const [debutFenetre, poserDebutFenetre] = createSignal(debutDemiHeureLocale(Date.now() - 15 * MINUTE))
  const [largeur, poserLargeur] = createSignal(0)
  const [filtre, poserFiltre] = createSignal('')
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

  // Les chaînes qui ont un guide viennent du catalogue (`epg_id`) : elles ne
  // changent qu'à l'import, et rien ici ne se revalide seul.
  const [lignes] = requete(cles.epgLignes, chargerLignes)
  const [totalLive] = requete(cles.nombre('live'), () =>
    db.catalogue.where('type').equals('live').count(),
  )

  const lignesFiltrees = createMemo(() => {
    const f = normaliser(filtre().trim())
    const liste = lignes() ?? []
    return f ? liste.filter((l) => l.entree.recherche.includes(f)) : liste
  })

  // ── Grilles des lignes visibles ────────────────────────────────────────────
  // Chaque ligne montée s'inscrit ; une requête groupée, débouncée, sert tout
  // le lot. Interroger le serveur ligne par ligne au défilement multiplierait
  // les appels pour exactement le même résultat.
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

  /** Lecture réactive : `revision` republie les grilles arrivées du serveur. */
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

    const abandon = new AbortController()
    onCleanup(() => abandon.abort())
    poserEchec(null)
    epg
      .grille(manquants, t0, t1, abandon.signal)
      .then((m) => {
        if (abandon.signal.aborted || cleCache !== cle) return
        for (const [k, v] of m) cache.set(k, v)
        poserRevision((v) => v + 1)
      })
      .catch((e: unknown) => {
        if (abandon.signal.aborted) return
        // Le guide est secondaire : l'écran le dit et reste utilisable.
        poserEchec(e instanceof ErreurLecteur ? `${e.message} — ${e.action}` : String(e))
      })
  })

  // ── Navigation temporelle ──────────────────────────────────────────────────
  function decaler(ms: number) {
    poserDebutFenetre((t) => t + ms)
  }

  function revenirMaintenant() {
    poserMaintenant(Date.now())
    poserDebutFenetre(debutDemiHeureLocale(Date.now() - 15 * MINUTE))
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
    // Demi-heures LOCALES : on repart du fuseau a chaque pas, ce qui reste juste
    // quand un changement d'heure tombe dans la fenetre.
    let t = debutDemiHeureLocale(t0)
    if (t < t0) t = debutDemiHeureLocale(t + PAS + 1)
    for (; t < t1 && out.length < 64; t = debutDemiHeureLocale(t + PAS + 1)) out.push(t)
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
    // Mesure différée par `requestAnimationFrame` : écrire la largeur dans le
    // rappel repositionne la règle pendant la même disposition, boucle que
    // WebKit remonte en `pageerror` (audit D17).
    let demande = 0
    const observateur = new ResizeObserver(() => {
      cancelAnimationFrame(demande)
      demande = requestAnimationFrame(() => poserLargeur(el.clientWidth))
    })
    observateur.observe(el)
    poserLargeur(el.clientWidth)
    onCleanup(() => {
      cancelAnimationFrame(demande)
      observateur.disconnect()
    })
  })

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
          </div>
        </Show>
      </header>

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
          <Show when={!lignes.loading} fallback="Lecture du catalogue…">
            {lignesFiltrees().length.toLocaleString('fr-FR')} chaîne(s) affichée(s) ·{' '}
            {(lignes()?.length ?? 0).toLocaleString('fr-FR')} avec guide sur{' '}
            {(totalLive() ?? 0).toLocaleString('fr-FR')} chaînes en direct
          </Show>
        </p>
      </div>

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
            <ListeVirtuelle
              elements={lignesFiltrees()}
              hauteurLigne={HAUTEUR_LIGNE}
              marge={4}
              vide={
                <p class="tertiaire" style={{ padding: '16px' }}>
                  Aucune chaîne ne correspond — ou le catalogue n'est pas importé, ou aucune chaîne n'annonce de guide.
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
  props.inscrire(props.ligne.id)

  const programmes = () => props.grille(props.ligne.id)
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

/**
 * Les chaînes affichables : celles du direct dont le catalogue annonce un guide
 * (`epg_id`). Triées par nom, comme le reste de l'interface.
 */
async function chargerLignes(): Promise<Ligne[]> {
  const entrees = await chainesAvecGuide()
  return entrees
    .map((entree): Ligne => ({ id: idServeurDe(entree), entree }))
    .sort((a, b) => a.entree.nom.localeCompare(b.entree.nom, 'fr'))
}
