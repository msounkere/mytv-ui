import { Show } from 'solid-js'
import Icone from '../../components/Icone'
import { estBureau, estMobile } from '../../lib/gabarit'
import { mmss } from '../../components/ControlesLecteur'
import type { Programme } from '../../lib/epg'
import type { EntreeCatalogue } from '../../lib/db'
import { heure, surtitre } from './format'

// Le pied du lecteur ne lit que deux choses : le programme (ou le fichier) et
// le favori. Il n'a donc aucune raison de connaître le reste du lecteur.

export default function PiedLecteur(props: {
  entree: EntreeCatalogue
  direct: boolean
  enCours: Programme | undefined
  ensuite: Programme | undefined
  position: number
  duree: number
  favori: boolean
  surFavori: () => void
  /** VOD : « + Ma liste » / « ✓ Dans ma liste » (US-45, C 5.3) ; les favoris ne concernent plus que les chaines. */
  maListe?: { present: boolean; basculer: () => void }
}) {
  return (
    <div
      style={{
        display: 'flex', 'align-items': 'center', gap: '16px',
        padding: estBureau() ? '14px 20px' : estMobile() ? '10px 12px' : '12px 20px',
        background: 'var(--panel)', 'border-top': '1px solid var(--line)',
      }}
    >
      <div style={{ flex: 1, 'min-width': 0, display: 'grid', gap: '4px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <span class="tertiaire" style={surtitre}>{props.direct ? 'En ce moment' : 'En lecture'}</span>
          <span class="num tertiaire" style={{ 'font-size': '12px' }}>
            {props.direct
              ? props.enCours
                ? `${heure(props.enCours.debut)}–${heure(props.enCours.fin)}`
                : ''
              : `${mmss(props.position)}${props.duree ? ` / ${mmss(props.duree)}` : ''}`}
          </span>
        </div>
        <span class="tronque" style={{ 'font-size': '15px', 'font-weight': 'var(--w-strong)' }}>
          {props.direct
            ? (props.enCours?.titre ?? 'Aucun programme au guide pour cette chaîne')
            : props.entree.nom}
        </span>
      </div>

      {/* Sur mobile, « Ensuite » passe par le panneau d'infos : 390 px ne le portent pas. */}
      <Show when={!estMobile() ? props.ensuite : undefined}>
        {(p) => (
          <div
            style={{
              flex: 1, 'min-width': 0, display: 'grid', gap: '4px',
              'padding-left': '16px', 'border-left': '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
              <span class="tertiaire" style={surtitre}>Ensuite</span>
              <span class="num tertiaire" style={{ 'font-size': '12px' }}>
                {heure(p().debut)}–{heure(p().fin)}
              </span>
            </div>
            <span class="tronque secondaire" style={{ 'font-size': '13px' }}>{p().titre}</span>
          </div>
        )}
      </Show>

      <Show when={props.direct}>
        <button
          onClick={props.surFavori}
          title={props.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-label={props.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-pressed={props.favori}
          style={{
            flex: '0 0 auto', display: 'flex', 'align-items': 'center', gap: '6px',
            height: estMobile() ? '44px' : '34px', 'min-width': estMobile() ? '44px' : undefined,
            'justify-content': 'center',
            padding: estMobile() ? '0 10px' : '0 12px 0 10px',
            border: '1px solid var(--line2)', 'border-radius': 'var(--r-btn-md)',
            'font-size': '13px', color: props.favori ? 'var(--acc-fg)' : undefined,
          }}
        >
          <Icone nom={props.favori ? 'star' : 'star_border'} taille={18} plein={props.favori} />
          <Show when={!estMobile()}>{props.favori ? 'Favorite' : 'Ajouter aux favoris'}</Show>
        </button>
      </Show>
      <Show when={!props.direct && props.maListe}>
        {(m) => (
          <button
            type="button"
            data-role="ma-liste"
            onClick={() => m().basculer()}
            title={m().present ? 'Retirer de Ma liste' : 'Préparé d’avance sur le serveur pour une lecture sans coupure'}
            aria-label={m().present ? 'Retirer de Ma liste' : 'Ajouter à Ma liste'}
            aria-pressed={m().present}
            style={{
              flex: '0 0 auto', display: 'flex', 'align-items': 'center', gap: '6px',
              height: estMobile() ? '44px' : '34px', 'min-width': estMobile() ? '44px' : undefined, 'justify-content': 'center',
              padding: estMobile() ? '0 10px' : '0 12px 0 10px',
              border: `1px solid ${m().present ? 'var(--acc)' : 'var(--line2)'}`, 'border-radius': 'var(--r-btn-md)',
              'font-size': '13px', color: m().present ? 'var(--acc-fg)' : undefined,
            }}
          >
            <Icone nom={m().present ? 'check' : 'add'} taille={18} plein={m().present} />
            <Show when={!estMobile()}>{m().present ? 'Dans ma liste' : 'Ma liste'}</Show>
          </button>
        )}
      </Show>
    </div>
  )
}
