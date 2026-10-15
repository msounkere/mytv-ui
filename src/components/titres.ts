// Le relais encode les métadonnées dans le libellé : « The Guest (2025) (US) »,
// « Verity (TELESYNC) (2026) ». Les maquettes montrent un titre nu et l'année
// dans la ligne de métadonnées ; on sépare donc les deux à l'affichage, sans
// jamais toucher au nom stocké — c'est lui qui sert à la recherche.

/** Suffixes parenthésés sans valeur dans un titre : année, pays, source. */
const SUFFIXE = /\s*[([](?:(?:19|20)\d{2}|[A-Z]{2,3}|TELESYNC|TS|CAM|HDCAM|MULTI|VOSTFR|VF|VO)[)\]]\s*$/

export function titreCourt(nom: string): string {
  let t = nom.trim()
  // Plusieurs suffixes peuvent s'enchaîner : on les retire jusqu'au dernier.
  for (let i = 0; i < 4 && SUFFIXE.test(t); i++) t = t.replace(SUFFIXE, '').trim()
  return t || nom
}

/** Année portée par le titre : 92 % des films du relais l'affichent « (2025) ». */
export function anneeDuTitre(nom: string): string | undefined {
  const m = /[([]((?:19|20)\d{2})[)\]]/.exec(nom)
  return m?.[1]
}
