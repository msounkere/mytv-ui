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
import Icone from '../components/Icone'
import ResumeContenu from '../components/ResumeContenu'
import FaitsContenu from '../components/FaitsContenu'
import { cibleDe, dureeLongue, useDetails } from '../lib/details'
import { audioLisible, separerPrefixe } from '../lib/libelles'
import { versErreurLecteur, type SaisonApi } from '../lib/api'
import { ErreurLecteur, LIBELLE_COUCHE } from '../lib/errors'
import { progressions } from '../lib/preferences'
import { FRAICHEUR, cles, requete, requeteClefee } from '../lib/requetes'
import { listeAVoir } from '../lib/a-voir'
import { estBureau, estMobile } from '../lib/gabarit'
import { BadgePret, BoutonAVoir, LigneDisponibilite, useAVoirCles } from '../components/BoutonAVoir'
import { estPret } from '../lib/a-voir-serveur'
import { useDisponibilite } from '../lib/disponibilite'
import { chargerSaisons, lireSaisons } from '../lib/saisons'
import { prochainAVoir } from '../lib/episodes-suivants'
import { lectureEnCours } from '../etat'
import type { EntreeCatalogue } from '../lib/db'

// Une serie n est pas une entree de plus dans une liste : c est un index. Le
// relais renvoie les episodes groupes par saison, parfois 268 dans une seule
// (verifie sur le catalogue reel) — d ou le selecteur de saison et la liste
// fenetree au-dela de SEUIL_VIRTUEL.

// ── Fiche d affichage ───────────────────────────────────────────────────────
// Le modele d affichage ci-dessous date de l ancienne API (`get_series_info`) ;
// il est conserve pour ne pas reecrire l ecran. `fiche.json` le remplit depuis
// `/series/{id}/saisons` (contrat v1) : saisons -> episodes, chacun avec son
// identifiant `fournisseur:numero.ext` et son adresse de lecture relative.
// Synopsis, genre, casting et bande-annonce de la SERIE viennent de `/series/{id}`
// (details demandes a l'ouverture de la fiche, US-28) ; synopsis, vignette et date
// de chaque EPISODE viennent des saisons. Tout champ absent est simplement masque.
//
// US-43 : « À voir » sur la serie (un seul element) et sur chaque episode (la
// serie « a partir de » cet episode, CA1) ; badge « Prêt » sur les episodes que
// le serveur tient (CA3) ; sonde du prochain episode a regarder, a l'ouverture,
// hors lecture (CA5).

interface PisteFfprobe {
  codec_name?: string
}

