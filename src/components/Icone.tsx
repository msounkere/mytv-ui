import { Show } from 'solid-js'
import { FLUENT } from './fluent-icones'

// Le dossier de conception impose Fluent UI System Icons, contour par défaut et
// plein pour l'actif. Les tracés sont inclus dans le bundle plutôt que servis
// par une police : une police d'icônes lit des ligatures, donc elle doit être
// chargée AVANT le premier rendu sous peine d'afficher « live_tv » en toutes
// lettres dans la barre de navigation. Un <svg> n'a pas ce temps mort.
//
// Les écrans appellent des noms que Fluent ne couvre pas (ondemand_video,
// restore). Plutôt que de les laisser disparaître, on retombe sur le
// sous-ensemble Material Symbols déjà embarqué : aucune icône ne manque jamais,
// et le dessin Fluent s'applique partout où il existe.

export default function Icone(props: {
  nom: string
  /** Taille en pixels ; la maquette n'utilise que 16, 18, 20, 22, 24 et 30. */
  taille?: number
  /** Variante pleine : marque l'entrée de navigation active. */
  plein?: boolean
}) {
  const trace = () => FLUENT[props.nom]
  const px = () => `${props.taille ?? 20}px`

  return (
    <Show
      when={trace()}
      fallback={
        <span
          class="icone"
          aria-hidden="true"
          data-plein={props.plein ? '1' : '0'}
          style={{ 'font-size': px() }}
        >
          {props.nom}
        </span>
      }
    >
      {(t) => (
        <svg
          class="icone"
          aria-hidden="true"
          viewBox="0 0 20 20"
          width={px()}
          height={px()}
          fill="currentColor"
        >
          <path d={props.plein ? t()[1] : t()[0]} />
        </svg>
      )}
    </Show>
  )
}
