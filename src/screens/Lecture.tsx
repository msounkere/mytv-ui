import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from 'solid-js'
import { Portal } from 'solid-js/web'
import SubstitutLogo from '../components/SubstitutLogo'
import EtiquettePays from '../components/EtiquettePays'
import Icone from '../components/Icone'
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
  BandeauReconnexion, ProchainContenu, ProchainEpisode, SEUIL_REPRISE,
} from '../components/CalquesLecture'
import { prochainAVoirApres, type AVoirJoint } from '../lib/a-voir'
import { episodeApres } from '../lib/episodes-suivants'
import { chargerSaisons } from '../lib/saisons'
import { idServeurDeCle } from '../lib/identifiants'
import { donnee } from './lecture/donnee'
import { finContenu, prochainAcceptable } from './lecture/fin-regles'
import type { SaisonApi } from '../lib/api'
import { estBureau, estMobile } from '../lib/gabarit'
import { ecran, ouvrirDetails, ouvrirFiche, poserEcran, revenirAuLecteur } from '../etat'
import { db } from '../lib/db'
import { attacher, hlsNatif, type Attache } from '../lib/lecteur'
import { planDirect, planVod, urlVod, deplacementParService, bornerPosition, BADGE_MODE, type Plan } from '../lib/flux'
import { lectureDe, chaineDeLecture } from '../lib/source-lecture'
import { annulerFinDifferee } from '../lib/bail'
import { ErreurLecteur, enCoupure } from '../lib/errors'
import { noter } from '../lib/diagnostic'
import { codecEstHevc, capacitesAnnoncees, capacitesPretes, marquerHevcDefaillant, urlAvecCapacites } from '../lib/capacites'
import {
  AUCUNE_TENTATIVE, BADGE_DIRECT, DELAI_ATTENTE_LONGUE_MS, LIBELLE_CONVERSION, MESSAGE_4K, enConversion, erreurApresConversions, est4K,
  suiteApresErreur, urlForcee, type EtatTentatives, type ModeDirect, type ModeForce,
} from '../lib/modes-direct'
import { noterOuverture, noterPosition, estFavori, basculerFavori } from '../lib/preferences'
import {
  creerDiffusion, demanderLien, detailsDiffusion, diffusionResoutLeCodec, lienAbsolu, parametresDiffusion, avecPosition,
  preparerDiffusion, reglagesTeleviseur, type Diffusion, type EtatDiffusion,
} from '../lib/cast'
import type { EtatLien } from '../components/DialogueDiffusion'
import { versErreurLecteur } from '../lib/api'
import { modePipDisponible, ouvrirPipDocument, basculerPipNatif } from '../lib/pip'
import { basculerPleinEcran } from './lecture/plein-ecran'
import { MenuLecteur, type EntreeMenuLecteur } from '../components/CalquesLecture'
import { basculerAVoir } from '../lib/a-voir'
import { useAVoirCles } from '../components/BoutonAVoir'
import type { EntreeCatalogue } from '../lib/db'
import ColonnePistes from './lecture/ColonnePistes'
import PiedLecteur from './lecture/PiedLecteur'
import { creerCalques } from './lecture/calques'
import { envoyerPosition } from './lecture/position'
import { PART_VUE } from '../lib/ui7-contrat'
import { brancherClavier } from './lecture/clavier'
import { heure } from './lecture/format'
import { creerPistes } from './lecture/pistes'
import { creerReprisePanne } from './lecture/reconnexion'
import { departDeLecture, finPrematuree, pointDeReprise } from '../lib/politique-reprise'
import { urlMasquee } from './lecture/sources'
import { creerZapping } from './lecture/zapping'
import { creerVariantesLecteur } from './lecture/variantes'
import Variantes from '../components/Variantes'
import { abonnerEvenements } from '../lib/diagnostic'
import { debitLecteurMbps } from '../lib/fluidite'
import { sonde } from '../sonde-debit'
import {
  ETAT_ECO_INITIAL, LIBELLE_QUALITE_MODE, MESSAGE_ECO, choisirQualite, entetesQualite, evaluerEco, fluxKbpsDe, qualite,
  urlAvecQualite, type EtatEco,
} from '../lib/qualite'

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

/** Deux taps du meme cote dans cette fenetre = un double-tap (±10 s) ; au-dela, un tap simple (CA6). */
const FENETRE_DOUBLE_TAP = 400

