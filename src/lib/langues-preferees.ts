import { db, type EntreeCatalogue, type TypeContenu } from './db'
import { analyserCategorie, langueDe, type FacettesCategorie } from './facettes'

// Langues affichées (Réglages > Catalogue) : un réglage du PROFIL, synchronisé entre ses
// appareils (clé `langues.preferees`, un ensemble). Il sert de point de départ au filtre
// « Langue » de Films et Séries (des pastilles qu'on retire d'un geste) et limite les rangées
// de l'Accueil (« récemment ajoutés », « À la une »). Rien de coché = tout. Ni « Reprendre »
// ni « Ma liste » ne sont filtrés : ce sont des choix de l'utilisateur.

export const CLE_LANGUES = 'langues.preferees'

export async function lireLangues(): Promise<string[]> {
  const r = await db.reglages.get(CLE_LANGUES)
  return Array.isArray(r?.valeur) ? (r.valeur as string[]).filter((x) => typeof x === 'string') : []
}

/** Écrit la préférence, périme ce qui en dépend et demande une synchronisation. */
export async function ecrireLangues(langues: string[]): Promise<void> {
  await db.reglages.put({ cle: CLE_LANGUES, valeur: [...new Set(langues)].sort() })
  const { invaliderLangues } = await import('./requetes')
  await invaliderLangues()
  const { planifierGeste } = await import('./synchro')
  planifierGeste()
}

/**
 * Prédicat « ce titre est-il dans les langues du profil ? », ou `null` quand rien n'est
 * choisi. Même règle de langue que les facettes (préfixe du titre, sinon catégorie).
 */
export async function filtreLangues(type: TypeContenu): Promise<((e: EntreeCatalogue) => boolean) | null> {
  const langues = new Set(await lireLangues())
  if (langues.size === 0) return null
  const parCategorie = new Map<string, FacettesCategorie>()
  for (const c of await db.categories.where('type').equals(type).toArray()) parCategorie.set(c.id, analyserCategorie(c.nom))
  return (e) => {
    const l = langueDe(e, e.categorie ? parCategorie.get(e.categorie) : undefined)
    return l !== undefined && langues.has(l)
  }
}
