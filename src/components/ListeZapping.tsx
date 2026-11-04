import { Show, createEffect, createMemo } from 'solid-js'
import ListeVirtuelle from './ListeVirtuelle'
import SubstitutLogo from './SubstitutLogo'
import EtiquettePays from './EtiquettePays'
import Icone from './Icone'
import { BadgesVariantes } from './LigneChaine'
import { estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'
import { grouperVariantes, qualitesDuGroupe, type Groupe } from '../lib/variantes'
import { indiceGroupeActif } from '../lib/direct-tri'
import { ouvrirGroupe } from '../screens/parcours/ouverture'

/** Hauteur de ligne de la maquette ; sert aussi au recentrage du défilement. */
export const HAUTEUR_LIGNE = 48

// Lot 10 (US-47 CA2, audit A UX15) : la colonne de zapping regroupe les
// variantes comme la liste du Direct — UNE entrée par chaîne (« Chaîne 0 ·
// 4K · HD »), et choisir une entrée ouvre la variante recommandée pour la
// liaison, exactement comme depuis la liste. La chaîne jouée est l'entrée dont
// l'une des variantes est en lecture.

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

  const groupes = createMemo(() => grouperVariantes(props.elements))
  const indiceActif = createMemo(() => indiceGroupeActif(groupes(), props.cleActive))

  // Zapper au clavier doit ramener la chaîne jouée sous les yeux. La zone de
  // défilement appartient à ListeVirtuelle : on la pilote depuis le DOM plutôt
  // que d'ajouter une API à une primitive partagée et testée.
  createEffect(() => {
    const index = indiceActif()
    if (index < 0) return
    const scroller = zone.firstElementChild as HTMLElement | null
    if (!scroller) return
    const haut = index * HAUTEUR_LIGNE
    const bas = haut + HAUTEUR_LIGNE
    if (haut < scroller.scrollTop) scroller.scrollTop = haut
    else if (bas > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bas - scroller.clientHeight
  })

  /** La variante jouée du groupe, sinon celle qu'on recommande. */
  function choisir(g: Groupe<EntreeCatalogue>) {
    const jouee = g.variantes.find((v) => v.cle === props.cleActive)
    if (jouee) return
    void ouvrirGroupe(g, props.surChoisir)
  }

  const sousTitreDe = (g: Groupe<EntreeCatalogue>) => {
    for (const v of g.variantes) {
      const t = props.sousTitre?.(v)
      if (t) return t
    }
    return undefined
  }

  return (
    <>
      <div style={{ display: 'grid', gap: '10px', padding: '14px 14px 10px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <h2 class="tronque" style={{ flex: 1, 'font-size': '13px' }}>{props.titre}</h2>
          <span class="num tertiaire" data-role="zapping-compte" style={{ 'font-size': '11px' }}>
            {groupes().length.toLocaleString('fr-FR')}
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
          elements={groupes()}
          hauteurLigne={HAUTEUR_LIGNE}
          marge={6}
          vide={
            <p class="tertiaire" style={{ margin: 0, padding: '12px 14px', 'font-size': '13px' }}>
              Aucune entrée ne correspond à ce filtre.
            </p>
          }
          ligne={(g) => {
            const actif = () => g.variantes.some((v) => v.cle === props.cleActive)
            const v = () => g.representant
            return (
              <button
                onClick={() => choisir(g)}
                title={g.nom}
                data-role="entree-zapping"
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
                <EtiquettePays pays={v().pays} />
                <SubstitutLogo nom={v().nom} src={v().icone} taille={32} />
                <span style={{ flex: 1, 'min-width': 0, display: 'grid' }}>
                  <span style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'min-width': 0 }}>
                    <span class="tronque" style={{ 'font-size': '13px', 'font-weight': 'var(--w-strong)', flex: '0 1 auto', 'min-width': 0 }}>
                      {g.nom}
                    </span>
                    <BadgesVariantes qualites={qualitesDuGroupe(g)} compact nom={g.nom} />
                  </span>
                  <Show when={sousTitreDe(g)}>
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
