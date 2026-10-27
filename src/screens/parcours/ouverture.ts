import { capacitesAnnoncees } from '../../lib/capacites'
import type { EntreeCatalogue } from '../../lib/db'
import { choisirVariante, choixMemorise, classeDebit, debitLecteurMbps, preparerVariantes, scoresPour } from '../../lib/fluidite'
import type { Groupe } from '../../lib/variantes'
import { sonde } from '../../sonde-debit'

// Ouvrir un GROUPE depuis une liste (US-39 CA3) : la variante recommandée pour
// cette liaison — meilleure note dans la classe de débit courante, parmi celles
// que le navigateur lit — ou le choix explicite retenu pour le groupe. La
// télémétrie `recommandation:choix` est notée par le lecteur, qui voit ce qui
// est finalement lu (CA5).

/** Débit courant : mesuré par le lecteur sur un segment récent, sinon par la sonde. */
export function debitConnuMbps(): number | undefined {
  const d = debitLecteurMbps()
  if (d !== undefined) return d
  const s = sonde()
  return s.etat === 'ok' ? s.mesure.debit : undefined
}

export async function ouvrirGroupe(g: Groupe<EntreeCatalogue>, surOuvrir: (e: EntreeCatalogue) => void): Promise<void> {
  if (g.variantes.length <= 1) return surOuvrir(g.representant)
  const debit = debitConnuMbps()
  let entree = g.representant
  try {
    const scores = await scoresPour(g.variantes, { classe: classeDebit(debit) })
    const choix = choisirVariante(preparerVariantes(g.variantes, scores), {
      capHevc: capacitesAnnoncees().includes('hevc'), debitMbps: debit, choixExplicite: choixMemorise(g.cle),
    })
    entree = choix.choisie.entree
  } catch {
    // Sans base ni note, le représentant fait l'affaire.
  }
  surOuvrir(entree)
}
