// Ancien nom (lot 9). L'ecran s'appelle « Ma liste » (screens/MaListe.tsx) ; ce
// module ne fait que le reexporter pour la coque (App.tsx) tant qu'elle importe
// l'ancien chemin. A supprimer quand plus personne ne l'importe.
export { default, PERIODE_ETAT } from './MaListe'
