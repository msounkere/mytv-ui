import { estMobile, estTablette, gabarit } from '../lib/gabarit'
import { Show } from 'solid-js'
import PlaqueChaine, { avancement, plageHoraire, type ProgrammeCourant } from './PlaqueChaine'
import EtiquettePays from './EtiquettePays'
import Badge4K from './Badge4K'
import type { EntreeCatalogue } from '../lib/db'

// Ligne de chaîne du mode Liste de Direct. Le dossier de conception la veut
// porteuse de son programme en cours — « 20:00 – 21:00 · Journal » — parce que
// c'est le titre à l'antenne qui décide de zapper, pas le nom de la chaîne.
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html », Direct en
// mode Liste : ligne 56 px avec filet bas, colonnes
// « 40px 52px minmax(170px,1fr) minmax(240px,1.6fr) », écart 12 px, retraits
// latéraux 20 px ; plaque 52 × 34 ; horaire sur 96 px ; jauge 160 × 3 px.

export const COLONNES_CHAINE = '40px 52px minmax(170px, 1fr) minmax(240px, 1.6fr)'
// Tablette : la liste ne dispose que de 512 px (748 − colonne de 236). Les
// minimums du bureau en demandent 578 : la ligne débordait. Ici ils cèdent la
// place à des fractions, et seule la colonne du programme garde de quoi lire.
const COLONNES_TABLETTE = '28px 52px minmax(0, 1fr) minmax(0, 1.5fr)'
// Mobile : logo, nom, programme — le numéro et la jauge n'ont plus la place.
const COLONNES_MOBILE = '52px minmax(0, 1fr)'

/** Colonnes de la ligne ET de son en-tête : elles doivent rester alignées. */
export function colonnesChaine(): string {
  const g = gabarit()
  return g === 'bureau' ? COLONNES_CHAINE : g === 'tablette' ? COLONNES_TABLETTE : COLONNES_MOBILE
}
export const HAUTEUR_CHAINE = 56

export interface LigneChaineProps {
  numero: number
  entree: EntreeCatalogue
  programme?: ProgrammeCourant
  /** Horloge partagée : une liste entière ne doit pas tenir un minuteur par ligne. */
  maintenant: number
  surOuvrir: () => void
}

export default function LigneChaine(props: LigneChaineProps) {
  return (
    <button
      onClick={props.surOuvrir}
      title={props.entree.nom}
      style={{
        display: 'grid',
        'grid-template-columns': colonnesChaine(),
        gap: '12px',
        'align-items': 'center',
        width: '100%',
        height: '100%',
        padding: estMobile() ? '0 12px' : estTablette() ? '0 16px' : '0 20px',
        'border-bottom': '1px solid var(--line)',
        'border-radius': '0',
        'text-align': 'left',
      }}
    >
      <Show when={!estMobile()}>
        <span class="num" style={{ 'text-align': 'right', 'font-size': '12px', color: 'var(--fg3)' }}>
          {props.numero}
        </span>
      </Show>

      <PlaqueChaine nom={props.entree.nom} src={props.entree.icone} largeur={52} hauteur={34} />

      <Show
        when={!estMobile()}
        fallback={
          // Mobile : nom au-dessus, programme dessous, dans la seule colonne
          // restante — c'est le programme qui décide de zapper.
          <span style={{ display: 'flex', 'flex-direction': 'column', gap: '3px', 'min-width': '0' }}>
            <span style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'min-width': '0' }}>
              <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{props.entree.nom}</span>
              <Badge4K nom={props.entree.nom} />
            </span>
            <span class="tronque" style={{ 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
              {props.programme?.titre ?? 'Aucun programme disponible'}
            </span>
          </span>
        }
      >
      <span style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'min-width': '0' }}>
        <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{props.entree.nom}</span>
        <Badge4K nom={props.entree.nom} />
        <EtiquettePays pays={props.entree.pays} />
      </span>

      <span style={{ display: 'flex', 'flex-direction': 'column', gap: '5px', 'min-width': '0' }}>
        <Show
          when={props.programme}
          fallback={<span class="tertiaire tronque">Aucun programme disponible</span>}
        >
          {(p) => (
            <>
              <span style={{ display: 'flex', gap: '10px', 'align-items': 'baseline', 'min-width': '0' }}>
                <span class="num" style={{ 'flex': 'none', width: estTablette() ? '88px' : '96px', 'font-size': '12px', color: 'var(--fg3)' }}>
                  {plageHoraire(p())}
                </span>
                <span class="tronque">{p().titre}</span>
              </span>
              <span
                style={{ width: '160px', 'max-width': '100%', height: '3px', 'border-radius': '2px', background: 'var(--line2)' }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    'border-radius': '2px',
                    width: `${Math.round(avancement(p(), props.maintenant) * 100)}%`,
                    background: 'var(--acc-fg)',
                  }}
                />
              </span>
            </>
          )}
        </Show>
      </span>
      </Show>
    </button>
  )
}
