import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from '../components/Icone'
import SubstitutLogo from '../components/SubstitutLogo'
import ChipPreparation from '../components/ChipPreparation'
import MenuContextuel, { positionSous, type EntreeMenu } from '../components/MenuContextuel'
import { anneeDuTitre, titreCourt } from '../components/titres'
import {
  listeMaListeJointe, modifierOptionsMaListe, reessayerMaListe, reordonnerMaListe, retirerMaListe, type AVoirJoint,
} from '../lib/ma-liste'
import {
  EPISODES_AVANCE_MAX, EPISODES_AVANCE_MIN, LIBELLES, deplacer, enTeteListe, enTeteListeCourt, libelleEpisodesAvance, repere,
} from '../lib/ma-liste-regles'
import { budgetListe, derniereReception, episodesAvanceDefaut } from '../lib/a-voir-serveur'
import { etatSynchro, tirerAVoir } from '../lib/synchro'
import { chargerSaisons, lireSaisons } from '../lib/saisons'
import { episodesOrdonnes, type EpisodeLisible } from '../lib/episodes-suivants'
import { FRAICHEUR, cles, requete, requeteClefee } from '../lib/requetes'
import { lireEpisodeDe } from '../etat'
import { estBureau, estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Ecran « Ma liste » (lot 10, US-46 CA5 ; rapport C §5.4-5.5) : la liste que le
// serveur prepare d'avance, dans l'ordre ou l'on compte regarder. En-tete
// `5 titres · 2 prêts · 1 en préparation · 4,2 Go sur 10 Go`, une ligne par
// titre (poignee, vignette, titre -> fiche, chip d'etat, ▶ Regarder / ▶ Lire
// S01E02, ⋯), reordonnable au glisser, par le menu et par Alt+↑↓ ; Entree =
// fiche, Suppr = retirer (annonces dans ⋯). Telephone : une ligne par titre
// (vignette, titre, chip, ⋯). L'etat de preparation se relit toutes les 10 s
// tant que l'ecran est ouvert -- et c'est tout ce qu'on relit : la liste
// elle-meme vit en base locale, perimee au geste.

/** Rafraichissement de l'etat de preparation, ecran ouvert. */
export const PERIODE_ETAT = 10_000

const LIBELLE_TYPE: Record<string, string> = { vod: 'Film', series: 'Série' }

export default function MaListe(props: {
  /** « ▶ Regarder » d'un film : la lecture directe. */
  surOuvrir: (e: EntreeCatalogue) => void
  /** Titre, vignette, Entree : la fiche. */
  surDetails: (e: EntreeCatalogue) => void
}) {
  const [liste, { refetch }] = requete(cles.aVoir, listeMaListeJointe, { fraicheur: FRAICHEUR.geste })
  const [glisse, poserGlisse] = createSignal<number | null>(null)
  const [survol, poserSurvol] = createSignal<number | null>(null)
  const [maintenant, poserMaintenant] = createSignal(Date.now())
  const [enLigne, poserEnLigne] = createSignal(typeof navigator === 'undefined' ? true : navigator.onLine)

  // L'etat de preparation vient du serveur : une relecture a l'ouverture, puis
  // toutes les 10 s. `tirerAVoir` perime la liste quand quelque chose change.
  onMount(() => {
    const relire = () => void tirerAVoir().catch(() => undefined)
    relire()
    const minuteur = setInterval(() => {
      if (document.visibilityState === 'visible') relire()
    }, PERIODE_ETAT)
    const horloge = setInterval(() => poserMaintenant(Date.now()), 5000)
    const surLigne = () => poserEnLigne(navigator.onLine)
    window.addEventListener('online', surLigne)
    window.addEventListener('offline', surLigne)
    onCleanup(() => {
      clearInterval(minuteur)
      clearInterval(horloge)
      window.removeEventListener('online', surLigne)
      window.removeEventListener('offline', surLigne)
    })
  })

  // Lignes STABLES d'une relecture a l'autre : la relecture de l'etat (10 s) et
  // chaque geste rendent de nouveaux objets, et un `For` sur les objets
  // remonterait les lignes -- menu « ⋯ » ferme sous la souris apres « + »,
  // bouton vise qui disparait sous le doigt. Les lignes sont donc clefees par
  // la CLE de l'element ; leur contenu suit par `props`.
  const elements = createMemo<AVoirJoint[]>(() => liste() ?? [])
  const parCle = createMemo(() => new Map(elements().map((j) => [j.element.cle, j])))
  const clesOrdonnees = createMemo(() => elements().map((j) => j.element.cle))

  const horsLigne = () => !enLigne() || etatSynchro() === 'hors-ligne'
  const heureEtats = () => {
    const t = derniereReception()
    return t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : undefined
  }
  const misAJour = () => {
    const t = derniereReception()
    if (!t) return undefined
    const s = Math.max(0, Math.round((maintenant() - t) / 1000))
    return s < 60 ? `Mis à jour il y a ${s} s.` : `Mis à jour il y a ${Math.round(s / 60)} min.`
  }

  async function bouger(index: number, sens: -1 | 1) {
    const apres = deplacer(elements(), index, sens)
    if (apres === elements()) return
    await reordonnerMaListe(apres.map((j) => j.element.cle))
  }

  async function deposer(cible: number) {
    const source = glisse()
    poserGlisse(null)
    poserSurvol(null)
    if (source === null || source === cible) return
    const copie = [...elements()]
    const [e] = copie.splice(source, 1)
    copie.splice(cible, 0, e!)
    await reordonnerMaListe(copie.map((j) => j.element.cle))
  }

  const marge = () => (estBureau() ? '24px 32px 64px' : estMobile() ? '12px 12px 40px' : '20px 20px 56px')

  return (
    <div data-role="ecran-ma-liste" style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ 'max-width': '1100px', margin: '0 auto', padding: marge(), display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
        <header style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <div style={{ display: 'flex', 'align-items': 'baseline', gap: '10px', 'flex-wrap': 'wrap' }}>
            <h1 style={{ margin: 0, 'font-size': '22px', 'line-height': '28px' }}>{LIBELLES.liste}</h1>
            <span class="num" data-role="en-tete-ma-liste" style={{ 'font-size': '13px', color: 'var(--fg2)' }}>
              {estMobile() ? enTeteListeCourt(elements().map((j) => j.element), budgetListe()) : enTeteListe(elements().map((j) => j.element), budgetListe())}
            </span>
          </div>
          <Show when={elements().length > 0 && !estMobile()}>
            <p class="tertiaire" style={{ margin: 0, 'font-size': '12px' }}>
              Préparés d’avance sur le serveur, dans cet ordre. {misAJour()}
            </p>
          </Show>
          <Show when={horsLigne()}>
            <p
              role="status"
              data-role="bandeau-hors-ligne"
              style={{
                margin: '4px 0 0', padding: '8px 12px', 'border-radius': 'var(--r-xs)', 'font-size': '13px',
                background: 'var(--lim-bg)', color: 'var(--lim)', border: '1px solid var(--line2)',
              }}
            >
              Hors ligne{heureEtats() ? ` — états du ${heureEtats()}` : ''} ; vos changements partiront au retour du réseau.
            </p>
          </Show>
        </header>

        <Show
          when={elements().length > 0}
          fallback={
            <Show when={!liste.loading}>
              <div data-role="ma-liste-vide" style={{ display: 'flex', 'flex-direction': 'column', gap: '6px', padding: '24px 0' }}>
                <p style={{ margin: 0, 'font-weight': 'var(--w-strong)' }}>{LIBELLES.vide}.</p>
                <p class="secondaire" style={{ margin: 0 }}>{LIBELLES.videDetail}</p>
              </div>
            </Show>
          }
        >
          <ol data-role="liste-ma-liste" style={{ margin: 0, padding: 0, 'list-style': 'none', display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
            <For each={clesOrdonnees()}>
              {(cle, i) => (
                <Show when={parCle().get(cle)}>
                  {(j) => (
                    <Ligne
                      joint={j()}
                      index={i()}
                      total={elements().length}
                      enGlisse={glisse() === i()}
                      survole={survol() === i() && glisse() !== null && glisse() !== i()}
                      surOuvrir={() => props.surOuvrir(j().entree)}
                      surDetails={() => props.surDetails(j().entree)}
                      surMonter={() => void bouger(i(), -1)}
                      surDescendre={() => void bouger(i(), 1)}
                      surRetirer={() => void retirerMaListe(cle)}
                      surReessayer={() => void reessayerMaListe(cle)}
                      surOptions={(o) => void modifierOptionsMaListe(cle, o)}
                      surDebutGlisse={() => poserGlisse(i())}
                      surFinGlisse={() => { poserGlisse(null); poserSurvol(null) }}
                      surSurvol={() => poserSurvol(i())}
                      surDepot={() => void deposer(i())}
                    />
                  )}
                </Show>
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
  surReessayer: () => void
  surOptions: (o: { episodesAvance?: number; depuis?: { saison: number; episode: number } }) => void
  surDebutGlisse: () => void
  surFinGlisse: () => void
  surSurvol: () => void
  surDepot: () => void
}) {
  const e = () => props.joint.entree
  const el = () => props.joint.element
  const serie = () => e().type === 'series'
  const preparation = () => el().preparation
  const etat = () => preparation()?.etat
  const [menu, poserMenu] = createSignal<{ x: number; y: number; ancre: HTMLElement } | null>(null)
  const [menuDemande, poserMenuDemande] = createSignal(false)

  // Les episodes de la serie, pour « À partir de… » : lus a la demande, a la
  // premiere ouverture du menu (meme cache que la fiche), jamais pour un film.
  const [saisons] = requeteClefee(
    (id: string) => cles.saisons(id),
    () => (serie() && menuDemande() ? e().idServeur : undefined),
    lireSaisons,
    { fraicheur: FRAICHEUR.relais, peremption: FRAICHEUR.relais, suspendre: false },
  )
  const episodes = createMemo<EpisodeLisible[]>(() => (saisons() ? episodesOrdonnes(saisons()!, e().nom) : []))

  /** L'episode que « ▶ Lire S01E02 » vise : le premier prepare, sinon le point de depart, sinon le premier. */
  const cible = () => {
    const premier = preparation()?.episodes?.[0]
    if (premier) return { saison: premier.saison, episode: premier.episode }
    return el().depuis ?? { saison: 1, episode: 1 }
  }

  async function lireSerie() {
    try {
      const tous = episodesOrdonnes(await chargerSaisons(e().idServeur), e().nom)
      const c = cible()
      const ep = tous.find((x) => x.saison === c.saison && x.numero === c.episode) ?? tous[0]
      if (!ep) return props.surDetails()
      const i = tous.indexOf(ep)
      const suivant = tous[i + 1]
      lireEpisodeDe(e(), { cle: ep.cle, nom: ep.nom, url: ep.url, extension: ep.extension, suivant: suivant ? { cle: suivant.cle, nom: suivant.nom, url: suivant.url, extension: suivant.extension } : undefined })
    } catch {
      props.surDetails()
    }
  }

  const libelleLecture = () => (serie() ? `Lire ${repere(cible().saison, cible().episode)}` : 'Regarder')
  const sousTitre = () => {
    const parts = [LIBELLE_TYPE[e().type] ?? e().type, anneeDuTitre(e().nom)]
    if (serie()) {
      if (el().depuis) parts.push(`dès ${repere(el().depuis!.saison, el().depuis!.episode)}`)
      const n = el().episodesAvance
      if (n) parts.push(`${n} épisode${n > 1 ? 's' : ''} d’avance`)
    }
    return parts.filter(Boolean).join(' · ')
  }

  const entreesMenu = (): EntreeMenu[] => {
    // 0 ou absent : rien de choisi, le serveur applique `episodes_avance_defaut`.
    const avance = el().episodesAvance || undefined
    const n = avance ?? episodesAvanceDefaut()
    const valeurDepuis = el().depuis ? `${el().depuis!.saison}:${el().depuis!.episode}` : ''
    const options = [{ valeur: '', libelle: 'l’épisode entamé' }]
    if (episodes().length === 0 && el().depuis) options.push({ valeur: valeurDepuis, libelle: repere(el().depuis!.saison, el().depuis!.episode) })
    for (const ep of episodes()) options.push({ valeur: `${ep.saison}:${ep.numero}`, libelle: repere(ep.saison, ep.numero) })
    return [
      ...(estMobile() ? [{ icone: 'play_arrow', libelle: libelleLecture(), action: () => (serie() ? void lireSerie() : props.surOuvrir()) }] : []),
      { icone: 'expand_less', libelle: 'Monter', raccourci: 'Alt+↑', desactive: props.index === 0, action: props.surMonter },
      { icone: 'expand_more', libelle: 'Descendre', raccourci: 'Alt+↓', desactive: props.index >= props.total - 1, action: props.surDescendre },
      ...(etat() === 'echec' ? [{ icone: 'refresh', libelle: LIBELLES.reessayer, action: props.surReessayer }] : []),
      ...(serie()
        ? [
            {
              icone: 'video_library',
              libelle: libelleEpisodesAvance(avance, episodesAvanceDefaut()),
              compteur: {
                surMoins: () => props.surOptions({ episodesAvance: Math.max(EPISODES_AVANCE_MIN, n - 1) }),
                surPlus: () => props.surOptions({ episodesAvance: Math.min(EPISODES_AVANCE_MAX, n + 1) }),
                moinsDesactive: n <= EPISODES_AVANCE_MIN,
                plusDesactive: n >= EPISODES_AVANCE_MAX,
              },
            },
            {
              icone: 'history',
              libelle: 'À partir de…',
              choix: {
                valeur: valeurDepuis,
                options,
                surChoisir: (v: string) => {
                  const [s, ep] = v.split(':').map(Number)
                  props.surOptions({ depuis: v && s !== undefined && ep !== undefined ? { saison: s, episode: ep } : undefined })
                },
              },
            },
          ]
        : []),
      { icone: 'delete', libelle: LIBELLES.retirer, raccourci: 'Suppr', danger: true, action: props.surRetirer },
    ]
  }

  const boutonAction = (libelle: string, action: () => void) => (
    <button
      type="button"
      data-role="lire-ma-liste"
      aria-label={libelle}
      title={libelle}
      onClick={(ev) => { ev.stopPropagation(); action() }}
      style={{
        display: 'inline-flex', 'align-items': 'center', gap: '6px', 'white-space': 'nowrap',
        height: estMobile() ? '44px' : '34px', padding: '0 12px 0 8px',
        'border-radius': 'var(--r-btn-sm)', border: '1px solid var(--line2)', background: 'transparent', color: 'inherit',
        cursor: 'pointer', 'font-weight': 'var(--w-strong)', 'font-size': '13px',
      }}
    >
      <Icone nom="play_arrow" taille={18} plein />
      {libelle}
    </button>
  )

  const boutonMenu = (
    <button
      type="button"
      data-role="menu-ma-liste"
      aria-label={`Plus d’options pour ${titreCourt(e().nom)}`}
      aria-haspopup="menu"
      title="Plus d’options"
      onClick={(ev) => { ev.stopPropagation(); poserMenuDemande(true); poserMenu(positionSous(ev.currentTarget)) }}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation() }}
      style={{
        display: 'flex', 'align-items': 'center', 'justify-content': 'center', flex: 'none',
        width: estMobile() ? '44px' : '34px', height: estMobile() ? '44px' : '34px',
        'border-radius': 'var(--r-xs)', border: '1px solid var(--line2)', background: 'transparent', color: 'inherit', cursor: 'pointer',
      }}
    >
      <Icone nom="more_horiz" taille={20} />
    </button>
  )

  return (
    <li
      data-role="element-ma-liste"
      data-cle={el().cle}
      data-etat={etat()}
      draggable={!estMobile()}
      tabindex="0"
      aria-label={`${props.index + 1}. ${titreCourt(e().nom)}`}
      onDragStart={(ev) => { ev.dataTransfer?.setData('text/plain', el().cle); props.surDebutGlisse() }}
      onDragEnd={props.surFinGlisse}
      onDragOver={(ev) => { ev.preventDefault(); props.surSurvol() }}
      onDrop={(ev) => { ev.preventDefault(); props.surDepot() }}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return
        // Alt+↑ / Alt+↓ : le clavier reordonne sans viser un bouton ; Entree = fiche ; Suppr = retirer.
        if (ev.altKey && ev.key === 'ArrowUp') { ev.preventDefault(); props.surMonter() }
        else if (ev.altKey && ev.key === 'ArrowDown') { ev.preventDefault(); props.surDescendre() }
        else if (ev.key === 'Delete') { ev.preventDefault(); props.surRetirer() }
        else if (ev.key === 'Enter') { ev.preventDefault(); props.surDetails() }
      }}
      style={{
        display: 'grid',
        'grid-template-columns': estMobile() ? 'auto minmax(0,1fr) auto' : 'auto auto minmax(0,1fr) auto auto',
        'align-items': 'center', gap: estMobile() ? '10px' : '14px',
        padding: estMobile() ? '8px' : '10px 14px',
        border: `1px solid ${props.survole ? 'var(--acc)' : 'var(--line)'}`, 'border-radius': 'var(--r-md)',
        background: 'var(--card)', opacity: props.enGlisse ? 0.5 : 1, cursor: estMobile() ? 'default' : 'grab',
      }}
    >
      <Show when={!estMobile()}>
        <span aria-hidden="true" data-role="poignee" class="tertiaire" style={{ 'font-size': '16px', 'letter-spacing': '-2px', 'user-select': 'none' }} title="Glisser pour réordonner">
          ⋮⋮ <span class="num" style={{ 'font-size': '13px', 'letter-spacing': 0 }}>{props.index + 1}</span>
        </span>
      </Show>
      <span onClick={props.surDetails} style={{ cursor: 'pointer' }}>
        <SubstitutLogo nom={titreCourt(e().nom)} src={e().icone} taille={estMobile() ? 48 : 64} affiche />
      </span>

      <div style={{ 'min-width': 0, display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
        <div style={{ display: 'flex', 'align-items': 'baseline', gap: '8px', 'min-width': 0 }}>
          <span class="tronque" data-role="titre-ma-liste" style={{ 'font-weight': 'var(--w-strong)', cursor: 'pointer' }} onClick={props.surDetails} title={e().nom}>
            {titreCourt(e().nom)}
          </span>
          <Show when={!estMobile()}>
            <span class="tertiaire tronque" style={{ 'font-size': '12px', flex: 'none' }}>{sousTitre()}</span>
          </Show>
        </div>
        <span data-role="etat-preparation">
          <ChipPreparation preparation={preparation()} forme={serie() ? 'ligne' : 'chip'} compact={estMobile()} surReessayer={props.surReessayer} />
        </span>
      </div>

      <Show when={!estMobile()}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {boutonAction(libelleLecture(), () => (serie() ? void lireSerie() : props.surOuvrir()))}
        </div>
      </Show>
      {boutonMenu}

      <Show when={menu()}>
        {(m) => <MenuContextuel x={m().x} y={m().y} ancre={m().ancre} libelle={`Options de ${titreCourt(e().nom)}`} entrees={entreesMenu()} surFermer={() => poserMenu(null)} />}
      </Show>
    </li>
  )
}
