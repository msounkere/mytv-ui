import { createEffect, onCleanup, type JSX } from 'solid-js'

// Panneau latéral du mobile : la colonne de catégories de Direct n'a plus la
// place d'exister à côté de la liste (390 px), elle glisse donc par-dessus.
//
// POURQUOI `visibility` ET JAMAIS `display: none` NI DÉMONTAGE : la colonne
// contient une liste virtualisée qui ne monte AUCUNE ligne si son conteneur n'a
// pas de hauteur réelle à l'attache. Fermé, le panneau garde donc sa hauteur
// (`top: 0; bottom: 0`) et sa position défilée ; seul `visibility` le retire de
// la vue et du focus. Rouvrir est instantané et retrouve la catégorie visée.
//
// RIEN n'est posé quand il est ouvert (jamais de `visibility: visible`) : la
// propriété s'hérite, un `visible` explicite ressusciterait le panneau dans une
// couche d'écran masquée.
//
// Le panneau se pose dans la zone de contenu (position absolue), pas sur toute
// la fenêtre : la barre d'onglets du bas reste utilisable, comme sur la maquette.

export default function PanneauCoulissant(props: {
  ouvert: boolean
  surFermer: () => void
  etiquette: string
  children: JSX.Element
}) {
  createEffect(() => {
    if (!props.ouvert) return
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.surFermer()
    }
    document.addEventListener('keydown', echap)
    onCleanup(() => document.removeEventListener('keydown', echap))
  })

  const duree = 'var(--dur, 200ms)'

  return (
    <>
      {/* `click` et non `pointerdown` : Solid délègue ses événements au
          document, un panneau démonté entre l'appui et le relâchement
          n'émettrait jamais son clic. Ici le voile se ferme au clic complet. */}
      <div
        aria-hidden="true"
        onClick={props.surFermer}
        style={{
          position: 'absolute', inset: '0', 'z-index': '40',
          background: 'rgba(0,0,0,.5)',
          opacity: props.ouvert ? '1' : '0',
          visibility: props.ouvert ? undefined : 'hidden',
          'pointer-events': props.ouvert ? 'auto' : 'none',
          transition: `opacity ${duree} var(--ease, ease-out), visibility 0s linear ${props.ouvert ? '0s' : '200ms'}`,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.etiquette}
        aria-hidden={!props.ouvert}
        style={{
          position: 'absolute', top: '0', bottom: '0', left: '0', 'z-index': '41',
          width: 'min(320px, calc(100% - 56px))',
          display: 'flex', 'flex-direction': 'column', 'min-height': '0',
          background: 'var(--panel)',
          'box-shadow': props.ouvert ? 'var(--moov-shadow-2xl)' : 'none',
          transform: props.ouvert ? 'none' : 'translateX(-100%)',
          visibility: props.ouvert ? undefined : 'hidden',
          transition: `transform ${duree} var(--ease, ease-out), visibility 0s linear ${props.ouvert ? '0s' : '200ms'}`,
        }}
      >
        {props.children}
      </div>
    </>
  )
}
