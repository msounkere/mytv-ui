// Libelles du fournisseur : fonctions pures, sans reseau, partagees entre le
// worker d'import (qui derive le pays au moment d'ecrire) et les ecrans.

/**
 * Les libelles arrivent prefixes par le pays : « FR - TF1 », « |EU| Canal+ ».
 * Le brief demande de traiter le pays comme une etiquette distincte. Le serveur
 * garantit des noms BRUTS (contrat) : c'est donc ici, et pas chez lui, que le
 * prefixe se separe.
 */
const PREFIXE = /^\s*(?:\|([A-Z]{2,4})\||([A-Z]{2,4})\s*[-:])\s*/

export function separerPrefixe(nom: string): { pays?: string; titre: string } {
  const m = PREFIXE.exec(nom)
  if (!m) return { titre: nom.trim() }
  return { pays: m[1] ?? m[2], titre: nom.slice(m[0].length).trim() }
}

/**
 * Les navigateurs ne decodent pas EAC3 : le brief impose de l anticiper plutot
 * que d echouer en lecture.
 */
const AUDIO_NON_LISIBLE = /^(eac3|ac3|dts|truehd)$/i

export function audioLisible(codec: string | undefined): boolean {
  return !codec || !AUDIO_NON_LISIBLE.test(codec.trim())
}
