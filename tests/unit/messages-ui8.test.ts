// US-47 CA4 / CA5 / CA6 : messages (guide, direct, stockage local, hors ligne,
// profils) — logique pure, sans navigateur.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageGuideVide, estContexteDirect, MESSAGE_GUIDE_INDISPONIBLE, MESSAGE_FLUX_ILLISIBLE, CONTEXTE_GUIDE } from '../../src/lib/messages-guide'
import { erreurDeStatut, estErreurStockage, erreurStockageLocal, MESSAGE_STOCKAGE_BLOQUE } from '../../src/lib/errors'
import { libelleGeste, phraseHorsLigne, SUFFIXE_HORS_LIGNE } from '../../src/lib/hors-ligne'
import { nomProfilDisponible, cheminApresExpiration, MESSAGE_PROFIL_EXISTANT } from '../../src/lib/profils-regles'

test('CA6 etat vide du guide : la cause est nommee (filtre, catalogue, guide)', () => {
  assert.equal(messageGuideVide({ filtre: 'zzz', totalLive: 60, avecGuide: 60 }), 'Aucune chaîne ne correspond à « zzz ».')
  assert.match(messageGuideVide({ filtre: '', totalLive: 0, avecGuide: 0 }), /catalogue n’est pas importé/)
  assert.match(messageGuideVide({ filtre: '', totalLive: 60, avecGuide: 0 }), /Aucune chaîne de ce catalogue n’annonce de guide/)
  assert.equal(messageGuideVide({ filtre: '  ', totalLive: 60, avecGuide: 5 }), 'Aucun programme à afficher.')
})

test('CA6 erreur du guide : ses propres mots, jamais « contenu n existe plus »', () => {
  for (const statut of [404, 500, 503]) {
    const e = erreurDeStatut(statut, { contexte: CONTEXTE_GUIDE })
    assert.equal(e.message, MESSAGE_GUIDE_INDISPONIBLE, `statut ${statut}`)
    assert.match(e.action, /Réessayer/)
    assert.doesNotMatch(e.message, /catalogue/)
    assert.match(e.detail ?? '', new RegExp(`HTTP ${statut}`))
  }
  // Un 401 reste une session expiree : l'application doit se reconnecter.
  assert.equal(erreurDeStatut(401, { contexte: CONTEXTE_GUIDE }).couche, 'auth')
})

test('CA6 erreur de lecture du direct : « Impossible de lire ce flux » + Reessayer', () => {
  assert.ok(estContexteDirect('manifestLoadError'))
  assert.ok(estContexteDirect('fragLoadError'))
  assert.ok(estContexteDirect('/api/v1/live/100.m3u8'))
  assert.ok(!estContexteDirect('film'))
  assert.ok(!estContexteDirect(undefined))
  const e = erreurDeStatut(404, { contexte: 'manifestLoadError' })
  assert.equal(e.message, MESSAGE_FLUX_ILLISIBLE)
  assert.match(e.action, /^Réessayer/)
  // Un film absent, lui, reste « n'existe plus au catalogue ».
  assert.match(erreurDeStatut(404, { contexte: 'film' }).message, /n’existe plus au catalogue/)
})

test('CA4 stockage local bloque : phrase humaine, exception en detail seulement', () => {
  const brute = Object.assign(new Error('A mutation operation was attempted on a database that did not allow mutations.'), { name: 'InvalidStateError' })
  assert.ok(estErreurStockage(brute))
  assert.ok(estErreurStockage(Object.assign(new Error('x'), { name: 'DatabaseClosedError', inner: brute })))
  assert.ok(!estErreurStockage(new Error('reseau')))
  assert.ok(!estErreurStockage(null))
  const e = erreurStockageLocal(brute)
  assert.equal(e.message, MESSAGE_STOCKAGE_BLOQUE)
  assert.match(e.message, /bloque le stockage local/)
  assert.doesNotMatch(e.message, /InvalidStateError/)
  assert.match(e.detail ?? '', /InvalidStateError/)
})

test('CA4 gestes hors ligne : « sera envoye au retour du reseau »', () => {
  assert.equal(libelleGeste('Ajouté à Ma liste', false), 'Ajouté à Ma liste')
  assert.equal(libelleGeste('Ajouté à Ma liste', true), `Ajouté à Ma liste · ${SUFFIXE_HORS_LIGNE}`)
  assert.equal(phraseHorsLigne(0), 'Hors ligne · catalogue local')
  assert.match(phraseHorsLigne(1), /1 geste sera envoyé au retour du réseau/)
  assert.match(phraseHorsLigne(3), /3 gestes seront envoyés/)
})

test('CA5 noms de profils uniques (casse et espaces ignores)', () => {
  const existants = [{ id: 'p1', nom: 'Salon' }, { id: 'p2', nom: 'Chambre ' }]
  assert.ok(nomProfilDisponible(existants, 'Cuisine'))
  assert.ok(!nomProfilDisponible(existants, 'salon'))
  assert.ok(!nomProfilDisponible(existants, '  chambre'))
  assert.ok(!nomProfilDisponible(existants, '   '))
  assert.match(MESSAGE_PROFIL_EXISTANT, /porte déjà ce nom/)
})

test('CA4 session expiree : l ecran d origine est garde, sauf une lecture', () => {
  assert.equal(cheminApresExpiration('/reglages'), '/reglages')
  assert.equal(cheminApresExpiration('/ma-liste'), '/ma-liste')
  assert.equal(cheminApresExpiration('/lecture/live:iptva:100'), '/')
})
