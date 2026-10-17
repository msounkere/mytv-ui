import { Show } from 'solid-js'
import Icone from './Icone'
import { ENCRE, ENCRE2, mmss } from './ControlesLecteur'
import { estBureau, estMobile } from '../lib/gabarit'

// Trois calques qui se posent sur l'image sans jamais la couper : on propose
// une reprise, on annonce une reconnexion, on enchaîne un épisode. Aucun des
// trois ne décide à la place de l'utilisateur — chacun porte son refus.

/** Fond de verre des calques du lecteur ; la surface est toujours sombre. */
const VERRE = 'rgba(20,20,20,.88)'
const CADRE = '1px solid rgba(255,255,255,.12)'

const calque = {
  position: 'absolute', 'z-index': 4,
  'backdrop-filter': 'blur(24px)',
  border: CADRE, 'border-radius': 'var(--r-md)',
  color: ENCRE, animation: 'fadein var(--dur) var(--ease)',
} as const

/**
 * Empilée sous la liste, la vidéo ne fait plus que 219 px de haut sur mobile :
 * un calque plus haut qu'elle serait rogné par `overflow: hidden`, et ses
 * boutons deviendraient inatteignables. Il défile donc plutôt que de déborder.
 */
const borne = () =>
  estBureau() ? {} : ({ 'max-height': 'calc(100% - 16px)', overflow: 'auto' } as const)

/**
 * Reprise proposée, jamais imposée : le dossier fixe le seuil à 60 s, en
 * dessous desquelles rouvrir au début ne coûte rien.
 */
export const SEUIL_REPRISE = 60

export function DialogueReprise(props: {
  titre: string
  position: number
  surReprendre: () => void
  surRecommencer: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Reprendre la lecture"
      data-role="reprise"
      style={{
        ...calque,
        ...borne(),
        left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        display: 'flex', 'flex-direction': 'column', gap: '12px',
        padding: '20px', width: 'min(340px, calc(100% - 32px))',
        background: 'rgba(20,20,20,.86)',
      }}
    >
      <span style={{ 'font-size': '17px', 'font-weight': 'var(--w-strong)' }}>Reprendre la lecture ?</span>
      <span class="tronque" style={{ 'font-size': '13px', color: ENCRE2 }}>
        Vous vous étiez arrêté pendant « {props.titre} ».
      </span>
      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
        <BoutonCalque principal surAction={props.surReprendre}>
          Reprendre à {mmss(props.position)}
        </BoutonCalque>
        <BoutonCalque surAction={props.surRecommencer}>Depuis le début</BoutonCalque>
      </div>
    </div>
  )
}

/**
 * Reconnexion : le dossier interdit l'écran noir silencieux. Tant qu'un essai
 * reste, on dit lequel et quand — l'erreur nommée n'arrive qu'après le
 * troisième échec.
 */
/** « 45 s », « 2 min 05 » : l'attente d'une place peut durer des minutes. */
function duree(s: number): string {
  const n = Math.max(0, Math.round(s))
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)} min${n % 60 ? ` ${String(n % 60).padStart(2, '0')}` : ''}`
}

export function BandeauReconnexion(props: {
  essai: number
  total: number
  dans: number
  /** `occupe` : la place du fournisseur est prise, ce n'est pas une panne. */
  motif?: 'occupe' | 'panne'
  /** Attente « compte occupe » : message du serveur, coupure ou non, secondes deja attendues. */
  occupation?: { message: string; coupure: boolean; attendu: number; plafond: number }
}) {
  return (
    <div
      role="status"
      data-role="reconnexion"
      style={{
        ...calque,
        ...borne(),
        // `left: 50%` réduit la boîte à la moitié de la vidéo : sur 390 px le
        // message tombait sur cinq lignes. Hors bureau il prend la largeur.
        ...(estBureau()
          ? { left: '50%', transform: 'translateX(-50%)', 'max-width': 'calc(100% - 32px)' }
          : { left: '8px', right: '8px' }),
        top: estBureau() ? '16px' : '8px',
        display: 'flex', 'align-items': 'center', gap: '12px',
        padding: estBureau() ? '10px 16px' : '8px 12px',
        background: 'rgba(74,30,4,.92)', 'backdrop-filter': 'none', border: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: '0 0 auto', width: '18px', height: '18px', 'border-radius': '50%',
          border: '2px solid rgba(255,255,255,.2)', 'border-top-color': 'var(--lim)',
          animation: 'spin .8s linear infinite',
        }}
      />
      <div style={{ display: 'flex', 'flex-direction': 'column', 'min-width': 0 }}>
        <span style={{ 'font-weight': 'var(--w-strong)' }}>
          {props.occupation
            ? props.occupation.message
            : props.motif === 'occupe'
            ? 'Place occupée — nouvelle tentative automatique'
            : 'Connexion interrompue — reconnexion automatique'}
        </span>
        <span class="num" style={{ 'font-size': '12px', color: 'var(--lim)' }}>
          {props.occupation
            ? `Reprise automatique · nouvel essai dans ${props.dans} s · attente ${duree(props.occupation.attendu)} sur ${duree(props.occupation.plafond)} au plus`
            : `Tentative ${props.essai} sur ${props.total} · nouvel essai dans ${props.dans} s`}
        </span>
      </div>
    </div>
  )
}

/** Décompte avant l'épisode suivant, mesuré sur la maquette. */
export const REBOURS_EPISODE = 10
/** Secondes restantes à partir desquelles le décompte démarre. */
export const AVANT_FIN_EPISODE = 15

export function ProchainEpisode(props: {
  titre: string
  restant: number
  surLire: () => void
  surAnnuler: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Épisode suivant"
      data-role="prochain-episode"
      style={{
        ...calque,
        ...borne(),
        right: estBureau() ? '16px' : '8px', bottom: estBureau() ? '120px' : '84px',
        display: 'flex', 'flex-direction': 'column', gap: '10px',
        padding: '16px', width: 'min(320px, calc(100% - 32px))',
        background: VERRE,
      }}
    >
      <span class="num" style={{ 'font-size': '12px', 'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)' }}>
        Épisode suivant dans {props.restant} s
      </span>
      <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{props.titre}</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <BoutonCalque principal icone="play_arrow" surAction={props.surLire}>Lire maintenant</BoutonCalque>
        <BoutonCalque surAction={props.surAnnuler}>Annuler</BoutonCalque>
      </div>
    </div>
  )
}

function BoutonCalque(props: {
  principal?: boolean
  icone?: string
  surAction: () => void
  children: string | (string | number)[]
}) {
  return (
    <button
      onClick={props.surAction}
      style={{
        display: 'flex', 'align-items': 'center', gap: '4px',
        height: estMobile() ? '44px' : '34px', padding: '0 14px',
        'border-radius': 'var(--r-btn-md)',
        'font-weight': 'var(--w-strong)',
        background: props.principal ? '#fff' : 'transparent',
        color: props.principal ? '#000' : ENCRE,
        border: props.principal ? '1px solid #fff' : '1px solid rgba(255,255,255,.4)',
      }}
    >
      <Show when={props.icone}>
        {(i) => <Icone nom={i()} taille={18} plein />}
      </Show>
      {props.children}
    </button>
  )
}
