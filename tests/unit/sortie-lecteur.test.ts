import test from 'node:test'
import assert from 'node:assert/strict'
import { cheminApresLecture, destinationRetour } from '../../src/lib/sortie-lecteur'

// US-45 CA2 : une seule regle de retour, la pile d'historique. Constats (A8, B4, B UX4/UX5) :
// « Retour » d'un film menait a /films meme depuis la fiche, la fiche serie renvoyait vers Direct.

test('CA2 pile non vide : un pas en arriere, quel que soit le contenu', () => {
  assert.deepEqual(destinationRetour(1, { type: 'vod', cle: 'vod:iptva:5' }), { action: 'arriere' })
  assert.deepEqual(destinationRetour(3, { type: 'live', cle: 'live:iptva:1' }), { action: 'arriere' })
  assert.deepEqual(destinationRetour(2, null), { action: 'arriere' })
})

test('CA2 pile vide : la fiche du contenu (film, serie de l episode)', () => {
  assert.deepEqual(destinationRetour(0, { type: 'vod', cle: 'vod:iptva:5' }), { action: 'fiche', chemin: '/film/vod:iptva:5' })
  assert.deepEqual(destinationRetour(0, { type: 'series', cle: 'series:iptva:77.mkv', serie: 'series:iptva:s7' }), { action: 'fiche', chemin: '/serie/series:iptva:s7' })
})

test('CA2 pile vide sans fiche possible : l accueil', () => {
  assert.deepEqual(destinationRetour(0, { type: 'live', cle: 'live:iptva:1' }), { action: 'accueil', chemin: '/' })
  assert.deepEqual(destinationRetour(0, { type: 'series', cle: 'series:iptva:77.mkv' }), { action: 'accueil', chemin: '/' })
  assert.deepEqual(destinationRetour(0, null), { action: 'accueil', chemin: '/' })
  assert.deepEqual(destinationRetour(-1, undefined), { action: 'accueil', chemin: '/' })
})

test('CA2 l etat de navigation ne navigue plus : la destination « apres lecture » est le chemin courant', () => {
  // Hors navigateur, le chemin courant est la racine : la valeur importe peu, c'est l'absence de /films, /direct, /series qui compte.
  for (const sel of [{ type: 'vod' as const }, { type: 'live' as const }, { type: 'series' as const, serie: 'x' }, null, undefined])
    assert.ok(!['/films', '/direct', '/series'].includes(cheminApresLecture(sel)))
})
