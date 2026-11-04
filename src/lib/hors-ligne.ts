// Libelles du mode hors ligne (US-47 CA4). Module PUR, teste sous node ; le
// signal `horsLigne()` qui decide de les afficher vit dans `lib/reseau.ts`.

/** Suffixe des gestes de liste, de favori et de progression faits hors ligne. */
export const SUFFIXE_HORS_LIGNE = 'sera envoyé au retour du réseau'

/** « Ajouté à Ma liste · sera envoyé au retour du réseau » quand il n'y a pas de reseau. */
export function libelleGeste(message: string, horsReseau: boolean): string {
  return horsReseau ? `${message} · ${SUFFIXE_HORS_LIGNE}` : message
}

/** Phrase du bandeau : le nombre de gestes en attente, s'il y en a. */
export function phraseHorsLigne(gestesEnAttente: number): string {
  if (gestesEnAttente <= 0) return 'Hors ligne · catalogue local'
  return gestesEnAttente === 1
    ? `Hors ligne · 1 geste ${SUFFIXE_HORS_LIGNE}`
    : `Hors ligne · ${gestesEnAttente} gestes seront envoyés au retour du réseau`
}
