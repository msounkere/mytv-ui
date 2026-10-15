// Un 401 venu de la lecture, de l'EPG ou de la telemetrie veut dire « plus de
// session ». Ce module ne decide pas de ce qu'on en fait : la couche d'auth
// (auth.ts) ecoute cet evenement et ramene a l'ecran de connexion. Passer par
// un evenement DOM evite que la lecture importe l'auth (et inversement), et
// laisse la lecture testable sans elle.

export const EVENEMENT_SESSION_EXPIREE = 'mytv:session-expiree'

/** Prevenir l'application que le serveur ne reconnait plus la session. */
export function signalerSessionExpiree(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENEMENT_SESSION_EXPIREE))
}

/** Commode aux sites d'appel : ne fait rien tant que le statut n'est pas 401. */
export function signalerSiNonAuthentifie(statut: number): void {
  if (statut === 401) signalerSessionExpiree()
}
