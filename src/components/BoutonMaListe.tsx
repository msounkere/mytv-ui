import { Show, createSignal } from 'solid-js'
import Icone from './Icone'
import MenuContextuel, { positionSous, type EntreeMenu } from './MenuContextuel'
import { ajouterMaListe, listeMaListe, retirerMaListe, type OptionsMaListe } from '../lib/ma-liste'
import { LIBELLES, libelleDisponibilite, repere, type Disponibilite } from '../lib/ma-liste-regles'
import { FRAICHEUR, cles, requete, type Donnee } from '../lib/requetes'
import { estMobile } from '../lib/gabarit'
import type { AVoir } from '../lib/db'

// Le bouton « + Ma liste » / « ✓ Dans ma liste » des fiches, des cartes, de
// « À la une » et du lecteur (lot 10, US-46 CA6 ; libelles rapport C §5.5),
// le badge « Prêt » et la ligne de la sonde : trois petits composants qui disent
// la meme chose partout ou un contenu s'affiche en grand.

/** Cles de la liste, partagees par tous les boutons (une lecture, perimee au geste). */
export function useMaListeCles(): Donnee<ReadonlySet<string>> {
  const [cles_] = requete(cles.aVoirCles, async () => new Set((await listeMaListe()).map((l) => l.cle)), { fraicheur: FRAICHEUR.geste })
  return cles_
}
export const useAVoirCles = useMaListeCles

/** Les elements de la liste par cle, preparation comprise : pour le chip d'etat d'une fiche ou d'une carte. */
export function useMaListeElements(): Donnee<ReadonlyMap<string, AVoir>> {
  const [elements] = requete(cles.maListeElements, async () => new Map((await listeMaListe()).map((l) => [l.cle, l])), { fraicheur: FRAICHEUR.geste })
  return elements
}

export interface BoutonMaListeProps {
  cle: string
  /** Episode : la serie est ajoutee « a partir de » cet episode. */
  options?: OptionsMaListe
  present: boolean
  /** Serie presente : le point de depart retenu, affiche « · dès S01E03 ▾ ». */
  depuis?: { saison: number; episode: number }
  /**
   * Serie : les points de depart possibles ; le « ▾ » ouvre un menu pour en
   * changer (« l'épisode entamé » = `undefined`).
   */
  choixDepart?: Array<{ saison: number; episode: number; libelle?: string }>
  surChangerDepart?: (depuis: { saison: number; episode: number } | undefined) => void
  /** Libelle a l'ajout quand il doit dire d'ou l'on part (« Ma liste à partir d’ici »). */
  libelleAjout?: string
  compact?: boolean
  principal?: boolean
}

