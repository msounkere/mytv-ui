import { estMobile } from '../lib/gabarit'
import { Show } from 'solid-js'
import Icone from './Icone'

// Colonne de catégories de Direct. Un catalogue Xtream expose 358 catégories
// dont la plupart ne sont que la déclinaison d'un même thème par pays : la
// maquette les empile derrière un en-tête repliable, met une recherche au-dessus
// et laisse épingler celles qu'on ouvre tous les jours.
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html », écran
// Direct : ligne 34 px, retraits 10 px (racine) ou 34 px (sous un groupe) et
// 4 px à droite, écart 8 px, rayon 4 px ; compteur 11 px ; épingle 24 px ;
// étiquette de section 11/16 px semi-grasse, interlettrage .04em, capitales.

const FORMAT = new Intl.NumberFormat('fr-FR')

export interface LigneCategorieProps {
  libelle: string
  compte?: number
  /** Code pays, en pastille mono devant le libellé. */
  pays?: string
  /** Icône de tête pour les entrées qui n'ont pas de pays (Favoris, Récents). */
  icone?: string
  /** Un groupe se replie ; une catégorie se sélectionne. */
  groupe?: boolean
  deplie?: boolean
  /** 10 px à la racine, 34 px sous un en-tête de groupe. */
  retrait: number
  active?: boolean
  /** Catégorie masquée, affichée en retrait tant qu'on montre les masquées. */
  masquee?: boolean
  epinglee?: boolean
  /** Absent : la ligne ne porte pas d'épingle (groupes, entrées spéciales). */
  surEpingler?: () => void
  surClic: () => void
}

/** En-tête de section de la colonne : « ÉPINGLÉES », « PAYS ». */
export function EtiquetteSection(props: { libelle: string }) {
  return (
    <div
      style={{
        padding: '12px 10px 6px',
        margin: '0 8px',
        'font-size': '11px',
        'line-height': '16px',
        'font-weight': 'var(--w-strong)',
        'letter-spacing': '.04em',
        'text-transform': 'uppercase',
        color: 'var(--fg3)',
      }}
    >
      {props.libelle}
    </div>
  )
}

export default function LigneCategorie(props: LigneCategorieProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        'align-items': 'center',
        width: 'calc(100% - 16px)',
        // 44 px au doigt, 34 px à la souris : voir PAS_CATEGORIE de la colonne.
        height: estMobile() ? '44px' : '34px',
        margin: '0 8px',
        'border-radius': 'var(--r-btn-sm)',
        // Le fond n'est posé que lorsqu'il y a une couleur à mettre : un
        // `background:transparent` inline battrait `button:hover` de base.css
        // et supprimerait le survol de toutes les lignes inactives.
        background: props.active ? 'var(--acc-bg)' : undefined,
        opacity: props.masquee ? '0.45' : '1',
      }}
    >
      <button
        onClick={props.surClic}
        title={props.libelle}
        aria-expanded={props.groupe ? (props.deplie ? 'true' : 'false') : undefined}
        aria-current={props.active ? 'true' : undefined}
        style={{
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          flex: '1',
          'min-width': '0',
          height: '100%',
          padding: `0 4px 0 ${props.retrait}px`,
          'border-radius': 'var(--r-btn-sm)',
          'text-align': 'left',
          background: 'transparent',
          color: props.active ? 'var(--acc-fg)' : 'var(--fg)',
        }}
      >
        <Show when={props.groupe}>
          <span
            aria-hidden="true"
            style={{
              display: 'flex',
              'flex': 'none',
              color: props.active ? 'var(--acc-fg)' : 'var(--fg3)',
              // Le jeu d'icônes n'a pas de `chevron_right` : le chevron replié
              // est `expand_more` pivoté.
              transform: props.deplie ? 'none' : 'rotate(-90deg)',
              transition: 'transform var(--dur) var(--ease)',
            }}
          >
            <Icone nom="expand_more" taille={16} />
          </span>
        </Show>

        <Show when={props.icone}>
          {(nom) => (
            <span style={{ 'flex': 'none', display: 'flex', color: props.active ? 'var(--acc-fg)' : 'var(--fg3)' }}>
              <Icone nom={nom()} taille={16} plein={props.active} />
            </span>
          )}
        </Show>

        <Show when={props.pays}>
          <span
            style={{
              'flex': 'none',
              'font-family': 'var(--moov-font-mono)',
              'font-size': '10px',
              'line-height': '14px',
              padding: '0 4px',
              'border-radius': 'var(--r-2xs)',
              border: '1px solid var(--line2)',
              color: 'var(--fg3)',
            }}
          >
            {props.pays}
          </span>
        </Show>

        <span
          class="tronque"
          style={{ flex: 1, 'font-weight': props.groupe || props.active ? 'var(--w-strong)' : '400' }}
        >
          {props.libelle}
        </span>

        <Show when={props.compte !== undefined}>
          <span class="num" style={{ 'flex': 'none', 'font-size': '11px', color: 'var(--fg3)' }}>
            {FORMAT.format(props.compte!)}
          </span>
        </Show>
      </button>

      <Show when={props.surEpingler}>
        <button
          aria-label={props.epinglee ? `Désépingler ${props.libelle}` : `Épingler ${props.libelle}`}
          title={props.epinglee ? 'Désépingler' : 'Épingler'}
          aria-pressed={props.epinglee}
          onClick={props.surEpingler}
          style={{
            width: estMobile() ? '44px' : '24px',
            height: estMobile() ? '44px' : '24px',
            'flex': 'none',
            'margin-right': estMobile() ? '0' : '4px',
            padding: '0',
            'border-radius': 'var(--r-btn-sm)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            background: 'transparent',
            color: props.epinglee ? 'var(--acc-fg)' : 'var(--fg3)',
            // Discrète au repos, franche à l'épingle posée : la colonne ne doit
            // pas ressembler à un champ de punaises.
            opacity: props.epinglee ? '1' : '0.5',
          }}
        >
          <Icone nom="push_pin" taille={14} plein={props.epinglee} />
        </button>
      </Show>
    </div>
  )
}
