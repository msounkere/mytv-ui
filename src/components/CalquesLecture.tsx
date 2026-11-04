import { For, Show, onMount } from 'solid-js'
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
 * Calque de FIN (épisode suivant, film terminé) : au bureau, un îlot en bas à
 * droite ; sur téléphone et tablette, ANCRÉ EN BAS DE LA ZONE VIDÉO, pleine
 * largeur, jamais plus haut que la zone -- il débordait par le haut du cadre de
 * 219 px (B17, C13) ; il passe au-dessus de la barre de commandes (z-index).
 */
const positionFin = () =>
  estBureau()
    ? ({ right: '16px', bottom: '120px', width: 'min(340px, calc(100% - 32px))' } as const)
    : ({ left: '8px', right: '8px', bottom: '8px', 'max-height': 'calc(100% - 16px)', overflow: 'auto', 'z-index': 5 } as const)

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

/**
 * Épisode suivant (US-43 CA4, US-45 CA5) : pendant le décompte, « Épisode suivant
 * dans 10 s · ● Prêt — démarre sans attente » + « Lire maintenant / Annuler » ;
 * après une annulation, à la vraie fin, le MÊME calque reste, sans décompte :
 * « Épisode suivant · [Lire] [Revenir à la série] » (jamais une image figée).
 * Il nomme l'épisode (repère, titre) avec sa vignette (B UX15).
 */
export function ProchainEpisode(props: {
  /** Libelle complet (« Serie — S01E02 »), repli quand la fiche n'a pas donne le titre. */
  titre: string
  /** Repere « S01E02 » et titre de l'episode, quand les saisons les donnent. */
  repere?: string
  titreEpisode?: string
  vignette?: string
  /** Secondes restantes ; `null` = calque persistant sans decompte. */
  restant: number | null
  /** Le serveur tient deja l'episode suivant sur son disque (US-43 CA4) : on le dit. */
  pret?: boolean
  surLire: () => void
  surAnnuler: () => void
  surRevenir?: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Épisode suivant"
      data-role="prochain-episode"
      data-decompte={props.restant === null ? 'non' : 'oui'}
      style={{
        ...calque,
        ...positionFin(),
        display: 'flex', 'flex-direction': 'column', gap: '8px',
        padding: estMobile() ? '10px 12px' : '16px',
        background: VERRE,
      }}
    >
      <span class="num" style={{ 'font-size': '12px', 'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)' }}>
        {props.restant === null ? 'Épisode suivant' : `Épisode suivant dans ${props.restant} s`}
        <Show when={props.pret}>
          <span data-role="suivant-pret" style={{ color: 'var(--ok)' }}> · ● Prêt — démarre sans attente</span>
        </Show>
      </span>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'min-width': 0 }}>
        <Show when={props.vignette}>
          {(v) => <img src={v()} alt="" decoding="async" style={{ width: '64px', height: '36px', 'object-fit': 'cover', 'border-radius': 'var(--r-2xs)', flex: '0 0 auto', background: 'var(--video)' }} />}
        </Show>
        <span style={{ display: 'grid', 'min-width': 0 }}>
          <span class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>
            {props.repere ? `${props.repere}${props.titreEpisode ? ` · ${props.titreEpisode}` : ''}` : props.titre}
          </span>
          <Show when={props.repere}>
            <span class="tronque" style={{ 'font-size': '12px', color: ENCRE2 }}>{props.titre}</span>
          </Show>
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
        <BoutonCalque principal icone="play_arrow" surAction={props.surLire}>
          {props.restant === null ? 'Lire' : 'Lire maintenant'}
        </BoutonCalque>
        <Show when={props.restant !== null} fallback={<BoutonCalque surAction={props.surRevenir ?? props.surAnnuler}>Revenir à la série</BoutonCalque>}>
          <BoutonCalque surAction={props.surAnnuler}>Annuler</BoutonCalque>
        </Show>
      </div>
    </div>
  )
}

export interface EntreeMenuLecteur {
  icone: string
  libelle: string
  /** Precision en dessous (« passer en Éco (débit réduit) »). */
  detail?: string
  actif?: boolean
  action: () => void
}

/**
 * Menu « ⋯ » du lecteur hors bureau (US-45 CA6) : Diffuser, Pistes, Qualité, Infos,
 * Image dans l'image, Ma liste, Arrêter -- ce que la barre compacte ne porte pas.
 * Un calque DANS le cadre (il reste visible en plein écran), fermé par Échap, par
 * un tap sur l'image ou par le choix d'une entrée ; flèches ↑↓ au clavier.
 */
