import { Show, createSignal } from 'solid-js'
import Icone from './Icone'
import ChipPreparation from './ChipPreparation'
import MenuContextuel, { type EntreeMenu } from './MenuContextuel'
import { BoutonMenuCarte } from './CarteAffiche'
import { plaqueTexte } from './couleurs'
import { RAYON_VISUEL, couverture } from './aplats'
import { titreCourt } from './titres'
import type { EntreeCatalogue } from '../lib/db'

// Carte de la rangee « Reprendre » (ex-« Continuer a regarder ») : miniature
// 16:9, barre de progression, temps restant et menu « ⋯ ». Le temps restant
// est la seule information que l'utilisateur regarde vraiment ici — il décide
// s'il a le temps de finir —, il est donc en clair plutôt que déduit de la barre.
//
// Lot 10 (US-46 CA3) : le tap LANCE la lecture (du film, ou de l'episode a
// lire d'une serie : jamais la fiche, C16) ; la legende dit `S01E03 · reste
// 23 min` ou `S01E03 · épisode suivant` ; le menu « ⋯ » (toujours visible,
// focalisable, son Entree n'atteint pas la carte : B2) propose Reprendre ·
// Marquer comme vu · Retirer de Reprendre.

const TRANSITION = 'transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease)'
const OMBRE_REPOS = '0 0 0 1px rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.28)'
const OMBRE_SURVOL = '0 0 0 1px rgba(255,255,255,.2), 0 10px 22px rgba(0,0,0,.45)'

export interface CarteRepriseProps {
  entree: EntreeCatalogue
  /** Avancement entre 0 et 1. */
  progression: number
  /** « S01E03 · épisode suivant », « Film · 2019 ». */
  sousTitre: string
  /** « reste 17 min » ; vide pour un episode suivant. */
  reste: string
  /** Le fichier a lire est pret sur le serveur. */
  pret?: boolean
  /** Tap = LECTURE (film ou episode a lire). */
  surOuvrir: (e: EntreeCatalogue) => void
  /** Entrees du menu « ⋯ » : Reprendre · Marquer comme vu · Retirer de Reprendre. */
  entreesMenu: EntreeMenu[]
}

export default function CarteReprise(props: CarteRepriseProps) {
  const [survol, poserSurvol] = createSignal(false)
  const [chargee, poserChargee] = createSignal(false)
  const [menu, poserMenu] = createSignal<{ x: number; y: number; ancre: HTMLElement } | null>(null)
  const titre = () => titreCourt(props.entree.nom)

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'min-width': 0 }}>
      <div
        role="button"
        tabindex="0"
        data-role="carte-reprise"
        aria-label={`Reprendre ${titre()}, ${props.sousTitre}`}
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
          position: 'relative', 'aspect-ratio': '16 / 9',
          'border-radius': RAYON_VISUEL, overflow: 'hidden',
          background: couverture(props.entree.nom), cursor: 'pointer',
          'box-shadow': survol() ? OMBRE_SURVOL : OMBRE_REPOS,
          transform: survol() ? 'translateY(-3px)' : 'none',
          transition: TRANSITION,
        }}
      >
        <div
          style={{
            position: 'absolute', left: '14px', right: '56px', bottom: '16px',
            'font-family': 'var(--moov-font-heading)', 'font-size': '17px', 'line-height': '21px',
            'font-weight': 'var(--w-strong)', color: plaqueTexte(props.entree.nom), 'text-wrap': 'balance',
          }}
        >
          {titre()}
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

        <Show when={props.pret}>
          <div style={{ position: 'absolute', top: '6px', left: '6px', 'pointer-events': 'none' }}>
            <ChipPreparation forme="badge" etat="pret" />
          </div>
        </Show>

        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', 'align-items': 'center', 'justify-content': 'center',
            background: 'rgba(0,0,0,.35)', opacity: survol() ? 1 : 0,
            'pointer-events': 'none', transition: 'opacity 150ms ease-out',
          }}
        >
          <span
            style={{
              width: '48px', height: '48px', 'border-radius': '50%', background: '#fff', color: '#000',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              'box-shadow': '0 4px 14px rgba(0,0,0,.4)',
            }}
          >
            <Icone nom="play_arrow" taille={26} plein />
          </span>
        </div>

        <BoutonMenuCarte titre={titre()} coin="haut" surOuvrir={poserMenu} />

        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '4px', background: 'rgba(0,0,0,.55)' }}>
          <div style={{ height: '100%', width: `${Math.min(100, Math.round(props.progression * 100))}%`, background: 'var(--acc-fg)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px', 'min-width': 0 }}>
        <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{titre()}</span>
        <div class="num" data-role="legende-reprise" style={{ display: 'flex', 'justify-content': 'space-between', gap: '8px', 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
          <span class="tronque">{props.sousTitre}</span>
          <Show when={props.reste}>
            <span style={{ 'white-space': 'nowrap' }}>{props.reste}</span>
          </Show>
        </div>
      </div>

      <Show when={menu()}>
        {(m) => <MenuContextuel x={m().x} y={m().y} ancre={m().ancre} libelle={`Options de ${titre()}`} entrees={props.entreesMenu} surFermer={() => poserMenu(null)} />}
      </Show>
    </div>
  )
}
