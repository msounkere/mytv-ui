// STUB ui-6 (contrat ui-8, US-47 CA2 / ui-8.info-ui6 §4) : REMPLACE a la fusion par
//   import { ouvrirGroupe } from '../parcours/ouverture'
//   import { indiceGroupeActif } from '../../lib/direct-tri'
// Meme contrat que les fonctions d'ui-8 : ouvrir un GROUPE de variantes par la
// variante recommandee pour la liaison (lib/fluidite), et retrouver le groupe courant.
import { capacitesAnnoncees } from '../../lib/capacites'
import type { EntreeCatalogue } from '../../lib/db'
import { choisirVariante, choixMemorise, classeDebit, debitLecteurMbps, preparerVariantes, scoresPour } from '../../lib/fluidite'
import type { Groupe } from '../../lib/variantes'
import { sonde } from '../../sonde-debit'

function debitConnuMbps(): number | undefined {
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
    // Sans base ni note, le representant fait l'affaire.
  }
  surOuvrir(entree)
}

export function indiceGroupeActif(groupes: readonly { variantes: readonly { cle?: string }[] }[], cle: string): number {
  return groupes.findIndex((g) => g.variantes.some((v) => v.cle === cle))
}
