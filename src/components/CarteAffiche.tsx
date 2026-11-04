import { Show, createSignal } from 'solid-js'
import Icone from './Icone'
import ChipPreparation from './ChipPreparation'
import MenuContextuel, { positionSous, type EntreeMenu } from './MenuContextuel'
import { useMaListeCles } from './BoutonMaListe'
import { plaque, plaqueTexte } from './couleurs'
import { RAYON_VISUEL } from './aplats'
import { titreCourt } from './titres'
import { lire as lireDirect } from '../etat'
import { basculerMaListe } from '../lib/ma-liste'
import { LIBELLES, type Preparation } from '../lib/ma-liste-regles'
import { estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Carte 2:3 du dossier de conception (composant « PosterCard »). L'affiche
// réelle n'arrive que si `icone` existe ET se charge : sur ce relais une bonne
// part des jaquettes répond 404 ou jamais. L'aplat teinté est donc le fond
// permanent, l'image se posant par-dessus — aucun carré vide pendant l'attente.
//
// Lot 10 (US-46 CA2, regle transverse) : un tap/clic sur l'affiche OUVRE LA
// FICHE, partout. La lecture est un bouton ▶ explicite. Chaque carte porte un
// bouton « ⋯ » TOUJOURS visible (44 px au doigt, 36 px au bureau, focalisable)
// qui ouvre le menu : ▶ Lecture · + Ma liste / Retirer de Ma liste · Détails.
// Au survol bureau, ▶ et + en plus. Badge de coin : etat de preparation et ✓ vu
// -- la legende (annee · genre) reste. L'etoile (favori) a disparu : les
// favoris ne concernent plus que les chaines (C UX9, US-44 CA6).

const TRANSITION = 'transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)'
const OMBRE_REPOS = '0 0 0 1px rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.28)'
const OMBRE_SURVOL = '0 0 0 1px rgba(255,255,255,.2), 0 10px 22px rgba(0,0,0,.45)'

export interface CarteAfficheProps {
  entree: EntreeCatalogue
  /** « 2024 », « 2024 · Drame »… : ce que le catalogue sait réellement dire. */
  meta?: string
  nouveau?: boolean
  /** Avancement entre 0 et 1 ; absent = pas de barre. */
  progression?: number
  /** Contenu vu : ✓ dans le coin. */
  vu?: boolean
  /** Etat de preparation (element de Ma liste) : badge de coin. */
  preparation?: Preparation
  /** Dans Ma liste ; absent = lu par la carte elle-meme. */
  dansMaListe?: boolean
  /** Tap/clic sur l'affiche et « Détails » : la FICHE. */
  surOuvrir: (e: EntreeCatalogue) => void
  /** « ▶ Lecture » ; absent = lecture directe (`lire`). */
  surLire?: (e: EntreeCatalogue) => void
  /** « + Ma liste » / « Retirer » ; absent = `basculerMaListe`. */
  surMaListe?: (e: EntreeCatalogue) => void
  /** @deprecated lot 9 : `dansMaListe`. */
  aVoir?: boolean
  /** @deprecated lot 9 : `preparation`. */
  pret?: boolean
  /** @deprecated lot 9 : `surMaListe`. */
  surAVoir?: (e: EntreeCatalogue) => void
  /** @deprecated lot 10 : les favoris sont reserves aux chaines ; ignore. */
  favori?: boolean
  /** @deprecated lot 10 : ignore. */
  surFavori?: (e: EntreeCatalogue) => void
}

/** Squelette affiché pendant que la rangée interroge IndexedDB. */
export function SqueletteAffiche() {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }} aria-hidden="true">
      <div style={{ 'aspect-ratio': '2 / 3', 'border-radius': RAYON_VISUEL, background: 'var(--elev)' }} />
      <div style={{ height: '14px', 'border-radius': 'var(--r-2xs)', background: 'var(--elev)' }} />
      <div style={{ height: '10px', width: '60%', 'border-radius': 'var(--r-2xs)', background: 'var(--elev)' }} />
    </div>
  )
}

