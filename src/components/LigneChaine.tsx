import { estMobile, estTablette, gabarit } from '../lib/gabarit'
import { Show } from 'solid-js'
import PlaqueChaine, { avancement, plageHoraire, type ProgrammeCourant } from './PlaqueChaine'
import EtiquettePays from './EtiquettePays'
import Badge4K from './Badge4K'
import type { EntreeCatalogue } from '../lib/db'
import { LIBELLE_QUALITE, qualiteDe, type Qualite } from '../lib/variantes'

// Ligne de chaîne du mode Liste de Direct. Le dossier de conception la veut
// porteuse de son programme en cours — « 20:00 – 21:00 · Journal » — parce que
// c'est le titre à l'antenne qui décide de zapper, pas le nom de la chaîne.
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html », Direct en
// mode Liste : ligne 56 px avec filet bas, colonnes
// « 40px 52px minmax(170px,1fr) minmax(240px,1.6fr) », écart 12 px, retraits
// latéraux 20 px ; plaque 52 × 34 ; horaire sur 96 px ; jauge 160 × 3 px.
//
// Lot 10 (US-47 CA2, audit D5 / A UX14) : le NOM prime sur le badge des
// variantes. Hors bureau, le badge se replie en sa seule qualité la plus haute
// (« HD »), et il cède d'abord si la place manque (il rétrécit vingt fois plus
// vite que le nom). La chaîne en cours de lecture est surlignée.

export const COLONNES_CHAINE = '40px 52px minmax(170px, 1fr) minmax(240px, 1.6fr)'
// Tablette : la liste ne dispose que de 512 px (748 − colonne de 236). Les
// minimums du bureau en demandent 578 : la ligne débordait. Ici ils cèdent la
// place à des fractions ; le NOM garde la plus large (audit D5 : à 1,5fr pour
// le programme, « Chaîne 2 4K » devenait « Chaîn… »).
const COLONNES_TABLETTE = '28px 52px minmax(0, 1.25fr) minmax(0, 1fr)'
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
  /** Qualités des variantes du groupe (US-39 CA1), de la plus haute à la plus basse ; vide : chaîne sans variante. */
  qualites?: Qualite[]
  /** La chaîne (ou l'une de ses variantes) est en cours de lecture. */
  active?: boolean
  surOuvrir: () => void
}

/** « 4K · FHD · HD » : les variantes disponibles, sans la ligne pour chacune. */
export function BadgesVariantes(props: { qualites?: Qualite[]; compact?: boolean; nom?: string }) {
  const texte = () => {
    const q = props.qualites ?? []
    if (!props.compact) return q.map((x) => LIBELLE_QUALITE[x]).join(' · ')
    // Replié : la meilleure définition seule ; « standard » seul ne dit rien,
    // et une qualité déjà dans le nom (« Chaîne 2 4K ») ne se répète pas.
    const haute = q[0]
    if (!haute || haute === 'inconnue') return ''
    if (props.nom && qualiteDe(props.nom) === haute) return ''
    return LIBELLE_QUALITE[haute]
  }
  return (
    <Show when={props.qualites && props.qualites.length > 1 && texte()}>
      <span
        data-role="variantes"
        title={`${props.qualites!.length} variantes : ${props.qualites!.map((q) => LIBELLE_QUALITE[q]).join(', ')}`}
        style={{
          // Il cède la place avant le nom : rétrécissement vingt fois plus rapide,
          // et il disparaît (overflow) plutôt que de pousser le nom hors de la ligne.
          flex: props.compact ? '0 20 auto' : 'none', 'min-width': '0', overflow: 'hidden', 'white-space': 'nowrap',
          'font-family': 'var(--moov-font-mono)', 'font-size': '10px', 'line-height': '14px',
          padding: '0 5px', 'border-radius': 'var(--r-2xs)', background: 'var(--acc-bg)', color: 'var(--acc-fg)',
        }}
      >
        {texte()}
      </span>
    </Show>
  )
}

export default function LigneChaine(props: LigneChaineProps) {
  return (
    <button
      onClick={props.surOuvrir}
      title={props.entree.nom}
      aria-current={props.active ? 'true' : undefined}
      data-role="ligne-chaine"
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
        // Chaîne en cours (A UX14) : fond d'accent et barre de sélection à gauche.
        'box-shadow': props.active ? 'inset 3px 0 0 var(--acc-fg)' : undefined,
        background: props.active ? 'var(--acc-bg)' : undefined,
        color: props.active ? 'var(--acc-fg)' : undefined,
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
              <span class="tronque" data-role="nom-chaine" style={{ 'font-weight': 'var(--w-strong)', flex: '0 1 auto', 'min-width': '0' }}>{props.entree.nom}</span>
              <Badge4K nom={props.entree.nom} />
              <BadgesVariantes qualites={props.qualites} compact nom={props.entree.nom} />
            </span>
            <span class="tronque" style={{ 'font-size': '12px', 'line-height': '16px', color: 'var(--fg3)' }}>
              {props.programme?.titre ?? 'Aucun programme disponible'}
            </span>
          </span>
        }
      >
      <span style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'min-width': '0' }}>
        <span class="tronque" data-role="nom-chaine" style={{ 'font-weight': 'var(--w-strong)', flex: '0 1 auto', 'min-width': '0' }}>{props.entree.nom}</span>
        <Badge4K nom={props.entree.nom} />
        <BadgesVariantes qualites={props.qualites} compact={!gabarit().startsWith('bureau')} nom={props.entree.nom} />
        <Show when={!estTablette()}>
          <EtiquettePays pays={props.entree.pays} />
        </Show>
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