export function MenuLecteur(props: { entrees: EntreeMenuLecteur[]; surFermer: () => void }) {
  let racine!: HTMLDivElement
  onMount(() => (racine.querySelector('button') as HTMLButtonElement | null)?.focus())
  const auClavier = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const boutons = Array.from(racine.querySelectorAll('button'))
    const i = boutons.indexOf(document.activeElement as HTMLButtonElement)
    const n = boutons.length
    boutons[((i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus()
  }
  return (
    <div
      ref={racine}
      role="menu"
      aria-label="Plus d’options"
      data-role="menu-lecteur"
      onKeyDown={auClavier}
      onClick={(e) => e.stopPropagation()}
      style={{
        ...calque,
        left: '8px', right: '8px', bottom: '8px', 'max-height': 'calc(100% - 16px)', overflow: 'auto', 'z-index': 6,
        display: 'grid', padding: '6px', background: 'rgba(20,20,20,.94)',
      }}
    >
      <For each={props.entrees}>
        {(e) => (
          <button
            type="button"
            role="menuitem"
            aria-pressed={e.actif}
            onClick={() => { props.surFermer(); e.action() }}
            style={{
              display: 'flex', 'align-items': 'center', gap: '12px', height: estMobile() ? '44px' : '40px', padding: '0 10px',
              'border-radius': 'var(--r-xs)', 'text-align': 'left', color: e.actif ? 'var(--acc-fg)' : ENCRE, 'font-size': '14px',
            }}
          >
            <Icone nom={e.icone} taille={20} plein={e.actif} />
            <span style={{ display: 'grid', 'min-width': 0 }}>
              <span class="tronque">{e.libelle}</span>
              <Show when={e.detail}>{(d) => <span class="tronque" style={{ 'font-size': '12px', color: ENCRE2 }}>{d()}</span>}</Show>
            </span>
          </button>
        )}
      </For>
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

/**
 * Fin d'un film ou du DERNIER episode d'une serie (US-43 CA4, US-45 CA5) : « Film
 * terminé ✓ » / « Série terminée ✓ », puis « Prochain dans Ma liste · ● Prêt »
 * -- PROPOSE, jamais lance tout seul, et jamais le contenu que l'on vient de
 * finir. Sans prochain : « Regarder à nouveau » et « Fermer » (plus d'impasse, B UX6).
 */
export function ProchainContenu(props: {
  /** Ce qui vient de finir. */
  fin: 'film' | 'serie'
  /** Le prochain element de Ma liste, s'il y en a un. */
  prochain?: { titre: string; type: 'vod' | 'series' | 'live'; pret?: boolean }
  surRegarder: () => void
  surRevoir: () => void
  surFermer: () => void
}) {
  const titreFin = () => (props.fin === 'serie' ? 'Série terminée ✓' : 'Film terminé ✓')
  return (
    <div
      role="dialog"
      aria-label={titreFin()}
      data-role="prochain-contenu"
      data-fin={props.fin}
      style={{
        ...calque,
        ...positionFin(),
        display: 'flex', 'flex-direction': 'column', gap: '8px',
        padding: estMobile() ? '10px 12px' : '16px',
        background: VERRE,
      }}
    >
      <span style={{ 'font-size': '12px', 'font-weight': 'var(--w-strong)', color: 'var(--acc-fg)' }}>
        {titreFin()}
        <Show when={props.prochain}>
          {' · '}Prochain dans Ma liste
          <Show when={props.prochain?.pret}>
            <span data-role="suivant-pret" style={{ color: 'var(--ok)' }}> · ● Prêt</span>
          </Show>
        </Show>
      </span>
      <Show when={props.prochain}>
        {(p) => <span data-role="prochain-titre" class="tronque" style={{ 'font-weight': 'var(--w-strong)' }}>{p().titre}</span>}
      </Show>
      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
        <Show
          when={props.prochain}
          fallback={<BoutonCalque principal icone="refresh" surAction={props.surRevoir}>Regarder à nouveau</BoutonCalque>}
        >
          {(p) => (
            <BoutonCalque principal icone="play_arrow" surAction={props.surRegarder}>
              {p().type === 'series' ? 'Ouvrir la série' : 'Regarder'}
            </BoutonCalque>
          )}
        </Show>
        <BoutonCalque surAction={props.surFermer}>Fermer</BoutonCalque>
      </div>
    </div>
  )
}
