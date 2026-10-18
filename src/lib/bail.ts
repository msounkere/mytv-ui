import { signalerSiNonAuthentifie } from './session-expiree'

// Rendre la place du fournisseur quand on a fini de lire un direct.
//
// POURQUOI ce module existe : le fournisseur n'accorde qu'UNE connexion. Le
// serveur ne rend la place d'un direct que de DEUX facons : l'appel explicite
// `POST /live/{chaine}/fin` fait ici, ou l'expiration de son bail (90 s). Il ne
// la rend PLUS quand une requete de segment en vol est annulee : hls.js annule
// des segments pour ses propres raisons (changement de niveau, saut, purge de
// tampon, delai) sans que le spectateur ait quitte la chaine, et rendre la place
// a ce moment laissait une autre session la prendre — la lecture se coupait.
// Sans cet appel, fermer le lecteur laisserait donc la place prise pendant plus
// d'une minute, et le contenu suivant se heurterait a un 503.
//
// CE QUI DOIT PASSER PAR ICI, et comment : fermer le lecteur (la croix) et
// changer de contenu detachent le flux (`lecteur.ts`), qui appelle
// `lectureArretee` ; ouvrir quoi que ce soit (direct ou film) appelle
// `lectureOuverte`, qui annule une fin en attente ; fermer l'onglet passe par
// `pagehide` et `fermeturePage`, en `keepalive`. « Retour » n'y passe pas : la
// lecture continue dans le mini-lecteur, la place reste a nous.
//
// POURQUOI l'appel est DIFFERE : zapper ferme une chaine puis en ouvre une
// autre, et le serveur ne rend la place que si la session lit « encore » la
// chaine fermee. Si l'appel arrivait avant la premiere requete de la nouvelle
// chaine, il libererait la place... que la nouvelle chaine vient justement
// reprendre — et le fournisseur, qui ne l'oublie qu'apres ~100 s, refuserait
// la reprise. On attend donc un instant ; toute nouvelle ouverture annule.

/** Delai pendant lequel une nouvelle ouverture peut encore annuler la fin. */
export const DELAI_FIN_MS = 1500

type Minuteur = ReturnType<typeof setTimeout>

export interface DependancesBail {
  fetch: typeof fetch
  setTimeout: (f: () => void, ms: number) => Minuteur
  clearTimeout: (m: Minuteur) => void
}

export function creerBail(dep: DependancesBail) {
  let minuteur: Minuteur | undefined
  /** Fin programmee, pas encore partie. */
  let enAttente: string | undefined
  /** Direct actuellement ouvert : c'est lui qu'une fermeture de page doit rendre. */
  let courante: string | undefined

  /** Envoi sans attente. `keepalive` le laisse partir meme si la page se ferme. */
  function envoyerFin(chaine: string): void {
    void dep
      .fetch(`/api/v1/live/${encodeURIComponent(chaine)}/fin`, {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
      })
      .then((r) => signalerSiNonAuthentifie(r.status))
      // Un echec n'est pas grave : le bail expirera de lui-meme.
      .catch(() => {})
  }

  function annulerFin(): void {
    if (minuteur !== undefined) dep.clearTimeout(minuteur)
    minuteur = undefined
    enAttente = undefined
  }

  return {
    /**
     * Une lecture s'ouvre (direct ou film) : elle reprend la place, il n'y a plus
     * rien a rendre. `chaine` n'est donnee que pour un direct.
     */
    lectureOuverte(chaine?: string): void {
      annulerFin()
      courante = chaine
    },
    /** Le lecteur a lache cette chaine : la fin partira si rien ne la remplace. */
    lectureArretee(chaine: string): void {
      annulerFin()
      if (courante === chaine) courante = undefined
      enAttente = chaine
      minuteur = dep.setTimeout(() => {
        const c = enAttente
        minuteur = undefined
        enAttente = undefined
        if (c) envoyerFin(c)
      }, DELAI_FIN_MS)
    },
    /** Une ouverture est en route (sonde, attente) : elle annule la fin differee. */
    annulerFin,
    /** La page se ferme : plus le temps d'attendre, et le direct ouvert est rendu aussi. */
    fermeturePage(): void {
      const c = enAttente ?? courante
      annulerFin()
      courante = undefined
      if (c) envoyerFin(c)
    },
    enAttente: () => enAttente,
    courante: () => courante,
  }
}

const bailGlobal = creerBail({
  fetch: (...a) => fetch(...a),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: (m) => clearTimeout(m),
})

export const lectureOuverte = bailGlobal.lectureOuverte
export const lectureArretee = bailGlobal.lectureArretee
export const annulerFinDifferee = bailGlobal.annulerFin

if (typeof addEventListener === 'function')
  addEventListener('pagehide', () => bailGlobal.fermeturePage())
