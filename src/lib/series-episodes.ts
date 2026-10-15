// Serie parente des episodes en cours de lecture.
//
// Le serveur range l'historique d'un episode sous sa serie et REFUSE l'ecriture
// sans elle ; le lecteur, lui, ne connait que la cle de l'episode. La fiche
// serie (seule a savoir) la declare ici avant le lancement. Module a part pour
// que `preferences.ts` (qui ecrit) et `synchro.ts` (qui envoie) le partagent
// sans s'importer l'un l'autre.

const series = new Map<string, string>()

export function associerSerie(episode: string, serie: string): void {
  series.set(episode, serie)
}

export function serieAssociee(episode: string): string | undefined {
  return series.get(episode)
}
