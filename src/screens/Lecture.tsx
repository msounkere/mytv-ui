import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { Portal } from 'solid-js/web'
import SubstitutLogo from '../components/SubstitutLogo'
import EtiquettePays from '../components/EtiquettePays'
import ControlesLecteur, { ENCRE, ENCRE2, type BoutonControle } from '../components/ControlesLecteur'
import ListeZapping from '../components/ListeZapping'
import ErreurLecture, { type ActionErreur } from '../components/ErreurLecture'
import DialogueDiffusion from '../components/DialogueDiffusion'
import BandeauChaine from '../components/BandeauChaine'
import MiniGuide from '../components/MiniGuide'
import PanneauInfos from '../components/PanneauInfos'
import MiniLecteur, { MARGE_MINI, hauteurMini } from '../components/MiniLecteur'
import Notification, { type NotificationLecteur } from '../components/Notification'
import {
  BandeauReconnexion, DialogueReprise, ProchainEpisode, SEUIL_REPRISE,
} from '../components/CalquesLecture'
import { estBureau, estMobile } from '../lib/gabarit'
import { ecran, poserEcran, revenirAuLecteur } from '../etat'
import { attacher, type Attache } from '../lib/lecteur'
import { planDirect, planVod, urlVod, deplacementParService, BADGE_MODE, type Plan } from '../lib/flux'
import { lectureDe } from '../lib/source-lecture'
import { annulerFinDifferee } from '../lib/bail'
import { ErreurLecteur } from '../lib/errors'
import { noterOuverture, noterPosition, reprisePour, estFavori, basculerFavori } from '../lib/preferences'
import {
  creerDiffusion, preparerDiffusion, urlPourDiffusion, diffusionResoutLeCodec, diffusionPossible,
  type EtatDiffusion,
} from '../lib/cast'
import { modePipDisponible, ouvrirPipDocument, basculerPipNatif } from '../lib/pip'
import type { EntreeCatalogue } from '../lib/db'
import ColonnePistes from './lecture/ColonnePistes'
import PiedLecteur from './lecture/PiedLecteur'
import { creerCalques } from './lecture/calques'
import { brancherClavier } from './lecture/clavier'
import { heure } from './lecture/format'
import { creerPistes } from './lecture/pistes'
import { creerReprisePanne } from './lecture/reconnexion'
import { urlMasquee } from './lecture/sources'
import { creerZapping } from './lecture/zapping'

// Le lecteur occupe la surface principale ; la colonne de droite permet de
// zapper sans quitter la lecture (direct) ou de choisir ses pistes (VOD).
// Un seul flux est ouvert à la fois — l'abonnement n'autorise qu'une connexion
// simultanée, et la barre de contrôles est dessinée ici plutôt que confiée aux
// contrôles natifs : leur apparence change d'un navigateur à l'autre.
//
// Le lecteur reste monté quand on navigue ailleurs : la coque le masque par
// `visibility`. Ce qui doit rester visible hors de l'écran — mini-lecteur et
// notifications — passe donc par un portail, hors de la couche masquée.
//
// CE QUI RESTE ICI, et pourquoi : l'ouverture du flux. Un seul effet décide de
// la source, et il est indivisible — la vérification en tête d'un film, le point
// atteint et le détachement propre du flux précédent sont les étapes d'une même
// décision, qui tient la connexion unique de l'abonnement. Ce qui s'en détachait sans l'affaiblir est dans
// `./lecture/` : les voisines, les calques, les raccourcis, les pistes.

/** Hauteur réelle de la barre de contrôles, mesurée sur la maquette. */
const HAUTEUR_CONTROLES = { live: 68, vod: 94 }

/** Part du contenu au-delà de laquelle le dossier le considère vu. */
const SEUIL_VU = 0.9

/**
 * Attente avant d'appliquer un déplacement passant par le service. Chaque
 * déplacement y relance un ffmpeg et reprend la connexion unique : on laisse la
 * poignée se stabiliser plutôt que de rouvrir le flux à chaque pixel.
 */
const DELAI_DEPLACEMENT = 600

