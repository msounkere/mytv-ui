import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  createEffect,
  on,
  onCleanup,
  onMount,
} from 'solid-js'
import ListeVirtuelle from '../components/ListeVirtuelle'
import SubstitutLogo from '../components/SubstitutLogo'
import EtiquettePays from '../components/EtiquettePays'
import { ClientXtream, audioLisible, separerPrefixe } from '../lib/xtream'
import { config } from '../config'
import { ErreurLecteur, LIBELLE_COUCHE } from '../lib/errors'
import { progressions } from '../lib/preferences'
import { FRAICHEUR, cles, requeteClefee } from '../lib/requetes'
import { estBureau, estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Une serie n est pas une entree de plus dans une liste : c est un index. Le
// relais renvoie les episodes groupes par saison, parfois 268 dans une seule
// (verifie sur le catalogue reel) — d ou le selecteur de saison et la liste
// fenetree au-dela de SEUIL_VIRTUEL.

// ── Forme reelle de get_series_info ─────────────────────────────────────────
// Observee sur le relais, et volontairement plus prudente que `InfosSerie` :
//  · la reponse est `[]` (et non un objet) pour ~1 serie sur 8 — fiche absente ;
//  · `seasons` annonce des saisons qui n ont aucun episode (« Especiales ») :
//    la verite, ce sont les cles de `episodes` ;
//  · `info.audio` est tantot l objet ffprobe, tantot `[]` quand la piste manque ;
//  · `info.plot` n est jamais renseigne par episode, `movie_image` souvent absent.
// On ne touche pas a xtream.ts (d autres ecrans en dependent) : on narrow ici.

interface PisteFfprobe {
  codec_name?: string
}

interface InfoEpisodeBrut {
  duration_secs?: number
  duration?: string
  movie_image?: string
  air_date?: string
  rating?: number | string
  audio?: PisteFfprobe | unknown[]
  video?: PisteFfprobe | unknown[]
}

interface EpisodeBrut {
  id?: string
  episode_num?: number
  title?: string
  container_extension?: string
  season?: number
  info?: InfoEpisodeBrut
}

interface SaisonBrute {
  season_number?: number
  name?: string
  episode_count?: string | number
  air_date?: string
  cover?: string
}

interface InfoSerieBrute {
  name?: string
  cover?: string
  plot?: string
  genre?: string
  cast?: string
  director?: string
  rating?: string
  releaseDate?: string
  release_date?: string
  episode_run_time?: string | number
}

interface FicheBrute {
  info?: InfoSerieBrute
  seasons?: SaisonBrute[]
  episodes?: Record<string, EpisodeBrut[] | undefined>
}

// ── Modele d affichage ──────────────────────────────────────────────────────

interface Episode {
  cle: string
  numero: number
  titre: string
  /** Libelle complet transmis au lecteur, reconnaissable dans l historique. */
  nom: string
  url: string
  extension: string
  vignette?: string
  dureeSecondes?: number
  /** Renseigne seulement si le navigateur ne saura pas le decoder. */
  codecAudioMuet?: string
  diffuseLe?: string
}

interface Saison {
  numero: number
  nom: string
  compte: number
}

/** Au-dela, le rendu d un bloc fige le navigateur : on fenetre. */
const SEUIL_VIRTUEL = 40
const HAUTEUR_LIGNE = 76
/** Marge latérale : réduite hors bureau, où l'écran ne la peut plus. */
const marge = () => (estBureau() ? 16 : estMobile() ? 12 : 12)
/** 44 px au doigt (cahier des charges, §6) ; le bureau garde ses 5 px de rembourrage. */
const hauteurCible = () => (estMobile() ? '44px' : undefined)

/** Meme seuil que `reprisePour` : au-dela, l episode compte comme vu. */
const SEUIL_VU = 0.95

export default function FicheSerie(props: {
  serie: EntreeCatalogue
  surLire: (episode: {
    cle: string
    nom: string
    url: string
    extension: string
    /** Épisode d'après dans la saison, pour le décompte « épisode suivant ». */
    suivant?: { cle: string; nom: string; url: string; extension: string }
  }) => void
  surRetour: () => void
}) {
  const [saisonChoisie, poserSaison] = createSignal<number | null>(null)

  // `null` = le relais a repondu, mais sans fiche : un etat vide explicite,
  // pas une erreur — le brief interdit de confondre les deux.
  //
  // Clefee par serie : rouvrir une fiche deja consultee ne redemande rien au
  // relais, qui pousse peut-etre un flux au meme moment. L'erreur ne se propage
  // pas — le `Switch` plus bas montre un diagnostic et un bouton « Reessayer ».
  const [fiche, { refetch }] = requeteClefee<number, FicheBrute | null>(
    (id) => cles.serie(id),
    () => props.serie.id,
    async (id) => {
      const brut: unknown = await new ClientXtream().infosSerie(id)
      if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null
      return brut as FicheBrute
    },
    { fraicheur: FRAICHEUR.relais, reessais: 2, peremption: FRAICHEUR.relais },
  )

  // Changer de serie remet le selecteur sur la premiere saison disponible.
  createEffect(on(() => props.serie.cle, () => poserSaison(null)))

  const erreur = createMemo<ErreurLecteur | null>(() => {
    const e: unknown = fiche.error
    if (!e) return null
    if (e instanceof ErreurLecteur) return e
    return new ErreurLecteur('donnees', String(e), 'Reessayer le chargement de la fiche.')
  })

  const titreSerie = createMemo(() => {
    const brut = fiche()?.info?.name
    return brut ? separerPrefixe(brut).titre : props.serie.nom
  })

  const jaquette = createMemo(() => fiche()?.info?.cover ?? props.serie.icone)

  const saisons = createMemo<Saison[]>(() => {
    const f = fiche()
    if (!f?.episodes) return []
    const nommees = new Map<number, string>()
    for (const s of f.seasons ?? [])
      if (typeof s.season_number === 'number' && s.name) nommees.set(s.season_number, s.name)

    const liste: Saison[] = []
    for (const [cle, episodes] of Object.entries(f.episodes)) {
      if (!episodes || episodes.length === 0) continue
      const numero = Number(cle)
      if (!Number.isFinite(numero)) continue
      liste.push({
        numero,
        nom: nommees.get(numero) ?? (numero === 0 ? 'Hors saison' : `Saison ${numero}`),
        compte: episodes.length,
      })
    }
    return liste.sort((a, b) => a.numero - b.numero)
  })

  const totalEpisodes = createMemo(() => saisons().reduce((n, s) => n + s.compte, 0))

  // Le choix explicite ne vaut que s il existe encore dans la fiche courante.
  const saisonActive = createMemo<number | null>(() => {
    const dispo = saisons()
    const choix = saisonChoisie()
    if (choix !== null && dispo.some((s) => s.numero === choix)) return choix
    return dispo[0]?.numero ?? null
  })

  const episodes = createMemo<Episode[]>(() => {
    const f = fiche()
    const saison = saisonActive()
    if (!f?.episodes || saison === null) return []
    const bruts = f.episodes[String(saison)] ?? []
    const client = clientOuRien()
    const nomBrutSerie = f.info?.name ?? props.serie.nom

    return bruts
      .map((e, index): Episode | null => {
        if (!e.id) return null
        const numero = typeof e.episode_num === 'number' ? e.episode_num : index + 1
        const extension = e.container_extension || 'mp4'
        const codec = codecAudio(e.info)
        return {
          cle: `${props.serie.cle}:${e.id}`,
          numero,
          titre: titreLisible(e.title, nomBrutSerie, numero),
          nom: `${titreSerie()} — ${repere(saison, numero)}`,
          url: client ? client.fluxEpisode(e.id, extension) : '',
          extension,
          vignette: e.info?.movie_image || undefined,
          dureeSecondes: typeof e.info?.duration_secs === 'number' ? e.info.duration_secs : undefined,
          codecAudioMuet: codec && !audioLisible(codec) ? codec.toUpperCase() : undefined,
          diffuseLe: e.info?.air_date || undefined,
        }
      })
      .filter((e): e is Episode => e !== null)
  })

  // Avancement memorise : ce qui a ete regarde se voit sans rouvrir le flux.
  // Clefe par serie et par saison, pas par liste d'identifiants : 268 cles
  // concatenees ne font pas une cle de cache lisible. Perime a chaque position
  // enregistree, donc les pastilles « Vu » suivent la lecture.
  const [avancement] = requeteClefee(
    (s: { saison: number; episodes: string[] }) => cles.progressions(props.serie.cle, s.saison),
    () => {
      const saison = saisonActive()
      return saison === null ? undefined : { saison, episodes: episodes().map((e) => e.cle) }
    },
    (s) => progressions(s.episodes),
    { fraicheur: FRAICHEUR.geste },
  )

  const etatDe = (cle: string): 'vu' | 'encours' | null => {
    const p = avancement()?.get(cle)
    if (p === undefined) return null
    return p >= SEUIL_VU ? 'vu' : p > 0 ? 'encours' : null
  }

  // Escape ferme la fiche : c est une vue de detail, pas une page de plus.
  onMount(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props.surRetour()
    }
    window.addEventListener('keydown', auClavier)
    onCleanup(() => window.removeEventListener('keydown', auClavier))
  })

  function lire(e: Episode) {
    if (!e.url) return
    // L'épisode d'après alimente le décompte de fin ; absent sur le dernier
    // de la saison, auquel cas le lecteur n'arme simplement rien.
    const liste = episodes()
    const apres = liste[liste.findIndex((x) => x.cle === e.cle) + 1]
    props.surLire({
      cle: e.cle, nom: e.nom, url: e.url, extension: e.extension,
      suivant:
        apres && apres.url
          ? { cle: apres.cle, nom: apres.nom, url: apres.url, extension: apres.extension }
          : undefined,
    })
  }

  const Ligne = (e: Episode) => (
    <button
      onClick={() => lire(e)}
      title={`${e.titre}${e.dureeSecondes ? ` · ${dureeLisible(e.dureeSecondes)}` : ''}`}
      style={{
        display: 'flex', 'align-items': 'center', gap: estMobile() ? '10px' : '12px',
        width: '100%', height: '100%', padding: estMobile() ? '8px 12px' : '8px 14px', 'text-align': 'left',
        'border-radius': 0, 'border-bottom': '1px solid var(--line)',
        opacity: etatDe(e.cle) === 'vu' ? '0.62' : '1',
      }}
    >
      <SubstitutLogo nom={e.titre} src={e.vignette} taille={estMobile() ? 48 : 56} />

      <span class="num tertiaire" style={{ flex: '0 0 auto', width: '34px', 'font-size': '13px' }}>
        {`E${String(e.numero).padStart(2, '0')}`}
      </span>

      <span style={{ flex: 1, 'min-width': 0 }}>
        <span class="tronque" style={{ display: 'block', 'font-weight': 'var(--w-strong)' }}>{e.titre}</span>
        <span
          class="secondaire tronque"
          style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px' }}
        >
          {/* Mobile : la date de diffusion cède la place — 390 px portent le
              titre, l'état et la durée, pas un troisième détail. */}
          <Show when={e.diffuseLe && !estMobile()}>{(d) => <span class="num">{d()}</span>}</Show>
          <Show when={etatDe(e.cle) === 'encours'}>
            <span style={{ color: 'var(--acc-fg)' }}>Repris en cours</span>
          </Show>
          <Show when={e.codecAudioMuet}>
            {(c) => (
              // Le navigateur n a pas de decodeur EAC3/AC3/DTS : on le dit avant
              // la lecture plutot que d afficher une image muette.
              <span
                class="num"
                title="Piste audio non decodee par le navigateur — lisible via la diffusion vers le televiseur"
                style={{
                  padding: '0 5px', 'border-radius': 'var(--r-2xs)',
                  color: 'var(--cod)', background: 'var(--cod-bg)',
                  border: '1px solid var(--cod)', 'font-size': '11px',
                }}
              >
                {c()} · televiseur
              </span>
            )}
          </Show>
        </span>
      </span>

      <Show when={etatDe(e.cle) === 'vu'}>
        <span
          style={{
            flex: '0 0 auto', padding: '0 6px', 'font-size': '11px',
            color: 'var(--ok)', border: '1px solid var(--ok)', 'border-radius': 'var(--r-2xs)',
          }}
        >
          Vu
        </span>
      </Show>

      <span class="num secondaire" style={{ flex: '0 0 auto', 'font-size': '13px' }}>
        {dureeLisible(e.dureeSecondes) ?? '—'}
      </span>
    </button>
  )

  return (
    <div style={{ display: 'grid', 'grid-template-rows': 'auto 1fr', height: '100%', 'min-height': 0 }}>
      <nav
        style={{
          display: 'flex', 'align-items': 'center', gap: '10px',
          padding: `8px ${marge()}px`, 'border-bottom': '1px solid var(--line)',
        }}
      >
        <button
          onClick={() => props.surRetour()}
          style={{ padding: '5px 12px', border: '1px solid var(--line2)', 'min-height': hauteurCible() }}
        >
          ← Retour
        </button>
        <span class="secondaire tronque" style={{ 'font-size': '13px' }}>
          Série · <span class="num">{props.serie.id}</span>
        </span>
      </nav>

      <Switch>
        <Match when={fiche.loading}>
          <p class="tertiaire" style={{ padding: '16px' }}>Chargement de la fiche…</p>
        </Match>

        <Match when={erreur()}>
          {(e) => (
            <div style={{ padding: '16px' }}>
              <div
                style={{
                  padding: '12px 14px', background: 'var(--err-bg)',
                  border: '1px solid var(--err)', 'border-radius': 'var(--r-md)',
                }}
              >
                <strong style={{ color: 'var(--err)' }}>{LIBELLE_COUCHE[e().couche]}</strong>
                <p style={{ margin: '2px 0' }}>{e().message}</p>
                <p class="secondaire" style={{ margin: 0, 'font-size': '13px' }}>{e().action}</p>
                <Show when={e().detail}>
                  {(d) => (
                    <p class="tertiaire" style={{ margin: '4px 0 0', 'font-family': 'var(--moov-font-mono)', 'font-size': '11px' }}>
                      {d()}
                    </p>
                  )}
                </Show>
                <button
                  onClick={() => void refetch()}
                  style={{ 'margin-top': '8px', border: '1px solid var(--line2)', padding: '4px 10px' }}
                >
                  Reessayer
                </button>
              </div>
            </div>
          )}
        </Match>

        <Match when={fiche() === null || saisons().length === 0}>
          <div style={{ padding: '16px' }}>
            <p style={{ margin: 0 }}>
              Le relais ne renvoie aucun episode pour « {props.serie.nom} ».
            </p>
            <p class="secondaire" style={{ margin: '2px 0 10px', 'font-size': '13px' }}>
              La fiche existe au catalogue mais le detail est vide cote TuliProx. Reessayer, ou
              choisir une autre serie.
            </p>
            <button onClick={() => void refetch()} style={{ border: '1px solid var(--line2)', padding: '4px 10px' }}>
              Reessayer
            </button>
          </div>
        </Match>

        <Match when={fiche()}>
          {(f) => (
            <div style={{ display: 'grid', 'grid-template-rows': 'auto auto 1fr', 'min-height': 0 }}>
              <header
                style={{
                  display: 'grid', 'grid-template-columns': 'auto 1fr',
                  gap: estMobile() ? '12px' : '16px',
                  padding: estBureau() ? '14px 16px' : `12px ${marge()}px`,
                  'border-bottom': '1px solid var(--line)',
                }}
              >
                {/* Affiche réduite sur mobile : 120 px de jaquette mangeraient
                    le tiers de la largeur au détriment du titre. */}
                <SubstitutLogo nom={titreSerie()} src={jaquette()} taille={estMobile() ? 84 : 120} affiche />

                <div style={{ 'min-width': 0 }}>
                  <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                    <EtiquettePays pays={props.serie.pays} />
                    <h1 class="tronque" title={titreSerie()}>{titreSerie()}</h1>
                  </div>

                  <p class="secondaire" style={{ margin: '4px 0 0', 'font-size': '13px' }}>
                    <span class="num">{saisons().length}</span> saison{saisons().length > 1 ? 's' : ''}
                    {' · '}
                    <span class="num">{totalEpisodes()}</span> épisodes
                    <Show when={f().info?.genre}>{(g) => <> · <span class="tronque">{g()}</span></>}</Show>
                    <Show when={anneeDe(f().info)}>{(a) => <> · <span class="num">{a()}</span></>}</Show>
                    <Show when={f().info?.rating}>{(r) => <> · <span class="num">{r()}/10</span></>}</Show>
                  </p>

                  <Show
                    when={f().info?.plot}
                    fallback={<p class="tertiaire" style={{ margin: '8px 0 0', 'font-size': '13px' }}>Aucun resume fourni par le relais.</p>}
                  >
                    {(plot) => (
                      <p
                        class="secondaire"
                        style={{ margin: '8px 0 0', 'max-height': '5.8em', overflow: 'auto', 'font-size': '13px' }}
                      >
                        {plot()}
                      </p>
                    )}
                  </Show>
                </div>
              </header>

              <div
                role="tablist"
                aria-label="Saisons"
                style={{
                  display: 'flex', gap: '2px', padding: `8px ${marge()}px`,
                  'overflow-x': 'auto', 'border-bottom': '1px solid var(--line)',
                  // Onglets défilants : sans cela, vingt saisons étirent la page.
                  'scrollbar-width': estMobile() ? 'none' : undefined,
                  '-webkit-overflow-scrolling': 'touch',
                }}
              >
                <For each={saisons()}>
                  {(s) => (
                    <button
                      role="tab"
                      aria-selected={saisonActive() === s.numero}
                      onClick={() => poserSaison(s.numero)}
                      title={`${s.nom} · ${s.compte} épisode${s.compte > 1 ? 's' : ''}`}
                      style={{
                        flex: '0 0 auto', padding: '5px 12px', 'min-height': hauteurCible(),
                        color: saisonActive() === s.numero ? 'var(--acc-fg)' : 'var(--fg2)',
                        background: saisonActive() === s.numero ? 'var(--acc-bg)' : 'transparent',
                        'font-weight': saisonActive() === s.numero ? 'var(--w-strong)' : '400',
                      }}
                    >
                      {s.nom} <span class="num tertiaire">{s.compte}</span>
                    </button>
                  )}
                </For>
              </div>

              <section style={{ 'min-height': 0 }}>
                <Show
                  when={episodes().length > SEUIL_VIRTUEL}
                  fallback={
                    <div style={{ height: '100%', overflow: 'auto' }}>
                      <For
                        each={episodes()}
                        fallback={<p class="tertiaire" style={{ padding: '14px' }}>Cette saison ne contient aucun episode lisible.</p>}
                      >
                        {(e) => <div style={{ height: `${HAUTEUR_LIGNE}px` }}>{Ligne(e)}</div>}
                      </For>
                    </div>
                  }
                >
                  <ListeVirtuelle
                    elements={episodes()}
                    hauteurLigne={HAUTEUR_LIGNE}
                    ligne={(e) => Ligne(e)}
                    vide={<p class="tertiaire" style={{ padding: '14px' }}>Cette saison ne contient aucun episode lisible.</p>}
                  />
                </Show>
              </section>
            </div>
          )}
        </Match>
      </Switch>
    </div>
  )
}

