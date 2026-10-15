import { Match, Switch, type JSX } from 'solid-js'
import type { Details } from '../lib/details'

// Le resume d'un film ou d'une serie, avec ses TROIS etats (US-28) : il arrive
// plus tard que la fiche (le fournisseur ne le donne qu'a la demande), il peut ne
// pas exister, ou le service peut ne pas avoir pu le chercher. L'ecran ne doit
// ni rester vide ni accuser le contenu quand c'est le service qui n'a pas repondu.

export type EtatResume = 'chargement' | 'pret' | 'absent' | 'indisponible'

export function etatResume(o: { details: Details | undefined; erreur: unknown; attendu: boolean }): EtatResume {
  if (o.details) return o.details.synopsis ? 'pret' : 'absent'
  if (o.erreur) return 'indisponible'
  return o.attendu ? 'chargement' : 'absent'
}

export default function ResumeContenu(props: {
  details: Details | undefined
  erreur: unknown
  /** Une demande est attendue ou en cours (contenu qui a des details possibles). */
  attendu: boolean
  surReessayer: () => void
  style?: JSX.CSSProperties
  /** Nombre de lignes affichees avant coupure ; absent = tout. */
  lignes?: number
  /** Hauteur reservee pour que l'arrivee du texte ne decale rien. */
  hauteurMin?: string
}) {
  const etat = () => etatResume(props)
  return (
    <div
      data-role="resume"
      data-etat={etat()}
      aria-busy={etat() === 'chargement'}
      style={{ 'min-height': props.hauteurMin, ...props.style }}
    >
      <Switch>
        <Match when={etat() === 'chargement'}>
          <span class="squelette" style={{ width: '92%', 'margin-bottom': '8px' }} />
          <span class="squelette" style={{ width: '64%' }} />
          <span class="visuellement-cache" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Chargement du résumé…
          </span>
        </Match>
        <Match when={etat() === 'pret'}>
          <p
            style={{
              margin: 0, 'text-wrap': 'pretty', 'white-space': 'pre-line',
              ...(props.lignes
                ? { display: '-webkit-box', '-webkit-line-clamp': props.lignes, '-webkit-box-orient': 'vertical', overflow: 'hidden' }
                : {}),
            }}
          >
            {props.details?.synopsis}
          </p>
        </Match>
        <Match when={etat() === 'absent'}>
          <p style={{ margin: 0, opacity: 0.72 }}>Pas de résumé disponible pour ce contenu.</p>
        </Match>
        <Match when={etat() === 'indisponible'}>
          <p style={{ margin: 0, opacity: 0.72 }}>
            Résumé momentanément indisponible.{' '}
            <button
              onClick={() => props.surReessayer()}
              style={{ padding: 0, border: 0, background: 'none', color: 'inherit', 'text-decoration': 'underline', cursor: 'pointer', font: 'inherit' }}
            >
              Réessayer
            </button>
          </p>
        </Match>
      </Switch>
    </div>
  )
}
