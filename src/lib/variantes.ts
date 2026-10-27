// Regroupement des VARIANTES d'une chaine (US-39 CA1). Le fournisseur liste la
// meme chaine plusieurs fois — « FR - TF1 », « FR - TF1 HD », « FR - TF1 FHD ◉ »,
// « FR - TF1 4K », « FR - TF1 HEVC » — souvent dans des categories differentes
// (« FRANCE 4K », « FRANCE HEVC »). Pour le spectateur c'est UNE chaine avec
// plusieurs facons de la regarder ; pour la recommandation (fluidite.ts) ce sont
// des candidates a departager. Ce module est PUR : aucune base, aucun reseau.
//
// Cle de groupe : le nom normalise (minuscules, sans accents, sans prefixe
// pays, sans marqueur de qualite, sans decoration), la ponctuation ramenee a
// une espace. « +1 » est conserve (« TF1 +1 » n'est pas « TF1 »), comme
// « canal plus » qui garde son « plus ».

import type { EntreeCatalogue } from './db'

/** Definition annoncee par le nom. `inconnue` : aucun marqueur (souvent de la HD). */
export type Qualite = '4K' | 'FHD' | 'HD' | 'SD' | 'inconnue'

/**
 * Prefixe de pays ou de source que les fournisseurs collent devant un nom :
 * « FR - », « FR: », « |FR| », « [BE] », « USA - », « 8K - ». Meme regle que
 * `separerPrefixe` (libelles.ts) : un code court suivi d'un separateur. « TV5
 * MONDE » n'en a pas (pas de separateur apres « TV5 »).
 */
const PREFIXE_PAYS = /^[\s|[(#]*[a-z0-9]{2,4}\s*(?:[:|/-]|\]|\))[\s|:/\-\])]*/

/** Marqueurs de qualite et techniques, comme MOTS ENTIERS (« HD » mais pas « HDTV5 »). */
const MOTS_QUALITE = new Set([
  'hd', 'fhd', 'uhd', 'sd', '4k', '8k', 'hevc', 'h265', 'h264', 'x265', 'raw', '50fps', '60fps',
  'fullhd', 'hq', 'lq', 'multisub', 'backup', 'bak', '1080p', '720p', '576p', '480p',
])

/**
 * Minuscules, compatibilite Unicode (« ᴴᴰ » devient « hd », « ◉ » et « • »
 * deviennent des symboles que l'on jette), sans accents.
 */
function replier(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Mots du nom, apres repli : lettres et chiffres seulement, « + » devenu « plus ». */
function mots(nom: string): string[] {
  const sans = replier(nom).replace(PREFIXE_PAYS, '')
  return sans
    .replace(/\+/g, ' plus ')
    // Lettres de tout alphabet : un nom arabe ou cyrillique ne doit pas se vider.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
}

/** Cle de groupe d'un nom de chaine : identique pour toutes ses variantes. */
export function cleGroupe(nom: string): string {
  return mots(nom).filter((m) => !MOTS_QUALITE.has(m)).join(' ')
}

/**
 * Cle de groupe d'une ENTREE du catalogue : le pays (etiquette que l'import a
 * separee du nom) puis le nom normalise. Le prefixe est retire du nom pour le
 * reconnaitre, mais « FR - TF1 » et « BE - TF1 HD » ne sont pas la meme chaine
 * (autre flux, autre programme) : le pays reste dans la cle. Sans pays, la cle
 * ne porte que le nom.
 */
export function cleGroupeEntree(e: { nom: string; pays?: string }): string {
  const nom = cleGroupe(e.nom) || replier(e.nom).trim()
  return e.pays ? `${e.pays.toLowerCase()}|${nom}` : nom
}

/** Definition annoncee par le nom (le marqueur le plus haut l'emporte : « UHD HD » est de la 4K). */
export function qualiteDe(nom: string): Qualite {
  const m = new Set(mots(nom))
  if (m.has('4k') || m.has('uhd')) return '4K'
  if (m.has('fhd') || m.has('fullhd') || m.has('1080p')) return 'FHD'
  if (m.has('hd') || m.has('720p')) return 'HD'
  if (m.has('sd') || m.has('576p') || m.has('480p') || m.has('lq')) return 'SD'
  return 'inconnue'
}

/** Le nom annonce-t-il un flux HEVC (H.265) ? Une 4K l'est en pratique toujours. */
export function annonceHevc(nom: string): boolean {
  const m = new Set(mots(nom))
  return m.has('hevc') || m.has('h265') || m.has('x265') || qualiteDe(nom) === '4K'
}

/** Rang de definition, pour trier et choisir : 4K > FHD > HD > inconnue > SD. */
export const RANG_QUALITE: Record<Qualite, number> = { '4K': 4, FHD: 3, HD: 2, inconnue: 1.5, SD: 1 }

export const LIBELLE_QUALITE: Record<Qualite, string> = { '4K': '4K', FHD: 'FHD', HD: 'HD', SD: 'SD', inconnue: 'standard' }

export interface Groupe<E extends { nom: string } = EntreeCatalogue> {
  cle: string
  /** Nom affiche : la variante au nom le plus court (« TF1 » plutot que « TF1 FHD ◉ »). */
  nom: string
  /** Toutes les variantes, de la plus haute definition a la plus basse. */
  variantes: E[]
  /** L'entree qui represente le groupe dans une liste (la premiere rencontree). */
  representant: E
}

function comparerDefinition(a: { nom: string }, b: { nom: string }): number {
  return RANG_QUALITE[qualiteDe(b.nom)] - RANG_QUALITE[qualiteDe(a.nom)] || a.nom.localeCompare(b.nom, 'fr')
}

/**
 * Regroupe une liste d'entrees par nom normalise, dans l'ORDRE de la liste (le
 * groupe apparait la ou sa premiere variante etait). Une chaine sans variante
 * forme un groupe d'une seule entree, telle quelle.
 */
export function grouperVariantes<E extends { nom: string; cle?: string; pays?: string }>(entrees: readonly E[]): Groupe<E>[] {
  const groupes = new Map<string, Groupe<E>>()
  for (const e of entrees) {
    const cle = cleGroupeEntree(e)
    const g = groupes.get(cle)
    if (!g) {
      groupes.set(cle, { cle, nom: e.nom, variantes: [e], representant: e })
      continue
    }
    // Deux entrees identiques (meme cle de catalogue) ne font qu'une variante.
    if (e.cle !== undefined && g.variantes.some((v) => v.cle === e.cle)) continue
    g.variantes.push(e)
    if (e.nom.length < g.nom.length) g.nom = e.nom
  }
  for (const g of groupes.values()) g.variantes.sort(comparerDefinition)
  return [...groupes.values()]
}

/** Qualites presentes dans un groupe, sans doublon, de la plus haute a la plus basse. */
export function qualitesDuGroupe(g: Groupe<{ nom: string }>): Qualite[] {
  const vues = new Set<Qualite>()
  for (const v of g.variantes) vues.add(qualiteDe(v.nom))
  return [...vues].sort((a, b) => RANG_QUALITE[b] - RANG_QUALITE[a])
}
