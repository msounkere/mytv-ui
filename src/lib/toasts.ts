import { createSignal } from 'solid-js'

// File de toasts (lot 10, US-46 CA4) : un seul a la fois, 4 s, 6 s quand il
// porte « Annuler ». Tout geste de liste ou de progression passe par ici --
// l'utilisateur voit ce qui vient de se passer et peut le defaire. Le coeur
// (`creerFileToasts`) est PUR pour se tester sous node ; le signal Solid
// n'est qu'une enveloppe au-dessus.

export const DUREE_TOAST = 4000
export const DUREE_TOAST_ANNULABLE = 6000

export type TonToast = 'ok' | 'info' | 'erreur'

export interface DemandeToast {
  message: string
  ton?: TonToast
  /** Libelle du bouton d'action ; `Annuler` par defaut quand `action` est donnee. */
  libelleAction?: string
  /** Le geste inverse (PUT / DELETE / reprise) ou « Réessayer ». */
  action?: () => void | Promise<void>
  /** Duree imposee ; sinon 4 s, ou 6 s avec une action. */
  dureeMs?: number
}

export interface Toast extends DemandeToast {
  id: number
  dureeMs: number
}

export interface FileToasts {
  courant: () => Toast | undefined
  /** Ajoute en file ; renvoie l'identifiant. */
  emettre: (d: DemandeToast) => number
  /** Ferme le toast `id` (ou le courant) et passe au suivant. */
  fermer: (id?: number) => void
  /** Execute l'action du toast courant puis le ferme. */
  agir: () => Promise<void>
  /** Suspend le minuteur (survol, focus) et le relance. */
  suspendre: () => void
  reprendre: () => void
  /** Vide tout (changement de profil, deconnexion). */
  vider: () => void
}

/**
 * @param surChangement appele a chaque changement du toast courant
 * @param minuteur injectable pour les tests (setTimeout / clearTimeout par defaut)
 */
export function creerFileToasts(
  surChangement: (t: Toast | undefined) => void = () => {},
  minuteur: { poser: (f: () => void, ms: number) => unknown; lever: (h: unknown) => void } = {
    poser: (f, ms) => setTimeout(f, ms),
    lever: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): FileToasts {
  const file: Toast[] = []
  let courant: Toast | undefined
  let handle: unknown
  let numero = 0
  let suspendu = false

  const armer = () => {
    if (handle !== undefined) minuteur.lever(handle)
    handle = undefined
    if (!courant || suspendu) return
    const id = courant.id
    handle = minuteur.poser(() => {
      handle = undefined
      if (courant?.id === id) fermer(id)
    }, courant.dureeMs)
  }
  const afficher = () => {
    courant = file.shift()
    surChangement(courant)
    armer()
  }
  const fermer = (id?: number) => {
    if (!courant) return
    if (id !== undefined && id !== courant.id) {
      const i = file.findIndex((t) => t.id === id)
      if (i >= 0) file.splice(i, 1)
      return
    }
    afficher()
  }
  return {
    courant: () => courant,
    emettre(d) {
      numero += 1
      const t: Toast = { ...d, id: numero, dureeMs: d.dureeMs ?? (d.action ? DUREE_TOAST_ANNULABLE : DUREE_TOAST) }
      // Un nouveau geste REMPLACE le toast affiche (snackbar Material) : le faire
      // attendre derriere le precedent (jusqu'a 6 s) rendait « Annuler » trompeur,
      // le bouton visible defaisait encore le geste d'avant (fiche serie, US-45 CA4).
      file.length = 0
      file.push(t)
      afficher()
      return t.id
    },
    fermer,
    async agir() {
      const t = courant
      if (!t) return
      fermer(t.id)
      if (t.action) await t.action()
    },
    suspendre() {
      suspendu = true
      if (handle !== undefined) minuteur.lever(handle)
      handle = undefined
    },
    reprendre() {
      suspendu = false
      armer()
    },
    vider() {
      file.length = 0
      if (handle !== undefined) minuteur.lever(handle)
      handle = undefined
      courant = undefined
      surChangement(undefined)
    },
  }
}

// --- Instance de l'application ------------------------------------------------

const [toastCourant, poserToastCourant] = createSignal<Toast | undefined>(undefined)
const file = creerFileToasts(poserToastCourant)

export { toastCourant }

/** Emet un toast ; n'importe quel module peut l'appeler (gestes de `ma-liste.ts`, `preferences.ts`, synchro). */
export function emettreToast(d: DemandeToast): number {
  // L'hote est garanti : s'il n'est monte nulle part, il l'est ici (import a la
  // demande : Toast.tsx importe ce module).
  if (typeof document !== 'undefined') void import('../components/Toast').then((m) => m.assurerHoteToasts()).catch(() => undefined)
  return file.emettre(d)
}

export const fermerToast = (id?: number) => file.fermer(id)
export const agirToast = () => file.agir()
export const suspendreToast = () => file.suspendre()
export const reprendreToast = () => file.reprendre()
export const viderToasts = () => file.vider()

// --- Textes des gestes (rapport C §5.4 / §5.5) ---------------------------------

export const TEXTES_TOAST = {
  ajoutMaListe: (titre: string) => `${titre} · ajouté à Ma liste · préparation d’avance sur le serveur`,
  retraitMaListe: (titre: string) => `${titre} · retiré de Ma liste`,
  vuRetireMaListe: (titre: string) => `✓ Vu · ${titre} retiré de Ma liste`,
  serieTermineeRetiree: (titre: string) => `✓ Série terminée · ${titre} retirée de Ma liste`,
  retireAilleurs: (titre: string) => `${titre} · retiré de Ma liste depuis un autre appareil`,
  marqueVu: (titre: string) => `✓ ${titre} marqué comme vu`,
  marqueNonVu: (titre: string) => `${titre} marqué comme non vu`,
  episodeVu: (repere: string, suivant: string | undefined) =>
    suivant ? `✓ ${repere} marqué vu · Reprendre passe à ${suivant}` : `✓ ${repere} marqué vu · série terminée`,
  retireDeReprendre: (titre: string) => `${titre} · retiré de Reprendre`,
  echecPreparation: (titre: string) => `Échec de préparation : ${titre}`,
  horsLigne: 'Hors ligne · sera envoyé au retour du réseau',
} as const
