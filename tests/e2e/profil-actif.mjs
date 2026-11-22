// Attendre que le profil soit ACTIVE avant d'ecrire l'etat local d'un test.
//
// POURQUOI : l'import du catalogue demarre des la connexion, AVANT la creation/activation du
// profil ; l'activation vide ensuite l'etat personnel local (auth.ts, cloisonner : favoris,
// historique, reprises). Un test qui n'attendait que la fin de l'import pouvait semer ses
// reprises juste avant ce nettoyage et les voir disparaitre (« Reprendre » absent : us46 et
// us45-fiches rouges en CI, deux fois de suite, en novembre 2026 ; reproduit en retardant
// PUT /compte/profil-actif de 3 s). La synchronisation part juste APRES le nettoyage et
// commence par GET /profil/historique : sa presence prouve que le nettoyage est passe.
export function profilSynchronise(serveur) {
  return serveur.etat.requetes.some((r) => r.methode === 'GET' && r.chemin === '/api/v1/profil/historique')
}
