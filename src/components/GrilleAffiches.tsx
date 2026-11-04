import { gabarit as gabaritEcran } from '../lib/gabarit'
import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from 'solid-js'
import ListeVirtuelle from './ListeVirtuelle'
import { memoriserDefilement } from './memoireDefilement'
import type { EntreeCatalogue } from '../lib/db'

// Films et séries ne se parcourent pas en liste de texte : la maquette les
// présente en jaquettes 2:3, parce que l'affiche est le seul repère qui
// distingue vite 107 000 titres les uns des autres.
//
// La virtualisation porte sur la RANGÉE, pas sur l'affiche : 107 159 films ne
// font que 15 309 rangées, et le virtualiseur n'a besoin que d'une hauteur de
// ligne constante — ce qu'une grille CSS fluide ne donnerait pas. Les colonnes
// sont donc calculées à la main depuis la largeur mesurée.
//
// Valeurs relevées au getComputedStyle sur « Lecteur IPTV.dc.html » (V2,
// section de 1220 px) : retrait 20 px, écart 16 px, 7 colonnes de 155 px,
// affiche de 232 px, pas de rangée 298 px.

// Retrait latéral (`gridSide`), écart (`gridGap`) et largeur minimale d'une
// affiche (`gridMin`, en deçà de laquelle la maquette retire une colonne), par
// gabarit — mesurés sur la maquette à 1440, 820 et 390 px. Le mobile impose en
// plus TROIS colonnes : à 390 px la formule du bureau n'en donnerait que deux.
const MESURES = {
  bureau: { bord: 20, ecart: 16, min: 148, colonnes: 0 },
  tablette: { bord: 20, ecart: 16, min: 136, colonnes: 0 },
  mobile: { bord: 12, ecart: 10, min: 0, colonnes: 3 },
} as const
/** Titre, métadonnées et respiration sous l'affiche, dans la formule `rh`. */
const HAUTEUR_LEGENDE = 50

interface Gabarit {
  colonnes: number
  hauteur: number
  pas: number
  bord: number
  ecart: number
}

/** Même dispersion de teintes que les plaques de logo : un titre garde sa couleur. */
function teinte(nom: string): number {
  let h = 0
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360
  return h
}

export interface GrilleAffichesProps {
  elements: EntreeCatalogue[]
  surOuvrir: (e: EntreeCatalogue) => void
  /** Titre affiché sous l'affiche, souvent allégé de ce que porte la légende. */
  titre?: (e: EntreeCatalogue) => string
  /** Ligne de métadonnées sous le titre (année, format…). */
  legende: (e: EntreeCatalogue) => string
  /** Badge posé en haut de l'affiche, « Nouveau » dans la maquette. */
  marque?: (e: EntreeCatalogue) => string | undefined
  /** Note encadrée en bout de légende, comme la carte du dossier. */
  note?: (e: EntreeCatalogue) => string | undefined
  /** Infobulle de l'affiche : ce que la légende de 155 px ne peut pas tenir. */
  infobulle?: (e: EntreeCatalogue) => string
  vide?: JSX.Element
  /** Squelette le temps que la nouvelle sélection se pose. */
  chargement?: boolean
  /** Identité de la vue dont on retient le défilement. */
  cleVue?: string
  /** Incrémenté à chaque changement de filtre : la grille repart du haut. */
  remiseAZero?: number
}

