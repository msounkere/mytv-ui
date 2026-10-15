// Ce que le lecteur MONTRE de la source qu'il lit. L'adresse elle-meme vient du
// serveur (champ `lecture` de l'API, voir `lib/source-lecture`) : plus rien ici
// ne fabrique une URL de flux, et plus rien n'y cache un identifiant.

/**
 * Adresse affichee sous le logo pour diagnostiquer. Les adresses du serveur ne
 * portent aucun secret (la session est un cookie) ; on retire malgre tout la
 * requete et le jeton d'un segment, pour qu'une capture d'ecran n'en montre pas.
 */
export function urlMasquee(brute: string): string {
  try {
    const u = new URL(brute, location.origin)
    return u.host + u.pathname.replace(/(\/seg\/)[^/]+/, '$1…')
  } catch {
    return ''
  }
}
