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
import BarreProgression from '../components/BarreProgression'
import MenuContextuel, { type EntreeMenu } from '../components/MenuContextuel'
import { cibleDe, dureeLongue, useDetails } from '../lib/details'
import { audioLisible, separerPrefixe } from '../lib/libelles'
import { versErreurLecteur, type SaisonApi } from '../lib/api'
import { ErreurLecteur, LIBELLE_COUCHE } from '../lib/errors'
import { associerSerie, noterPosition, oublierReprise } from '../lib/preferences'
import { FRAICHEUR, cles, invaliderReprises, requete, requeteClefee } from '../lib/requetes'
import { ajouterAVoir, listeAVoir, modifierOptionsAVoir, retirerAVoir } from '../lib/a-voir'
import { estBureau, estMobile } from '../lib/gabarit'
import { BoutonAVoir, useAVoirCles } from '../components/BoutonAVoir'
import { estPret } from '../lib/a-voir-serveur'
import { useDisponibilite } from '../lib/disponibilite'
import { chargerSaisons } from '../lib/saisons'
import { lectureEnCours } from '../etat'
import { actionSerie, etatLecture, partVue, repere, resteLisible, type EpisodeFiche } from '../lib/fiche-regles'
import { BoutonMenu, LigneSonde, propsChip } from './FicheFilm'
import { ChipPreparation, PART_VUE, emettreToast } from '../lib/ui7-contrat'
import { db, type EntreeCatalogue, type Reprise } from '../lib/db'

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
// US-43 : « Ma liste » sur la serie (un seul element) et, par le menu de chaque
// ligne, « Ma liste a partir d'ici » (la serie « a partir de » cet episode, CA1) ;
// chip « Prêt » sur les episodes que le serveur tient (CA3) ; sonde du prochain
// episode a regarder, a l'ouverture, UNE fois par fiche, hors lecture (CA5).
//
// US-45 CA3/CA4 (modele cible, rapport C §5.3-5.5) : action principale dans
// l'en-tete (`Lire S01E01` / `Reprendre S01E03 · 23 min` / `Episode suivant
// S01E04`) avec une barre de progression ; menu « ⋯ » sur CHAQUE ligne (Lire,
// Marquer comme vu / non vu, Ma liste a partir d'ici / Ne plus partir d'ici) et
// sur la saison (marquer la saison vue / non vue) ; un seul bouton Ma liste dans
// l'en-tete, « ✓ Dans ma liste · des S01E03 ▾ » quand elle y est ; aucun
// identifiant interne visible ; tout tient dans 390 px (`minmax(0,1fr)`).

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
  saison: number
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

  /** Episodes d'UNE saison, dans la forme d'affichage. */
  function episodesDe(saison: number): Episode[] {
    const f = fiche()
    if (!f?.episodes) return []
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
          saison,
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
  }

  const episodes = createMemo<Episode[]>(() => {
    const saison = saisonActive()
    return saison === null ? [] : episodesDe(saison)
  })

  /** TOUS les episodes, saisons dans l'ordre : l'action principale, le prochain a voir et la sonde les lisent. */
  const tous = createMemo<Episode[]>(() => saisons().flatMap((s) => episodesDe(s.numero)))

  // Positions memorisees de TOUS les episodes, en une lecture ; perimee a chaque
  // geste (cle sous `reprises`), donc les pastilles « Vu » suivent la lecture.
  const [reprises] = requeteClefee<{ serie: string; cles: string[] }, Map<string, Reprise>>(
    (s) => [...cles.reprises, 'fiche-serie', s.serie, s.cles.length],
    () => (tous().length ? { serie: props.serie.cle, cles: tous().map((e) => e.cle) } : undefined),
    async (s) => new Map((await db.reprises.bulkGet(s.cles)).filter((r): r is Reprise => !!r).map((r) => [r.cle, r])),
    { fraicheur: FRAICHEUR.geste, suspendre: false },
  )
  const repriseDe = (cle: string) => reprises()?.get(cle)
  const etatDe = (cle: string) => etatLecture(repriseDe(cle), PART_VUE)

  // --- « Ma liste » (US-43, US-45 CA4) ---------------------------------------------
  const aVoir = useAVoirCles()
  const dansAVoir = () => aVoir()?.has(props.serie.cle) ?? false
  // Point de depart retenu pour cette serie, et etat de preparation (chip).
  const [lignesAVoir] = requete([...cles.aVoir, 'fiche'], listeAVoir, { fraicheur: FRAICHEUR.geste, suspendre: false })
  const ligneSerie = () => lignesAVoir()?.find((l) => l.cle === props.serie.cle)
  const aVoirDepuis = () => ligneSerie()?.depuis
  const preparation = () => {
    const p = ligneSerie()?.preparation
    const base = propsChip(p as Record<string, unknown> | undefined)
    if (!base) return undefined
    const eps = p?.episodes ?? []
    const premier = eps[0]
    if (premier) return { ...base, etat: premier.etat, serie: { saison: premier.saison, episode: premier.episode, suivant: eps[1]?.etat } }
    return base
  }

  // L'ACTION PRINCIPALE : l'episode a lire (entame, sinon le prochain non vu). C'est
  // lui que la sonde mesure, a l'ouverture, UNE fois par fiche (pas par onglet : C17).
  const action = createMemo(() => actionSerie(tous() as EpisodeFiche[], reprises() ?? new Map(), PART_VUE, aVoirDepuis()))
  const episodeAction = () => tous().find((e) => e.cle === action()?.cle)
  const disponibilite = useDisponibilite(
    () => {
      const a = action()
      return a && a.motif !== 'revoir' ? a.cle.slice('series:'.length) : undefined
    },
    () => lectureEnCours() === null,
  )

  // Retour et Echap : l'ECRAN PRECEDENT (pile d'historique, US-45 CA2), comme la
  // fiche film ; sans pile (lien direct), le repli de la coque. Constat (B4) : la
  // fiche renvoyait vers l'onglet Parcours retenu, c'est-a-dire Direct.
  const retour = () => props.surRetour()
  const [menu, poserMenu] = createSignal<{ x: number; y: number; entrees: EntreeMenu[] } | null>(null)
  onMount(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menu()) return
      e.preventDefault()
      retour()
    }
    window.addEventListener('keydown', auClavier)
    onCleanup(() => window.removeEventListener('keydown', auClavier))
  })

  function lire(e: Episode) {
    if (!e.url) return
    // L'épisode d'après alimente le décompte de fin ; absent sur le dernier
    // de la saison, auquel cas le lecteur relit les saisons.
    const liste = episodesDe(e.saison)
    const apres = liste[liste.findIndex((x) => x.cle === e.cle) + 1]
    props.surLire({
      cle: e.cle, nom: e.nom, url: e.url, extension: e.extension,
      suivant:
        apres && apres.url
          ? { cle: apres.cle, nom: apres.nom, url: apres.url, extension: apres.extension }
          : undefined,
    })
  }

  // --- Gestes « vu » et « Ma liste », tous annulables par un toast ------------------
  const dureeDe = (e: Episode) => e.dureeSecondes || repriseDe(e.cle)?.duree || details()?.dureeSecondes || 1
  // L'invalidation des reprises est regroupee (30 s, pour le lecteur qui note
  // toutes les 5 s) : un geste explicite, lui, doit se voir tout de suite.
  const restaurer = async (avant: Map<string, Reprise | undefined>) => {
    for (const [cle, r] of avant) await (r ? noterPosition(cle, r.position, r.duree) : oublierReprise(cle))
    await invaliderReprises()
  }
  async function marquerVus(liste: Episode[], vu: boolean, message: string) {
    const avant = new Map(liste.map((e) => [e.cle, repriseDe(e.cle)]))
    for (const e of liste) {
      associerSerie(e.cle, props.serie.cle)
      if (vu) await noterPosition(e.cle, dureeDe(e), dureeDe(e))
      else await oublierReprise(e.cle)
    }
    await invaliderReprises()
    emettreToast({ message, action: () => void restaurer(avant) })
  }
  const marquerVu = (e: Episode) => marquerVus([e], true, `✓ ${repere(e.saison, e.numero)} marqué comme vu`)
  const marquerNonVu = (e: Episode) => marquerVus([e], false, `${repere(e.saison, e.numero)} marqué comme non vu`)
  const marquerSaison = (vue: boolean) => {
    const s = saisonActive()
    if (s === null) return
    void marquerVus(episodes(), vue, vue ? `✓ Saison ${s} marquée comme vue` : `Saison ${s} marquée comme non vue`)
  }
  const estPointDeDepart = (e: Episode) => dansAVoir() && aVoirDepuis()?.saison === e.saison && aVoirDepuis()?.episode === e.numero
  async function partirDe(e: Episode) {
    const avantPresent = dansAVoir()
    const avantDepuis = aVoirDepuis()
    await ajouterAVoir(props.serie.cle, { depuis: { saison: e.saison, episode: e.numero } })
    emettreToast({
      message: `✓ Ajouté à Ma liste · dès ${repere(e.saison, e.numero)}`,
      action: () => void (avantPresent ? modifierOptionsAVoir(props.serie.cle, { depuis: avantDepuis }) : retirerAVoir(props.serie.cle)),
    })
  }
  async function nePlusPartirDe() {
    const avant = aVoirDepuis()
    await modifierOptionsAVoir(props.serie.cle, { depuis: undefined })
    emettreToast({ message: 'Point de départ retiré : à partir de l’épisode entamé', action: () => void modifierOptionsAVoir(props.serie.cle, { depuis: avant }) })
  }
  async function retirerDeMaListe() {
    const avant = ligneSerie()
    await retirerAVoir(props.serie.cle)
    emettreToast({ message: 'Retiré de Ma liste', action: () => void ajouterAVoir(props.serie.cle, { depuis: avant?.depuis, episodesAvance: avant?.episodesAvance }) })
  }

  const menuEpisode = (e: Episode): EntreeMenu[] => [
    { icone: 'play_arrow', libelle: 'Lire', action: () => lire(e) },
    etatDe(e.cle) === 'vu'
      ? { icone: 'check_circle', libelle: 'Marquer comme non vu', action: () => void marquerNonVu(e) }
      : { icone: 'check', libelle: 'Marquer comme vu', action: () => void marquerVu(e) },
    estPointDeDepart(e)
      ? { icone: 'close', libelle: 'Ne plus partir d’ici', action: () => void nePlusPartirDe() }
      : { icone: 'add', libelle: 'Ma liste à partir d’ici', action: () => void partirDe(e) },
  ]
  const menuSaison = (): EntreeMenu[] => [
    { icone: 'check', libelle: 'Marquer la saison comme vue', action: () => marquerSaison(true) },
    { icone: 'check_circle', libelle: 'Marquer la saison comme non vue', action: () => marquerSaison(false) },
  ]
  /** « ✓ Dans ma liste · dès S01E03 ▾ » : changer le point de depart, ou retirer. */
  const menuMaListe = (): EntreeMenu[] => [
    ...(aVoirDepuis() ? [{ icone: 'undo', libelle: 'À partir de l’épisode entamé', action: () => void nePlusPartirDe() }] : []),
    ...episodes().map((e) => ({ icone: 'play_arrow', libelle: `À partir de ${repere(e.saison, e.numero)}`, action: () => void partirDe(e) })),
    { icone: 'close', libelle: 'Retirer de Ma liste', action: () => void retirerDeMaListe() },
  ]
  const ouvrirMenu = (p: { x: number; y: number }, entrees: EntreeMenu[]) => poserMenu({ ...p, entrees })

  // Une ligne = le bouton de lecture ET, a cote (jamais dedans : un bouton dans un
  // bouton n'est ni valide ni accessible), le menu « ⋯ » de l'episode.
  const Ligne = (e: Episode) => {
    const r = () => repriseDe(e.cle)
    const etat = () => etatDe(e.cle)
    const pret = () => estPret(e.cle)
    return (
    <div data-role="episode" data-cle={e.cle} style={{ display: 'flex', 'align-items': 'stretch', height: '100%', 'min-width': 0, 'border-bottom': '1px solid var(--line)' }}>
    <button
      onClick={() => lire(e)}
      aria-label={`Lire ${repere(e.saison, e.numero)} · ${e.titre}`}
      title={`${e.titre}${e.dureeSecondes ? ` · ${dureeLisible(e.dureeSecondes)}` : ''}${e.synopsis ? `\n${e.synopsis}` : ''}`}
      style={{
        display: 'flex', 'align-items': 'center', gap: estMobile() ? '8px' : '12px',
        flex: 1, 'min-width': 0, height: '100%', padding: estMobile() ? '8px 0 8px 12px' : '8px 0 8px 14px', 'text-align': 'left',
        'border-radius': 0,
        opacity: etat() === 'vu' ? '0.62' : '1',
      }}
    >
      <SubstitutLogo nom={e.titre} src={e.vignette} taille={estMobile() ? 44 : 56} />

      <span class="num tertiaire" style={{ flex: '0 0 auto', width: estMobile() ? '30px' : '34px', 'font-size': '13px' }}>
        {`E${String(e.numero).padStart(2, '0')}`}
      </span>

      <span style={{ flex: 1, 'min-width': 0, display: 'grid', gap: '2px' }}>
        <span class="tronque" style={{ display: 'block', 'font-weight': 'var(--w-strong)' }}>{e.titre}</span>
        <span
          class="secondaire"
          style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px', 'min-width': 0 }}
        >
          <Show when={etat() === 'vu'}>
            <span data-role="etat-episode" data-etat="vu" style={{ color: 'var(--ok)', 'white-space': 'nowrap' }}>✓ Vu</span>
          </Show>
          <Show when={etat() === 'entame'}>
            <span data-role="etat-episode" data-etat="entame" style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'min-width': 0, flex: 1 }}>
              <BarreProgression part={partVue(r())} largeur="min(120px, 40%)" />
              <span class="num" style={{ 'white-space': 'nowrap', color: 'var(--acc-fg)' }}>{resteLisible(r()!.duree - r()!.position)}</span>
            </span>
          </Show>
          <Show when={estPointDeDepart(e)}>
            <span data-role="point-de-depart" style={{ 'white-space': 'nowrap', color: 'var(--acc-fg)' }}>Point de départ</span>
          </Show>
          {/* Mobile : la date de diffusion cède la place — 390 px portent le
              titre, l'état et la durée, pas un troisième détail. */}
          <Show when={e.diffuseLe && !estMobile()}>{(d) => <span class="num tronque">{d()}</span>}</Show>
          <Show when={e.codecAudioMuet}>
            {(c) => (
              // Le navigateur n a pas de decodeur EAC3/AC3/DTS : on le dit avant
              // la lecture plutot que d afficher une image muette.
              <span
                class="num"
                title="Piste audio non decodee par le navigateur — lisible via la diffusion vers le televiseur"
                style={{
                  padding: '0 5px', 'border-radius': 'var(--r-2xs)', 'white-space': 'nowrap',
                  color: 'var(--cod)', background: 'var(--cod-bg)',
                  border: '1px solid var(--cod)', 'font-size': '11px',
                }}
              >
                {c()} · televiseur
              </span>
            )}
          </Show>
        </span>
        <Show when={e.synopsis && !estMobile()}>
          {(s) => (
            <span data-role="episode-resume" class="tertiaire tronque" style={{ display: 'block', 'font-size': '12px' }}>{s()}</span>
          )}
        </Show>
      </span>

      {/* Colonne de droite : le chip « Prêt » prime sur la duree au telephone (C15). */}
      <Show when={pret()}>
        <span style={{ flex: '0 0 auto' }}><ChipPreparation etat="pret" /></span>
      </Show>
      <Show when={!pret() || !estMobile()}>
        <span class="num secondaire" style={{ flex: '0 0 auto', 'font-size': '13px', 'padding-right': '4px' }}>
          {dureeLisible(e.dureeSecondes) ?? '—'}
        </span>
      </Show>
    </button>

      <span style={{ flex: '0 0 auto', display: 'flex', 'align-items': 'center', padding: estMobile() ? '0 4px 0 0' : '0 8px 0 2px' }}>
        <BoutonMenu compact libelle={`Options de l’épisode ${repere(e.saison, e.numero)}`} surOuvrir={(p) => ouvrirMenu(p, menuEpisode(e))} />
      </span>
    </div>
    )
  }

  return (
    <div data-role="fiche-serie" style={{ display: 'grid', 'grid-template-rows': 'auto 1fr', height: '100%', 'min-height': 0 }}>
      <nav
        style={{
          display: 'flex', 'align-items': 'center', gap: '10px',
          padding: `8px ${marge()}px`, 'border-bottom': '1px solid var(--line)',
        }}
      >
        <button
          onClick={retour}
          style={{ padding: '5px 12px', border: '1px solid var(--line2)', 'min-height': hauteurCible() }}
        >
          ← Retour
        </button>
        {/* Jamais l'identifiant du fournisseur ici (CA9) : il n'aide que le diagnostic. */}
        <span class="secondaire tronque" style={{ 'font-size': '13px' }}>Série</span>
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
            <div style={{ display: 'grid', 'grid-template-rows': 'auto auto minmax(0, 1fr)', 'min-height': 0, 'min-width': 0 }}>
              <header
                data-role="entete-serie"
                style={{
                  // `minmax(0,1fr)` et non `1fr` : une piste `1fr` prend la largeur
                  // minimale de son contenu (boutons insecables) et depassait les 390 px (D6).
                  display: 'grid', 'grid-template-columns': 'auto minmax(0, 1fr)', 'min-width': 0,
                  gap: estMobile() ? '12px' : '16px',
                  padding: estBureau() ? '14px 16px' : `12px ${marge()}px`,
                  'border-bottom': '1px solid var(--line)',
                }}
              >
                {/* Affiche réduite sur mobile : 120 px de jaquette mangeraient
                    le tiers de la largeur au détriment du titre. */}
                <SubstitutLogo nom={titreSerie()} src={jaquette()} taille={estMobile() ? 84 : 120} affiche />

                <div style={{ 'min-width': 0 }}>
                  <div style={{ display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '8px', 'min-width': 0 }}>
                    <EtiquettePays pays={props.serie.pays} />
                    <h1 class="tronque" title={titreSerie()} style={{ 'min-width': 0 }}>{titreSerie()}</h1>
                    <Show when={preparation()}>{(p) => <ChipPreparation {...p()} />}</Show>
                    <Show when={!preparation() && episodeAction() && estPret(episodeAction()!.cle)}>
                      <ChipPreparation etat="pret" serie={{ saison: episodeAction()!.saison, episode: episodeAction()!.numero }} />
                    </Show>
                  </div>

                  <p class="secondaire tronque" data-role="meta" style={{ margin: '4px 0 0', 'font-size': '13px' }}>
                    <span class="num">{saisons().length}</span> saison{saisons().length > 1 ? 's' : ''}
                    {' · '}
                    <span class="num">{totalEpisodes()}</span> épisodes
                    <Show when={details()?.genre}>{(g) => <> · {g()}</>}</Show>
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

                  {/* Episode entame : la barre sous le titre, comme sur la fiche film. */}
                  <Show when={action()?.motif === 'reprendre'}>
                    <div data-role="reprise-fiche" style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'max-width': '420px', 'margin-top': '8px' }}>
                      <BarreProgression part={action()!.part ?? 0} />
                      <span class="num secondaire" style={{ 'font-size': '12px', 'white-space': 'nowrap' }}>{repere(episodeAction()!.saison, episodeAction()!.numero)}</span>
                    </div>
                  </Show>

                  <ResumeContenu
                    details={details()}
                    erreur={details.error}
                    attendu={cibleDe(props.serie) !== undefined}
                    surReessayer={() => void relancerDetails()}
                    lignes={estMobile() ? 3 : undefined}
                    style={{ margin: '8px 0 0', 'max-height': '7.2em', overflow: 'auto', 'font-size': '13px', color: 'var(--fg2)' }}
                  />

                  {/* La sonde : hors liste et tant que rien n'est pret (C10) ; une fois par fiche (C17). */}
                  <Show when={episodeAction() && !dansAVoir() && !estPret(episodeAction()!.cle)}>
                    <div style={{ 'margin-top': '8px' }}>
                      <LigneSonde disponibilite={disponibilite()} prefixe={repere(episodeAction()!.saison, episodeAction()!.numero)} />
                    </div>
                  </Show>

                  <div data-role="actions-fiche" style={{ 'margin-top': '8px', display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '8px' }}>
                    <Show when={action() && episodeAction()}>
                      <button
                        data-role="action-principale"
                        onClick={() => lire(episodeAction()!)}
                        style={{
                          display: 'flex', 'align-items': 'center', gap: '6px', 'max-width': '100%',
                          height: estMobile() ? '44px' : '36px', padding: '0 14px 0 10px', 'border-radius': 'var(--r-btn-sm)',
                          'font-weight': 'var(--w-strong)', background: 'var(--acc)', color: '#fff', border: '1px solid transparent', cursor: 'pointer',
                        }}
                      >
                        <Icone nom={action()!.icone} taille={18} plein />
                        <span class="tronque">{action()!.libelle}</span>
                      </button>
                    </Show>
                    <Show
                      when={dansAVoir()}
                      fallback={<BoutonAVoir cle={props.serie.cle} present={false} />}
                    >
                      <button
                        type="button"
                        data-role="a-voir"
                        aria-pressed="true"
                        aria-haspopup="menu"
                        aria-label={`Dans ma liste${aVoirDepuis() ? ` · dès ${repere(aVoirDepuis()!.saison, aVoirDepuis()!.episode)}` : ''} — changer le point de départ ou retirer`}
                        onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); ouvrirMenu({ x: Math.max(12, r.left), y: r.bottom + 6 }, menuMaListe()) }}
                        style={{
                          display: 'flex', 'align-items': 'center', gap: '6px', 'max-width': '100%',
                          height: estMobile() ? '44px' : '36px', padding: '0 10px', 'border-radius': 'var(--r-btn-sm)',
                          'font-weight': 'var(--w-strong)', border: '1px solid var(--acc)', color: 'var(--acc-fg)', cursor: 'pointer',
                        }}
                      >
                        <Icone nom="check" taille={18} plein />
                        <span class="tronque">Dans ma liste{aVoirDepuis() ? ` · dès ${repere(aVoirDepuis()!.saison, aVoirDepuis()!.episode)}` : ''}</span>
                        <Icone nom="expand_more" taille={16} />
                      </button>
                    </Show>
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
                  <FaitsContenu details={details()} />
                </div>
              </header>

              <div style={{ display: 'flex', 'align-items': 'center', 'min-width': 0, 'border-bottom': '1px solid var(--line)' }}>
              <div
                role="tablist"
                aria-label="Saisons"
                style={{
                  flex: 1, 'min-width': 0, display: 'flex', gap: '2px', padding: `8px ${marge()}px`,
                  'overflow-x': 'auto',
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
                {/* Menu de la saison affichee : marquer la saison vue / non vue (CA4). */}
                <span style={{ flex: '0 0 auto', padding: `0 ${marge()}px 0 4px` }}>
                  <BoutonMenu compact libelle={`Options de la saison ${saisonActive() ?? ''}`} surOuvrir={(p) => ouvrirMenu(p, menuSaison())} />
                </span>
              </div>

              <section style={{ 'min-height': 0, 'min-width': 0 }}>
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

      <Show when={menu()}>
        {(m) => <MenuContextuel x={m().x} y={m().y} entrees={m().entrees} surFermer={() => poserMenu(null)} />}
      </Show>
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
