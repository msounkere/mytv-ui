// La maquette ne dispose d'aucune image : elle dérive une teinte stable du nom
// et peint une plaque. Le catalogue réel, lui, n'a de logo que pour une partie
// des entrées — on garde donc la plaque comme fond permanent, l'image ne venant
// que par-dessus. Même fonction de hachage que SubstitutLogo, pour qu'une même
// chaîne ait la même couleur partout.

export function teinte(nom: string): number {
  let h = 0
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360
  return h
}

/** Fond de vignette 16/9 ou d'affiche, relevé sur la maquette. */
export function plaque(nom: string): string {
  return `oklch(0.34 0.07 ${teinte(nom)})`
}

/** Texte sur `plaque()`, assez clair pour rester lisible. */
export function plaqueTexte(nom: string): string {
  return `oklch(0.95 0.03 ${teinte(nom)})`
}

/** Monogramme de chaîne : encre colorée sur la plaque blanche `--plate`. */
export function encreLogo(nom: string): string {
  return `oklch(0.48 0.16 ${teinte(nom)})`
}

/**
 * Premier mot significatif du nom, tel que la maquette l'affiche dans le logo.
 * Les relais préfixent les chaînes de marqueurs techniques — « |4K| TF1 »,
 * « [EU] … » — qui ne distinguent rien : les retirer avant de choisir le mot
 * évite une plaque pleine de « 4K ».
 */
export function monogramme(nom: string): string {
  const propre = nom.replace(/[|[(][^|\])]*[|\])]/g, ' ').trim() || nom
  const mots = propre.split(/\s+/).filter(Boolean)
  const premier = (mots[0] ?? '').replace(/[^\p{L}\p{N}+']/gu, '')
  const texte = premier.length <= 2 && mots[1] ? `${premier} ${mots[1]}` : premier
  return texte.slice(0, 8) || '?'
}

/** Corps du monogramme : la plaque fait 44 px, le texte doit y tenir sans coupe. */
export function tailleMonogramme(texte: string): string {
  if (texte.length > 7) return '8px'
  if (texte.length > 5) return '9px'
  return texte.length > 4 ? '11px' : '13px'
}