export function BoutonMaListe(props: BoutonMaListeProps) {
  const [menu, poserMenu] = createSignal<{ x: number; y: number; ancre: HTMLElement } | null>(null)
  const libelle = () => (props.present ? LIBELLES.present : props.libelleAjout ?? LIBELLES.ajouter)
  const aria = () => (props.present ? LIBELLES.presentAria : props.libelleAjout ?? LIBELLES.ajouterAria)
  const suffixe = () => (props.present && props.depuis ? ` · dès ${repere(props.depuis.saison, props.depuis.episode)}` : '')
  const peutChanger = () => props.present && !!props.surChangerDepart && !!props.choixDepart?.length

  const entreesDepart = (): EntreeMenu[] => [
    { libelle: 'À partir de l’épisode entamé', icone: 'history', action: () => props.surChangerDepart?.(undefined) },
    ...(props.choixDepart ?? []).map((c) => ({
      libelle: c.libelle ?? `À partir de ${repere(c.saison, c.episode)}`,
      action: () => props.surChangerDepart?.({ saison: c.saison, episode: c.episode }),
    })),
  ]

  return (
    <>
      <button
        type="button"
        data-role="ma-liste"
        aria-pressed={props.present}
        aria-label={aria() + suffixe()}
        title={props.present ? LIBELLES.presentAria : LIBELLES.ajouterInfobulle}
        onClick={(e) => {
          e.stopPropagation()
          if (peutChanger()) {
            poserMenu(positionSous(e.currentTarget))
            return
          }
          // `present` est juge par l'appelant : un episode « a partir d'ici » n'est
          // present que si la serie part de lui ; sinon le clic met a jour le depart.
          void (props.present ? retirerMaListe(props.cle) : ajouterMaListe(props.cle, props.options))
        }}
        style={{
          display: 'inline-flex', 'align-items': 'center', gap: '6px', 'max-width': '100%',
          height: props.compact ? '28px' : estMobile() ? '44px' : '36px',
          padding: props.compact ? '0 10px 0 6px' : '0 14px 0 10px',
          'border-radius': 'var(--r-btn-sm)', 'font-weight': 'var(--w-strong)', cursor: 'pointer',
          'font-size': props.compact ? '12px' : undefined, 'white-space': 'nowrap',
          ...(props.principal && !props.present
            ? { background: 'var(--acc)', color: '#fff', border: '1px solid transparent' }
            : { border: `1px solid ${props.present ? 'var(--acc)' : 'var(--line2)'}`, color: props.present ? 'var(--acc-fg)' : undefined, background: 'transparent' }),
        }}
      >
        <Icone nom={props.present ? 'check' : 'add'} taille={props.compact ? 14 : 18} plein={props.present} />
        <span class="tronque">
          {props.compact && props.present ? 'Ma liste' : libelle().replace(/^[+✓] /, '')}
          {suffixe()}
        </span>
        <Show when={peutChanger()}>
          <Icone nom="expand_more" taille={props.compact ? 14 : 18} />
        </Show>
      </button>
      <Show when={menu()}>
        {(m) => (
          <MenuContextuel x={m().x} y={m().y} ancre={m().ancre} libelle="Point de départ" entrees={entreesDepart()} surFermer={() => poserMenu(null)} />
        )}
      </Show>
    </>
  )
}

/** Compat lot 9 : ancien nom et anciennes props. */
export const BoutonAVoir = BoutonMaListe

/** « Prêt » : le serveur tient le fichier sur son disque, la lecture ne passera pas par le fournisseur. */
export function BadgePret(props: { visible: boolean; taille?: 'carte' | 'fiche' }) {
  return (
    <Show when={props.visible}>
      <span
        data-role="badge-pret"
        title="Préparé d’avance par le serveur : lecture sans coupure"
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

/**
 * Resultat de la sonde (US-43 CA5, lot 10 CA7) : trois phrases humaines, le
 * debit en detail, et « + Ma liste » quand elle conseille de preparer d'avance.
 */
export function LigneDisponibilite(props: {
  disponibilite: Disponibilite | undefined
  cle: string
  options?: OptionsMaListe
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
          title={x().detail}
          style={{
            display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '6px 10px',
            'font-size': '13px', 'min-width': 0,
            color: x().ton === 'lent' ? 'var(--lim)' : x().ton === 'pret' ? 'var(--ok)' : 'var(--fg2)',
          }}
        >
          <Icone nom={x().ton === 'lent' ? 'warning' : x().ton === 'pret' ? 'check_circle' : 'speed'} taille={16} plein={x().ton === 'pret'} />
          <span>
            <Show when={props.prefixe}>{(p) => <span class="num">{p()} · </span>}</Show>
            {x().texte}
          </span>
          <Show when={estMobile() ? undefined : x().detail}>
            {(d) => <span class="num" data-role="disponibilite-detail" style={{ 'font-size': '12px', color: 'var(--fg3)' }}>{d()}</span>}
          </Show>
          <Show when={x().proposerAVoir && !props.present}>
            <BoutonMaListe cle={props.cle} options={props.options} present={false} compact principal />
          </Show>
        </div>
      )}
    </Show>
  )
}