export default function GrilleAffiches(props: GrilleAffichesProps) {
  const [boite, poserBoite] = createSignal<HTMLDivElement | null>(null)
  const [largeur, poserLargeur] = createSignal(0)

  createEffect(() => {
    const el = boite()
    if (!el) return
    const mesurer = () => poserLargeur(el.clientWidth)
    // Mesure différée d'une image : écrire le signal DANS le rappel re-pose la
    // grille pendant la même disposition, boucle que WebKit remonte en
    // « ResizeObserver loop completed with undelivered notifications » (D17).
    let demande = 0
    const observateur = new ResizeObserver(() => {
      cancelAnimationFrame(demande)
      demande = requestAnimationFrame(mesurer)
    })
    observateur.observe(el)
    mesurer()
    onCleanup(() => {
      cancelAnimationFrame(demande)
      observateur.disconnect()
    })
  })

  // Mesuré dans l'application : la zone de défilement ne réserve pas de
  // gouttière (clientWidth === offsetWidth), la largeur utile est donc pleine.
  const m = () => MESURES[gabaritEcran()]
  const BORD = () => m().bord
  const ECART = () => m().ecart
  const disponible = createMemo(() => Math.max(0, largeur() - BORD() * 2))
  const colonnes = createMemo(() =>
    m().colonnes || Math.max(2, Math.floor((disponible() + ECART()) / (m().min + ECART()))),
  )
  // Largeur fractionnaire assumée, comme la maquette : arrondir à l'entier
  // laisserait jusqu'à six pixels de marge à droite de la dernière colonne.
  const largeurAffiche = createMemo(() =>
    Math.max(1, (disponible() - ECART() * (colonnes() - 1)) / colonnes()),
  )

  // Le gabarit ne porte que des entiers, et chacun passe par son propre mémo :
  // le virtualiseur est remonté à chaque nouveau gabarit, il ne doit donc pas
  // changer à chaque pixel d'un redimensionnement mais seulement quand la
  // géométrie change vraiment.
  const hauteurAffiche = createMemo(() => Math.round(largeurAffiche() * 1.5))
  const gabarit = createMemo<Gabarit>(() => {
    const h = hauteurAffiche()
    return { colonnes: colonnes(), hauteur: h, pas: h + HAUTEUR_LEGENDE + ECART(), bord: BORD(), ecart: ECART() }
  })

  const rangees = createMemo(() => {
    const n = gabarit().colonnes
    const tout = props.elements
    const out: EntreeCatalogue[][] = []
    for (let i = 0; i < tout.length; i += n) out.push(tout.slice(i, i + n))
    return out
  })

  memoriserDefilement({
    hote: boite,
    cle: () => props.cleVue ?? null,
    generation: () => props.remiseAZero ?? 0,
    pret: () => !props.chargement && largeur() > 0 && props.elements.length > 0,
  })

  return (
    <div ref={poserBoite} style={{ flex: '1', 'min-height': '0' }}>
      <Show when={largeur() > 0 && gabarit()} keyed>
        {(g) => (
          <Show when={!props.chargement} fallback={<Squelette gabarit={g} />}>
            {/* `keyed` plus haut : changer le nombre de colonnes change la
                hauteur de rangée, et le virtualiseur ne reprend pas une
                estimation de taille à chaud. */}
            <ListeVirtuelle
              elements={rangees()}
              hauteurLigne={g.pas}
              marge={3}
              vide={props.vide}
              ligne={(rangee) => (
                <div
                  style={{
                    display: 'grid',
                    'grid-template-columns': `repeat(${g.colonnes}, minmax(0, 1fr))`,
                    gap: `${g.ecart}px`,
                    padding: `${g.ecart}px ${g.bord}px 0`,
                  }}
                >
                  <For each={rangee}>
                    {(e) => (
                      <Affiche
                        entree={e}
                        hauteur={g.hauteur}
                        titre={props.titre?.(e) ?? e.nom}
                        legende={props.legende(e)}
                        marque={props.marque?.(e)}
                        note={props.note?.(e)}
                        infobulle={props.infobulle?.(e) ?? e.nom}
                        surOuvrir={() => props.surOuvrir(e)}
                      />
                    )}
                  </For>
                </div>
              )}
            />
          </Show>
        )}
      </Show>
    </div>
  )
}

/** Deux rangées d'ardoises au gabarit exact : la grille ne saute pas quand les
 *  vraies affiches prennent leur place. */
function Squelette(props: { gabarit: Gabarit }) {
  const ardoise = (h: string, l: string) => ({
    height: h, width: l, 'border-radius': 'var(--r-sm)',
    background: 'var(--elev)', animation: 'battement 1.2s ease-in-out infinite',
  })
  return (
    <div
      aria-busy="true"
      aria-label="Chargement"
      style={{
        display: 'grid',
        'grid-template-columns': `repeat(${props.gabarit.colonnes}, minmax(0, 1fr))`,
        gap: `${props.gabarit.ecart}px`,
        padding: `${props.gabarit.ecart}px ${props.gabarit.bord}px 0`,
      }}
    >
      <style>{'@keyframes battement{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
      <Index each={Array.from({ length: props.gabarit.colonnes * 2 })}>
        {() => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <div style={ardoise(`${props.gabarit.hauteur}px`, '100%')} />
            <div style={ardoise('14px', '80%')} />
            <div style={ardoise('12px', '50%')} />
          </div>
        )}
      </Index>
    </div>
  )
}

