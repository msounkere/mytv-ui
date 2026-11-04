import { Show, createSignal } from 'solid-js'
import PlaqueChaine, { avancement, plageHoraire, type ProgrammeCourant } from './PlaqueChaine'
import { plaque, plaqueTexte } from './couleurs'
import type { EntreeCatalogue } from '../lib/db'
import { estMobile } from '../lib/gabarit'

// Carte 16:9 d'une chaîne en direct. Servie par deux écrans : la rangée « En
// direct maintenant » de l'accueil et le mode « Cartes » de Direct.
//
// Une ligne de liste dit quelle chaîne c'est ; une carte dit ce qui y passe —
// c'est tout l'intérêt du mode, et c'est pourquoi le programme en cours occupe
// la vignette plutôt qu'une ligne grise sous le nom.
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html », Direct en
// mode Cartes : carte rayon 8 px, filet 1 px --line, fond --card ; vignette
// 16/9 ; titre du programme 15/19 px semi-gras à 12 px des bords et 10 px du
// bas ; plaque de logo 46 × 30 posée à 8 px ; pastille DIRECT 20 px de haut,
// retrait 7 px, rayon 3 px ; pied 10/12/12 px, écart 5 px ; jauge 3 px.

export interface CarteDirectProps {
  entree: EntreeCatalogue
  programme?: ProgrammeCourant
  /** Horloge partagée : 40 cartes ne doivent pas tenir 40 minuteurs. */
  maintenant?: number
  surOuvrir: (e: EntreeCatalogue) => void
}

export default function CarteDirect(props: CarteDirectProps) {
  const [survol, poserSurvol] = createSignal(false)
  const horloge = () => props.maintenant ?? Date.now()

  return (
    <button
      onClick={() => props.surOuvrir(props.entree)}
      onMouseEnter={() => poserSurvol(true)}
      onMouseLeave={() => poserSurvol(false)}
      onFocus={() => poserSurvol(true)}
      onBlur={() => poserSurvol(false)}
      title={props.entree.nom}
      data-role="carte-direct"
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'min-width': '0',
        width: '100%',
        padding: '0',
        'text-align': 'left',
        'border-radius': 'var(--r-md)',
        overflow: 'hidden',
        border: `1px solid ${survol() ? 'var(--line2)' : 'var(--line)'}`,
        background: 'var(--card)',
        transform: survol() ? 'translateY(-2px)' : 'none',
        transition: 'transform var(--dur) var(--ease), border-color var(--dur) var(--ease)',
      }}
    >
      <div
        style={{
          position: 'relative',
          'aspect-ratio': '16 / 9',
          width: '100%',
          background: plaque(props.entree.nom),
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '12px',
            right: '12px',
            bottom: '10px',
            'font-family': 'var(--moov-font-heading)',
            'font-size': '15px',
            'line-height': '19px',
            'font-weight': 'var(--w-strong)',
            color: plaqueTexte(props.entree.nom),
            'max-height': '38px',
            overflow: 'hidden',
            'text-shadow': '0 1px 6px rgba(0,0,0,.45)',
          }}
        >
          {props.programme?.titre ?? 'Aucun programme disponible'}
        </div>

        <div style={{ position: 'absolute', left: '8px', top: '8px', 'box-shadow': '0 1px 4px rgba(0,0,0,.4)', 'border-radius': 'var(--r-xs)' }}>
          <PlaqueChaine nom={props.entree.nom} src={props.entree.icone} largeur={46} hauteur={30} />
        </div>

        <span
          style={{
            position: 'absolute',
            right: '8px',
            top: '8px',
            display: 'flex',
            'align-items': 'center',
            gap: '5px',
            height: '20px',
            padding: '0 7px',
            'border-radius': 'var(--r-2xs)',
            background: 'rgba(20,20,20,.85)',
            color: 'var(--err)',
            'font-size': '10px',
            'font-weight': '700',
            'letter-spacing': '.04em',
          }}
        >
          <span aria-hidden="true" style={{ width: '6px', height: '6px', 'border-radius': '50%', background: 'currentColor' }} />
          DIRECT
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          'flex-direction': 'column',
          gap: '5px',
          padding: '10px 12px 12px',
          'min-width': '0',
          width: '100%',
        }}
      >
        {/* Telephone : une carte de 177 px ne loge pas le nom ET l'horaire
            sur une ligne (« Chaîn… », audit A bug 11) : l'horaire passe dessous. */}
        <div style={{ display: 'flex', 'flex-direction': estMobile() ? 'column' : 'row', 'align-items': estMobile() ? 'stretch' : 'baseline', gap: estMobile() ? '0' : '8px', 'min-width': '0' }}>
          <span class="tronque" data-role="nom-chaine" style={{ 'font-weight': 'var(--w-strong)', flex: '1', 'min-width': '0' }}>
            {props.entree.nom}
          </span>
          <Show when={props.programme}>
            {(p) => (
              <span class="num" style={{ 'font-size': '12px', color: 'var(--fg3)', 'flex': 'none' }}>
                {plageHoraire(p())}
              </span>
            )}
          </Show>
        </div>
        <div
          style={{
            height: '3px',
            'border-radius': '2px',
            background: 'var(--line2)',
            // Sans programme, la jauge ne doit pas prétendre mesurer quoi que
            // ce soit : elle s'efface au lieu de rester bloquée à zéro.
            opacity: props.programme ? '1' : '0.3',
          }}
        >
          <div
            style={{
              height: '100%',
              'border-radius': '2px',
              width: `${Math.round((props.programme ? avancement(props.programme, horloge()) : 0) * 100)}%`,
              background: 'var(--acc-fg)',
            }}
          />
        </div>
      </div>
    </button>
  )
}
