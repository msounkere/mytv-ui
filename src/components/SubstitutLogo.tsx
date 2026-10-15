import { Show, createMemo, createSignal } from 'solid-js'

// Les logos sont souvent absents ou servis par un hôte qui ne répond pas. On
// affiche donc TOUJOURS le substitut typographique d'emblée, et l'image ne
// vient par-dessus qu'une fois réellement chargée : aucune attente, aucun
// carré vide pendant l'expiration du délai réseau.

function teinte(nom: string): number {
  let h = 0
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360
  return h
}

function initiales(nom: string): string {
  const mots = nom.replace(/[^\p{L}\p{N}\s.\-_]/gu, ' ').split(/[\s.\-_]+/).filter(Boolean)
  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0]!.slice(0, 2).toUpperCase()
  return (mots[0]![0]! + mots[1]![0]!).toUpperCase()
}

export interface SubstitutLogoProps {
  nom: string
  src?: string
  taille?: number
  /** Jaquette (2:3) plutôt que logo (1:1). */
  affiche?: boolean
}

export default function SubstitutLogo(props: SubstitutLogoProps) {
  const [charge, poserCharge] = createSignal(false)
  const t = createMemo(() => teinte(props.nom))
  const largeur = () => props.taille ?? 28
  const hauteur = () => (props.affiche ? Math.round(largeur() * 1.5) : largeur())

  return (
    <div
      style={{
        position: 'relative', flex: '0 0 auto',
        width: `${largeur()}px`, height: `${hauteur()}px`,
        display: 'grid', 'place-items': 'center',
        'border-radius': 'var(--r-sm)',
        background: `oklch(0.28 0.04 ${t()})`,
        color: `oklch(0.82 0.06 ${t()})`,
        'font-size': `${Math.round(largeur() * 0.36)}px`,
        'font-weight': 'var(--w-strong)',
        overflow: 'hidden',
      }}
    >
      <span aria-hidden="true">{initiales(props.nom)}</span>
      <Show when={props.src}>
        <img
          src={props.src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => poserCharge(true)}
          onError={() => poserCharge(false)}
          style={{
            position: 'absolute', inset: '0',
            width: '100%', height: '100%', 'object-fit': 'contain',
            background: 'var(--elev)',
            opacity: charge() ? '1' : '0',
            transition: 'opacity var(--dur) var(--ease)',
          }}
        />
      </Show>
    </div>
  )
}
