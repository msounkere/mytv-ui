import { estBureau, estMobile, estTablette } from '../../lib/gabarit'
import { Show, type JSX } from 'solid-js'
import Icone from '../../components/Icone'
import SelecteurSegmente from '../../components/SelecteurSegmente'

// La rangée de commandes de Direct, mesurée à 56 px sur la maquette : ce qu'on
// regarde, ce qu'on y cherche, et sous quelle forme on le voit. Les trois sont
// côte à côte parce qu'ils portent sur la MÊME liste.

/** « Guide TV » n'est pas un rendu de cette liste : voir `choisirMode`. */
export const MODES: Array<{ cle: string; libelle: string; icone: string }> = [
  { cle: 'liste', libelle: 'Liste', icone: 'view_list' },
  { cle: 'cartes', libelle: 'Cartes', icone: 'grid_view' },
  { cle: 'guide', libelle: 'Guide TV', icone: 'tv_guide' },
]

export type ModeDirect = 'liste' | 'cartes'

export default function BarreOutilsDirect(props: {
  titre: string
  compte: string
  filtre: string
  surFiltre: (valeur: string) => void
  /** Absent quand aucune catégorie n'est active : rien à masquer. */
  masquee?: boolean
  surMasquer: () => void
  mode: string
  surMode: (cle: string) => void
  /** Mobile : ouvre le panneau des catégories. */
  surCategories?: () => void
}): JSX.Element {
  const libelleMasquage = () =>
    props.masquee ? 'Réafficher la catégorie' : 'Masquer la catégorie'

  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '10px',
        height: '56px',
        padding: estMobile() ? '0 12px' : estTablette() ? '0 16px' : '0 20px',
        'border-bottom': '1px solid var(--line)',
        'flex': 'none',
        'min-width': '0',
      }}
    >
      <Show when={estMobile() && props.surCategories}>
        <button
          aria-label="Catégories"
          aria-haspopup="dialog"
          onClick={() => props.surCategories?.()}
          style={{
            width: '44px', height: '44px', 'flex': 'none', padding: '0',
            display: 'flex', 'align-items': 'center', 'justify-content': 'center',
            'border-radius': 'var(--r-btn-sm)', border: '1px solid var(--line2)',
          }}
        >
          <Icone nom="filter_list" taille={20} />
        </button>
      </Show>
      <div style={{ display: 'flex', 'flex-direction': 'column', 'min-width': '0', flex: '1' }}>
        <h1 class="tronque" style={{ 'font-size': '18px', 'line-height': '22px' }}>{props.titre}</h1>
        <span class="num" style={{ 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
          {props.compte}
        </span>
      </div>

      {/* Mobile : le champ ne tient pas à côté du titre et du sélecteur ; il
          vit dans le panneau des catégories (voir Parcours). Tablette : 170 px,
          mesuré sur la maquette. */}
      <Show when={!estMobile()}>
      <div style={{ position: 'relative', width: estTablette() ? '170px' : '230px', 'flex': 'none' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: '10px', top: '8px',
            display: 'flex', color: 'var(--fg3)', 'pointer-events': 'none',
          }}
        >
          <Icone nom="filter_list" taille={16} />
        </span>
        <input
          value={props.filtre}
          onInput={(e) => props.surFiltre(e.currentTarget.value)}
          placeholder="Filtrer cette liste"
          aria-label="Filtrer les chaînes de cette liste"
          style={{
            width: '100%',
            height: '32px',
            padding: '0 10px 0 32px',
            'border-radius': 'var(--r-sm)',
            border: '1px solid var(--line2)',
            'border-bottom-color': 'var(--fg3)',
            background: 'var(--elev)',
            'font-size': '13px',
          }}
        />
      </div>
      </Show>

      <Show when={props.masquee !== undefined}>
        <button
          aria-label={libelleMasquage()}
          title={libelleMasquage()}
          onClick={props.surMasquer}
          style={{
            width: estMobile() ? '44px' : '32px',
            height: estMobile() ? '44px' : '32px',
            'flex': 'none',
            padding: '0',
            'border-radius': 'var(--r-btn-sm)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            color: 'var(--fg2)',
          }}
        >
          <Icone nom={props.masquee ? 'star' : 'filter_alt_off'} taille={18} />
        </button>
      </Show>

      <SelecteurSegmente
        etiquette="Mode d’affichage"
        segments={MODES}
        actif={props.mode}
        surChoisir={props.surMode}
        iconesSeules={!estBureau()}
      />
    </div>
  )
}
