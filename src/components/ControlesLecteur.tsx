import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from './Icone'
import { estBureau, estMobile } from '../lib/gabarit'

// La barre de contrôles est posée SUR la vidéo. Cette surface vaut toujours
// var(--video), quel que soit le thème : ses encres sont donc fixes, sinon le
// thème clair écrirait du gris foncé sur du noir.
export const ENCRE = '#e7edf4'
export const ENCRE2 = '#a3b3c5'
export const ENCRE3 = '#7287a0'

export interface BoutonControle {
  icone: string
  libelle: string
  titre?: string
  /** Le sous-ensemble de police ne contient pas de « skip_previous » ni de
      « forward_10 » : on retourne l'icône symétrique plutôt que d'embarquer
      1,4 Mo de police complète. */
  miroir?: boolean
  actif?: boolean
  /** Bouton sans objet pour l'instant — « dernière chaîne » au premier zap. */
  desactive?: boolean
  /** Bouton que le mobile retire : le téléphone a déjà ses gestes système
      (volume matériel, image dans l'image), et 44 px par cible ne laissent
      pas la place de tout garder sur 390 px. */
  masquerMobile?: boolean
  surAction: () => void
}

export interface ControlesLecteurProps {
  mode: 'live' | 'vod'
  enPause: boolean
  muet: boolean
  volume: number
  position: number
  duree: number
  /** Rappel des touches, affiché entre les deux groupes de boutons. */
  indiceClavier: string
  gauche: BoutonControle[]
  droite: BoutonControle[]
  surLecture: () => void
  surMuet: () => void
  surVolume: (v: number) => void
  surPosition: (v: number) => void
}

export default function ControlesLecteur(props: ControlesLecteurProps) {
  // La largeur qui compte est celle de la vidéo, pas celle de la fenêtre : au
  // seuil de 1100 px, barre latérale déployée, la vidéo ne fait que 540 px.
  // Sous ce plancher, volume et badge cèdent leur place — ils ne servent à rien
  // si « Plein écran » sort du cadre.
  let racine!: HTMLDivElement
  const [largeur, poserLargeur] = createSignal(Infinity)
  onMount(() => {
    const o = new ResizeObserver(() => poserLargeur(racine.clientWidth))
    o.observe(racine)
    poserLargeur(racine.clientWidth)
    onCleanup(() => o.disconnect())
  })
  const etroit = () => largeur() < 660

  const progressable = () => props.mode === 'vod' && props.duree > 0
  // Empilé sous la vidéo, le cadre n'a plus 900 px de haut : la barre ne flotte
  // plus en îlot arrondi, elle occupe toute la largeur comme sur la maquette.
  const flottante = estBureau
  // 44 px est la cible tactile minimale du cahier des charges.
  const cible = () => (estMobile() ? 44 : 38)
  const droite = () => (estMobile() ? props.droite.filter((b) => !b.masquerMobile) : props.droite)

  return (
    <div
      ref={racine}
      style={{
        position: 'absolute',
        left: flottante() ? 'var(--ctl-in)' : 0, right: flottante() ? 'var(--ctl-in)' : 0,
        bottom: flottante() ? 'var(--ctl-in)' : 0,
        // `minmax(0,1fr)` : une piste `auto` prend la largeur du texte intact de
        // l'indice clavier et pousse « Plein écran » hors de la vidéo dès que
        // celle-ci fait moins d'environ 900 px (barre latérale déployée).
        display: 'grid', 'grid-template-columns': 'minmax(0,1fr)', gap: '8px',
        padding: estMobile() ? '8px' : '12px 16px',
        background: 'var(--ov2)', 'backdrop-filter': 'var(--ovblur)',
        'border-radius': flottante() ? 'var(--ctl-r)' : 0,
        'z-index': 2,
        color: ENCRE,
      }}
    >
      <Show when={progressable()}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
          <span class="num" style={{ width: '56px', 'font-size': '12px', color: ENCRE2 }}>
            {mmss(props.position)}
          </span>
          <input
            type="range"
            min="0"
            max={props.duree}
            step="1"
            value={props.position}
            aria-label="Position de lecture"
            onInput={(e) => props.surPosition(e.currentTarget.valueAsNumber)}
            style={{ flex: 1, 'min-width': 0, height: '16px', padding: 0, border: 0, background: 'none' }}
          />
          <span class="num" style={{ width: '56px', 'font-size': '12px', color: ENCRE2, 'text-align': 'right' }}>
            −{mmss(Math.max(0, props.duree - props.position))}
          </span>
        </div>
      </Show>

      <div style={{ display: 'flex', 'align-items': 'center', gap: estMobile() ? 0 : '4px', height: '44px' }}>
        <button
          onClick={props.surLecture}
          title={props.enPause ? 'Lecture (Espace)' : 'Pause (Espace)'}
          aria-label={props.enPause ? 'Lecture' : 'Pause'}
          style={{
            flex: '0 0 auto', display: 'grid', 'place-items': 'center',
            width: estMobile() ? '44px' : '40px', height: estMobile() ? '44px' : '40px', 'border-radius': '50%',
            background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.22)',
            color: ENCRE,
          }}
        >
          <Icone nom={props.enPause ? 'play_arrow' : 'pause'} taille={24} />
        </button>

        <For each={props.gauche}>{(b) => <BoutonLecteur bouton={b} cible={cible()} />}</For>

        {/* Volume : le mobile s'en remet aux touches matérielles du téléphone. */}
        <Show when={!estMobile()}>
        <button
          onClick={props.surMuet}
          title={props.muet ? 'Rétablir le son (M)' : 'Couper le son (M)'}
          aria-pressed={props.muet}
          style={boutonIcone(props.muet ? ENCRE3 : ENCRE)}
        >
          <Icone nom="volume_up" taille={24} plein={!props.muet} />
        </button>

        <Show when={!etroit()}>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={props.muet ? 0 : props.volume}
          aria-label="Volume"
          onInput={(e) => props.surVolume(e.currentTarget.valueAsNumber)}
          style={{ flex: '0 0 auto', width: '90px', height: '16px', padding: 0, border: 0, background: 'none' }}
        />
        </Show>
        </Show>

        <Show when={props.mode === 'live' && !estMobile() && !etroit()}>
          <BadgeDirect />
        </Show>

        <span style={{ flex: 1 }} />

        {/* Le rappel des touches cède la place avant les boutons : la V2 en
            ajoute trois à droite, et c'est eux qu'il faut pouvoir atteindre. */}
        <Show when={estBureau()}>
          <span class="tronque" style={{ flex: '0 1 auto', 'min-width': 0, 'font-size': '11px', color: ENCRE2 }}>
            {props.indiceClavier}
          </span>
        </Show>

        <For each={droite()}>{(b) => <BoutonLecteur bouton={b} cible={cible()} />}</For>
      </div>
    </div>
  )
}

