import test from 'node:test'
import assert from 'node:assert/strict'
import { cheminApresLecture } from '../../src/lib/sortie-lecteur'

// Constat : depuis un episode, quitter le lecteur renvoyait a la liste de toutes les series.
test('un episode ramene a la fiche de sa serie', () => {
  assert.equal(cheminApresLecture({ type: 'series', serie: 'iptva:s77' }), '/serie/iptva:s77')
})

test('un film ou une chaine ramene a sa liste', () => {
  assert.equal(cheminApresLecture({ type: 'vod' }), '/films')
  assert.equal(cheminApresLecture({ type: 'live' }), '/direct')
})

test('une serie sans fiche connue, ou rien de selectionne : repli sur la liste ou l accueil', () => {
  assert.equal(cheminApresLecture({ type: 'series' }), '/series')
  assert.equal(cheminApresLecture(null), '/')
  assert.equal(cheminApresLecture(undefined), '/')
})
