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

test('CA2 le repli « apres lecture » de l etat : la fiche, sinon l accueil -- plus jamais une liste', () => {
  assert.equal(cheminApresLecture({ type: 'vod', cle: 'vod:iptva:5' }), '/film/vod:iptva:5')
  assert.equal(cheminApresLecture({ type: 'series', cle: 'series:iptva:77.mkv', serie: 'series:iptva:s7' }), '/serie/series:iptva:s7')
  assert.equal(cheminApresLecture({ type: 'live', cle: 'live:iptva:1' }), '/')
  assert.equal(cheminApresLecture({ type: 'vod' }), '/')
  assert.equal(cheminApresLecture(null), '/')
})
