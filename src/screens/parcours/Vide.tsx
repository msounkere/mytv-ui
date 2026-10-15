import type { JSX } from 'solid-js'

// États vides de Direct. Le message nomme la cause plutôt que de constater
// l'absence : « Catégorie vide » et « Aucune chaîne ne correspond » n'appellent
// pas le même geste.

export function Vide(props: { titre: string; texte: string }): JSX.Element {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '6px',
        padding: '24px',
        'text-align': 'center',
        color: 'var(--fg3)',
      }}
    >
      <div class="secondaire" style={{ 'font-weight': 'var(--w-strong)' }}>{props.titre}</div>
      <div style={{ 'max-width': '360px' }}>{props.texte}</div>
    </div>
  )
}

export function VideChaines(props: { filtre: string }): JSX.Element {
  return (
    <Vide
      titre={props.filtre ? 'Aucune chaîne ne correspond' : 'Catégorie vide'}
      texte={
        props.filtre
          ? 'Essayez la recherche globale pour chercher dans tout le catalogue.'
          : 'Aucune chaîne dans cette catégorie.'
      }
    />
  )
}
