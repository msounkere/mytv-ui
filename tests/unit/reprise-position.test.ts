import test from 'node:test'
import assert from 'node:assert/strict'
import { pointDeReprise, MARGE_REPRISE } from '../../src/lib/politique-reprise'

// Regression (recette reelle) : une coupure apres 6 min de lecture reprenait au depart demande.
test('apres une coupure, on reprend a la position atteinte (moins une marge)', () => {
  assert.equal(pointDeReprise(1242, 878), 1242 - MARGE_REPRISE)
})

test('sans position valide, on garde le dernier point demande', () => {
  assert.equal(pointDeReprise(0, 878), 878)
  assert.equal(pointDeReprise(NaN, 878), 878)
  assert.equal(pointDeReprise(-5, 878), 878)
})

test('jamais de position negative', () => {
  assert.equal(pointDeReprise(1, 0), 0)
})

// --- Fin prematuree (constat : le serveur tronque la reponse quand le remux casse) ---
import { finPrematuree, MARGE_FIN, departDeLecture } from '../../src/lib/politique-reprise'

test('un ended a 42 min d un film de 1 h 37 est une coupure, pas une fin', () => {
  assert.equal(finPrematuree(42 * 60, 97 * 60), true)
})

test('un ended dans les dernieres secondes est une vraie fin', () => {
  const d = 97 * 60
  assert.equal(finPrematuree(d, d), false)
  assert.equal(finPrematuree(d - MARGE_FIN, d), false)
  assert.equal(finPrematuree(d - MARGE_FIN - 1, d), true)
})

test('sans duree connue, un ended n est jamais une coupure', () => {
  assert.equal(finPrematuree(100, 0), false)
  assert.equal(finPrematuree(100, NaN), false)
  assert.equal(finPrematuree(NaN, 5000), false)
})

// --- Depart de lecture et dialogue « Reprendre / Recommencer » ---
const SEUIL = 60

test('premiere ouverture avec une position sauvegardee : on ouvre directement la, et on propose', () => {
  assert.deepEqual(departDeLecture({ premierPassage: true, pointAtteint: 0, sauvegardee: 1500, seuil: SEUIL }), { depart: 1500, proposer: 1500 })
})

test('sous le seuil : depuis le debut, sans question', () => {
  assert.deepEqual(departDeLecture({ premierPassage: true, pointAtteint: 0, sauvegardee: 30, seuil: SEUIL }), { depart: 0, proposer: null })
  assert.deepEqual(departDeLecture({ premierPassage: true, pointAtteint: 0, sauvegardee: undefined, seuil: SEUIL }), { depart: 0, proposer: null })
})

test('reouverture automatique (coupure, forcage) : le point atteint, JAMAIS le dialogue', () => {
  // Regression : la position memorisee toutes les 5 s rejouait le dialogue apres chaque reprise,
  // et « Reprendre » rouvrait un ffmpeg et une place de plus chez le fournisseur.
  assert.deepEqual(departDeLecture({ premierPassage: false, pointAtteint: 1240, sauvegardee: 1238, seuil: SEUIL }), { depart: 1240, proposer: null })
  // Meme contenu rouvert alors qu'un point a deja ete atteint : pas de dialogue non plus.
  assert.deepEqual(departDeLecture({ premierPassage: true, pointAtteint: 500, sauvegardee: 1238, seuil: SEUIL }), { depart: 500, proposer: null })
  // Reouverture apres une coupure avant toute image (point atteint 0) : toujours pas de dialogue.
  assert.deepEqual(departDeLecture({ premierPassage: false, pointAtteint: 0, sauvegardee: 1238, seuil: SEUIL }), { depart: 0, proposer: null })
})
