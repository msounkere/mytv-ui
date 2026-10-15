import { Show, createSignal } from 'solid-js'
import { encreLogo, monogramme, tailleMonogramme } from './couleurs'

// Plaque de logo partagée par les deux cartes de chaîne de l'accueil. Comme
// ailleurs, le monogramme est posé d'abord et le logo distant ne le recouvre
// qu'une fois chargé : sur 21 791 chaînes, beaucoup d'icônes n'arrivent jamais.

export default function PlaqueChaine(props: { nom: string; src?: string; largeur: number; hauteur: number }) {
  const [chargee, poserChargee] = createSignal(false)
  const texte = () => monogramme(props.nom)
  return (
    <div
      style={{
        position: 'relative', width: `${props.largeur}px`, height: `${props.hauteur}px`, flex: 'none',
        'border-radius': 'var(--r-xs)', overflow: 'hidden',
        background: 'var(--plate)', color: encreLogo(props.nom),
        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
        'font-family': 'var(--moov-font-heading)', 'font-size': tailleMonogramme(texte()),
        'font-weight': 'var(--w-strong)', 'white-space': 'nowrap',
      }}
    >
      {texte()}
      <Show when={props.src}>
        <img
          src={props.src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => poserChargee(true)}
          onError={() => poserChargee(false)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', 'object-fit': 'contain',
            background: 'var(--plate)', opacity: chargee() ? 1 : 0,
            transition: 'opacity var(--dur) var(--ease)',
          }}
        />
      </Show>
    </div>
  )
}

/** Programme en cours tel que l'accueil le consomme, EPG absent compris. */
export interface ProgrammeCourant {
  titre: string
  debut: number
  fin: number
}

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export function plageHoraire(p: ProgrammeCourant): string {
  return `${HEURE.format(p.debut)} – ${HEURE.format(p.fin)}`
}

export function jusqua(p: ProgrammeCourant): string {
  return `Jusqu’à ${HEURE.format(p.fin)}`
}

/** Part écoulée du programme, bornée : une grille décalée ne doit pas déborder. */
export function avancement(p: ProgrammeCourant, maintenant: number): number {
  if (p.fin <= p.debut) return 0
  return Math.min(1, Math.max(0, (maintenant - p.debut) / (p.fin - p.debut)))
}