function Affiche(props: {
  entree: EntreeCatalogue
  hauteur: number
  titre: string
  legende: string
  marque?: string
  note?: string
  infobulle: string
  surOuvrir: () => void
}) {
  // Les jaquettes sont souvent absentes ou servies par un hôte muet : la
  // plaque colorée et le titre sont posés d'emblée, l'image ne vient
  // par-dessus qu'une fois réellement chargée.
  const [chargee, poserChargee] = createSignal(false)
  const [survol, poserSurvol] = createSignal(false)
  const t = createMemo(() => teinte(props.entree.nom))

  return (
    <button
      onClick={props.surOuvrir}
      onMouseEnter={() => poserSurvol(true)}
      onMouseLeave={() => poserSurvol(false)}
      onFocus={() => poserSurvol(true)}
      onBlur={() => poserSurvol(false)}
      title={props.infobulle}
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '6px',
        'min-width': '0',
        padding: '0',
        'text-align': 'left',
        background: 'transparent',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: `${props.hauteur}px`,
          'border-radius': 'var(--r-sm)',
          overflow: 'hidden',
          background: `oklch(0.34 0.07 ${t()})`,
          display: 'flex',
          'align-items': 'flex-end',
          padding: '12px',
          'box-shadow': survol()
            ? 'inset 0 0 0 1px rgba(255,255,255,.2), 0 10px 22px rgba(0,0,0,.45)'
            : 'inset 0 0 0 1px rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.28)',
          transform: survol() ? 'translateY(-3px)' : 'none',
          transition: 'transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)',
        }}
      >
        <Show when={props.entree.icone}>
          <img
            src={props.entree.icone}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => poserChargee(true)}
            onError={() => poserChargee(false)}
            style={{
              position: 'absolute',
              inset: '0',
              width: '100%',
              height: '100%',
              'object-fit': 'cover',
              opacity: chargee() ? '1' : '0',
              transition: 'opacity var(--dur) var(--ease)',
            }}
          />
        </Show>

        {/* Le titre porte la plaque tant qu'il n'y a pas de jaquette. Une fois
            l'affiche chargée, elle porte déjà son titre gravé : le répéter
            par-dessus ne produit qu'un empilement illisible. */}
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            'font-family': 'var(--moov-font-heading)',
            'font-size': '15px',
            'line-height': '19px',
            'font-weight': 'var(--w-strong)',
            color: `oklch(0.95 0.03 ${t()})`,
            overflow: 'hidden',
            'max-height': '76px',
            'text-shadow': '0 1px 6px rgba(0,0,0,.4)',
            opacity: chargee() ? '0' : '1',
            transition: 'opacity var(--dur) var(--ease)',
          }}
        >
          {props.titre}
        </span>

        <Show when={props.marque}>
          <span
            style={{
              position: 'absolute',
              top: '6px',
              left: '6px',
              'font-size': '10px',
              'line-height': '16px',
              padding: '0 6px',
              'border-radius': 'var(--r-2xs)',
              background: 'var(--acc)',
              color: 'var(--acc-ink)',
              'font-weight': 'var(--w-strong)',
            }}
          >
            {props.marque}
          </span>
        </Show>

        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '0',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            background: 'rgba(5,8,12,.35)',
            opacity: survol() ? '1' : '0',
            transition: 'opacity 150ms ease-out',
          }}
        >
          <span
            class="icone"
            data-plein="1"
            style={{
              width: '40px',
              height: '40px',
              'border-radius': '50%',
              background: 'rgba(255,255,255,.92)',
              color: 'var(--video)',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'font-size': '26px',
              'box-shadow': '0 4px 16px rgba(0,0,0,.4)',
            }}
          >
            play_arrow
          </span>
        </span>
      </div>

      <span class="tronque" style={{ 'font-weight': 'var(--w-strong)', 'line-height': '20px' }}>
        {props.titre}
      </span>

      <span
        class="num"
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          'margin-top': '-4px',
          'min-width': '0',
          'font-size': '12px',
          'line-height': '16px',
          color: 'var(--fg3)',
        }}
      >
        <span class="tronque">{props.legende}</span>
        <Show when={props.note}>
          <span
            style={{
              'flex': 'none',
              'font-size': '10px',
              'line-height': '14px',
              padding: '0 4px',
              border: '1px solid var(--line2)',
              'border-radius': 'var(--r-2xs)',
              color: 'var(--fg2)',
            }}
          >
            {props.note}
          </span>
        </Show>
      </span>
    </button>
  )
}
