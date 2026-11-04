// Regles PURES de la fin de lecture (US-45 CA5) : le decompte « Episode suivant »
// et ce qui se montre a la vraie fin. Sans reactivite : testees sous node, et
// appelees par `calques.ts` (le decompte) et par le lecteur (le calque de fin).

/** Un tic de decompte. En pause, rien ne bouge : l'utilisateur a suspendu, rien ne demarre dans son dos (B10). */
export function avancerDecompte(restant: number, enPause: boolean): { restant: number; lancer: boolean } {
  if (enPause) return { restant, lancer: false }
  if (restant > 1) return { restant: restant - 1, lancer: false }
  return { restant: 0, lancer: true }
}

export type CalqueFinEpisode = 'decompte' | 'persistant' | 'aucun'

/**
 * A la vraie fin d'un episode : le decompte s'il n'a pas ete refuse ; sinon le
 * calque PERSISTANT sans decompte (« Episode suivant · Lire / Revenir a la
 * serie ») plutot qu'une image figee (C6) ; rien sans episode suivant (le
 * lecteur passe alors au calque de fin de serie).
 */
export function calqueFinEpisode(o: { suivant: boolean; refuse: boolean }): CalqueFinEpisode {
  if (!o.suivant) return 'aucun'
  return o.refuse ? 'persistant' : 'decompte'
}

export interface FinContenu {
  de: 'film' | 'serie'
  titre: 'Film terminé ✓' | 'Série terminée ✓'
  /** Cle a chercher dans Ma liste pour le « prochain » : la SERIE d'un episode, pas l'episode (B11). */
  chercherApres: string
}

export function finContenu(entree: { cle: string; type: 'vod' | 'series' | 'live'; serie?: string }): FinContenu {
  if (entree.type === 'series') return { de: 'serie', titre: 'Série terminée ✓', chercherApres: entree.serie ?? entree.cle }
  return { de: 'film', titre: 'Film terminé ✓', chercherApres: entree.cle }
}

/** Le prochain propose ne doit jamais etre ce que l'on vient de finir (ni l'episode, ni sa serie). */
export function prochainAcceptable(prochain: { cle: string } | undefined, entree: { cle: string; serie?: string }): boolean {
  return !!prochain && prochain.cle !== entree.cle && prochain.cle !== entree.serie
}