function BoutonSurvol(props: { nom: string; libelle: string; principal?: boolean; plein?: boolean; surClic: () => void }) {
  const taille = () => (props.principal ? 40 : 36)
  return (
    <span
      role="button"
      tabindex="-1"
      aria-label={props.libelle}
      title={props.libelle}
      onClick={(e) => {
        e.stopPropagation()
        props.surClic()
      }}
      style={{
        width: `${taille()}px`, height: `${taille()}px`, 'border-radius': '50%',
        background: props.principal ? '#fff' : 'rgba(32,32,32,.85)',
        color: props.principal ? '#000' : '#fff',
        border: props.principal ? 'none' : '1px solid rgba(255,255,255,.28)',
        display: 'flex', 'align-items': 'center', 'justify-content': 'center', cursor: 'pointer',
      }}
    >
      <Icone nom={props.nom} taille={props.principal ? 22 : 18} plein={props.plein} />
    </span>
  )
}

/** Le bouton « ⋯ » d'une carte : toujours visible, focalisable, et son Entree n'atteint jamais la carte. */
export function BoutonMenuCarte(props: { titre: string; surOuvrir: (position: { x: number; y: number; ancre: HTMLElement }) => void; coin?: 'bas' | 'haut' }) {
  const [survol, poserSurvol] = createSignal(false)
  const taille = () => (estMobile() ? 44 : 36)
  return (
    <button
      type="button"
      data-role="menu-carte"
      aria-label={`Plus d’options pour ${props.titre}`}
      aria-haspopup="menu"
      title="Plus d’options"
      onClick={(e) => {
        e.stopPropagation()
        props.surOuvrir(positionSous(e.currentTarget))
      }}
      onKeyDown={(e) => {
        // Entree / Espace activent CE bouton (click natif) ; la carte dessous ne doit pas les voir (B2).
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
      onMouseEnter={() => poserSurvol(true)}
      onMouseLeave={() => poserSurvol(false)}
      style={{
        position: 'absolute', right: '4px', ...(props.coin === 'haut' ? { top: '4px' } : { bottom: '4px' }),
        width: `${taille()}px`, height: `${taille()}px`, padding: 0,
        'border-radius': 'var(--r-xs)', border: '1px solid rgba(255,255,255,.22)',
        background: survol() ? 'rgba(70,70,70,.95)' : 'rgba(20,20,20,.78)', color: '#fff',
        display: 'flex', 'align-items': 'center', 'justify-content': 'center', cursor: 'pointer', 'z-index': 2,
      }}
    >
      <Icone nom="more_horiz" taille={20} />
    </button>
  )
}

export default function CarteAffiche(props: CarteAfficheProps) {
  const [survol, poserSurvol] = createSignal(false)
  const [chargee, poserChargee] = createSignal(false)
  const [menu, poserMenu] = createSignal<{ x: number; y: number; ancre: HTMLElement } | null>(null)
  const teinte = () => plaque(props.entree.nom)
  const encre = () => plaqueTexte(props.entree.nom)
  const titre = () => titreCourt(props.entree.nom)
  const serie = () => props.entree.type === 'series'

  // Presence dans Ma liste : donnee par l'appelant (rangee « Ma liste »), sinon lue ici.
  const clesListe = props.dansMaListe === undefined && props.aVoir === undefined ? useMaListeCles() : undefined
  const dansMaListe = () => props.dansMaListe ?? props.aVoir ?? clesListe?.()?.has(props.entree.cle) ?? false
  const preparation = () => props.preparation ?? (props.pret ? { etat: 'pret' as const } : undefined)
  const lire = () => (props.surLire ?? lireDirect)(props.entree)
  const basculer = () => {
    const f = props.surMaListe ?? props.surAVoir
    if (f) f(props.entree)
    else void basculerMaListe(props.entree.cle)
  }

  const entreesMenu = (): EntreeMenu[] => [
    ...(serie() ? [] : [{ icone: 'play_arrow', libelle: 'Lecture', action: lire }]),
    dansMaListe()
      ? { icone: 'check', libelle: LIBELLES.retirer, action: basculer, danger: true }
      : { icone: 'add', libelle: LIBELLES.ajouter, action: basculer },
    { icone: 'info', libelle: 'Détails', action: () => props.surOuvrir(props.entree) },
  ]

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'min-width': 0, width: '100%' }}>
      <div
        role="button"
        tabindex="0"
        aria-label={titre()}
        title={props.entree.nom}
        onClick={() => props.surOuvrir(props.entree)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            props.surOuvrir(props.entree)
          }
        }}
        onMouseEnter={() => poserSurvol(true)}
        onMouseLeave={() => poserSurvol(false)}
        onFocusIn={() => poserSurvol(true)}
        onFocusOut={() => poserSurvol(false)}
        style={{
          position: 'relative', 'aspect-ratio': '2 / 3',
          'border-radius': RAYON_VISUEL, overflow: 'hidden',
          background: teinte(), cursor: 'pointer',
          'box-shadow': survol() ? OMBRE_SURVOL : OMBRE_REPOS,
          transform: survol() ? 'translateY(-3px)' : 'none',
          transition: TRANSITION,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: '12px', display: 'flex', 'flex-direction': 'column', 'justify-content': 'flex-end', gap: '8px' }}>
          <span
            style={{
              'font-family': 'var(--moov-font-heading)', 'font-size': '15px', 'line-height': '19px',
              'font-weight': 'var(--w-strong)', color: encre(), 'text-wrap': 'balance',
              overflow: 'hidden', 'max-height': '76px',
            }}
          >
            {titre()}
          </span>
          <span style={{ width: '20px', height: '2px', 'border-radius': '1px', background: encre(), opacity: 0.5 }} />
        </div>

        <Show when={props.entree.icone}>
          <img
            src={props.entree.icone}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => poserChargee(true)}
            onError={() => poserChargee(false)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              'object-fit': 'cover', opacity: chargee() ? 1 : 0,
              transition: 'opacity var(--dur) var(--ease)',
            }}
          />
        </Show>

        <div style={{ position: 'absolute', top: '6px', left: '6px', right: '6px', display: 'flex', gap: '4px', 'align-items': 'center', 'pointer-events': 'none' }}>
          <Show when={props.nouveau}>
            <span style={{ 'font-size': '10px', 'line-height': '16px', padding: '0 6px', 'border-radius': 'var(--r-2xs)', background: 'var(--acc)', color: 'var(--acc-ink)', 'font-weight': 'var(--w-strong)' }}>
              Nouveau
            </span>
          </Show>
          <ChipPreparation forme="badge" preparation={preparation()} />
          <span style={{ flex: 1 }} />
          <Show when={props.vu}>
            <span
              data-role="badge-vu"
              aria-label="Vu"
              title="Vu"
              style={{ 'font-size': '11px', 'line-height': '18px', width: '18px', 'text-align': 'center', 'border-radius': '50%', background: 'rgba(20,20,20,.78)', color: 'var(--ok)', 'font-weight': 'var(--w-strong)' }}
            >
              ✓
            </span>
          </Show>
        </div>

        <Show when={props.progression !== undefined && props.progression > 0}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '3px', background: 'rgba(0,0,0,.55)' }}>
            <div style={{ height: '100%', width: `${Math.round((props.progression ?? 0) * 100)}%`, background: 'var(--acc-fg)' }} />
          </div>
        </Show>

        {/* Survol bureau : ▶ et +, en plus du menu. Jamais au doigt (ils n'existent pas sans survol). */}
        <Show when={!estMobile()}>
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              gap: '8px', padding: '12px 8px', background: 'rgba(0,0,0,.45)',
              opacity: survol() ? 1 : 0, 'pointer-events': survol() ? 'auto' : 'none',
              transition: 'opacity 150ms ease-out',
            }}
          >
            <Show when={!serie()}>
              <BoutonSurvol nom="play_arrow" plein principal libelle="Lecture" surClic={lire} />
            </Show>
            <BoutonSurvol
              nom={dansMaListe() ? 'check' : 'add'}
              plein={dansMaListe()}
              libelle={dansMaListe() ? LIBELLES.presentAria : LIBELLES.ajouterAria}
              surClic={basculer}
            />
          </div>
        </Show>

        <BoutonMenuCarte titre={titre()} surOuvrir={poserMenu} />
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', 'min-width': 0 }}>
        <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{titre()}</span>
        <Show when={props.meta}>
          <div class="num" style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)', 'white-space': 'nowrap', overflow: 'hidden' }}>
            <span class="tronque">{props.meta}</span>
          </div>
        </Show>
      </div>

      <Show when={menu()}>
        {(m) => <MenuContextuel x={m().x} y={m().y} ancre={m().ancre} libelle={`Options de ${titre()}`} entrees={entreesMenu()} surFermer={() => poserMenu(null)} />}
      </Show>
    </div>
  )
}