function BoutonLecteur(props: { bouton: BoutonControle; cible: number }) {
  return (
    <button
      onClick={props.bouton.surAction}
      disabled={props.bouton.desactive}
      title={props.bouton.titre ?? props.bouton.libelle}
      aria-label={props.bouton.libelle}
      aria-pressed={props.bouton.actif}
      style={{
        ...boutonIcone(props.bouton.actif ? 'var(--acc-fg)' : ENCRE, props.cible),
        background: props.bouton.actif ? 'rgba(255,255,255,.2)' : undefined,
        opacity: props.bouton.desactive ? 0.4 : undefined,
      }}
    >
      <span style={{ display: 'grid', transform: props.bouton.miroir ? 'scaleX(-1)' : undefined }}>
        <Icone nom={props.bouton.icone} taille={22} plein={props.bouton.actif} />
      </span>
    </button>
  )
}

function BadgeDirect() {
  return (
    <span
      style={{
        flex: '0 0 auto', display: 'inline-flex', 'align-items': 'center', gap: '6px',
        height: '22px', padding: '0 8px',
        background: 'rgba(255,255,255,.1)', 'border-radius': 'var(--r-xs)',
        'font-size': '11px', 'font-weight': 'var(--w-strong)',
        'text-transform': 'uppercase', 'letter-spacing': '.06em', color: ENCRE,
      }}
    >
      <span style={{ width: '6px', height: '6px', 'border-radius': '50%', background: 'var(--err)' }} />
      Direct
    </span>
  )
}

function boutonIcone(couleur: string, cote = 38) {
  return {
    flex: '0 0 auto', display: 'grid', 'place-items': 'center',
    width: `${cote}px`, height: `${cote}px`,
    'border-radius': 'var(--r-btn-md)',
    color: couleur,
  } as const
}

/** Durées de lecture : heures seulement quand il y en a. */
export function mmss(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes < 0) return '--:--'
  const s = Math.floor(secondes % 60)
  const m = Math.floor(secondes / 60) % 60
  const h = Math.floor(secondes / 3600)
  const d2 = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${d2(m)}:${d2(s)}` : `${d2(m)}:${d2(s)}`
}
