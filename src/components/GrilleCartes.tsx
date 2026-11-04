import { gabarit as gabaritEcran } from '../lib/gabarit'
import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from 'solid-js'
import ListeVirtuelle from './ListeVirtuelle'
import CarteDirect from './CarteDirect'
import { memoriserDefilement } from './memoireDefilement'
import type { EntreeCatalogue } from '../lib/db'
import type { ProgrammeCourant } from './PlaqueChaine'

// Mode « Cartes » de Direct. Même parti que la grille d'affiches : c'est la
// RANGÉE qui est virtualisée, pas la carte — une catégorie de 500 chaînes ne
// fait que 170 rangées, et le virtualiseur exige une hauteur de ligne
// constante, que `repeat(auto-fill)` ne donnerait pas.
//
// Valeurs relevées au getComputedStyle sur « Lecteur IPTV.dc.html » : retrait
// 20 px, écart 16 px, largeur minimale 230 px, pas de rangée = hauteur 16/9 de
// la carte + 76 px de pied + l'écart.

const HAUTEUR_PIED = 76

// Retrait, écart et largeur minimale par gabarit. Le mobile serre les marges
// (12/10 px, comme l'Accueil) et descend à 150 px : sur 390 px, DEUX colonnes de
// 177 px, comme la maquette (230 px n'en laissait qu'une, de 366 px de large).
const MESURES = {
  bureau: { bord: 20, ecart: 16, min: 230 },
  tablette: { bord: 20, ecart: 16, min: 230 },
  mobile: { bord: 12, ecart: 10, min: 150 },
} as const

interface Gabarit {
  colonnes: number
  pas: number
}

export interface GrilleCartesProps {
  elements: EntreeCatalogue[]
  surOuvrir: (e: EntreeCatalogue) => void
  programme: (e: EntreeCatalogue) => ProgrammeCourant | undefined
  /** Horloge partagée par toutes les cartes de la grille. */
  maintenant: number
  vide?: JSX.Element
  /** Identité de la vue dont on retient la position de défilement. */
  cleVue?: string
}

export default function GrilleCartes(props: GrilleCartesProps) {
  const [boite, poserBoite] = createSignal<HTMLDivElement | null>(null)
  const [largeur, poserLargeur] = createSignal(0)

  createEffect(() => {
    const el = boite()
    if (!el) return
    const mesurer = () => poserLargeur(el.clientWidth)
    // La mesure est différée d'une image : écrire le signal DANS le rappel
    // re-pose la grille pendant la même passe de disposition, ce que WebKit
    // remonte en « ResizeObserver loop completed with undelivered
    // notifications » (audit D17).
    let demande = 0
    const observateur = new ResizeObserver(() => {
      cancelAnimationFrame(demande)
      demande = requestAnimationFrame(mesurer)
    })
    observateur.observe(el)
    mesurer()
    onCleanup(() => {
      cancelAnimationFrame(demande)
      observateur.disconnect()
    })
  })

  const m = () => MESURES[gabaritEcran()]
  const disponible = createMemo(() => Math.max(0, largeur() - m().bord * 2))
  const colonnes = createMemo(() =>
    Math.max(1, Math.floor((disponible() + m().ecart) / (m().min + m().ecart))),
  )
  // Le gabarit ne porte que des entiers : le virtualiseur est remonté à chaque
  // nouveau gabarit, il ne doit donc pas changer à chaque pixel de
  // redimensionnement mais seulement quand la géométrie change vraiment.
  const hauteurVignette = createMemo(() =>
    Math.round(((disponible() - m().ecart * (colonnes() - 1)) / colonnes()) * 9 / 16),
  )
  const gabarit = createMemo<Gabarit>(() => ({
    colonnes: colonnes(),
    pas: hauteurVignette() + HAUTEUR_PIED + m().ecart,
  }))

  const rangees = createMemo(() => {
    const n = gabarit().colonnes
    const tout = props.elements
    const out: EntreeCatalogue[][] = []
    for (let i = 0; i < tout.length; i += n) out.push(tout.slice(i, i + n))
    return out
  })

  memoriserDefilement({
    hote: boite,
    cle: () => props.cleVue ?? null,
    pret: () => largeur() > 0 && props.elements.length > 0,
  })

  return (
    <div ref={poserBoite} style={{ flex: '1', 'min-height': '0' }}>
      <Show when={largeur() > 0 && gabarit()} keyed>
        {(g) => (
          <ListeVirtuelle
            elements={rangees()}
            hauteurLigne={g.pas}
            marge={2}
            vide={props.vide}
            ligne={(rangee) => (
              <div
                style={{
                  display: 'grid',
                  'grid-template-columns': `repeat(${g.colonnes}, minmax(0, 1fr))`,
                  gap: `${m().ecart}px`,
                  padding: `${m().ecart}px ${m().bord}px 0`,
                }}
              >
                <For each={rangee}>
                  {(e) => (
                    <CarteDirect
                      entree={e}
                      programme={props.programme(e)}
                      maintenant={props.maintenant}
                      surOuvrir={props.surOuvrir}
                    />
                  )}
                </For>
              </div>
            )}
          />
        )}
      </Show>
    </div>
  )
}
