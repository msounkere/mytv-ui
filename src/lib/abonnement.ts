import { createSignal } from 'solid-js'
import { json } from './api'
import { dateLongue } from './errors'

// Etat du compte fournisseur, pour l'ADMINISTRATEUR seulement : le bandeau le
// previent de l'approche de l'expiration (ou d'un compte deja refuse) avant qu'un
// utilisateur ne tombe sur un lecteur muet. Le serveur calcule tout
// (`GET /admin/fournisseurs`, user_info du fournisseur) ; l'interface ne fait que
// montrer, et ne contacte jamais le fournisseur.

/** Une ligne de `GET /api/v1/admin/fournisseurs` (schema EtatFournisseurs). */
export interface EtatFournisseur {
  id: string
  etat: 'ok' | 'compte_invalide' | 'adresse_refusee' | 'indisponible' | 'inconnu'
  statut_compte: string
  expiration: string | null
  expire_dans_secondes: number | null
  alerte_expiration: boolean
}

export type NiveauAbonnement = 'proche' | 'expire' | 'adresse'

export interface AlerteAbonnement {
  niveau: NiveauAbonnement
  texte: string
  /** Change quand la situation change : un bandeau masque reparait alors. */
  cle: string
}

/** Un jour, deux jours... ou « moins d'un jour ». */
function dansCombien(secondes: number): string {
  const jours = Math.floor(secondes / 86400)
  if (jours >= 2) return `${jours} jours`
  if (jours === 1) return '1 jour'
  const heures = Math.floor(secondes / 3600)
  return heures >= 2 ? `${heures} heures` : 'moins de 2 heures'
}

/**
 * Ce qu'il faut dire a l'administrateur, ou rien. Fonction pure : le serveur a
 * deja tranche (`alerte_expiration`, `etat`) ; ici on choisit seulement les mots.
 */
export function evaluerAbonnement(lignes: readonly EtatFournisseur[]): AlerteAbonnement | undefined {
  // Le plus grave d'abord : un compte refuse prime sur une expiration proche.
  const refus = lignes.find((l) => l.etat === 'compte_invalide')
  if (refus) {
    const date = refus.expiration ? dateLongue(refus.expiration) : undefined
    return {
      niveau: 'expire',
      texte: `Abonnement du fournisseur expiré ou refusé${date ? ` (échéance : ${date})` : ''} : la lecture ne fonctionnera plus tant qu’il n’est pas renouvelé.`,
      cle: `expire:${refus.id}`,
    }
  }
  const adresse = lignes.find((l) => l.etat === 'adresse_refusee')
  if (adresse)
    return {
      niveau: 'adresse',
      texte: 'Le fournisseur refuse l’adresse de ce serveur : la lecture ne fonctionnera pas.',
      cle: `adresse:${adresse.id}`,
    }
  const proche = lignes
    .filter((l) => l.alerte_expiration && l.expire_dans_secondes !== null && l.expire_dans_secondes > 0)
    .sort((a, b) => (a.expire_dans_secondes ?? 0) - (b.expire_dans_secondes ?? 0))[0]
  if (proche) {
    const date = proche.expiration ? dateLongue(proche.expiration) : undefined
    return {
      niveau: 'proche',
      texte: `L’abonnement du fournisseur expire dans ${dansCombien(proche.expire_dans_secondes!)}${date ? ` (le ${date})` : ''}.`,
      // Un jour de moins ne fait pas reparaitre un bandeau masque ; une nouvelle date oui.
      cle: `proche:${proche.id}:${proche.expiration ?? ''}`,
    }
  }
  return undefined
}

const [lignes, poserLignes] = createSignal<EtatFournisseur[]>([])
export const alerteAbonnement = () => evaluerAbonnement(lignes())

/** Relit l'etat. Un echec est ignore : le bandeau est un confort, jamais une panne de plus. */
export async function rafraichirAbonnement(signal?: AbortSignal): Promise<void> {
  try {
    const r = await json<{ fournisseurs: EtatFournisseur[] }>('/admin/fournisseurs', { signal, sansDetectionSession: true })
    poserLignes(Array.isArray(r.fournisseurs) ? r.fournisseurs : [])
  } catch {
    // 403 (pas administrateur), 501 (supervision absente), reseau : pas de bandeau.
  }
}

export function oublierAbonnement(): void {
  poserLignes([])
}

/** Periode de relecture : l'expiration se compte en jours, inutile de marteler le serveur. */
export const PERIODE_RELECTURE_MS = 10 * 60_000
