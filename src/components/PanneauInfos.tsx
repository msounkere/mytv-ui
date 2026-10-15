import { estMobile } from '../lib/gabarit'
import { Show } from 'solid-js'
import SubstitutLogo from './SubstitutLogo'
import Icone from './Icone'
import { ENCRE, ENCRE2 } from './ControlesLecteur'
import { avancement, plage } from './MiniGuide'
import type { Programme } from '../lib/epg'
import type { EntreeCatalogue } from '../lib/db'
import { LIBELLE_MODE, TEINTE_MODE, type Plan } from '../lib/flux'

// Le dossier est formel : s'informer ne coupe pas la lecture. Ce panneau se
// pose à droite de l'image, la vidéo continue derrière, et il se referme sur
// Échap comme n'importe quel calque.

/** Largeur mesurée sur la maquette, bureau. */
export const LARGEUR_INFOS = 380

/** Surtitre « En ce moment » : encre fixe, la surface est toujours sombre. */
const ENCRE_DIRECT = '#ff99a4'

export default function PanneauInfos(props: {
  entree: EntreeCatalogue
  categorie?: string
  enCours?: Programme
  ensuite?: Programme
  /** Traitement que le serveur applique au flux ouvert. */
  flux?: Plan | null
  favori: boolean
  surFavori: () => void
  /** Ouvre le guide des programmes — sans arrêter le flux, le mini-lecteur
      prend le relais. */
  surGuide?: () => void
  surFermer: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label="Informations sur la chaîne"
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: `${LARGEUR_INFOS}px`, 'max-width': '100%',
        display: 'flex', 'flex-direction': 'column', gap: '14px',
        padding: '16px',
        background: 'rgba(20,20,20,.92)', 'backdrop-filter': 'blur(24px)',
        'border-left': '1px solid rgba(255,255,255,.12)',
        'z-index': 6, overflow: 'auto', color: ENCRE,
        animation: 'fadein var(--dur) var(--ease)',
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
        <SubstitutLogo nom={props.entree.nom} src={props.entree.icone} taille={42} />
        <div style={{ display: 'flex', 'flex-direction': 'column', 'min-width': 0, flex: 1 }}>
          <span class="tronque" style={{ 'font-size': '17px', 'font-weight': 'var(--w-strong)' }}>
            {props.entree.nom}
          </span>
          <Show when={props.categorie}>
            {(c) => <span class="tronque" style={{ 'font-size': '12px', color: ENCRE2 }}>{c()}</span>}
          </Show>
        </div>
        <button
          onClick={props.surFermer}
          aria-label="Fermer"
          title="Fermer (I)"
          style={{
            flex: '0 0 auto', display: 'grid', 'place-items': 'center',
            width: estMobile() ? '44px' : '32px', height: estMobile() ? '44px' : '32px', 'border-radius': 'var(--r-xs)', color: ENCRE2,
          }}
        >
          <Icone nom="close" taille={18} />
        </button>
      </div>

      {/* Le programme en cours n'a de sens qu'en direct : un film n'est pas à
          l'antenne, et sa chaîne de traitement est ce qui l'intéresse. */}
      <Show when={props.entree.type === 'live'}>
      <div
        style={{
          display: 'flex', 'flex-direction': 'column', gap: '6px',
          padding: '12px', 'border-radius': 'var(--r-sm)',
          background: 'rgba(255,255,255,.06)',
        }}
      >
        <span
          style={{
            'font-size': '11px', 'font-weight': 'var(--w-strong)',
            'letter-spacing': '.04em', 'text-transform': 'uppercase', color: ENCRE_DIRECT,
          }}
        >
          En ce moment
        </span>
        <span style={{ 'font-size': '18px', 'line-height': '24px', 'font-weight': 'var(--w-strong)' }}>
          {props.enCours?.titre ?? 'Aucun programme disponible'}
        </span>
        <Show
          when={props.enCours}
          fallback={
            <span style={{ color: ENCRE2 }}>
              Cette chaîne ne fournit pas de guide des programmes. La lecture en direct reste disponible.
            </span>
          }
        >
          {(p) => (
            <>
              <span class="num" style={{ 'font-size': '12px', color: ENCRE2 }}>{plage(p())}</span>
              <span style={{ height: '3px', 'border-radius': '2px', background: 'rgba(255,255,255,.2)' }}>
                <span
                  style={{
                    display: 'block', height: '100%', width: `${avancement(p())}%`,
                    'border-radius': '2px', background: 'var(--acc-fg)',
                  }}
                />
              </span>
              <Show when={p().description}>
                {(d) => <span style={{ color: ENCRE2 }}>{d()}</span>}
              </Show>
            </>
          )}
        </Show>
      </div>
      </Show>

      <Show when={props.flux}>{(p) => <BlocFlux plan={p()} />}</Show>

      <Show when={props.ensuite}>
        {(p) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', padding: '0 4px' }}>
            <span
              style={{
                'font-size': '11px', 'font-weight': 'var(--w-strong)',
                'letter-spacing': '.04em', 'text-transform': 'uppercase', color: ENCRE2,
              }}
            >
              Ensuite
            </span>
            <span style={{ 'font-weight': 'var(--w-strong)' }}>{p().titre}</span>
            <span class="num" style={{ 'font-size': '12px', color: ENCRE2 }}>{plage(p())}</span>
          </div>
        )}
      </Show>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', 'margin-top': 'auto' }}>
        <Show when={props.surGuide}>
          {(ouvrir) => (
            <BoutonPanneau icone="tv_guide" surAction={ouvrir()}>Ouvrir le guide</BoutonPanneau>
          )}
        </Show>
        <BoutonPanneau icone="star" plein={props.favori} surAction={props.surFavori}>
          {props.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        </BoutonPanneau>
      </div>
    </div>
  )
}

