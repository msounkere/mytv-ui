import test from 'node:test'
import assert from 'node:assert/strict'
import { avancerDecompte, calqueFinEpisode, finContenu, prochainAcceptable } from '../../src/screens/lecture/fin-regles'

// US-45 CA5 : regles de fin de lecture (B10, B11, C6, C19).

test('CA5 le decompte avance d une seconde par tic et lance le suivant a zero', () => {
  assert.deepEqual(avancerDecompte(10, false), { restant: 9, lancer: false })
  assert.deepEqual(avancerDecompte(2, false), { restant: 1, lancer: false })
  assert.deepEqual(avancerDecompte(1, false), { restant: 0, lancer: true })
})

test('CA5 en pause, le decompte est SUSPENDU : ni avance, ni lancement', () => {
  assert.deepEqual(avancerDecompte(10, true), { restant: 10, lancer: false })
  assert.deepEqual(avancerDecompte(1, true), { restant: 1, lancer: false })
})

test('CA5 apres une annulation, la vraie fin montre le calque PERSISTANT, sans decompte', () => {
  assert.equal(calqueFinEpisode({ suivant: true, refuse: true }), 'persistant')
  assert.equal(calqueFinEpisode({ suivant: true, refuse: false }), 'decompte')
  assert.equal(calqueFinEpisode({ suivant: false, refuse: false }), 'aucun')
  assert.equal(calqueFinEpisode({ suivant: false, refuse: true }), 'aucun')
})

test('CA5 fin du dernier episode : « Série terminée ✓ », et le prochain se cherche apres la SERIE', () => {
  assert.deepEqual(finContenu({ cle: 'series:iptva:77.mkv', type: 'series', serie: 'series:iptva:s7' }), { de: 'serie', titre: 'Série terminée ✓', chercherApres: 'series:iptva:s7' })
  assert.deepEqual(finContenu({ cle: 'vod:iptva:5', type: 'vod' }), { de: 'film', titre: 'Film terminé ✓', chercherApres: 'vod:iptva:5' })
})

test('CA5 jamais la serie (ni le film) que l on vient de finir comme « prochain »', () => {
  const ep = { cle: 'series:iptva:77.mkv', serie: 'series:iptva:s7' }
  assert.equal(prochainAcceptable({ cle: 'series:iptva:s7' }, ep), false)
  assert.equal(prochainAcceptable({ cle: 'series:iptva:77.mkv' }, ep), false)
  assert.equal(prochainAcceptable({ cle: 'vod:iptva:3' }, ep), true)
  assert.equal(prochainAcceptable(undefined, ep), false)
})
