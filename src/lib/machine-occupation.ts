// La machine d'etats de l'attente « compte occupe », SANS minuteur ni reactivite :
// le minuteur de l'ecran lui envoie un `tic` par seconde. Le contexte mesure :
// un autre appareil utilise le meme identifiant (une seule connexion), le
// fournisseur refuse pendant des dizaines de minutes, et l'ancienne interface
// reessayait toutes les 3 s (190 refus en 30 minutes). Regles :
//  - jamais de requete avant la fin du decompte, et le decompte vaut AU MOINS
//    le `Retry-After` du serveur ;
//  - une seule requete en vol : une erreur qui arrive pendant le decompte
//    (reliquat de l'ancien lecteur) est ignoree ;
//  - l'attente cumulee est plafonnee (10 min), puis l'utilisateur decide.

/** Attente par defaut quand le serveur n'a pas dit combien (premier palier du serveur). */
export const ATTENTE_OCCUPATION_DEFAUT = 15
/** Plafond de l'attente cumulee : 10 minutes. */
export const PLAFOND_ATTENTE_OCCUPATION = 600

export interface EtatOccupation {
  /** Un decompte est en cours : aucune requete n'est permise. */
  actif: boolean
  /** Reessais lances depuis le debut de l'episode. */
  essai: number
  /** Secondes deja ATTENDUES (decomptes termines). */
  cumul: number
  /** Secondes restantes du decompte en cours. */
  dans: number
  /** Duree du decompte en cours. */
  delai: number
}

export const REPOS: EtatOccupation = { actif: false, essai: 0, cumul: 0, dans: 0, delai: 0 }

/** Delai d'attente : `Retry-After` du serveur (jamais en dessous), sinon le defaut. 0 ou NaN = defaut. */
export function delaiOccupation(retryAfter: number | undefined): number {
  if (retryAfter === undefined || !Number.isFinite(retryAfter) || retryAfter < 1) return ATTENTE_OCCUPATION_DEFAUT
  return Math.ceil(retryAfter)
}

export type Evolution =
  | { action: 'attendre'; etat: EtatOccupation }
  | { action: 'ignorer'; etat: EtatOccupation }
  | { action: 'plafond'; etat: EtatOccupation }

/** Une erreur de place occupee arrive : demarrer un decompte, l'ignorer, ou abandonner. */
export function surErreur(
  etat: EtatOccupation, retryAfter: number | undefined, plafond = PLAFOND_ATTENTE_OCCUPATION,
): Evolution {
  if (etat.actif) return { action: 'ignorer', etat }
  const delai = delaiOccupation(retryAfter)
  if (etat.cumul + delai > plafond) return { action: 'plafond', etat }
  return { action: 'attendre', etat: { ...etat, actif: true, essai: etat.essai + 1, dans: delai, delai } }
}

/** Une seconde s'est ecoulee. `relancer` : le decompte est fini, UNE requete peut partir. */
export function tic(etat: EtatOccupation): { etat: EtatOccupation; relancer: boolean } {
  if (!etat.actif) return { etat, relancer: false }
  if (etat.dans > 1) return { etat: { ...etat, dans: etat.dans - 1 }, relancer: false }
  return { etat: { ...etat, actif: false, dans: 0, cumul: etat.cumul + etat.delai }, relancer: true }
}
