import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from '../components/Icone'
import SubstitutLogo from '../components/SubstitutLogo'
import { titreCourt } from '../components/titres'
import { listeAVoirJointe, modifierOptionsAVoir, reordonnerAVoir, retirerAVoir, type AVoirJoint } from '../lib/a-voir'
import { deplacer, libellePreparation, repere, resumeSerie, type EtatPreparation } from '../lib/a-voir-regles'
import { tirerAVoir } from '../lib/synchro'
import { lireSaisons } from '../lib/saisons'
import { episodesOrdonnes, type EpisodeLisible } from '../lib/episodes-suivants'
import { FRAICHEUR, cles, requete, requeteClefee } from '../lib/requetes'
import { estBureau, estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Ecran « À voir » (US-43 CA2) : la liste que le serveur prepare d'avance, dans
// l'ordre ou l'on compte regarder. Reordonnable au glisser ET par deux boutons
// (clavier, telecommande) ; retrait ; pour une serie, les episodes d'avance et
// le point de depart. L'etat de preparation de chaque element se relit toutes
// les 10 s tant que l'ecran est ouvert -- et c'est tout ce qu'on relit : la
// liste elle-meme vit en base locale, perimee au geste.

/** Rafraichissement de l'etat de preparation, ecran ouvert. */
export const PERIODE_ETAT = 10_000

const LIBELLE_TYPE: Record<string, string> = { vod: 'Film', series: 'Série' }
const CHOIX_AVANCE = [1, 2, 3, 4, 5]

const TEINTE: Record<EtatPreparation, string> = {
  attente: 'var(--fg3)', en_cours: 'var(--acc-fg)', pret: 'var(--ok)', echec: 'var(--err)',
}

export default function AVoir(props: {
  surOuvrir: (e: EntreeCatalogue) => void
  surDetails: (e: EntreeCatalogue) => void
}) {
  const [liste, { refetch }] = requete(cles.aVoir, listeAVoirJointe, { fraicheur: FRAICHEUR.geste })
  const [glisse, poserGlisse] = createSignal<number | null>(null)
  const [survol, poserSurvol] = createSignal<number | null>(null)
  const [derniereLecture, poserDerniereLecture] = createSignal<number | undefined>()

  // L'etat de preparation vient du serveur : une relecture a l'ouverture, puis
  // toutes les 10 s. `tirerAVoir` perime la liste quand quelque chose change.
  onMount(() => {
    const relire = () => void tirerAVoir().then(() => poserDerniereLecture(Date.now())).catch(() => undefined)
    relire()
    const minuteur = setInterval(() => {
      if (document.visibilityState === 'visible') relire()
    }, PERIODE_ETAT)
    onCleanup(() => clearInterval(minuteur))
  })

  // Lignes STABLES d'une relecture a l'autre : la relecture de l'etat (10 s)
  // rend de nouveaux objets, et `For` remonterait les douze lignes -- selecteurs
  // perdus, bouton vise qui disparait sous le doigt. Un element dont rien n'a
  // change garde son objet, donc sa ligne.
  const elements = createMemo<AVoirJoint[]>((precedents) => {
    const avant = new Map(precedents.map((j) => [j.element.cle, j]))
    return (liste() ?? []).map((j) => {
      const p = avant.get(j.element.cle)
      return p && JSON.stringify(p) === JSON.stringify(j) ? p : j
    })
  }, [])

  async function bouger(index: number, sens: -1 | 1) {
    const apres = deplacer(elements(), index, sens)
    if (apres === elements()) return
    await reordonnerAVoir(apres.map((j) => j.element.cle))
  }

  async function deposer(cible: number) {
    const source = glisse()
    poserGlisse(null)
    poserSurvol(null)
    if (source === null || source === cible) return
    const copie = [...elements()]
    const [e] = copie.splice(source, 1)
    copie.splice(cible, 0, e!)
    await reordonnerAVoir(copie.map((j) => j.element.cle))
  }

  const marge = () => (estBureau() ? '24px 32px 64px' : estMobile() ? '12px 12px 40px' : '20px 20px 56px')

  return (
    <div data-role="ecran-a-voir" style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ 'max-width': '1100px', margin: '0 auto', padding: marge(), display: 'flex', 'flex-direction': 'column', gap: '16px' }}>
        <header style={{ display: 'flex', 'align-items': 'baseline', gap: '10px', 'flex-wrap': 'wrap' }}>
          <h1 style={{ margin: 0, 'font-size': '22px', 'line-height': '28px' }}>À voir</h1>
          <span class="num" style={{ 'font-size': '12px', color: 'var(--fg3)' }}>
            {elements().length} élément{elements().length > 1 ? 's' : ''}
          </span>
          <span style={{ flex: 1 }} />
          <span class="tertiaire" style={{ 'font-size': '12px' }}>
            Le serveur prépare d’avance, dans cet ordre, ce que vous avez choisi.
            <Show when={derniereLecture()}>{(t) => <> État relu à {new Date(t()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.</>}</Show>
          </span>
        </header>

        <Show
          when={elements().length > 0}
          fallback={
            <Show when={!liste.loading}>
              <p class="secondaire" style={{ margin: 0 }}>
                Votre liste est vide — ajoutez un film ou une série depuis sa fiche ou depuis la recherche, avec le bouton « À voir ».
              </p>
            </Show>
          }
        >
          <ol data-role="liste-a-voir" style={{ margin: 0, padding: 0, 'list-style': 'none', display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <For each={elements()}>
              {(j, i) => (
                <Ligne
                  joint={j}
                  index={i()}
                  total={elements().length}
                  enGlisse={glisse() === i()}
                  survole={survol() === i() && glisse() !== null && glisse() !== i()}
                  surOuvrir={() => props.surOuvrir(j.entree)}
                  surDetails={() => props.surDetails(j.entree)}
                  surMonter={() => void bouger(i(), -1)}
                  surDescendre={() => void bouger(i(), 1)}
                  surRetirer={() => void retirerAVoir(j.element.cle)}
                  surOptions={(o) => void modifierOptionsAVoir(j.element.cle, o)}
                  surDebutGlisse={() => poserGlisse(i())}
                  surFinGlisse={() => { poserGlisse(null); poserSurvol(null) }}
                  surSurvol={() => poserSurvol(i())}
                  surDepot={() => void deposer(i())}
                />
              )}
            </For>
          </ol>
        </Show>

        <Show when={liste.error}>
          <p style={{ color: 'var(--err)' }}>
            La liste n’a pas pu être lue. <button onClick={() => refetch()} style={{ border: '1px solid var(--line2)', padding: '2px 8px' }}>Réessayer</button>
          </p>
        </Show>
      </div>
    </div>
  )
}

function Ligne(props: {
  joint: AVoirJoint
  index: number
  total: number
  enGlisse: boolean
  survole: boolean
  surOuvrir: () => void
  surDetails: () => void
  surMonter: () => void
  surDescendre: () => void
  surRetirer: () => void
  surOptions: (o: { episodesAvance?: number; depuis?: { saison: number; episode: number } }) => void
  surDebutGlisse: () => void
  surFinGlisse: () => void
  surSurvol: () => void
  surDepot: () => void
}) {
  const e = () => props.joint.entree
  const el = () => props.joint.element
  const serie = () => e().type === 'series'
  const etat = () => el().preparation?.etat
  const ligneEtat = () => (serie() ? resumeSerie(el().preparation) : libellePreparation(el().preparation))

  // Les episodes de la serie, pour le choix « a partir de » : lus a la demande
  // (meme cache que la fiche), jamais pour un film.
  const [saisons] = requeteClefee(
    (id: string) => cles.saisons(id),
    () => (serie() ? e().idServeur : undefined),
    lireSaisons,
    { fraicheur: FRAICHEUR.relais, peremption: FRAICHEUR.relais, suspendre: false },
  )
  const episodes = createMemo<EpisodeLisible[]>(() => (saisons() ? episodesOrdonnes(saisons()!, e().nom) : []))
  const valeurDepuis = () => (el().depuis ? `${el().depuis!.saison}:${el().depuis!.episode}` : '')

  const bouton = (icone: string, libelle: string, action: () => void, desactive = false) => (
    <button
      type="button"
      aria-label={libelle}
      title={libelle}
      disabled={desactive}
      onClick={(ev) => { ev.stopPropagation(); action() }}
      style={{
        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
        width: estMobile() ? '44px' : '34px', height: estMobile() ? '44px' : '34px',
        'border-radius': 'var(--r-xs)', border: '1px solid var(--line2)', cursor: desactive ? 'default' : 'pointer',
        opacity: desactive ? 0.4 : 1,
      }}
    >
      <Icone nom={icone} taille={18} />
    </button>
  )

  return (
    <li
      data-role="element-a-voir"
      data-cle={el().cle}
      data-etat={etat()}
      draggable={true}
      tabindex="0"
      aria-label={`${props.index + 1}. ${titreCourt(e().nom)}`}
      onDragStart={(ev) => { ev.dataTransfer?.setData('text/plain', el().cle); props.surDebutGlisse() }}
      onDragEnd={props.surFinGlisse}
      onDragOver={(ev) => { ev.preventDefault(); props.surSurvol() }}
      onDrop={(ev) => { ev.preventDefault(); props.surDepot() }}
      onKeyDown={(ev) => {
        // Alt+↑ / Alt+↓ : le clavier reordonne sans viser un bouton de 34 px.
        if (ev.altKey && ev.key === 'ArrowUp') { ev.preventDefault(); props.surMonter() }
        else if (ev.altKey && ev.key === 'ArrowDown') { ev.preventDefault(); props.surDescendre() }
        else if (ev.key === 'Delete') { ev.preventDefault(); props.surRetirer() }
      }}
      style={{
        display: 'grid',
        'grid-template-columns': estMobile() ? '28px auto minmax(0,1fr)' : '32px auto minmax(0,1fr) auto',
        'align-items': 'center', gap: estMobile() ? '8px' : '14px',
        padding: estMobile() ? '8px' : '10px 14px',
        border: `1px solid ${props.survole ? 'var(--acc)' : 'var(--line)'}`, 'border-radius': 'var(--r-md)',
        background: 'var(--card)', opacity: props.enGlisse ? 0.5 : 1, cursor: 'grab',
      }}
    >
      <span class="num tertiaire" style={{ 'font-size': '14px', 'text-align': 'right' }}>{props.index + 1}</span>
      <span onClick={props.surDetails} style={{ cursor: 'pointer' }}>
        <SubstitutLogo nom={titreCourt(e().nom)} src={e().icone} taille={estMobile() ? 48 : 64} affiche />
      </span>

      <div style={{ 'min-width': 0, display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'min-width': 0 }}>
          <span class="tronque" style={{ 'font-weight': 'var(--w-strong)', cursor: 'pointer' }} onClick={props.surDetails} title={e().nom}>
            {titreCourt(e().nom)}
          </span>
          <span class="tertiaire" style={{ 'font-size': '12px', flex: 'none' }}>{LIBELLE_TYPE[e().type]}</span>
        </div>
        <span data-role="etat-preparation" class="num" style={{ 'font-size': '13px', color: etat() ? TEINTE[etat()!] : 'var(--fg3)' }}>
          {ligneEtat()}
        </span>
        <Show when={serie()}>
          <div style={{ display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '6px 14px', 'font-size': '12px', color: 'var(--fg2)' }}>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              Épisodes d’avance
              <select
                aria-label="Épisodes d’avance"
                value={el().episodesAvance ?? ''}
                onChange={(ev) => props.surOptions({ episodesAvance: ev.currentTarget.value ? Number(ev.currentTarget.value) : undefined })}
                style={{ height: '28px', 'border-radius': 'var(--r-xs)', border: '1px solid var(--line2)', background: 'var(--elev)', color: 'inherit' }}
              >
                <option value="">par défaut</option>
                <For each={CHOIX_AVANCE}>{(n) => <option value={n}>{n}</option>}</For>
              </select>
            </label>
            <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              À partir de
              <select
                aria-label="À partir de"
                value={valeurDepuis()}
                onChange={(ev) => {
                  const v = ev.currentTarget.value
                  const [s, n] = v.split(':').map(Number)
                  props.surOptions({ depuis: v && s !== undefined && n !== undefined ? { saison: s, episode: n } : undefined })
                }}
                style={{ height: '28px', 'border-radius': 'var(--r-xs)', border: '1px solid var(--line2)', background: 'var(--elev)', color: 'inherit', 'max-width': '180px' }}
              >
                <option value="">l’épisode entamé</option>
                <Show when={episodes().length === 0 && el().depuis}>
                  {(d) => <option value={`${d().saison}:${d().episode}`}>{repere(d().saison, d().episode)}</option>}
                </Show>
                <For each={episodes()}>{(ep) => <option value={`${ep.saison}:${ep.numero}`}>{repere(ep.saison, ep.numero)}</option>}</For>
              </select>
            </label>
          </div>
        </Show>
      </div>

      <div style={{ display: 'flex', gap: '6px', 'grid-column': estMobile() ? '1 / -1' : undefined, 'justify-content': estMobile() ? 'flex-end' : undefined }}>
        {bouton('play_arrow', serie() ? 'Ouvrir la série' : 'Regarder', props.surOuvrir)}
        {bouton('expand_less', 'Monter', props.surMonter, props.index === 0)}
        {bouton('expand_more', 'Descendre', props.surDescendre, props.index >= props.total - 1)}
        {bouton('delete', 'Retirer de la liste', props.surRetirer)}
      </div>
    </li>
  )
}
