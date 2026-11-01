import { Show } from 'solid-js'
import Icone from './Icone'
import { ajouterAVoir, listeAVoir, retirerAVoir, type OptionsAVoir } from '../lib/a-voir'
import { libelleDisponibilite, type Disponibilite } from '../lib/a-voir-regles'
import { FRAICHEUR, cles, requete, type Donnee } from '../lib/requetes'
import { estMobile } from '../lib/gabarit'

// Le bouton « À voir » des fiches et des cartes (US-43 CA1), le badge « Prêt »
// (CA3) et la ligne de la sonde (CA5) : trois petits composants qui disent la
// meme chose partout ou un contenu s'affiche en grand.

/** Cles de la liste, partagees par tous les boutons (une lecture, perimee au geste). */
export function useAVoirCles(): Donnee<ReadonlySet<string>> {
  const [cles_] = requete(cles.aVoirCles, async () => new Set((await listeAVoir()).map((l) => l.cle)), { fraicheur: FRAICHEUR.geste })
  return cles_
}

export function BoutonAVoir(props: {
  cle: string
  /** Episode : la serie est ajoutee « a partir de » cet episode. */
  options?: OptionsAVoir
  present: boolean
  /** Libelle a l'ajout quand il doit dire d'ou l'on part (« À voir à partir d'ici »). */
  libelleAjout?: string
  compact?: boolean
  principal?: boolean
}) {
  const libelle = () => (props.present ? 'Retirer de « À voir »' : props.libelleAjout ?? 'À voir')
  return (
    <button
      type="button"
      data-role="a-voir"
      aria-pressed={props.present}
      aria-label={libelle()}
      title={props.present ? 'Retirer de la liste « À voir »' : 'Ajouter à la liste « À voir » : le serveur prépare le fichier d’avance'}
      onClick={(e) => {
        e.stopPropagation()
        // `present` est juge par l'appelant : un episode « a partir d'ici » n'est
        // present que si la serie part de lui ; sinon le clic met a jour le depart.
        void (props.present ? retirerAVoir(props.cle) : ajouterAVoir(props.cle, props.options))
      }}
      style={{
        display: 'flex', 'align-items': 'center', gap: '6px',
        height: props.compact ? '28px' : estMobile() ? '44px' : '36px',
        padding: props.compact ? '0 10px 0 6px' : '0 14px 0 10px',
        'border-radius': 'var(--r-btn-sm)', 'font-weight': 'var(--w-strong)', cursor: 'pointer',
        'font-size': props.compact ? '12px' : undefined,
        ...(props.principal && !props.present
          ? { background: 'var(--acc)', color: '#fff', border: '1px solid transparent' }
          : { border: `1px solid ${props.present ? 'var(--acc)' : 'var(--line2)'}`, color: props.present ? 'var(--acc-fg)' : undefined }),
      }}
    >
      <Icone nom={props.present ? 'check' : 'add'} taille={props.compact ? 14 : 18} plein={props.present} />
      {props.compact && props.present ? 'À voir' : libelle()}
    </button>
  )
}

/** « Prêt » : le serveur tient le fichier sur son disque, la lecture ne passera pas par le fournisseur. */
export function BadgePret(props: { visible: boolean; taille?: 'carte' | 'fiche' }) {
  return (
    <Show when={props.visible}>
      <span
        data-role="badge-pret"
        title="Préparé d’avance par le serveur : lecture immédiate"
        style={{
          display: 'inline-flex', 'align-items': 'center', gap: '3px',
          'font-size': props.taille === 'carte' ? '10px' : '11px', 'line-height': '16px', padding: '0 6px',
          'border-radius': 'var(--r-2xs)', background: 'var(--ok)', color: '#000', 'font-weight': 'var(--w-strong)',
        }}
      >
        Prêt
      </span>
    </Show>
  )
}

/** Resultat de la sonde (CA5), avec le bouton « À voir » quand elle conseille de preparer d'avance. */
export function LigneDisponibilite(props: {
  disponibilite: Disponibilite | undefined
  cle: string
  options?: OptionsAVoir
  present: boolean
  prefixe?: string
}) {
  const l = () => libelleDisponibilite(props.disponibilite)
  return (
    <Show when={l()}>
      {(x) => (
        <div
          data-role="disponibilite"
          data-etat={props.disponibilite?.etat}
          style={{
            display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '8px 10px',
            'font-size': '13px',
            color: x().ton === 'lent' ? 'var(--lim)' : x().ton === 'pret' ? 'var(--ok)' : 'var(--fg2)',
          }}
        >
          <Icone nom={x().ton === 'lent' ? 'warning' : x().ton === 'pret' ? 'check_circle' : 'speed'} taille={16} plein={x().ton === 'pret'} />
          <span>
            <Show when={props.prefixe}>{(p) => <span class="num">{p()} · </span>}</Show>
            {x().texte}
          </span>
          <Show when={x().proposerAVoir && !props.present}>
            <BoutonAVoir cle={props.cle} options={props.options} present={false} compact principal />
          </Show>
        </div>
      )}
    </Show>
  )
}