// ── Utilitaires locaux ──────────────────────────────────────────────────────

/**
 * Le client n est construit que pour fabriquer les URL d episodes, seul endroit
 * de l interface ou les identifiants du relais servent encore. Session fermee,
 * donc identifiants absents : on renvoie `null` et le bouton reste inerte,
 * l erreur de chargement ayant deja ete affichee par la ressource.
 */
function clientOuRien(): ClientXtream | null {
  const c = config()
  return c.username && c.password ? new ClientXtream(c) : null
}

function codecAudio(info: InfoEpisodeBrut | undefined): string | undefined {
  const a = info?.audio
  if (!a || Array.isArray(a)) return undefined
  return typeof a.codec_name === 'string' ? a.codec_name : undefined
}

/**
 * Le relais prefixe chaque titre d episode par le nom complet de la serie et
 * son repere « S01E01 » : illisible dans une liste deja groupee par saison.
 */
function titreLisible(brut: string | undefined, nomSerie: string, numero: number): string {
  let t = (brut ?? '').trim()
  if (nomSerie && t.toLowerCase().startsWith(nomSerie.toLowerCase())) t = t.slice(nomSerie.length)
  t = t.replace(/^[\s\-–—:]+/, '')
  t = t.replace(/^S\d{1,3}\s*E\d{1,4}\b[\s\-–—:]*/i, '').trim()
  return t.length > 0 ? t : `Episode ${numero}`
}

function repere(saison: number, episode: number): string {
  return `S${String(saison).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}

/** mm:ss sous l heure, « 1 h 08 » au-dela — aligne grace a `.num`. */
function dureeLisible(secondes: number | undefined): string | undefined {
  if (secondes === undefined || !Number.isFinite(secondes) || secondes <= 0) return undefined
  const total = Math.round(secondes)
  if (total < 3600) {
    const m = Math.floor(total / 60)
    return `${m}:${String(total % 60).padStart(2, '0')}`
  }
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return `${h} h ${String(m).padStart(2, '0')}`
}

function anneeDe(info: InfoSerieBrute | undefined): string | undefined {
  const date = info?.releaseDate ?? info?.release_date
  const m = date ? /\d{4}/.exec(date) : null
  return m?.[0]
}