/** Hauteur réelle de la barre de contrôles, mesurée sur la maquette. */
const HAUTEUR_CONTROLES = { live: 68, vod: 94 }


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
      compte à rebours de fin enchaîne. Facultatif — sans lui, aucun décompte.
      `pret` : le serveur le tient déjà sur son disque (US-43 CA4). */
  suivant?: { titre: string; lire: () => void; pret?: boolean }
  /** Film terminé (US-43 CA4) : ouvrir le prochain élément de la liste « À voir » (proposé, jamais lancé seul). */
  surSuivantListe?: (e: EntreeCatalogue) => void
  /**
   * « Ma liste » depuis le lecteur (contrat ui-7, US-46 CA6 / C UX28) : geste et
   * etat fournis par la coque ; a defaut, le lecteur bascule lui-meme la liste.
   */
  surMaListe?: () => void
  dansMaListe?: boolean
  surChanger: (e: EntreeCatalogue) => void
  /** Arrêt du flux : la coque oublie la sélection (le flux est déjà détaché ici). */
  surFermer: () => void
  /** Quitter l'écran sans arrêter (la coque n'a plus à naviguer : le lecteur le fait, CA2). */
  surRetour: () => void
}) {
  let video!: HTMLVideoElement
  let cadre!: HTMLDivElement
  let racine!: HTMLDivElement

  const [erreur, poserErreur] = createSignal<ErreurLecteur | null>(null)
  const [etatDiffusion, poserEtatDiffusion] = createSignal<EtatDiffusion>('indisponible')
  /** Le navigateur sait diffuser (Remote Playback API ou AirPlay) ; sinon le lien se copie (CA4). */
  const [diffusionSupportee, poserDiffusionSupportee] = createSignal(false)
  /** Le flux local est coupé : la source de l'élément est le lien signé, pour l'appareil (US-41 CA3). */
  const [diffusionEnCours, poserDiffusionEnCours] = createSignal(false)
  /** Navigateur sans Remote Playback : le lien signé se copie (US-41 CA4). */
  const [lienEtat, poserLienEtat] = createSignal<EtatLien>({ etat: 'aucun' })
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
  /**
   * Fin d'un film ou du dernier episode (US-43 CA4, US-45 CA5) : « Film terminé ✓ » /
   * « Série terminée ✓ » et le prochain element de Ma liste, propose sans demarrage
   * automatique -- jamais le contenu que l'on vient de finir.
   */
  const [fin, poserFin] = createSignal<{ de: 'film' | 'serie'; prochain?: AVoirJoint } | null>(null)
  /** Enchainement VOULU (decompte, « Lire maintenant », « Regarder » du calque de fin) : pas de notification « arrêté ». */
  let enchainementVoulu = false

  // --- Ce que le serveur fait du flux --------------------------------------
  const [plan, poserPlan] = createSignal<Plan | null>(null)
  /** Vrai pendant la vérification en tête d'un film (statut, mode). */
  const [verification, poserVerification] = createSignal(false)
  /** Décalage appliqué par le dernier `?t=` : à ajouter au temps du média. */
  const [decalage, poserDecalage] = createSignal(0)
  /** Position demandée mais pas encore appliquée : la poignée doit la suivre. */
  const [positionVisee, poserPositionVisee] = createSignal<number | null>(null)

  // Memo et non fonction : une valeur CAPTUREE, que le nettoyage des effets
  // peut relire apres la deselection sans toucher a `props.entree` (dont
  // l'accesseur, celui du `<Show>` de la coque, leve « Stale read » une fois
  // la selection a null : US-45 CA1, bug bloquant « l'arret qui n'arrete pas »).
  const direct = createMemo(() => props.entree.type === 'live')

  // --- Modes du direct (US-32) ---------------------------------------------
  /** Mode annoncé par le serveur (`X-Mytv-Mode`) pour la chaîne ouverte. */
  const [modeServeur, poserModeServeur] = createSignal<ModeDirect | null>(null)
  /** Mode imposé par nous (`?forcer=`), après un fragParsingError fatal. */
  const [forcageAffiche, poserForcageAffiche] = createSignal<ModeForce | null>(null)
  // Hors réactivité : ce sont des compteurs de garde-fou, lus à l'ouverture du flux.
  let etatTentatives: EtatTentatives = AUCUNE_TENTATIVE
  let forcage: ModeForce | null = null
  /** `X-Mytv-Codec` de la playlist ouverte : seul un flux HEVC justifie de mémoriser l'échec. */
  let codecServeur: string | undefined
  /** Playlist d'un direct pas encore arrivée après ~3 s : ffmpeg démarre peut-être. */
  const [attenteLongue, poserAttenteLongue] = createSignal(false)
  const conversion = () => {
    const m = forcageAffiche() ?? modeServeur()
    return direct() && enConversion(m) ? (m as ModeForce) : null
  }

  // Le serveur fabrique le MP4 à la volée quand il remuxe : sa durée propre n'a
  // aucun sens, et après un `?t=` ses horodatages repartent de zéro. La durée
  // vient donc de ce que le serveur annonce, et la position affichée est celle
  // du FILM, décalage compris.
  // Ni `duree` ni `position` ne lisent `props.entree` : le plan dit lui-meme
  // s'il decrit un film (CA1 : elles sont relues au nettoyage).
  const dureeAnnoncee = () => {
    const p = plan()
    if (!p || p.genre !== 'vod' || !p.viaService) return undefined
    const d = p.dureeSecondes ?? 0
    return d > 0 ? d : undefined
  }
  // Via le service, SEULE la duree annoncee compte : sans `X-Mytv-Duree`, elle
  // est inconnue (0) — pas de barre, et un deplacement n'est plus plafonne a 0.
  const duree = () => {
    const p = plan()
    return p?.genre === 'vod' && p.viaService ? (dureeAnnoncee() ?? 0) : dureeBrute()
  }
  const position = () => positionVisee() ?? decalage() + positionBrute()
  /** La coque garde le lecteur monté : il n'est « parti » que visuellement. */
  const horsLecteur = () => ecran() !== 'lecture'

  // --- Sortie : une seule regle, la pile d'historique (US-45 CA2) ----------------
  // La coque navigue (`surRetour` = quitterLecteur, `surFermer` = arreterLecture :
  // un pas en arriere dans la pile, sinon la fiche du contenu, sinon l'accueil --
  // lib/sortie-lecteur.ts) ; depuis le mini-lecteur, elle ne navigue pas.
  /** Navigation explicite vers une fiche (« Revenir a la serie »). */
  function naviguerVers(chemin: string) {
    const e = untrack(() => props.entree)
    if (chemin.startsWith('/film/')) ouvrirDetails(e)
    else if (chemin.startsWith('/serie/')) {
      const serie = chemin.slice('/serie/'.length)
      void db.catalogue.get(serie).then((s) => (s ? ouvrirFiche(s) : poserEcran('accueil')))
    } else poserEcran('accueil')
  }
  /** Retour (fleche, Echap) : l'ecran precedent, la lecture continue dans le mini-lecteur. */
  function revenir() {
    props.surRetour()
  }
  /**
   * Arret (croix, « Fermer la lecture », « Retour » du panneau d'erreur, fin de
   * lecture) : la position de sortie est notee AVANT le detachement (qui remet le
   * media a zero), le flux est DETACHE tout de suite (l'effet de source lit
   * `arret()`), puis la coque oublie la selection et revient a l'ecran precedent
   * (depuis le mini-lecteur elle reste ou elle est). `vers` : une fiche explicite
   * (« Revenir a la serie ») -- la coque n'est prevenue qu'une fois l'ecran quitte,
   * pour qu'elle ne navigue pas une seconde fois.
   */
  const [arret, poserArret] = createSignal(false)
  let noterSortie: (() => void) | undefined
  let fermetureDemandee = false
  function arreter(vers?: string) {
    if (untrack(arret)) return
    noterSortie?.()
    poserArret(true)
    if (vers && !untrack(horsLecteur)) return naviguerVers(vers)
    fermetureDemandee = true
    props.surFermer()
  }
  createEffect(() => {
    if (!arret() || fermetureDemandee || !horsLecteur()) return
    fermetureDemandee = true
    props.surFermer()
  })

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

  /**
   * Toute erreur fatale passe ici. Un `fragParsingError` en direct déclenche UNE
   * conversion audio puis UNE conversion vidéo (jamais plus : `suiteApresErreur`
   * est bornée) ; le reste suit la politique de reprise habituelle.
   */
  function traiterErreur(brute: ErreurLecteur) {
    // Un film repart de la position ATTEINTE, pas du dernier saut demande (voir pointDeReprise).
    if (!direct()) pointAtteint = pointDeReprise(position(), pointAtteint)
    // Apres des images, une place prise est une COUPURE (message dedie, meme reprise).
    const e = imagesVues ? enCoupure(brute) : brute
    const chaine = direct() ? chaineDeLecture(lectureDe(props.entree)) : undefined
    if (direct()) {
      const s = suiteApresErreur(etatTentatives, e, { hevcAnnonce: capacitesAnnoncees(etatTentatives.sansHevc).includes('hevc') })
      if (s.action === 'sans-hevc') {
        etatTentatives = s.etat
        // Repli pour CETTE lecture dans tous les cas ; mémorisé (24 h) seulement si la source est HEVC.
        if (codecEstHevc(codecServeur)) marquerHevcDefaillant()
        noter('live:sans-hevc', { chaine, detail: e.detail })
        notifier('Lecture impossible en HEVC — nouvel essai sans cette capacité', 'limite')
        panne.relancer()
        return
      }
      if (s.action === 'forcer') {
        etatTentatives = s.etat
        forcage = s.mode
        noter('live:forcage', { mode: s.mode, tentative: s.tentative, total: s.total, chaine, detail: e.detail })
        notifier(`Lecture impossible en l’état — essai avec conversion ${s.mode === 'audio' ? 'audio' : 'vidéo'}`, 'limite')
        panne.relancer()
        return
      }
      if (s.action === 'abandonner') {
        noter('live:conversion-echec', { mode: forcage ?? undefined, chaine, detail: e.detail, fin: true })
        panne.signalerErreur(erreurApresConversions(e.detail))
        return
      }
      if (forcage || modeServeur() === 'audio' || modeServeur() === 'video')
        noter('live:conversion-echec', { mode: forcage ?? modeServeur() ?? undefined, chaine, detail: e.detail })
      else if (e.detail?.includes('format_hevc_non_lisible'))
        noter('live:refus-hevc', { chaine, detail: e.detail })
    }
    panne.signalerErreur(e)
  }

  // Le contenu a deja donne des images : une place prise est alors une coupure.
  let imagesVues = false

  const pistes = creerPistes(() => video)

  const panne = creerReprisePanne({ poserErreur })

  /**
   * Contenu tenu pour VU (US-43 CA4) : sa position saute a la fin, et la
   * memorisation periodique ne doit plus la ramener en arriere. Enchainer sur
   * l'episode suivant -- decompte ecoule ou « Lire maintenant », donc quelques
   * secondes avant la fin -- vaut fin de l'episode : sans cela, la fiche et
   * « Continuer a regarder » le montreraient encore en cours.
   */
  let cleTerminee: string | undefined
  function terminer(cle: string) {
    cleTerminee = cle
    const d = duree()
    if (Number.isFinite(d) && d > 0) void noterPosition(cle, d, d)
  }
  const suivantEnchaine = () =>
    props.suivant
      ? {
          ...props.suivant,
          lire: () => {
            terminer(props.entree.cle)
            enchainementVoulu = true
            props.suivant!.lire()
          },
        }
      : undefined

  // --- L'episode lu et le suivant, tels que les saisons les decrivent (CA5, CA9) ----
  // Le decompte nomme l'episode (repere, titre, vignette) et le panneau Infos
  // donne titre, numero et resume : tout vient des saisons, deja en cache depuis
  // la fiche (lib/saisons), sans rien redemander au service qui pousse le flux.
  const saisonsSerie = donnee(
    () => (props.entree.type === 'series' ? props.entree.serie : undefined),
    (serie) => (serie ? chargerSaisons(idServeurDeCle(serie)).catch(() => [] as SaisonApi[]) : Promise.resolve([] as SaisonApi[])),
    [] as SaisonApi[],
  )
  const infosEpisode = (cle: string | undefined) => {
    if (!cle) return undefined
    for (const sa of saisonsSerie())
      for (const e of sa.episodes)
        if (`series:${e.id}` === cle)
          return { saison: sa.numero, numero: e.numero, repere: `S${String(sa.numero).padStart(2, '0')}E${String(e.numero).padStart(2, '0')}`, titre: e.titre, synopsis: e.synopsis, image: e.image }
    return undefined
  }
  const episodeCourant = createMemo(() => infosEpisode(props.entree.cle))
  const episodeSuivant = createMemo(() => (props.suivant ? infosEpisode(episodeApres(saisonsSerie(), '', props.entree.cle)?.cle) : undefined))

  const calques = creerCalques({
    cle: () => props.entree.cle,
    // Ce que le MÉDIA attend d'une décision ; les calques y ajoutent les leurs.
    decisionEnAttente: () =>
      enPause() || chargement() || !!erreur() ||
      !!panne.reconnexion() || etatDiffusion() === 'diffusion',
    enPause,
    suivant: suivantEnchaine,
    duree,
    position,
    surQuitterEcran: revenir,
  })

  /**
   * Changement de chaine DIFFERE hors du geste (US-45 CA9, D16). WebKit (tout
   * iPhone) plantait au zapping apres un echec HLS : la coque REMONTE le lecteur
   * (selection changee), donc retire du document l'element focalise -- la racine
   * ou un bouton de la colonne -- PENDANT la touche ou le clic qui le vise.
   * Isole sous Playwright webkit : aucune operation sur la video ne plante seule ;
   * seul le demontage pendant l'evenement plante. On rend le focus et on change
   * a la tache suivante.
   */
  function changer(e: EntreeCatalogue) {
    const actif = document.activeElement as HTMLElement | null
    if (actif && racine?.contains(actif)) actif.blur()
    setTimeout(() => props.surChanger(e), 0)
  }

  const zapping = creerZapping({
    entree: () => props.entree,
    direct,
    guideOuvert: calques.miniGuideOuvert,
    surChanger: changer,
    notifier,
  })

  // --- Variantes de la chaîne (US-39) et qualité Éco (US-38 CA4) --------------
  /** Débit courant : ce que le lecteur a mesuré sur un segment récent, sinon la sonde. */
  const debitCourantMbps = () => {
    const d = debitLecteurMbps()
    if (d !== undefined) return d
    const so = sonde()
    return so.etat === 'ok' ? so.mesure.debit : undefined
  }
  /** Adresse de playlist complète : capacités et qualité, comme à l'ouverture. */
  const urlDirect = (lecture: string, cap = capacitesAnnoncees(etatTentatives.sansHevc)) =>
    urlAvecQualite(urlAvecCapacites(urlForcee(lecture, forcage), cap), qualite())
  const variantesLecteur = creerVariantesLecteur({
    entree: () => props.entree,
    direct,
    debitMbps: debitCourantMbps,
    urlLecture: (lecture) => urlDirect(lecture),
    entetes: () => ({ 'X-Mytv-Capacites': capacitesAnnoncees(etatTentatives.sansHevc).join(','), ...entetesQualite(qualite()) }),
    surChanger: changer,
  })
  /** « Passer en Éco ? » : proposé une fois par lecture quand la liaison est trop juste. */
  const [propositionEco, poserPropositionEco] = createSignal(false)
  let etatEco: EtatEco = ETAT_ECO_INITIAL
  // La règle lit les segments que le lecteur note déjà (hls:segment) : débit
  // mesuré par hls.js contre débit propre du segment (octets / durée de vidéo).
  onCleanup(abonnerEvenements((type, d) => {
    if (type !== 'hls:segment' || !direct() || qualite() === 'eco') return
    const flux = fluxKbpsDe(Number(d['octets']), Number(d['dureeMedia']))
    const mesure = Number(d['debitKbps'])
    if (flux === undefined || !(mesure > 0)) return
    const r = evaluerEco(etatEco, { t: Date.now(), debitKbps: mesure, fluxKbps: flux })
    etatEco = r.etat
    if (r.recommander) {
      poserPropositionEco(true)
      noter('eco:proposition', { chaine: chaineDeLecture(lectureEntree(props.entree)), mesure, flux })
    }
  }))
  function passerEnEco() {
    poserPropositionEco(false)
    choisirQualite('eco')
    noter('eco:choix', { qualite: 'eco', origine: 'proposition' })
  }
  function basculerQualite() {
    const q = qualite() === 'eco' ? 'auto' : 'eco'
    poserPropositionEco(false)
    choisirQualite(q)
    noter('eco:choix', { qualite: q, origine: 'bouton' })
    notifier(q === 'eco' ? 'Qualité Éco : flux réencodé à débit réduit par le serveur' : 'Qualité Auto')
  }

  /** Adresse de lecture du serveur : celle de l'entrée, ou celle de l'épisode. */
  function lectureEntree(e: EntreeCatalogue): string {
    return lectureDe(e, props.urlForcee && e.cle === props.entree.cle ? props.urlForcee : undefined)
  }

  const urlAffichee = () => urlMasquee(plan()?.url ?? lectureEntree(props.entree))

  /** Position memorisee a rouvrir, ou rien si le contenu est VU (seuil commun) ou inconnu. */
  async function positionSauvegardee(cle: string): Promise<number | undefined> {
    const r = await db.reprises.get(cle)
    if (!r || !(r.duree > 0) || r.position / r.duree >= PART_VUE) return undefined
    return r.position
  }

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
    // Arret demande : le nettoyage ci-dessous a detache le flux, rien ne rouvre.
    if (arret()) {
      poserChargement(false)
      poserImageDisponible(false)
      return
    }
    // Changer de qualité (Auto / Éco) rouvre proprement : un seul flux, le
    // serveur arrête son ffmpeg (US-38 CA3), et l'adresse porte le nouveau mode.
    const modeQualite = qualite()
    // Test actif (US-39 CA4) : le flux est FERMÉ (le nettoyage ci-dessous a
    // déjà détaché le précédent) et rien ne rouvre tant que le test enchaîne les
    // variantes — jamais deux flux. À la fin, cet effet rouvre.
    if (variantesLecteur.testEnCours()) {
      poserChargement(false)
      poserImageDisponible(false)
      poserErreur(null)
      return
    }
    // Diffusion (US-41 CA3) : le flux local vient d'être détaché par le
    // nettoyage ci-dessous, et rien ne rouvre tant que l'appareil a la main —
    // un seul flux, celui du téléviseur. À l'arrêt, cet effet rouvre.
    if (diffusionEnCours()) {
      poserChargement(false)
      poserErreur(null)
      return
    }
    let attache: Attache | undefined
    let annule = false
    const abandon = new AbortController()

    if (precedente && precedente.cle !== entree.cle) {
      // Zapper ne notifie rien ; un enchainement VOULU (decompte, « Lire maintenant »,
      // « Regarder » du calque de fin) non plus (B12) ; passer d'un film à une chaîne,
      // si : le flux précédent a bel et bien été fermé pour laisser la place.
      if (!(precedente.type === 'live' && entree.type === 'live') && !enchainementVoulu)
        notifier(`« ${precedente.nom} » arrêté — l’abonnement n’autorise qu’un flux à la fois`, 'limite')
      if (precedente.type === 'live') zapping.poserDerniereChaine(precedente)
    }
    enchainementVoulu = false
    const premierPassage = !precedente || precedente.cle !== entree.cle
    if (premierPassage) {
      panne.remettreAZero()
      panne.arreter()
      imagesVues = false
      calques.nouveauContenu(entree.type === 'live')
      etatTentatives = AUCUNE_TENTATIVE
      forcage = null
      etatEco = ETAT_ECO_INITIAL
      poserPropositionEco(false)
      poserFin(null)
      // Un contenu rouvert repart avec sa memorisation normale.
      if (cleTerminee === entree.cle) cleTerminee = undefined
      if (entree.type === 'live' && est4K(entree.nom)) notifier(MESSAGE_4K, 'limite')
      // Un autre contenu : le point atteint dans le précédent ne vaut plus rien.
      pointAtteint = 0
    }
    // HLS natif (WebKit) : un element neuf pour la nouvelle chaine, jamais la
    // reaffectation d'un element dont le chargement a echoue (D16).
    if (precedente && precedente.cle !== entree.cle && entree.type === 'live' && hlsNatif(video)) poserGeneration((g) => g + 1)
    precedente = entree
    // Capture SYNCHRONE du point atteint : le detachement du flux precedent
    // (nettoyage ci-dessous, `load()`) signale ensuite un `timeupdate` a zero.
    const atteintAvant = pointAtteint
    // Une fin de lecture différée (zapping) ne doit plus partir : ce qui
    // s'ouvre reprend la place que l'ancienne chaîne allait rendre.
    annulerFinDifferee()

    poserErreur(null)
    codecServeur = undefined
    poserModeServeur(null)
    poserForcageAffiche(forcage)
    poserAttenteLongue(false)
    const minuteurAttente = entree.type === 'live' ? setTimeout(() => poserAttenteLongue(true), DELAI_ATTENTE_LONGUE_MS) : undefined
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
        await capacitesPretes()
        if (annule) return
        const cap = capacitesAnnoncees(etatTentatives.sansHevc)
        // En Éco, toute ouverture (direct, film, épisode) porte `qualite=eco`.
        const lecture = urlAvecQualite(lectureEntree(entree), modeQualite)
        let p: Plan
        let pointDepart = 0
        if (entree.type === 'live') {
          p = planDirect(lecture)
          p = { ...p, url: urlDirect(lectureEntree(entree), cap) }
        }
        else {
          // La question « Reprendre ou recommencer ? » s'est posee SUR LA FICHE
          // (US-45 CA3) : ici on ouvre directement au point sauvegarde -- a la
          // PREMIERE ouverture seulement, une reouverture automatique repart du
          // point atteint. Un contenu VU (part >= seuil commun) repart du debut :
          // « Regarder a nouveau » n'efface pas le ✓, il ne lit simplement pas la
          // position de fin. Sous une minute, rouvrir au debut ne coute rien.
          const sauvegardee = premierPassage ? await positionSauvegardee(entree.cle) : undefined
          if (annule) return
          const depart = departDeLecture({ premierPassage, pointAtteint: atteintAvant, sauvegardee, seuil: SEUIL_REPRISE })
          // Valeur LOCALE : pendant l'attente du HEAD, le `timeupdate` a zero du
          // media detache arrive encore et ne doit pas effacer le point de depart.
          pointDepart = depart.depart
          pointAtteint = pointDepart
          poserVerification(true)
          try {
            p = await planVod({ lecture, capacites: cap, decalage: pointDepart, signal: abandon.signal })
          } finally {
            poserVerification(false)
          }
        }
        if (annule) return
        poserPlan(p)
        // Un film remuxé repart de `pointDepart` par `?t=` ; un fichier servi tel
        // quel reprend, lui, par un déplacement natif une fois ses métadonnées lues.
        poserDecalage(p.viaService ? pointDepart : 0)

        const source =
          p.genre === 'live'
            ? ({ kind: 'hls', url: p.url, chaine: p.chaine } as const)
            : ({ kind: 'fichier', url: p.url } as const)
        attache = await attacher(video, source, traiterErreur, {
          forcer: forcage,
          capacites: cap,
          entetes: entetesQualite(modeQualite),
          surMode: (m, codec) => { poserModeServeur(m); codecServeur = codec },
        })
        if (annule) return attache.detacher()
        if (p.genre === 'vod' && !p.viaService && pointDepart > 0) {
          const reprise = pointDepart
          pointAtteint = reprise
          video.addEventListener('loadedmetadata', () => { video.currentTime = reprise }, { once: true })
        }
        await video.play().catch(() => {
          /* lecture différée jusqu'au geste de l'utilisateur */
        })
      } catch (e) {
        poserVerification(false)
        if (!annule) traiterErreur(e instanceof ErreurLecteur ? e : new ErreurLecteur('relais', String(e), 'Réessayer.'))
      }
    })()

    onCleanup(() => {
      clearTimeout(minuteurAttente)
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

  /**
   * Generation de l'element <video> (US-45 CA9, D16). Sur WebKit -- qui lit le
   * HLS nativement -- reaffecter la source d'un element dont le chargement
   * precedent a echoue plantait la page (« Target crashed », reproduit sous
   * Playwright webkit apres un passage par l'Accueil et le Direct). A chaque
   * changement de chaine en HLS natif, l'element est donc RECREE : l'ancien est
   * detache proprement (source vide, `load()`) puis retire, le nouveau branche.
   */
  const [generation, poserGeneration] = createSignal(1)

  // Miroir de l'élément <video> vers les signaux de la barre de contrôles, et
  // objet de diffusion : branches sur CHAQUE element cree (voir `generation`).
  function brancherVideo(el: HTMLVideoElement) {
    video = el
    const lire = () => {
      poserMuet(video.muted)
      poserVolume(video.volume)
      poserDureeBrute(Number.isFinite(video.duration) ? video.duration : 0)
    }
    const auTemps = () => {
      poserPositionBrute(video.currentTime)
      // Le point atteint suit la LECTURE (US-45 CA8, B3) : changer de qualite
      // rouvre au point ou l'on en est, plus au dernier saut demande. Pas apres
      // un detachement (`load()` remet le media a zero et le signale) : la
      // source vide dit que ce zero n'est pas une position.
      if (!direct() && video.readyState > 0 && Number.isFinite(video.currentTime)) pointAtteint = decalage() + video.currentTime
    }
    const auxImages = () => {
      // Le tampon restant d'une lecture coupee peut encore afficher des images
      // pendant le decompte : ce n'est pas une reprise, la relance part a l'heure.
      if (panne.reconnexion()?.occupation) { imagesVues = true; return }
      poserImageDisponible(true)
      poserChargement(false)
      poserHauteurImage(video.videoHeight)
      // Des images arrivent : il n'y a plus de panne à afficher. Le dire est
      // la contrepartie de la reconnexion silencieuse qui vient de réussir.
      imagesVues = true
      if (panne.essais() > 0) {
        panne.reussir()
        panne.remettreAZero()
        notifier('Connexion au relais rétablie — lecture reprise')
      }
      panne.arreter()
      poserErreur(null)
      pistes.relirePistes()
    }
    // Un `ended` avant la fin annoncee n'est pas une fin : le serveur, quand son
    // remux casse, tronque la reponse, et le navigateur prend la fin du corps pour
    // la fin du film. C'est une coupure : la reprise rouvre au point atteint (`?t=`).
    const alaFin = () => {
      if (direct()) return
      if (finPrematuree(position(), duree())) {
        noter('vod:fin-prematuree', { position: Math.round(position()), duree: Math.round(duree()) })
        traiterErreur(new ErreurLecteur(
          'reseau', 'Le flux s’est interrompu avant la fin du film.',
          'Reprise automatique au point atteint.', 'ended_premature',
        ))
        return
      }
      // Vraie fin (US-43 CA4). Le contenu est vu : la position saute a la fin tout
      // de suite, pour que la fiche et « Continuer a regarder » s'accordent avant
      // meme que l'episode suivant demarre.
      terminer(props.entree.cle)
      // Un episode enchaine (decompte annulable, ou calque persistant apres un
      // refus) ; un film -- ou le DERNIER episode d'une serie -- propose le
      // prochain element de Ma liste, sans rien lancer, et jamais la serie que
      // l'on vient de finir (on cherche apres la SERIE, pas apres l'episode : B11).
      if (props.suivant) calques.reboursAlaFin()
      else {
        const entree = { cle: props.entree.cle, type: props.entree.type, serie: props.entree.serie }
        const f = finContenu(entree)
        void prochainAVoirApres(f.chercherApres).then((j) => {
          if (props.entree.cle === entree.cle) poserFin({ de: f.de, prochain: prochainAcceptable(j?.entree, entree) ? j : undefined })
        })
      }
    }
    const evenements: Array<[string, () => void]> = [
      ['play', () => { poserEnPause(false); lire() }],
      ['ended', alaFin],
      ['pause', () => { poserEnPause(true); lire() }],
      ['volumechange', lire], ['durationchange', lire],
      ['timeupdate', auTemps], ['loadeddata', auxImages], ['playing', auxImages],
      ['waiting', () => poserChargement(true)],
    ]
    for (const [nom, cb] of evenements) el.addEventListener(nom, cb)
    poserEnPause(el.paused)
    lire()
    // Diffusion : l'objet suit l'élément <video>.
    const d = creerDiffusion(el)
    diffusion = d
    poserDiffusionSupportee(d.supportee())
    poserEtatDiffusion(d.etat())
    d.surChangement((e) => {
      poserEtatDiffusion(e)
      if (!diffusionEnCours()) return
      if (e === 'diffusion') {
        debutDiffusionMs = Date.now()
        noter('diffusion:debut', detailsDiffusion(lectureEntree(props.entree), navigator.userAgent))
      } else if (e !== 'connexion') {
        // L'appareil a lâché (arrêt depuis le téléviseur, perte) : retour local.
        void terminerDiffusion()
      }
    })
    onCleanup(() => {
      for (const [nom, cb] of evenements) el.removeEventListener(nom, cb)
      d.detacher()
    })
  }

  let diffusion!: Diffusion
  let debutDiffusionMs = 0

  // Mémorisation de la position de lecture pour la VOD (US-45 CA1).
  //
  // RIEN ICI NE RELIT `props.entree` AU NETTOYAGE : la coque ferme le `<Show>`
  // (selection a null) AVANT de demonter le lecteur, et l'accesseur leverait
  // « Stale read from <Show> » — l'exception interrompait la disposition, le
  // flux restait attache (son fantome, place du fournisseur tenue) et la
  // position de sortie n'etait jamais ecrite. La cle, la serie et le type sont
  // CAPTURES a l'entree de l'effet ; `duree()` et `position()` ne lisent que
  // des signaux locaux.
  createEffect(() => {
    const entree = props.entree
    if (entree.type === 'live') return
    // Pendant la diffusion, l'élément porte le lien signé (position à zéro) :
    // la position atteinte est gardée à part, rien à mémoriser ici.
    if (diffusionEnCours()) return
    const cle = entree.cle
    const serie = entree.serie
    const noter = (immediat: boolean) => {
      // Tenu pour vu (fin, ou enchainement) : la fin notee ne doit pas etre reculee.
      if (cleTerminee === cle) return
      // Le décalage du dernier `?t=` est compris dans `position()` : sans lui,
      // reprendre un film déplacé le ramènerait au début.
      const d = duree()
      const courant = position()
      if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(courant)) return
      // Au-delà du seuil « vu », on enregistre la fin plutôt qu'un drapeau à
      // part : « Reprendre » et la fiche série lisent déjà cette position, et
      // elles s'accordent alors d'elles-mêmes.
      const p = courant / d >= PART_VUE ? d : courant
      void noterPosition(cle, p, d)
      // Sortie, pause, fermeture de page : la position part tout de suite au
      // serveur (le journal, lui, attend 30 s) — l'autre appareil reprend juste.
      if (immediat) envoyerPosition(cle, p, d, serie)
    }
    // Apres l'arret, plus rien a noter : le media detache repasse a zero, et
    // cette position-la n'est pas une reprise.
    if (arret()) return
    const minuteur = setInterval(() => noter(false), 5000)
    const alaPause = () => noter(true)
    const alaFermeture = () => noter(true)
    video.addEventListener('pause', alaPause)
    window.addEventListener('pagehide', alaFermeture)
    noterSortie = () => noter(true)
    onCleanup(() => {
      clearInterval(minuteur)
      video.removeEventListener('pause', alaPause)
      window.removeEventListener('pagehide', alaFermeture)
      noterSortie = undefined
      if (!untrack(arret)) noter(true)
    })
  })

  /**
   * Diffuser (US-41 CA1) : 1. le serveur remet un lien signé pour l'adresse de
   * lecture, avec les capacités du téléviseur (CA2) ; 2. le flux local est
   * coupé et l'élément reçoit ce lien SANS le charger (CA3) ; 3. le sélecteur
   * natif. L'appareil va chercher le flux lui-même, sans cookie, d'où qu'il soit.
   */
  async function diffuser() {
    if (diffusionEnCours()) return
    const lecture = lectureEntree(props.entree)
    // Un film repart d'où on en était, sur le téléviseur comme au retour (CA5).
    if (!direct()) pointAtteint = pointDeReprise(position(), pointAtteint)
    const parametres = avecPosition(parametresDiffusion(reglagesTeleviseur(), qualite()), direct() ? undefined : pointAtteint)
    let lien
    try {
      lien = await demanderLien(lecture, parametres)
    } catch (e) {
      notifier(`Lien de diffusion refusé : ${versErreurLecteur(e).message}`, 'erreur')
      return
    }
    // Coupe le flux local (l'effet de source se retire) sans rendre la place :
    // le téléviseur reprend le MÊME bail, comme s'il était cette session.
    poserDiffusionEnCours(true)
    annulerFinDifferee()
    poserImageDisponible(false)

    // En direct la vidéo était portée par MSE, que la diffusion ne sait pas
    // envoyer : on pose le lien signé comme source simple et on attend que les
    // appareils se déclarent sur CETTE source avant d'ouvrir le sélecteur.
    const pret = await preparerDiffusion(video, lien.url)
    if (!pret) {
      notifier('Aucun appareil de diffusion ne répond', 'limite')
      await terminerDiffusion()
      return
    }
    await diffusion.choisir().catch(() => {})
    // Sélecteur refermé sans appareil : rien à attendre, on rouvre ici.
    if (etatDiffusion() !== 'diffusion' && etatDiffusion() !== 'connexion') await terminerDiffusion()
  }

  /** Retour à la lecture locale par l'adresse normale (cookie), position conservée (US-41 CA5). */
  async function terminerDiffusion() {
    if (!diffusionEnCours()) return
    if (debutDiffusionMs) {
      noter('diffusion:fin', detailsDiffusion(lectureEntree(props.entree), navigator.userAgent, (Date.now() - debutDiffusionMs) / 1000))
      debutDiffusionMs = 0
    }
    diffusion.vider()
    poserDiffusionEnCours(false)
  }

  async function arreterDiffusion() {
    if (etatDiffusion() === 'diffusion') {
      // Le navigateur propose « Arrêter la diffusion » ; s'il garde l'appareil, on reste télécommande.
      await diffusion.arreter().catch(() => {})
      if (etatDiffusion() === 'diffusion') return
    }
    await terminerDiffusion()
  }

  /** Navigateur sans Remote Playback (US-41 CA4) : le lien signé, absolu, dans le presse-papiers. */
  async function copierLien() {
    const lecture = lectureEntree(props.entree)
    poserLienEtat({ etat: 'demande' })
    try {
      const lien = await demanderLien(lecture, parametresDiffusion(reglagesTeleviseur(), qualite()))
      const absolu = lienAbsolu(lien.url)
      // Jamais le lien dans la télémétrie : seulement la ressource.
      noter('diffusion:lien-copie', detailsDiffusion(lecture, navigator.userAgent))
      try {
        await navigator.clipboard.writeText(absolu)
        poserLienEtat({ etat: 'copie', expire: lien.expire })
      } catch {
        poserLienEtat({ etat: 'affiche', lien: absolu, expire: lien.expire })
      }
    } catch (e) {
      poserLienEtat({ etat: 'erreur', message: `Lien de diffusion refusé : ${versErreurLecteur(e).message}` })
    }
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
      // Un refus du navigateur n'est pas une panne de lecture (B7) : rien ne se
      // rouvre, la lecture continue, on le dit discretement.
      noter('pip:refus', { detail: String(e).slice(0, 120) })
      notifier('Image dans l’image indisponible sur ce navigateur', 'limite')
    }
  }

  function basculerLecture() {
    // Pendant la préparation de la diffusion, un `play()` local chargerait le
    // lien signé ici même : interdit tant que l'appareil n'a pas la main (CA3).
    if (diffusionEnCours() && etatDiffusion() !== 'diffusion') return
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
    // Sans duree connue (remux sans `X-Mytv-Duree`), on ne plafonne pas : voir bornerPosition.
    const borne = bornerPosition(cible, duree())
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
    const borne = bornerPosition(cible, duree())
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

  /** Plein ecran du cadre, ou de la video sur WebKit iPhone (US-45 CA7, D4/B8). */
  function pleinEcran() {
    const api = basculerPleinEcran(cadre, video)
    if (api === 'aucune') notifier('Plein écran indisponible sur ce navigateur', 'limite')
  }

  // --- Telephone et tablette (US-45 CA6) : barre compacte, menu « ⋯ », gestes ------
  /** Hors bureau : seules les commandes essentielles dans la barre, le reste dans « ⋯ ». */
  const compact = () => !estBureau()
  const [menuOuvert, poserMenuOuvert] = createSignal(false)
  /** Telephone couche : la video prend toute la hauteur disponible. */
  const [paysage, poserPaysage] = createSignal(typeof matchMedia === 'function' && matchMedia('(orientation: landscape)').matches)
  onMount(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(orientation: landscape)')
    const f = () => poserPaysage(mq.matches)
    mq.addEventListener('change', f)
    onCleanup(() => mq.removeEventListener('change', f))
  })
  const immersif = () => compact() && paysage()
  /** La colonne de droite n'existe que si elle sert : zapping en direct, pistes quand il y a un CHOIX (CA9, B UX10). */
  const avecColonne = () => !immersif() && (direct() || pistes.pistesAudio().length > 1 || pistes.pistesTexte().length > 0)
  // « Ma liste » depuis le lecteur : la coque (contrat surMaListe), sinon la liste locale.
  const clesMaListe = useAVoirCles()
  const cleMaListe = () => (props.entree.type === 'series' ? props.entree.serie : props.entree.type === 'vod' ? props.entree.cle : undefined)
  const dansMaListe = () => props.dansMaListe ?? (cleMaListe() ? clesMaListe()?.has(cleMaListe()!) ?? false : false)
  function basculerMaListe() {
    if (props.surMaListe) return props.surMaListe()
    const cle = cleMaListe()
    if (!cle) return
    void basculerAVoir(cle).then((present) => notifier(present ? 'Ajouté à Ma liste · le serveur le prépare d’avance' : 'Retiré de Ma liste'))
  }
  /** Un tap sur l'image (hors bureau) montre ou cache les commandes ; un clic (bureau) met en pause. */
  let dernierTap = 0
  let coteDernierTap = ''
  let tapSimple: ReturnType<typeof setTimeout> | undefined
  function surSurface(e: MouseEvent) {
    if (menuOuvert()) return poserMenuOuvert(false)
    if (!compact()) return basculerLecture()
    const r = cadre.getBoundingClientRect()
    const cote = e.clientX < r.left + r.width / 3 ? 'gauche' : e.clientX > r.right - r.width / 3 ? 'droite' : 'centre'
    const maintenant = Date.now()
    if (maintenant - dernierTap < FENETRE_DOUBLE_TAP && cote === coteDernierTap && cote !== 'centre' && !direct()) {
      // Double-tap lateral : ±10 s (YouTube, Netflix) ; le tap simple en attente est annule.
      clearTimeout(tapSimple)
      tapSimple = undefined
      dernierTap = 0
      deplacer(cote === 'gauche' ? -10 : 10)
      return
    }
    dernierTap = maintenant
    coteDernierTap = cote
    clearTimeout(tapSimple)
    tapSimple = setTimeout(() => {
      tapSimple = undefined
      calques.basculerCommandes()
    }, FENETRE_DOUBLE_TAP)
  }
  onCleanup(() => clearTimeout(tapSimple))

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
      calques.diffusionOuverte() || calques.infosOuvertes() || calques.miniGuideOuvert() ||
      calques.rebours() !== null || calques.finEpisode() || fin() !== null ||
      variantesLecteur.ouvert() || menuOuvert(),
    reveiller: calques.reveiller,
    // Échap : ferme le calque ouvert — le décompte d'épisode suivant compris (US-43
    // CA4 : Échap l'annule) ; sinon quitte l'écran (la lecture continue).
    fermerCalque: () => {
      // Echap ferme d'abord TOUT calque ouvert (menu, variantes, diffusion, infos,
      // mini-guide, decompte, fin) avant de quitter (US-45 CA8, D7/B13).
      if (menuOuvert()) poserMenuOuvert(false)
      else if (variantesLecteur.ouvert()) variantesLecteur.poserOuvert(false)
      else if (fin() !== null) poserFin(null)
      else if (calques.diffusionOuverte() || calques.infosOuvertes() || calques.miniGuideOuvert() || calques.rebours() !== null || calques.finEpisode()) calques.fermerCalque()
      // Echap sans calque : quitter l'ecran (la lecture continue dans le mini-lecteur), ecran precedent (CA2).
      else revenir()
    },
    zapper: zapping.zapper,
    deplacer,
    basculerLecture,
    basculerMuet: () => (video.muted = !video.muted),
    basculerDiffusion: () => calques.poserDiffusionOuverte((v) => !v),
    basculerPleinEcran: pleinEcran,
    revenirDerniereChaine: zapping.revenirDerniereChaine,
    basculerMiniGuide: ouvrirMiniGuide,
    basculerInfos: ouvrirInfos,
    basculerVariantes: () => variantesLecteur.poserOuvert((v) => !v),
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

  /** Le menu « ⋯ » hors bureau : ce que la barre compacte ne porte pas (CA6, D2/E2). */
  const entreesMenu = (): EntreeMenuLecteur[] => [
    { icone: 'cast', libelle: 'Diffuser vers un téléviseur', actif: etatDiffusion() === 'diffusion', action: () => calques.poserDiffusionOuverte(true) },
    ...(!direct() && (pistes.pistesAudio().length > 1 || pistes.pistesTexte().length > 0)
      ? [{ icone: 'subtitles', libelle: 'Pistes et sous-titres', action: () => calques.poserInfosOuvertes(true) }]
      : []),
    ...(direct()
      ? [
          { icone: 'tv_guide', libelle: 'Mini-guide', actif: calques.miniGuideOuvert(), action: ouvrirMiniGuide },
          { icone: 'hd', libelle: 'Variantes de la chaîne', actif: variantesLecteur.ouvert(), action: () => variantesLecteur.poserOuvert(true) },
        ]
      : []),
    { icone: 'speed', libelle: `Qualité : ${LIBELLE_QUALITE_MODE[qualite()]}`, detail: qualite() === 'eco' ? 'repasser en Auto' : 'passer en Éco (débit réduit)', actif: qualite() === 'eco', action: basculerQualite },
    { icone: 'info_panel', libelle: direct() ? 'Informations sur le programme' : 'Informations', actif: calques.infosOuvertes(), action: ouvrirInfos },
    ...(modePipDisponible() !== 'indisponible' ? [{ icone: 'picture_in_picture_alt', libelle: 'Image dans l’image', actif: enPip(), action: () => void basculerPip() }] : []),
    ...(cleMaListe() ? [{ icone: dansMaListe() ? 'check' : 'add', libelle: dansMaListe() ? 'Retirer de Ma liste' : 'Ma liste', actif: dansMaListe(), action: basculerMaListe }] : []),
    { icone: 'close', libelle: 'Arrêter le flux', detail: 'libère la connexion', action: () => arreter() },
  ]

  const boutonsDroiteCompacts = (): BoutonControle[] => [
    { icone: 'more_horiz', libelle: 'Plus d’options', titre: 'Diffuser, pistes, qualité, infos, Ma liste, arrêter', actif: menuOuvert(), surAction: () => poserMenuOuvert((v) => !v) },
    { icone: 'fullscreen', libelle: 'Plein écran', titre: 'Plein écran (F)', surAction: pleinEcran },
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
          {
            icone: 'hd',
            libelle: 'Variantes de la chaîne',
            titre: 'Variantes de la chaîne : recommandation, choix, test (V)',
            actif: variantesLecteur.ouvert(),
            surAction: () => variantesLecteur.poserOuvert((v) => !v),
          },
        ]
      : []),
    {
      icone: 'speed',
      libelle: `Qualité : ${LIBELLE_QUALITE_MODE[qualite()]}`,
      titre: qualite() === 'eco' ? 'Qualité Éco (débit réduit) — repasser en Auto' : 'Qualité Auto — passer en Éco (débit réduit, pour une liaison lente)',
      actif: qualite() === 'eco',
      surAction: basculerQualite,
    },
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
    { icone: 'close', libelle: 'Arrêter le flux', titre: 'Arrêter le flux et libérer la connexion (retour à l’écran précédent)', surAction: () => arreter() },
    { icone: 'fullscreen', libelle: 'Plein écran', titre: 'Plein écran (F)', surAction: pleinEcran },
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
      direct() && modeServeur() && modeServeur() !== 'direct' ? BADGE_DIRECT[modeServeur()!] : null,
      direct() && forcageAffiche() ? `forcé ${forcageAffiche()}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const actionsErreur = (): ActionErreur[] => {
    const actions: ActionErreur[] = []
    // « Réessayer » d'abord, toujours (arbitrage lot 10) ; les MP4 en EAC3 sont
    // illisibles en navigateur mais décodés par les téléviseurs : la sortie est
    // dans le message, juste à côté.
    actions.push({
      libelle: 'Réessayer',
      principale: erreur()!.couche !== 'codec' || !diffusionSupportee(),
      surAction: () => {
        // Geste de l'utilisateur : le compte des conversions repart de zéro.
        etatTentatives = AUCUNE_TENTATIVE
        forcage = null
        panne.remettreAZero()
        poserErreur(null)
        panne.relancer()
      },
    })
    if (erreur()!.couche === 'codec' && diffusionSupportee())
      actions.push({ libelle: 'Diffuser vers le téléviseur', principale: true, surAction: () => void diffuser() })
    actions.push({ libelle: 'Retour', surAction: () => arreter() })
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
    erreur() ? (erreur()!.couche === 'fournisseur' ? 'Abonnement refusé' : 'Erreur de lecture') : chargement() ? 'Connexion…' : enPause() ? 'En pause' : undefined

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
          ? { 'grid-template-columns': avecColonne() ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)' }
          : immersif()
            ? { 'grid-template-columns': 'minmax(0,1fr)', 'grid-template-rows': 'minmax(0,1fr)' }
            : { 'grid-template-columns': 'minmax(0,1fr)', 'grid-template-rows': avecColonne() ? 'auto minmax(0,1fr)' : 'auto' }),
        height: '100%', 'min-height': 0, 'min-width': 0, outline: 'none',
        animation: 'fadein 200ms var(--ease)',
      }}
    >
      <div
        style={{
          display: 'grid', 'min-height': 0, 'min-width': 0,
          'grid-template-rows': estBureau() || immersif() ? 'minmax(0,1fr) auto' : 'auto auto',
        }}
      >
        <div
          ref={cadre}
          onMouseMove={compact() ? undefined : calques.reveiller}
          onDblClick={compact() ? undefined : pleinEcran}
          style={{
            position: 'relative', 'min-height': 0, overflow: 'hidden', background: 'var(--video)',
            // Empilé, la vidéo n'a plus de hauteur imposée par la grille : le
            // 16:9 la lui donne, plafonné pour qu'un téléphone droit garde sa
            // liste à l'écran. Couché, ou sans colonne, elle prend toute la hauteur (CA6).
            ...(estBureau() || immersif() ? {} : { 'aspect-ratio': '16 / 9', 'max-height': '56dvh', width: '100%' }),
            cursor: calques.commandesVisibles() ? undefined : 'none',
          }}
        >
          <Show when={generation()} keyed>
            {(_g) => (
              <video
                ref={brancherVideo}
                playsinline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'var(--video)' }}
              />
            )}
          </Show>

          {/* Identité du contenu tant qu'aucune image n'est arrivée : un carré
              noir ne dit pas si le flux est en route ou perdu. */}
          {/* Identité du contenu tant qu'aucune image n'est arrivée : un carré
              noir ne dit pas si le flux est en route ou perdu. L'adresse, elle,
              est reservee au panneau technique (CA9). */}
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
            </div>
          </Show>

          {/* Surface de gestes (CA6) : tap = commandes, double-tap lateral = ±10 s ; bureau : clic = pause. */}
          <div
            data-role="surface"
            onClick={surSurface}
            // Sans z-index : au-dessus de la video (qui la precede), sous tous les
            // calques et commandes (qui la suivent dans le document).
            style={{ position: 'absolute', inset: 0 }}
          />

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
              {/* Retour visible : avant, seule la croix (qui ARRÊTE le flux) permettait de
                  quitter l'écran, et depuis un épisode elle renvoyait à la liste de toutes
                  les séries. Ici la lecture continue dans le mini-lecteur. */}
              <button
                type="button"
                class="lecteur-retour"
                title="Retour (la lecture continue dans le mini-lecteur) — Échap"
                aria-label="Retour"
                onClick={revenir}
                style={{
                  display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', gap: '4px',
                  padding: '4px 8px', 'margin-right': '4px', border: '0', 'border-radius': '6px',
                  'min-width': compact() ? '44px' : undefined, 'min-height': compact() ? '44px' : undefined,
                  background: 'transparent', color: ENCRE, cursor: 'pointer', 'font-size': '13px',
                }}
              >
                <Icone nom="arrow_back" taille={18} />
                <Show when={!estMobile()}>Retour</Show>
              </button>
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

            {/* Gros bouton central lecture/pause, hors bureau (CA6). */}
            <Show when={compact() && !erreur() && !chargement()}>
              <button
                type="button"
                data-role="lecture-centrale"
                aria-label={enPause() ? 'Lecture' : 'Pause'}
                onClick={basculerLecture}
                style={{
                  position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                  width: '64px', height: '64px', 'border-radius': '50%', 'z-index': 2,
                  background: 'rgba(20,20,20,.72)', border: '1px solid rgba(255,255,255,.35)', color: ENCRE,
                  display: 'grid', 'place-items': 'center',
                }}
              >
                <Icone nom={enPause() ? 'play_arrow' : 'pause'} taille={36} plein />
              </button>
            </Show>
            <ControlesLecteur
              mode={direct() ? 'live' : 'vod'}
              compact={compact()}
              enPause={enPause()}
              muet={muet()}
              volume={volume()}
              position={position()}
              duree={duree()}
              indiceClavier={
                direct()
                  ? '↑ ↓ zapper · R dernière · G guide · V variantes · I infos'
                  : '← → 10 s · Espace pause · M muet · F favori · I infos'
              }
              gauche={boutonsGauche()}
              droite={compact() ? boutonsDroiteCompacts() : boutonsDroite()}
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
              <span data-role={conversion() || (direct() && attenteLongue()) ? 'conversion' : undefined} style={{ 'font-size': '12px', color: ENCRE2 }}>
                {conversion()
                  ? LIBELLE_CONVERSION[conversion()!]
                  : direct() && attenteLongue()
                  ? 'Démarrage de la chaîne (conversion possible)…'
                  : verification()
                  ? 'Vérification du film…'
                  : direct()
                    ? 'Ouverture du flux HLS…'
                    : 'Ouverture du fichier…'}
              </span>
            </div>
          </Show>

          <Show when={panne.reconnexion()}>
            {(r) => <BandeauReconnexion essai={r().essai} total={r().total} dans={r().dans} motif={r().motif} occupation={r().occupation} />}
          </Show>

          <Show when={calques.bandeau() > 0 && direct() && !erreur()}>
            <BandeauChaine
              entree={props.entree}
              programme={zapping.enCours()?.titre}
              horaire={horaireEnCours()}
            />
          </Show>

          <Show when={(calques.rebours() !== null || calques.finEpisode()) && suivantEnchaine()}>
            {(s) => (
              <ProchainEpisode
                titre={s().titre}
                repere={episodeSuivant()?.repere}
                titreEpisode={episodeSuivant()?.titre}
                vignette={episodeSuivant()?.image}
                restant={calques.rebours()}
                pret={s().pret}
                surLire={() => {
                  // Lu AVANT d'arreter le decompte : l'arret ferme ce `Show`, et
                  // son accesseur ne vaut plus rien ensuite (lecture perimee).
                  const suivant = s()
                  calques.arreterRebours()
                  calques.poserFinEpisode(false)
                  suivant.lire()
                }}
                surAnnuler={calques.annulerRebours}
                surRevenir={() => {
                  const serie = untrack(() => props.entree.serie)
                  arreter(serie ? `/serie/${serie}` : undefined)
                }}
              />
            )}
          </Show>

          <Show when={fin()}>
            {(f) => (
              <ProchainContenu
                fin={f().de}
                prochain={f().prochain ? { titre: f().prochain!.entree.nom, type: f().prochain!.entree.type, pret: f().prochain!.element.preparation?.etat === 'pret' } : undefined}
                surRegarder={() => {
                  // Lu avant de fermer le calque (voir « Lire maintenant »).
                  const entree = f().prochain!.entree
                  noter('enchainement:suivant', { de: props.entree.cle, vers: entree.cle, auto: false, liste: true })
                  enchainementVoulu = true
                  poserFin(null)
                  props.surSuivantListe?.(entree)
                }}
                surRevoir={() => {
                  poserFin(null)
                  cleTerminee = undefined
                  allerA(0)
                  void video.play().catch(() => {})
                }}
                surFermer={() => arreter()}
              />
            )}
          </Show>

          <Show when={menuOuvert()}>
            <MenuLecteur entrees={entreesMenu()} surFermer={() => poserMenuOuvert(false)} />
          </Show>

          <Show when={direct() && variantesLecteur.ouvert() && variantesLecteur.choix()}>
            {(c) => (
              <Variantes
                variantes={variantesLecteur.variantes()}
                choix={c()}
                cleLue={props.entree.cle}
                explication={variantesLecteur.explication()}
                testEnCours={variantesLecteur.testEnCours()}
                resultat={variantesLecteur.resultat()}
                surChoisir={variantesLecteur.choisir}
                surTester={() => void variantesLecteur.tester()}
                surAnnulerTest={variantesLecteur.annulerTest}
                surFermer={() => variantesLecteur.poserOuvert(false)}
              />
            )}
          </Show>

          <Show when={propositionEco() && !erreur()}>
            <div
              role="status"
              data-role="proposition-eco"
              style={{
                position: 'absolute', left: '50%', top: '64px', transform: 'translateX(-50%)',
                display: 'flex', 'align-items': 'center', gap: '10px', padding: '8px 12px',
                'border-radius': '8px', background: 'rgba(20,20,20,.9)', 'backdrop-filter': 'blur(18px)',
                border: '1px solid rgba(255,255,255,.14)', color: ENCRE, 'font-size': '13px', 'z-index': 5,
                animation: 'fadein var(--dur) var(--ease)',
              }}
            >
              <Icone nom="speed" taille={16} />
              <span>{MESSAGE_ECO}</span>
              <button type="button" onClick={passerEnEco} style={{ background: 'var(--vacc)', color: '#000', padding: '4px 10px', 'border-radius': '6px', 'font-weight': 'var(--w-strong)' }}>
                Passer en Éco
              </button>
              <button type="button" onClick={() => poserPropositionEco(false)} style={{ color: ENCRE2, padding: '4px 6px' }}>
                Non
              </button>
            </div>
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
                changer(e)
              }}
              surFermer={() => calques.poserMiniGuideOuvert(false)}
            />
          </Show>

          <Show when={calques.infosOuvertes()}>
            <PanneauInfos
              entree={props.entree}
              episode={episodeCourant()}
              categorie={zapping.nomCategorie()}
              enCours={zapping.enCours()}
              ensuite={zapping.ensuite()}
              flux={plan()}
              adresse={urlAffichee()}
              favori={direct() ? favori() : undefined}
              surFavori={direct() ? marquerFavori : undefined}
              surGuide={direct() ? () => poserEcran('guide') : undefined}
              surFermer={() => calques.poserInfosOuvertes(false)}
            />
          </Show>

          <Show when={calques.diffusionOuverte()}>
            <DialogueDiffusion
              etat={etatDiffusion()}
              supportee={diffusionSupportee()}
              lien={lienEtat()}
              surCopierLien={() => void copierLien()}
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

        <Show when={!immersif()}>
          <PiedLecteur
            entree={props.entree}
            direct={direct()}
            enCours={zapping.enCours()}
            ensuite={zapping.ensuite()}
            position={position()}
            duree={duree()}
            favori={favori()}
            surFavori={marquerFavori}
            maListe={cleMaListe() ? { present: dansMaListe(), basculer: basculerMaListe } : undefined}
          />
        </Show>
      </div>

      <Show when={avecColonne()}>
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
            surChoisir={changer}
          />
        </Show>
      </aside>
      </Show>

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
            surFermer={() => arreter()}
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