interface InfoEpisodeBrut {
  plot?: string
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
  /** Adresse de lecture relative donnee par l API. */
  lecture?: string
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
  synopsis?: string
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
  const [fiche, { refetch }] = requeteClefee<string, FicheBrute | null>(
    (id) => cles.serie(id),
    () => props.serie.idServeur,
    async (id) => {
      try {
        // Meme cache que l'enchainement du lecteur et la sonde (lib/saisons).
        return versFiche(await chargerSaisons(id))
      } catch (e) {
        // `ErreurApi` (501 non disponible, 502 fournisseur...) devient l erreur
        // nommee que l ecran sait afficher, avec son action proposee.
        throw versErreurLecteur(e, 'Reessayer le chargement de la fiche.')
      }
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

  // Details de la serie, demandes A L'OUVERTURE de la fiche (jamais par carte de liste).
  // Independants des saisons : un echec ici ne cache pas les episodes.
  const [details, { refetch: relancerDetails }] = useDetails(() => cibleDe(props.serie))

  const jaquette = createMemo(() => details()?.affiche ?? props.serie.icone)

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
    const nomBrutSerie = f.info?.name ?? props.serie.nom

    return bruts
      .map((e, index): Episode | null => {
        if (!e.id) return null
        const numero = typeof e.episode_num === 'number' ? e.episode_num : index + 1
        const extension = e.container_extension || 'mp4'
        const codec = codecAudio(e.info)
        return {
          // Cle locale d un episode : `series:` + son identifiant serveur
          // (`series:iptva:77123.mkv`). Il n est pas au catalogue ; l historique
          // et les reprises le rangent sous ce nom.
          cle: `series:${e.id}`,
          numero,
          titre: titreLisible(e.title, nomBrutSerie, numero),
          nom: `${titreSerie()} — ${repere(saison, numero)}`,
          url: e.lecture ?? '',
          extension,
          vignette: e.info?.movie_image || undefined,
          synopsis: e.info?.plot || undefined,
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

  // --- « À voir » (US-43) -------------------------------------------------------
  const aVoir = useAVoirCles()
  const dansAVoir = () => aVoir()?.has(props.serie.cle) ?? false
  // Point de depart retenu pour cette serie : la ligne de l'episode qui le porte le dit.
  const [lignesAVoir] = requete(cles.aVoir, listeAVoir, { fraicheur: FRAICHEUR.geste })
  const aVoirDepuis = () => lignesAVoir()?.find((l) => l.cle === props.serie.cle)?.depuis

  // Le prochain episode a regarder (premier non vu de la saison affichee) : c'est
  // lui que la sonde mesure, a l'ouverture de la fiche et hors lecture (CA5).
  const [saisonsBrutes] = requeteClefee<string, SaisonApi[]>(
    (id) => cles.saisons(id),
    () => (fiche() ? props.serie.idServeur : undefined),
    lireSaisons,
    { fraicheur: FRAICHEUR.relais, peremption: FRAICHEUR.relais, suspendre: false },
  )
  const prochain = createMemo(() => {
    const s = saisonsBrutes()
    const saison = saisonActive()
    if (!s || saison === null) return undefined
    const avancees = avancement() ?? new Map<string, number>()
    return prochainAVoir(s.filter((x) => x.numero === saison), props.serie.nom, avancees, SEUIL_VU)
  })
  const disponibilite = useDisponibilite(
    () => {
      const p = prochain()
      return p ? p.cle.slice('series:'.length) : undefined
    },
    () => lectureEnCours() === null,
  )

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

  // Une ligne = le bouton de lecture ET, a cote (jamais dedans : un bouton dans un
  // bouton n'est ni valide ni accessible), le bouton « À voir à partir d'ici ».
  const Ligne = (e: Episode) => (
    <div data-role="episode" style={{ display: 'flex', 'align-items': 'stretch', height: '100%', 'border-bottom': '1px solid var(--line)' }}>
    <button
      onClick={() => lire(e)}
      title={`${e.titre}${e.dureeSecondes ? ` · ${dureeLisible(e.dureeSecondes)}` : ''}${e.synopsis ? `\n${e.synopsis}` : ''}`}
      style={{
        display: 'flex', 'align-items': 'center', gap: estMobile() ? '10px' : '12px',
        flex: 1, 'min-width': 0, height: '100%', padding: estMobile() ? '8px 12px' : '8px 14px', 'text-align': 'left',
        'border-radius': 0,
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
        <Show when={e.synopsis}>
          {(r) => (
            <span data-role="episode-resume" class="tertiaire tronque" style={{ display: 'block', 'font-size': '12px' }}>{r()}</span>
          )}
        </Show>
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

      <BadgePret visible={estPret(e.cle)} />

      <span class="num secondaire" style={{ flex: '0 0 auto', 'font-size': '13px' }}>
        {dureeLisible(e.dureeSecondes) ?? '—'}
      </span>
    </button>

      {/* Un episode ajoute SA SERIE, « a partir de » lui : jamais un element par episode. */}
      <Show when={!estMobile()}>
        <span style={{ flex: '0 0 auto', display: 'flex', 'align-items': 'center', padding: '0 12px 0 4px' }}>
          <BoutonAVoir
            cle={props.serie.cle}
            options={{ depuis: { saison: saisonActive() ?? 0, episode: e.numero } }}
            present={dansAVoir() && aVoirDepuis()?.saison === saisonActive() && aVoirDepuis()?.episode === e.numero}
            libelleAjout="À voir à partir d’ici"
            compact
          />
        </span>
      </Show>
    </div>
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
          Série · <span class="num">{props.serie.idServeur}</span>
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
              La fiche existe au catalogue mais le detail est vide cote fournisseur. Reessayer, ou
              choisir une autre serie.
            </p>
            <button onClick={() => void refetch()} style={{ border: '1px solid var(--line2)', padding: '4px 10px' }}>
              Reessayer
            </button>
          </div>
        </Match>

        <Match when={fiche()}>
          {(_f) => (
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

                  <p class="secondaire" data-role="meta" style={{ margin: '4px 0 0', 'font-size': '13px' }}>
                    <span class="num">{saisons().length}</span> saison{saisons().length > 1 ? 's' : ''}
                    {' · '}
                    <span class="num">{totalEpisodes()}</span> épisodes
                    <Show when={details()?.genre}>{(g) => <> · <span class="tronque">{g()}</span></>}</Show>
                    <Show when={details()?.annee ?? (props.serie.annee ? String(props.serie.annee) : undefined)}>
                      {(a) => <> · <span class="num">{a()}</span></>}
                    </Show>
                    <Show when={details()?.note ?? props.serie.note}>
                      {(r) => <> · <span class="num">{r().toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/10</span></>}
                    </Show>
                    <Show when={dureeLongue(details()?.dureeSecondes)}>
                      {(d) => <> · <span class="num">{d()} par épisode</span></>}
                    </Show>
                  </p>

                  <ResumeContenu
                    details={details()}
                    erreur={details.error}
                    attendu={cibleDe(props.serie) !== undefined}
                    surReessayer={() => void relancerDetails()}
                    style={{ margin: '8px 0 0', 'max-height': '7.2em', overflow: 'auto', 'font-size': '13px', color: 'var(--fg2)' }}
                  />

                  <Show when={prochain()}>
                    {(p) => (
                      <div style={{ 'margin-top': '8px' }}>
                        <LigneDisponibilite
                          disponibilite={disponibilite()}
                          cle={props.serie.cle}
                          options={{ depuis: { saison: p().saison, episode: p().numero } }}
                          present={dansAVoir()}
                          prefixe={repere(p().saison, p().numero)}
                        />
                      </div>
                    )}
                  </Show>

                  <div style={{ 'margin-top': '8px', display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '8px 16px' }}>
                    <BoutonAVoir cle={props.serie.cle} present={dansAVoir()} />
                    <FaitsContenu details={details()} />
                    <Show when={details()?.bandeAnnonce}>
                      {(href) => (
                        <a
                          href={href()}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-role="bande-annonce"
                          style={{
                            display: 'flex', 'align-items': 'center', gap: '6px', padding: '4px 12px 4px 8px',
                            border: '1px solid var(--line2)', 'border-radius': 'var(--r-btn-sm)', color: 'inherit',
                            'text-decoration': 'none', 'min-height': hauteurCible(),
                          }}
                        >
                          <Icone nom="movie" taille={16} />
                          Bande-annonce
                        </a>
                      )}
                    </Show>
                  </div>
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

/** Saisons de l API v1 -> forme d affichage historique (episodes par numero de saison). */
export function versFiche(saisons: SaisonApi[]): FicheBrute | null {
  if (saisons.length === 0) return null
  const episodes: Record<string, EpisodeBrut[]> = {}
  for (const s of saisons)
    episodes[String(s.numero)] = s.episodes.map((e) => ({
      id: e.id,
      lecture: e.lecture,
      episode_num: e.numero,
      title: e.titre,
      container_extension: e.extension,
      season: s.numero,
      info:
        e.duree > 0 || e.synopsis || e.image || e.sortie
          ? {
              duration_secs: e.duree > 0 ? e.duree : undefined,
              plot: e.synopsis,
              movie_image: e.image,
              air_date: e.sortie,
              rating: e.note,
            }
          : undefined,
    }))
  return { episodes }
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
