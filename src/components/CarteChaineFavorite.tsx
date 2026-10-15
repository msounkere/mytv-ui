import { createSignal } from 'solid-js'
import PlaqueChaine, { avancement, jusqua, type ProgrammeCourant } from './PlaqueChaine'
import type { EntreeCatalogue } from '../lib/db'

// Carte « Mes chaînes favorites » : elle existe pour ramener le lancement d'une
// favorite à UN clic depuis l'accueil, au lieu de trois en passant par Direct.
// Le guide ne couvre que 4 042 chaînes sur 21 791 : quand il manque, la carte
// le dit au lieu d'afficher une ligne vide qu'on prendrait pour un bug.

export default function CarteChaineFavorite(props: {
  entree: EntreeCatalogue
  sousTitre: string
  programme?: ProgrammeCourant
  surOuvrir: (e: EntreeCatalogue) => void
}) {
  const [survol, poserSurvol] = createSignal(false)
  const maintenant = Date.now()

  return (
    <div
      role="button"
      tabindex="0"
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
        display: 'flex', 'flex-direction': 'column', gap: '10px', padding: '12px',
        'border-radius': 'var(--r-md)', border: `1px solid ${survol() ? 'var(--line2)' : 'var(--line)'}`,
        background: survol() ? 'var(--elev)' : 'var(--card)', cursor: 'pointer', 'min-width': 0,
        transition: 'background var(--dur), border-color var(--dur)',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'min-width': 0 }}>
        <PlaqueChaine nom={props.entree.nom} src={props.entree.icone} largeur={52} hauteur={34} />
        <div style={{ 'min-width': 0, flex: 1 }}>
          <div class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{props.entree.nom}</div>
          <div class="tronque" style={{ 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
            {props.sousTitre}
          </div>
        </div>
        <span
          style={{
            display: 'flex', 'align-items': 'center', gap: '5px', flex: 'none', height: '20px',
            padding: '0 7px', 'border-radius': 'var(--r-2xs)', background: 'var(--err-bg)', color: 'var(--err)',
            'font-size': '10px', 'font-weight': 700, 'letter-spacing': '.04em',
          }}
        >
          <span style={{ width: '6px', height: '6px', 'border-radius': '50%', background: 'currentColor' }} />
          DIRECT
        </span>
      </div>

      <div style={{ 'min-width': 0 }}>
        <div class="tronque" style={{ color: props.programme ? 'var(--fg)' : 'var(--fg3)' }}>
          {props.programme?.titre ?? 'Aucun programme disponible'}
        </div>
        <div class="num" style={{ 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
          {props.programme ? jusqua(props.programme) : 'Pas de guide pour cette chaîne'}
        </div>
      </div>

      <div
        style={{
          height: '3px', 'border-radius': '2px', background: 'var(--line2)',
          opacity: props.programme ? 1 : 0,
        }}
      >
        <div
          style={{
            height: '100%', 'border-radius': '2px', background: 'var(--acc-fg)',
            width: `${Math.round((props.programme ? avancement(props.programme, maintenant) : 0) * 100)}%`,
          }}
        />
      </div>
    </div>
  )
}