export default function Lecture(props: {
  entree: EntreeCatalogue
  /** Adresse de lecture (champ `lecture` de l'API) d'un épisode de série, dont
      l'identifiant n'est pas celui d'une entrée du catalogue. */
  urlForcee?: string
  /** Épisode qui suit, quand la fiche série le connaît : c'est lui que le
      compte à rebours de fin enchaîne. Facultatif — sans lui, aucun décompte. */
  suivant?: { titre: string; lire: () => void }
  surChanger: (e: EntreeCatalogue) => void
  surFermer: () => void
}) {
  let video!: HTMLVideoElement
  let cadre!: HTMLDivElement
  let racine!: HTMLDivElement

  const [erreur, poserErreur] = createSignal<ErreurLecteur | null>(null)
  const [etatDiffusion, poserEtatDiffusion] = createSignal<EtatDiffusion>('indisponible')
  const [enPip, poserEnPip] = createSignal(false)
  const [favori, poserFavori] = createSignal(false)

  // État visible du média : la barre de contrôles est à nous, elle doit donc
  // suivre l'élément <video> au lieu de le piloter à l'aveugle.
  const [enPause, poserEnPause] = createSignal(true)
  const [muet, poserMuet] = createSignal(false)
  const [volume, poserVolume] = createSignal(1)
  const [positionBrute, poserPositionBrute] = createSignal(0)
  const [dureeBrute, poserDureeBrute] = createSignal(0)
  const [hauteurImage, poserHauteurImage] = createSignal(0)
  const [imageDisponible, poserImageDisponible] = createSignal(false)
  const [chargement, poserChargement] = createSignal(true)

  const [miniReduit, poserMiniReduit] = createSignal(false)
  const [notification, poserNotification] = createSignal<NotificationLecteur | null>(null)

  // --- Ce que le serveur fait du flux --------------------------------------
  const [plan, poserPlan] = createSignal<Plan | null>(null)
  /** Vrai pendant la vérification en tête d'un film (statut, mode). */
  const [verification, poserVerification] = createSignal(false)
  /** Décalage appliqué par le dernier `?t=` : à ajouter au temps du média. */
  const [decalage, poserDecalage] = createSignal(0)
  /** Position demandée mais pas encore appliquée : la poignée doit la suivre. */
  const [positionVisee, poserPositionVisee] = createSignal<number | null>(null)

  const direct = () => props.entree.type === 'live'

  // Le serveur fabrique le MP4 à la volée quand il remuxe : sa durée propre n'a
  // aucun sens, et après un `?t=` ses horodatages repartent de zéro. La durée
  // vient donc de ce que le serveur annonce, et la position affichée est celle
  // du FILM, décalage compris.
  const dureeAnnoncee = () => {
    const p = plan()
    if (direct() || !p?.viaService) return undefined
    const d = p.dureeSecondes ?? 0
    return d > 0 ? d : undefined
  }
  const duree = () => dureeAnnoncee() ?? dureeBrute()
  const position = () => positionVisee() ?? decalage() + positionBrute()
  /** La coque garde le lecteur monté : il n'est « parti » que visuellement. */
  const horsLecteur = () => ecran() !== 'lecture'

  // Les favoris ramènent 154 000 entrées à la dizaine réellement regardée.
  createEffect(() => {
    const cle = props.entree.cle
    void estFavori(cle).then(poserFavori)
  })

  function marquerFavori() {
    void basculerFavori(props.entree.cle).then(poserFavori)
  }

  // --- Notifications ------------------------------------------------------
  // L'identifiant croît à chaque émission : deux messages identiques à la
  // suite doivent chacun obtenir leur pleine durée d'affichage.
  let numeroNotification = 0
  function notifier(message: string, ton: NotificationLecteur['ton'] = 'ok') {
    numeroNotification += 1
    poserNotification({ id: numeroNotification, message, ton })
  }

  const pistes = creerPistes(() => video)

  const panne = creerReprisePanne({ poserErreur })

  const calques = creerCalques({
    cle: () => props.entree.cle,
    // Ce que le MÉDIA attend d'une décision ; les calques y ajoutent les leurs.
    decisionEnAttente: () =>
      enPause() || chargement() || !!erreur() ||
      !!panne.reconnexion() || etatDiffusion() === 'diffusion',
    suivant: () => props.suivant,
    duree,
    position,
    surQuitterEcran: () => poserEcran('parcours'),
  })

  const zapping = creerZapping({
    entree: () => props.entree,
    direct,
    guideOuvert: calques.miniGuideOuvert,
    surChanger: props.surChanger,
    notifier,
  })

  /** Adresse de lecture du serveur : celle de l'entrée, ou celle de l'épisode. */
  function lectureEntree(e: EntreeCatalogue): string {
    return lectureDe(e, props.urlForcee && e.cle === props.entree.cle ? props.urlForcee : undefined)
  }

  const urlAffichee = () => urlMasquee(plan()?.url ?? lectureEntree(props.entree))

  // Un seul effet pilote la source : changer d'entrée détache proprement le
  // flux précédent avant d'en ouvrir un autre.
  let precedente: EntreeCatalogue | undefined
  /**
   * Point atteint dans le contenu courant, hors réactivité. POURQUOI le garder :
   * une reconnexion ou un transcodage imposé rouvrent le flux, et sans cette
   * mémoire ils renvoyaient l'utilisateur au début — mesuré sur un film de
   * 1 h 37 réouvert à 00:00 après un repli à 30:00.
   */
  let pointAtteint = 0
  createEffect(() => {
    const entree = props.entree
    // Lu pour que la reconnexion rouvre réellement le flux.
    panne.relance()
    let attache: Attache | undefined
    let annule = false
    const abandon = new AbortController()

    if (precedente && precedente.cle !== entree.cle) {
      // Zapper ne notifie rien ; passer d'un film à une chaîne, si : le flux
      // précédent a bel et bien été fermé pour laisser la place.
      if (!(precedente.type === 'live' && entree.type === 'live'))
        notifier(`« ${precedente.nom} » arrêté — l’abonnement n’autorise qu’un flux à la fois`, 'limite')
      if (precedente.type === 'live') zapping.poserDerniereChaine(precedente)
    }
    if (!precedente || precedente.cle !== entree.cle) {
      panne.remettreAZero()
      panne.arreter()
      calques.nouveauContenu(entree.type === 'live')
      // Un autre contenu : le point atteint dans le précédent ne vaut plus rien.
      pointAtteint = 0
    }
    precedente = entree
    // Une fin de lecture différée (zapping) ne doit plus partir : ce qui
    // s'ouvre reprend la place que l'ancienne chaîne allait rendre.
    annulerFinDifferee()

    poserErreur(null)
    poserChargement(true)
    poserImageDisponible(false)
    poserPositionBrute(0)
    poserDureeBrute(0)
    poserDecalage(0)
    poserPositionVisee(null)
    // Le plan précédent ne vaut rien ici : il décrivait un autre flux.
    poserPlan(null)
    calques.poserReprise(null)
    void noterOuverture(entree.cle)

    void (async () => {
      try {
        // Direct : aucune requête préalable, hls.js ouvre la playlist. Film : une
        // vérification en tête (statut, mode) car <video> ne rend ni l'un ni l'autre.
        const lecture = lectureEntree(entree)
        let p: Plan
        if (entree.type === 'live') p = planDirect(lecture)
        else {
          poserVerification(true)
          try {
            p = await planVod({ lecture, decalage: pointAtteint, signal: abandon.signal })
          } finally {
            poserVerification(false)
          }
        }
        if (annule) return
        poserPlan(p)
        // Un film remuxé repart de `pointAtteint` par `?t=` ; un fichier servi tel
        // quel reprend, lui, par un déplacement natif une fois ses métadonnées lues.
        poserDecalage(p.viaService ? pointAtteint : 0)

        const source =
          p.genre === 'live'
            ? ({ kind: 'hls', url: p.url, chaine: p.chaine } as const)
            : ({ kind: 'fichier', url: p.url } as const)
        attache = await attacher(video, source, panne.signalerErreur)
        if (annule) return attache.detacher()
        if (p.genre === 'vod' && !p.viaService && pointAtteint > 0) {
          const reprise = pointAtteint
          video.addEventListener('loadedmetadata', () => { video.currentTime = reprise }, { once: true })
        }

        // La reprise est proposée, jamais imposée : sous une minute, rouvrir
        // au début ne coûte rien et évite une question de plus.
        if (entree.type !== 'live') {
          const position = await reprisePour(entree.cle)
          if (position && position > SEUIL_REPRISE && !annule) calques.poserReprise(position)
        }
        await video.play().catch(() => {
          /* lecture différée jusqu'au geste de l'utilisateur */
        })
      } catch (e) {
        poserVerification(false)
        if (!annule) panne.signalerErreur(e instanceof ErreurLecteur ? e : new ErreurLecteur('relais', String(e), 'Réessayer.'))
      }
    })()

    onCleanup(() => {
      annule = true
      // Zapper pendant la vérification d'un film l'annule : le serveur rend la
      // place dès que le client s'en va.
      abandon.abort()
      attache?.detacher()
    })
  })

  // L'erreur met fin à l'attente : aucun spinner ne doit tourner derrière un
  // message qui dit déjà que c'est perdu.
  createEffect(() => {
    if (erreur()) poserChargement(false)
  })

  // Miroir de l'élément <video> vers les signaux de la barre de contrôles.
  onMount(() => {
    const lire = () => {
      poserMuet(video.muted)
      poserVolume(video.volume)
      poserDureeBrute(Number.isFinite(video.duration) ? video.duration : 0)
    }
    const auTemps = () => poserPositionBrute(video.currentTime)
    const auxImages = () => {
      poserImageDisponible(true)
      poserChargement(false)
      poserHauteurImage(video.videoHeight)
      // Des images arrivent : il n'y a plus de panne à afficher. Le dire est
      // la contrepartie de la reconnexion silencieuse qui vient de réussir.
      if (panne.essais() > 0) {
        panne.remettreAZero()
        notifier('Connexion au relais rétablie — lecture reprise')
      }
      panne.arreter()
      poserErreur(null)
      pistes.relirePistes()
    }
    const evenements: Array<[string, () => void]> = [
      ['play', () => { poserEnPause(false); lire() }],
      ['pause', () => { poserEnPause(true); lire() }],
      ['volumechange', lire], ['durationchange', lire],
      ['timeupdate', auTemps], ['loadeddata', auxImages], ['playing', auxImages],
      ['waiting', () => poserChargement(true)],
    ]
    for (const [nom, cb] of evenements) video.addEventListener(nom, cb)
    poserEnPause(video.paused)
    lire()
    onCleanup(() => {
      for (const [nom, cb] of evenements) video.removeEventListener(nom, cb)
    })
  })

  // Diffusion : disponible dès que le navigateur voit un appareil compatible.
  createEffect(() => {
    const d = creerDiffusion(video)
    poserEtatDiffusion(d.etat())
    const stop = d.surChangement(poserEtatDiffusion)
    onCleanup(stop)
  })

  // Mémorisation de la position de lecture pour la VOD.
  createEffect(() => {
    const entree = props.entree
    if (entree.type === 'live') return
    const noter = () => {
      // Le décalage du dernier `?t=` est compris dans `position()` : sans lui,
      // reprendre un film déplacé le ramènerait au début.
      const d = duree()
      const courant = position()
      if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(courant)) return
      // Au-delà de 90 %, le dossier tient le contenu pour vu. On enregistre la
      // fin plutôt qu'un drapeau à part : « Reprendre » et la fiche série
      // lisent déjà cette position, et elles s'accordent alors d'elles-mêmes.
      const p = courant / d >= SEUIL_VU ? d : courant
      void noterPosition(entree.cle, p, d)
    }
    const minuteur = setInterval(noter, 5000)
    onCleanup(() => {
      clearInterval(minuteur)
      noter()
    })
  })

  async function diffuser() {
    if (!diffusionPossible()) {
      notifier('La diffusion n’est possible que depuis le réseau local', 'limite')
      return
    }
    // L'appareil va chercher le flux lui-même, sans cookie : le serveur le
    // reconnaît à son adresse réseau (compte technique local). On lui donne donc
    // l'adresse de lecture, absolue, sur l'origine de cette page.
    const locale = urlPourDiffusion(lectureEntree(props.entree))

    // En direct la vidéo est portée par MSE, que la diffusion ne sait pas
    // envoyer : on repose une URL simple et on attend que les appareils se
    // déclarent sur CETTE source avant d'ouvrir le sélecteur.
    const pret = await preparerDiffusion(video, locale)
    if (!pret) {
      notifier("Aucun appareil de diffusion ne répond sur ce réseau", 'limite')
      return
    }
    await creerDiffusion(video).choisir().catch(() => {})
  }

  async function arreterDiffusion() {
    await creerDiffusion(video).arreter().catch(() => {})
  }

  async function basculerPip() {
    try {
      if (modePipDisponible() === 'document') {
        if (enPip()) return
        const { fenetre } = await ouvrirPipDocument(cadre)
        poserEnPip(true)
        fenetre.addEventListener('pagehide', () => poserEnPip(false), { once: true })
      } else {
        poserEnPip(await basculerPipNatif(video))
      }
    } catch (e) {
      poserErreur(
        new ErreurLecteur('relais', "L'image dans l'image n'a pas pu s'ouvrir.", 'Réessayer.', String(e)),
      )
    }
  }

  function basculerLecture() {
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
  }

  /**
   * Déplacement dans un flux fabriqué par le service. `?t=` est exact, mais le
   * MP4 fragmenté renumérote alors ses horodatages à partir de zéro : on
   * mémorise le décalage demandé, et c'est lui qui recale tout l'affichage —
   * barre de progression, temps restant, position de reprise.
   */
  function allerA(cible: number) {
    const borne = Math.max(0, Math.min(duree() || 0, cible))
    const p = plan()
    if (!deplacementParService(p)) {
      video.currentTime = borne
      return
    }
    // Le point visé est déjà le zéro de ce flux : revenir à son propre début ne
    // vaut pas une connexion de plus chez le fournisseur.
    if (Math.abs(borne - decalage()) < 1) {
      video.currentTime = 0
      poserPositionBrute(0)
      return
    }
    pointAtteint = borne
    poserDecalage(borne)
    poserPositionBrute(0)
    poserChargement(true)
    poserImageDisponible(false)
    // L'écouteur d'erreur posé par `attacher` reste en place : seule la source
    // change, et le flux précédent est fermé par le navigateur lui-même.
    video.src = urlVod(p!.lecture, borne)
    void video.play().catch(() => {
      /* lecture différée jusqu'au geste de l'utilisateur */
    })
  }

  let minuteurDeplacement: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(minuteurDeplacement))

  /**
   * Un déplacement via le service rouvre un ffmpeg ET la connexion unique : on
   * n'applique que la dernière intention, une fois la poignée relâchée.
   */
  function demanderPosition(cible: number) {
    const borne = Math.max(0, Math.min(duree() || 0, cible))
    if (!deplacementParService(plan())) {
      video.currentTime = borne
      return
    }
    poserPositionVisee(borne)
    clearTimeout(minuteurDeplacement)
    minuteurDeplacement = setTimeout(() => {
      poserPositionVisee(null)
      allerA(borne)
    }, DELAI_DEPLACEMENT)
  }

  function deplacer(secondes: number) {
    demanderPosition(position() + secondes)
  }

  function pleinEcran() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void cadre.requestFullscreen?.().catch(() => {})
  }

  function ouvrirMiniGuide() {
    // S'informer et zapper ne se superposent pas : l'un ferme l'autre.
    calques.poserInfosOuvertes(false)
    calques.poserMiniGuideOuvert((v) => !v)
  }

  function ouvrirInfos() {
    // S'informer ne coupe pas la lecture : le panneau se pose à côté.
    calques.poserMiniGuideOuvert(false)
    calques.poserInfosOuvertes((v) => !v)
  }

  const auClavier = brancherClavier({
    surSonEcran: () => !horsLecteur(),
    direct,
    calqueOuvert: () =>
      calques.diffusionOuverte() || calques.infosOuvertes() || calques.miniGuideOuvert(),
    reveiller: calques.reveiller,
    fermerCalque: calques.fermerCalque,
    zapper: zapping.zapper,
    deplacer,
    basculerLecture,
    basculerMuet: () => (video.muted = !video.muted),
    basculerDiffusion: () => calques.poserDiffusionOuverte((v) => !v),
    basculerFavori: marquerFavori,
    revenirDerniereChaine: zapping.revenirDerniereChaine,
    basculerMiniGuide: ouvrirMiniGuide,
    basculerInfos: ouvrirInfos,
  })

  const boutonsGauche = (): BoutonControle[] =>
    direct()
      ? [
          { icone: 'skip_previous', libelle: 'Chaîne précédente', titre: 'Chaîne précédente (↑)', surAction: () => zapping.zapper(-1) },
          { icone: 'skip_next', libelle: 'Chaîne suivante', titre: 'Chaîne suivante (↓)', surAction: () => zapping.zapper(1) },
        ]
      : [
          { icone: 'replay_10', libelle: 'Reculer de 10 secondes', titre: 'Reculer de 10 s (←)', surAction: () => deplacer(-10) },
          { icone: 'forward_10', libelle: 'Avancer de 10 secondes', titre: 'Avancer de 10 s (→)', surAction: () => deplacer(10) },
        ]

  const boutonsDroite = (): BoutonControle[] => [
    ...(direct()
      ? [
          {
            icone: 'undo',
            libelle: 'Dernière chaîne regardée',
            titre: 'Dernière chaîne regardée (R)',
            desactive: zapping.derniereChaine() === null,
            masquerMobile: true,
            surAction: zapping.revenirDerniereChaine,
          },
          {
            icone: 'tv_guide',
            libelle: 'Mini-guide',
            titre: 'Mini-guide (G)',
            actif: calques.miniGuideOuvert(),
            surAction: ouvrirMiniGuide,
          },
        ]
      : []),
    // Ouvert en VOD aussi : c'est là que se lit la chaîne de traitement, et
    // 54,6 % des films y passent.
    {
      icone: 'info_panel',
      libelle: direct() ? 'Informations sur le programme' : 'Informations sur le flux',
      titre: `${direct() ? 'Informations sur le programme' : 'Informations sur le flux'} (I)`,
      actif: calques.infosOuvertes(),
      surAction: ouvrirInfos,
    },
    {
      icone: 'cast',
      libelle: 'Diffuser vers un téléviseur',
      titre: 'Diffuser vers un téléviseur (C)',
      actif: etatDiffusion() === 'diffusion',
      desactive: !diffusionPossible(),
      surAction: () => calques.poserDiffusionOuverte((v) => !v),
    },
    {
      icone: 'picture_in_picture_alt',
      libelle: "Image dans l'image",
      titre: "Image dans l'image",
      actif: enPip(),
      masquerMobile: true,
      surAction: () => void basculerPip(),
    },
    { icone: 'close', libelle: 'Arrêter le flux', titre: 'Arrêter le flux et libérer la connexion', surAction: props.surFermer },
    { icone: 'fullscreen', libelle: 'Plein écran', titre: 'Plein écran', surAction: pleinEcran },
  ]

  // Ce que le flux EST, et ce qu'on lui fait : le conteneur annoncé par le
  // catalogue, la hauteur réellement décodée et le traitement du serveur.
  const ligneTechnique = () => {
    const mode = plan()?.mode
    const conteneur = direct() ? 'HLS' : (props.entree.extension ?? 'mp4')
    return [
      conteneur.toUpperCase(),
      hauteurImage() ? `${hauteurImage()}p` : null,
      mode ? BADGE_MODE[mode] : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const actionsErreur = (): ActionErreur[] => {
    const actions: ActionErreur[] = []
    // Les MP4 en EAC3 sont illisibles en navigateur mais décodés par les
    // téléviseurs : la sortie est dans le message, pas trois clics plus loin.
    if (erreur()!.couche === 'codec' && etatDiffusion() !== 'indisponible')
      actions.push({ libelle: 'Diffuser vers le téléviseur', principale: true, surAction: () => void diffuser() })
    actions.push({
      libelle: 'Réessayer',
      principale: actions.length === 0,
      surAction: () => {
        panne.remettreAZero()
        poserErreur(null)
        panne.relancer()
      },
    })
    actions.push({ libelle: 'Retour', surAction: props.surFermer })
    return actions
  }

  /** Avancement affiché par le mini-lecteur : le programme, ou le fichier. */
  const avancementMini = () => {
    if (direct()) {
      const p = zapping.enCours()
      if (!p || p.fin <= p.debut) return 0
      return (Date.now() - p.debut) / (p.fin - p.debut)
    }
    return duree() > 0 ? position() / duree() : 0
  }

  const etatMini = () =>
    erreur() ? 'Erreur de lecture' : chargement() ? 'Connexion…' : enPause() ? 'En pause' : undefined

  const horaireEnCours = createMemo(() => {
    const p = zapping.enCours()
    return p ? `${heure(p.debut)}–${heure(p.fin)}` : undefined
  })

  return (
    <div
      ref={racine}
      tabindex="-1"
      onKeyDown={auClavier}
      style={{
        // Bureau : vidéo | liste de 340 px. Tablette et mobile : vidéo 16:9 puis
        // liste. Les deux pistes de lignes valent exactement deux enfants, et
        // la seconde est `minmax(0,1fr)` : sans cette hauteur réelle, la liste
        // virtualisée de la zone du bas ne monte aucune ligne.
        display: 'grid',
        ...(estBureau()
          ? { 'grid-template-columns': 'minmax(0,1fr) 340px' }
          : { 'grid-template-columns': 'minmax(0,1fr)', 'grid-template-rows': 'auto minmax(0,1fr)' }),
        height: '100%', 'min-height': 0, 'min-width': 0, outline: 'none',
        animation: 'fadein 200ms var(--ease)',
      }}
    >
      <div
        style={{
          display: 'grid', 'min-height': 0, 'min-width': 0,
          'grid-template-rows': estBureau() ? 'minmax(0,1fr) auto' : 'auto auto',
        }}
      >
        <div
          ref={cadre}
          onMouseMove={calques.reveiller}
          onDblClick={pleinEcran}
          style={{
            position: 'relative', 'min-height': 0, overflow: 'hidden', background: 'var(--video)',
            // Empilé, la vidéo n'a plus de hauteur imposée par la grille : le
            // 16:9 la lui donne, plafonné pour qu'un téléphone couché garde
            // sa liste de chaînes à l'écran.
            ...(estBureau() ? {} : { 'aspect-ratio': '16 / 9', 'max-height': '56dvh', width: '100%' }),
            cursor: calques.commandesVisibles() ? undefined : 'none',
          }}
        >
          <video
            ref={video}
            playsinline
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'var(--video)' }}
          />

          {/* Identité du contenu tant qu'aucune image n'est arrivée : un carré
              noir ne dit pas si le flux est en route ou perdu. */}
          <Show when={!imageDisponible()}>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', inset: 0, display: 'grid', 'place-items': 'center',
                'align-content': 'center', gap: '14px', 'pointer-events': 'none',
                opacity: erreur() || chargement() ? 0.25 : 1,
                transition: 'opacity var(--dur) var(--ease)',
              }}
            >
              <SubstitutLogo nom={props.entree.nom} src={props.entree.icone} taille={84} />
              <span style={{ 'font-family': 'var(--moov-font-mono)', 'font-size': '11px', color: '#56697f' }}>
                {urlAffichee()}
              </span>
            </div>
          </Show>

          <div
            data-role="commandes"
            style={{
              opacity: calques.commandesVisibles() ? 1 : 0,
              'pointer-events': calques.commandesVisibles() ? 'auto' : 'none',
              transition: 'opacity 250ms var(--ease)',
            }}
          >
            <div
              style={{
                position: 'absolute', inset: '0 0 auto 0',
                display: 'flex', 'align-items': 'center', gap: '10px',
                padding: estMobile() ? '8px 12px' : '16px 20px',
                background: 'var(--ov1)', 'backdrop-filter': 'var(--ovblur)',
                color: ENCRE, 'z-index': 2,
              }}
            >
              <EtiquettePays pays={props.entree.pays} />
              <h1 class="tronque" style={{ 'font-size': '15px', 'line-height': '18px' }}>{props.entree.nom}</h1>
              <Show when={zapping.nomCategorie()}>
                {(c) => (
                  <span class="tronque" style={{ 'font-size': '13px', 'line-height': '18px', color: ENCRE2 }}>{c()}</span>
                )}
              </Show>
              <span style={{ flex: 1 }} />
              <Show when={!estMobile()}>
                <span class="num" style={{ 'font-size': '11px', color: ENCRE2 }}>{ligneTechnique()}</span>
              </Show>
            </div>

            <ControlesLecteur
              mode={direct() ? 'live' : 'vod'}
              enPause={enPause()}
              muet={muet()}
              volume={volume()}
              position={position()}
              duree={duree()}
              indiceClavier={
                direct()
                  ? '↑ ↓ zapper · R dernière · G guide · I infos'
                  : '← → 10 s · Espace pause · M muet · F favori · I infos'
              }
              gauche={boutonsGauche()}
              droite={boutonsDroite()}
              surLecture={basculerLecture}
              surMuet={() => (video.muted = !video.muted)}
              surVolume={(v) => {
                video.volume = v
                video.muted = v === 0
              }}
              surPosition={demanderPosition}
            />
          </div>

          <Show when={chargement() && !erreur() && !panne.reconnexion()}>
            <div
              style={{
                position: 'absolute', inset: 0, display: 'grid', 'place-items': 'center',
                'align-content': 'center', gap: '14px', 'pointer-events': 'none',
              }}
            >
              <span
                style={{
                  width: '34px', height: '34px', 'border-radius': '50%',
                  border: '3px solid rgba(255,255,255,.14)', 'border-top-color': 'var(--vacc)',
                  animation: 'spin .8s linear infinite',
                }}
              />
              <span style={{ 'font-size': '12px', color: ENCRE2 }}>
                {verification()
                  ? 'Vérification du film…'
                  : direct()
                    ? 'Ouverture du flux HLS…'
                    : 'Ouverture du fichier…'}
              </span>
            </div>
          </Show>

          <Show when={panne.reconnexion()}>
            {(r) => <BandeauReconnexion essai={r().essai} total={r().total} dans={r().dans} motif={r().motif} />}
          </Show>

          <Show when={calques.bandeau() > 0 && direct() && !erreur()}>
            <BandeauChaine
              entree={props.entree}
              programme={zapping.enCours()?.titre}
              horaire={horaireEnCours()}
            />
          </Show>

          <Show when={calques.reprise() !== null && !erreur()}>
            <DialogueReprise
              titre={props.entree.nom}
              position={calques.reprise()!}
              surReprendre={() => {
                allerA(calques.reprise()!)
                calques.poserReprise(null)
                void video.play().catch(() => {})
              }}
              surRecommencer={() => {
                allerA(0)
                calques.poserReprise(null)
                void video.play().catch(() => {})
              }}
            />
          </Show>

          <Show when={calques.rebours() !== null && props.suivant}>
            {(s) => (
              <ProchainEpisode
                titre={s().titre}
                restant={calques.rebours()!}
                surLire={() => {
                  calques.arreterRebours()
                  s().lire()
                }}
                surAnnuler={calques.annulerRebours}
              />
            )}
          </Show>

          <Show when={calques.miniGuideOuvert()}>
            <MiniGuide
              titre={zapping.nomCategorie() ?? 'Mini-guide'}
              elements={zapping.chainesGuide()}
              cleActive={props.entree.cle}
              programme={zapping.programmeDe}
              ensuite={zapping.ensuiteDe}
              surChoisir={(e) => {
                calques.poserMiniGuideOuvert(false)
                props.surChanger(e)
              }}
              surFermer={() => calques.poserMiniGuideOuvert(false)}
            />
          </Show>

          <Show when={calques.infosOuvertes()}>
            <PanneauInfos
              entree={props.entree}
              categorie={zapping.nomCategorie()}
              enCours={zapping.enCours()}
              ensuite={zapping.ensuite()}
              flux={plan()}
              favori={favori()}
              surFavori={marquerFavori}
              surGuide={direct() ? () => poserEcran('guide') : undefined}
              surFermer={() => calques.poserInfosOuvertes(false)}
            />
          </Show>

          <Show when={calques.diffusionOuverte()}>
            <DialogueDiffusion
              etat={etatDiffusion()}
              basPx={HAUTEUR_CONTROLES[direct() ? 'live' : 'vod'] + 16}
              resoutLeCodec={
                // L'extension du catalogue ne dit rien du codec : on ne propose
                // la diffusion « pour le codec » que sur une erreur de format.
                diffusionResoutLeCodec(props.entree.extension) ||
                erreur()?.couche === 'codec'
              }
              surChoisir={() => void diffuser()}
              surArreter={() => void arreterDiffusion()}
              surFermer={() => calques.poserDiffusionOuverte(false)}
            />
          </Show>

          <Show when={erreur()}>
            {(e) => <ErreurLecture erreur={e()} tentatives={panne.essais()} actions={actionsErreur()} />}
          </Show>
        </div>

        <PiedLecteur
          entree={props.entree}
          direct={direct()}
          enCours={zapping.enCours()}
          ensuite={zapping.ensuite()}
          position={position()}
          duree={duree()}
          favori={favori()}
          surFavori={marquerFavori}
        />
      </div>

      <aside
        style={{
          display: 'grid', 'grid-template-rows': direct() ? 'auto minmax(0,1fr)' : 'minmax(0,1fr)',
          'min-height': 0, 'min-width': 0, background: 'var(--panel)',
          [estBureau() ? 'border-left' : 'border-top']: '1px solid var(--line)',
        }}
      >
        <Show
          when={direct()}
          fallback={
            <ColonnePistes
              pistesAudio={pistes.pistesAudio()}
              pistesTexte={pistes.pistesTexte()}
              sousTitre={pistes.sousTitre()}
              categorie={zapping.nomCategorie()}
              surSousTitre={pistes.choisirSousTitre}
            />
          }
        >
          <ListeZapping
            titre={zapping.nomCategorie() ?? 'Zapping'}
            elements={zapping.liste()}
            cleActive={props.entree.cle}
            filtre={zapping.filtre()}
            surFiltre={zapping.poserFiltre}
            sousTitre={(v) => (v.cle === props.entree.cle ? zapping.enCours()?.titre : undefined)}
            surChoisir={props.surChanger}
          />
        </Show>
      </aside>

      {/* La coque masque le lecteur par `visibility` : un portail est le seul
          moyen pour le mini-lecteur et les notifications de rester visibles
          pendant que le flux, lui, continue de tourner derrière. */}
      <Show when={horsLecteur()}>
        <Portal>
          <MiniLecteur
            entree={props.entree}
            sousTitre={direct() ? (zapping.enCours()?.titre ?? zapping.nomCategorie() ?? 'En direct') : props.entree.nom}
            avancement={avancementMini()}
            etat={etatMini()}
            muet={muet()}
            reduit={miniReduit()}
            surOuvrir={revenirAuLecteur}
            surMuet={() => (video.muted = !video.muted)}
            surReduire={() => poserMiniReduit((v) => !v)}
            surFermer={props.surFermer}
          />
        </Portal>
      </Show>

      <Show when={notification()}>
        {(n) => (
          <Portal>
            <Notification
              notification={n()}
              basPx={horsLecteur() ? MARGE_MINI * 2 + hauteurMini(miniReduit()) : 24}
              surExpiration={() => poserNotification(null)}
            />
          </Portal>
        )}
      </Show>
    </div>
  )
}
