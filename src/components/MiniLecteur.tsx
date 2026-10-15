import { Show } from 'solid-js'
import SubstitutLogo from './SubstitutLogo'
import Icone from './Icone'
import { estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Quitter le lecteur ne coupe jamais la lecture : le flux reste attaché, et
// c'est ce bloc qui le dit. Son bouton « Fermer » est le SEUL qui libère la
// connexion — tout le reste ne fait que naviguer.

/** Largeurs mesurées sur la maquette, bureau. */
export const LARGEUR_MINI = 320
const LARGEUR_MINI_REDUIT = 300
/** Marge au bord de l'écran ; sert aussi à poser les notifications au-dessus. */
export const MARGE_MINI = 16
/** Hauteurs mesurées sur le rendu réel ; la notification se pose au-dessus. */
export function hauteurMini(reduit: boolean): number {
  // En mobile le mini-lecteur est toujours une barre : 3 px de progression plus
  // une ligne de 44 px, la cible tactile minimale.
  if (estMobile()) return 47
  return reduit ? 51 : 232
}

export default function MiniLecteur(props: {
  entree: EntreeCatalogue
  /** Programme en direct, ou titre du contenu en VOD. */
  sousTitre?: string
  /** 0 à 1 — avancement du programme ou du fichier. */
  avancement: number
  /** « Connexion… », « En pause », « Erreur de lecture » — vide si tout va bien. */
  etat?: string
  muet: boolean
  reduit: boolean
  surOuvrir: () => void
  surMuet: () => void
  surReduire: () => void
  surFermer: () => void
}) {
  return (
    <div
      role="region"
      aria-label="Mini-lecteur"
      data-role="mini-lecteur"
      style={
        estMobile()
          ? {
              // Pleine largeur, posé sur la barre d'onglets et non devant elle :
              // elle doit rester atteignable pendant qu'un flux est attaché.
              position: 'fixed', left: 0, right: 0, bottom: 'var(--hauteur-onglets)',
              'z-index': 30, overflow: 'hidden',
              background: 'var(--elev)', 'border-top': '1px solid var(--line2)',
              'box-shadow': '0 -4px 12px rgba(0, 0, 0, .28)',
              animation: 'fadein var(--dur) var(--ease)',
            }
          : {
              position: 'fixed', right: `${MARGE_MINI}px`, bottom: `${MARGE_MINI}px`,
              width: `${props.reduit ? LARGEUR_MINI_REDUIT : LARGEUR_MINI}px`,
              'z-index': 30, 'border-radius': 'var(--r-md)', overflow: 'hidden',
              background: 'var(--elev)', border: '1px solid var(--line2)',
              'box-shadow': 'var(--moov-shadow-2xl)',
              animation: 'fadein var(--dur) var(--ease)',
            }
      }
    >
      {/* Pas de vignette en mobile : 220 px de hauteur volés au contenu pour
          afficher un logo que la ligne du dessous porte déjà. */}
      <Show when={!props.reduit && !estMobile()}>
        <button
          onClick={props.surOuvrir}
          aria-label="Revenir au lecteur"
          style={{
            position: 'relative', display: 'grid', 'place-items': 'center',
            width: '100%', 'aspect-ratio': '16 / 9',
            background: 'var(--video)', 'border-radius': 0,
          }}
        >
          <SubstitutLogo nom={props.entree.nom} src={props.entree.icone} taille={56} />
          <Show when={props.etat}>
            {(e) => (
              <span
                style={{
                  position: 'absolute', left: '8px', top: '8px',
                  display: 'flex', 'align-items': 'center', height: '20px', padding: '0 7px',
                  'border-radius': 'var(--r-2xs)',
                  background: 'rgba(20,20,20,.85)', color: '#fff', 'font-size': '11px',
                }}
              >
                {e()}
              </span>
            )}
          </Show>
        </button>
      </Show>

      <div style={{ height: '3px', background: 'var(--line2)' }}>
        <span
          style={{
            display: 'block', height: '100%',
            width: `${Math.max(0, Math.min(1, props.avancement)) * 100}%`,
            background: 'var(--acc-fg)',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex', 'align-items': 'center', gap: '8px',
          padding: estMobile() ? '0 4px 0 12px' : '8px 6px 8px 10px',
        }}
      >
        <button
          onClick={props.surOuvrir}
          aria-label="Revenir au lecteur"
          style={{
            flex: 1, 'min-width': 0, display: 'flex', 'align-items': 'center', gap: '10px',
            padding: 0, 'text-align': 'left', background: 'none', border: 0,
          }}
        >
          <SubstitutLogo nom={props.entree.nom} src={props.entree.icone} taille={30} />
          <span style={{ display: 'flex', 'flex-direction': 'column', 'min-width': 0 }}>
            <span class="tronque" style={{ 'font-size': '13px', 'font-weight': 'var(--w-strong)' }}>
              {props.entree.nom}
            </span>
            <span class="tronque tertiaire" style={{ 'font-size': '12px' }}>
              {props.sousTitre ?? props.etat ?? ''}
            </span>
          </span>
        </button>

        <Show when={!estMobile()}>
          <BoutonMini
            icone={props.reduit ? 'expand_less' : 'expand_more'}
            libelle={props.reduit ? 'Agrandir le mini-lecteur' : 'Réduire le mini-lecteur'}
            surAction={props.surReduire}
          />
        </Show>
        <BoutonMini
          icone={props.muet ? 'volume_off' : 'volume_up'}
          libelle={props.muet ? 'Rétablir le son' : 'Couper le son'}
          surAction={props.surMuet}
        />
        <BoutonMini icone="close" libelle="Fermer la lecture" surAction={props.surFermer} />
      </div>
    </div>
  )
}

function BoutonMini(props: { icone: string; libelle: string; surAction: () => void }) {
  return (
    <button
      onClick={props.surAction}
      aria-label={props.libelle}
      title={props.libelle}
      style={{
        flex: '0 0 auto', display: 'grid', 'place-items': 'center',
        width: estMobile() ? '44px' : '32px', height: estMobile() ? '44px' : '32px',
        'border-radius': 'var(--r-xs)',
      }}
    >
      <Icone nom={props.icone} taille={18} />
    </button>
  )
}
