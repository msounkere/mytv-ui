import { Show, createEffect } from 'solid-js'
import ListeVirtuelle from './ListeVirtuelle'
import SubstitutLogo from './SubstitutLogo'
import EtiquettePays from './EtiquettePays'
import Icone from './Icone'
import { estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

/** Hauteur de ligne de la maquette ; sert aussi au recentrage du défilement. */
export const HAUTEUR_LIGNE = 48

export interface ListeZappingProps {
  titre: string
  elements: EntreeCatalogue[]
  cleActive: string
  filtre: string
  surFiltre: (v: string) => void
  /** Seconde ligne d'une entrée — le programme en cours quand on le connaît. */
  sousTitre?: (e: EntreeCatalogue) => string | undefined
  surChoisir: (e: EntreeCatalogue) => void
}

export default function ListeZapping(props: ListeZappingProps) {
  let zone!: HTMLDivElement

  // Zapper au clavier doit ramener la chaîne jouée sous les yeux. La zone de
  // défilement appartient à ListeVirtuelle : on la pilote depuis le DOM plutôt
  // que d'ajouter une API à une primitive partagée et testée.
  createEffect(() => {
    const index = props.elements.findIndex((e) => e.cle === props.cleActive)
    if (index < 0) return
    const scroller = zone.firstElementChild as HTMLElement | null
    if (!scroller) return
    const haut = index * HAUTEUR_LIGNE
    const bas = haut + HAUTEUR_LIGNE
    if (haut < scroller.scrollTop) scroller.scrollTop = haut
    else if (bas > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bas - scroller.clientHeight
  })

  return (
    <>
      <div style={{ display: 'grid', gap: '10px', padding: '14px 14px 10px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <h2 class="tronque" style={{ flex: 1, 'font-size': '13px' }}>{props.titre}</h2>
          <span class="num tertiaire" style={{ 'font-size': '11px' }}>
            {props.elements.length.toLocaleString('fr-FR')}
          </span>
        </div>
        <div style={{ position: 'relative', display: 'grid' }}>
          <span
            class="tertiaire"
            style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', display: 'grid' }}
          >
            <Icone nom="tune" taille={16} />
          </span>
          <input
            value={props.filtre}
            onInput={(e) => props.surFiltre(e.currentTarget.value)}
            placeholder="Filtrer · ↑ ↓ pour zapper"
            aria-label="Filtrer la liste de zapping"
            style={{ height: estMobile() ? '44px' : '30px', padding: '0 10px 0 32px', 'font-size': '13px' }}
          />
        </div>
      </div>

      <div ref={zone} style={{ 'min-height': 0 }}>
        <ListeVirtuelle
          elements={props.elements}
          hauteurLigne={HAUTEUR_LIGNE}
          marge={6}
          vide={
            <p class="tertiaire" style={{ margin: 0, padding: '12px 14px', 'font-size': '13px' }}>
              Aucune entrée ne correspond à ce filtre.
            </p>
          }
          ligne={(v) => {
            const actif = () => v.cle === props.cleActive
            return (
              <button
                onClick={() => props.surChoisir(v)}
                title={v.nom}
                aria-current={actif() ? 'true' : undefined}
                style={{
                  display: 'flex', 'align-items': 'center', gap: '10px',
                  width: '100%', height: '100%', padding: '0 14px',
                  'text-align': 'left', 'border-radius': 0,
                  'border-left': `3px solid ${actif() ? 'var(--acc)' : 'transparent'}`,
                  background: actif() ? 'var(--acc-bg)' : undefined,
                  color: actif() ? 'var(--acc-fg)' : undefined,
                }}
              >
                <EtiquettePays pays={v.pays} />
                <SubstitutLogo nom={v.nom} src={v.icone} taille={32} />
                <span style={{ flex: 1, 'min-width': 0, display: 'grid' }}>
                  <span class="tronque" style={{ 'font-size': '13px', 'font-weight': 'var(--w-strong)' }}>
                    {v.nom}
                  </span>
                  <Show when={props.sousTitre?.(v)}>
                    {(s) => (
                      <span class="tronque tertiaire" style={{ 'font-size': '11px' }}>{s()}</span>
                    )}
                  </Show>
                </span>
              </button>
            )
          }}
        />
      </div>
    </>
  )
}
