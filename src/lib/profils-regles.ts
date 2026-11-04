// Regles pures autour des profils et de la session (US-47 CA4 / CA5), testees
// sous node ; `auth.ts` les applique.

export interface ProfilNomme {
  nom: string
}

/** Deux profils ne portent pas le meme nom (casse et espaces ignores) : audit A bug 14. */
export function nomProfilDisponible(existants: readonly ProfilNomme[], nom: string): boolean {
  const n = nom.trim().toLocaleLowerCase('fr')
  return n.length > 0 && !existants.some((p) => p.nom.trim().toLocaleLowerCase('fr') === n)
}

export const MESSAGE_PROFIL_EXISTANT = 'Un profil porte déjà ce nom. Choisissez-en un autre.'

/**
 * Ou revenir apres une session expiree : l'ecran d'origine, sauf une lecture,
 * qui rouvrirait un flux toute seule (une coupure pour celui qui regarde sur un
 * abonnement a une connexion) : elle devient l'accueil.
 */
export function cheminApresExpiration(chemin: string): string {
  return /^\/lecture\//.test(chemin) ? '/' : chemin
}
