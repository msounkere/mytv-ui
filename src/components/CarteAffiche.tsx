import { Show, createSignal } from 'solid-js'
import Icone from './Icone'
import { plaque, plaqueTexte } from './couleurs'
import { RAYON_VISUEL } from './aplats'
import { titreCourt } from './titres'
import { BadgePret } from './BoutonAVoir'
import type { EntreeCatalogue } from '../lib/db'

// Carte 2:3 du dossier de conception (composant « PosterCard »). L'affiche
// réelle n'arrive que si `icone` existe ET se charge : sur ce relais une bonne
// part des jaquettes répond 404 ou jamais. L'aplat teinté est donc le fond
// permanent, l'image se posant par-dessus — aucun carré vide pendant l'attente.

const TRANSITION = 'transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)'
const OMBRE_REPOS = '0 0 0 1px rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.28)'
const OMBRE_SURVOL = '0 0 0 1px rgba(255,255,255,.2), 0 10px 22px rgba(0,0,0,.45)'

export interface CarteAfficheProps {
  entree: EntreeCatalogue
  /** « 2024 », « 2024 · Drame »… : ce que le catalogue sait réellement dire. */
  meta?: string
  nouveau?: boolean
  favori?: boolean
  /** Avancement entre 0 et 1 ; absent = pas de barre. */
  progression?: number
  /** Dans la liste « À voir » (US-43 CA1) ; `surAVoir` absent = pas de bouton. */
  aVoir?: boolean
  /** Le serveur tient le fichier pret (US-43 CA3). */
  pret?: boolean
  surOuvrir: (e: EntreeCatalogue) => void
  surLire?: (e: EntreeCatalogue) => void
  surFavori?: (e: EntreeCatalogue) => void
  surAVoir?: (e: EntreeCatalogue) => void
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

export default function CarteAffiche(props: CarteAfficheProps) {
  const [survol, poserSurvol] = createSignal(false)
  const [chargee, poserChargee] = createSignal(false)
  const teinte = () => plaque(props.entree.nom)
  const encre = () => plaqueTexte(props.entree.nom)
  const titre = () => titreCourt(props.entree.nom)

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
          <BadgePret visible={!!props.pret} taille="carte" />
          <span style={{ flex: 1 }} />
          <Show when={props.favori}>
            <span style={{ color: '#fff', display: 'flex' }}>
              <Icone nom="star" taille={16} plein />
            </span>
          </Show>
        </div>

        <Show when={props.progression !== undefined && props.progression > 0}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '3px', background: 'rgba(0,0,0,.55)' }}>
            <div style={{ height: '100%', width: `${Math.round((props.progression ?? 0) * 100)}%`, background: 'var(--acc-fg)' }} />
          </div>
        </Show>

        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', 'align-items': 'flex-end', 'justify-content': 'center',
            gap: '8px', padding: '12px 8px 14px', background: 'rgba(0,0,0,.55)',
            opacity: survol() ? 1 : 0, 'pointer-events': survol() ? 'auto' : 'none',
            transition: 'opacity 150ms ease-out',
          }}
        >
          <Show when={props.surLire}>
            {(lire) => (
              <BoutonSurvol
                nom="play_arrow"
                plein
                principal
                libelle={props.entree.type === 'series' ? 'Lire le prochain épisode' : 'Lecture rapide'}
                surClic={() => lire()(props.entree)}
              />
            )}
          </Show>
          <Show when={props.surFavori}>
            {(basculer) => (
              <BoutonSurvol
                nom="star"
                plein={props.favori}
                libelle={props.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                surClic={() => basculer()(props.entree)}
              />
            )}
          </Show>
          <Show when={props.surAVoir}>
            {(basculer) => (
              <BoutonSurvol
                nom={props.aVoir ? 'check' : 'add'}
                plein={props.aVoir}
                libelle={props.aVoir ? 'Retirer de « À voir »' : 'Ajouter à « À voir »'}
                surClic={() => basculer()(props.entree)}
              />
            )}
          </Show>
          <BoutonSurvol nom="info" libelle="Voir les détails" surClic={() => props.surOuvrir(props.entree)} />
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', 'min-width': 0 }}>
        <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{titre()}</span>
        <Show when={props.meta}>
          <div class="num" style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)', 'white-space': 'nowrap', overflow: 'hidden' }}>
            <span class="tronque">{props.meta}</span>
          </div>
        </Show>
      </div>
    </div>
  )
}