/**
 * Ce qui arrive au flux, dit sobrement : l'utilisateur doit pouvoir savoir si
 * le serveur travaille pour lui. Discret parce que, dans l'immense majorité des
 * cas, la réponse est « rien du tout ». Un direct n'a pas de mode : le serveur
 * relaie la playlist et les segments tels quels.
 */
function BlocFlux(props: { plan: Plan }) {
  const mode = () => props.plan.mode

  return (
    <div
      data-role="chaine-flux"
      style={{
        display: 'flex', 'flex-direction': 'column', gap: '4px',
        padding: '10px 12px', 'border-radius': 'var(--r-sm)',
        border: '1px solid rgba(255,255,255,.1)',
      }}
    >
      <span
        style={{
          'font-size': '11px', 'font-weight': 'var(--w-strong)',
          'letter-spacing': '.04em', 'text-transform': 'uppercase', color: ENCRE2,
        }}
      >
        Chaîne de traitement
      </span>

      <span
        style={{
          'font-size': '13px', 'font-weight': 'var(--w-strong)',
          color: mode() ? TEINTE_MODE[mode()!] : ENCRE,
        }}
      >
        {mode() ? LIBELLE_MODE[mode()!] : 'Relais tel quel par le serveur'}
      </span>
    </div>
  )
}

function BoutonPanneau(props: {
  icone: string
  plein?: boolean
  surAction: () => void
  children: string
}) {
  return (
    <button
      onClick={props.surAction}
      style={{
        display: 'flex', 'align-items': 'center', gap: '8px',
        height: '36px', padding: '0 12px',
        'border-radius': 'var(--r-btn-md)',
        border: '1px solid rgba(255,255,255,.3)',
        'font-weight': 'var(--w-strong)',
        color: props.plein ? 'var(--acc-fg)' : ENCRE,
      }}
    >
      <Icone nom={props.icone} taille={18} plein={props.plein} />
      {props.children}
    </button>
  )
}
