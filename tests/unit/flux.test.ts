import test from 'node:test'
import assert from 'node:assert/strict'
import { deplacementParService, lireEnTetesVod, planDirect, planVod, urlVod } from '../../src/lib/flux'

const reponse = (statut: number, entetes: Record<string, string> = {}) =>
  new Response(null, { status: statut, headers: entetes })

test('?t= seulement au-dela de 0,5 s, requete existante conservee', () => {
  assert.equal(urlVod('/api/v1/vod/iptva:1'), '/api/v1/vod/iptva:1')
  assert.equal(urlVod('/api/v1/vod/iptva:1', 0.3), '/api/v1/vod/iptva:1')
  assert.equal(urlVod('/api/v1/vod/iptva:1', 90.5), '/api/v1/vod/iptva:1?t=90.500')
  assert.equal(urlVod('/api/v1/vod/iptva:1?x=2', 10), '/api/v1/vod/iptva:1?x=2&t=10.000')
})

test('mode lu dans les en-tetes : X-Mytv-Mode prime, sinon Accept-Ranges', () => {
  assert.deepEqual(lireEnTetesVod(new Headers({ 'Accept-Ranges': 'bytes' })), { mode: 'direct', dureeSecondes: undefined })
  assert.equal(lireEnTetesVod(new Headers({ 'Accept-Ranges': 'none' })).mode, 'remux')
  assert.equal(lireEnTetesVod(new Headers({ 'Accept-Ranges': 'none', 'X-Mytv-Mode': 'audio' })).mode, 'audio')
  assert.equal(lireEnTetesVod(new Headers({ 'X-Mytv-Mode': 'n-importe-quoi', 'Accept-Ranges': 'bytes' })).mode, 'direct')
  assert.equal(lireEnTetesVod(new Headers({ 'X-Mytv-Duree': '5821' })).dureeSecondes, 5821)
  assert.equal(lireEnTetesVod(new Headers({ 'X-Mytv-Duree': '-3' })).dureeSecondes, undefined)
})

test('direct : aucune requete, adresse du serveur telle quelle', () => {
  const p = planDirect('/api/v1/live/845410.m3u8')
  assert.equal(p.url, '/api/v1/live/845410.m3u8')
  assert.equal(p.chaine, '845410')
  assert.equal(p.viaService, false)
  assert.equal(deplacementParService(p), false)
})

test('film servi tel quel : HEAD, Range natif, pas de ?t=', async () => {
  const appels: Array<{ url: string; methode?: string }> = []
  const p = await planVod({
    lecture: '/api/v1/vod/iptva:5521',
    decalage: 120,
    fetchImpl: async (url, init) => {
      appels.push({ url: String(url), methode: init?.method })
      return reponse(200, { 'Accept-Ranges': 'bytes' })
    },
  })
  assert.deepEqual(appels, [{ url: '/api/v1/vod/iptva:5521', methode: 'HEAD' }])
  assert.equal(p.mode, 'direct')
  assert.equal(p.url, '/api/v1/vod/iptva:5521')
  assert.equal(deplacementParService(p), false)
})

test('film remuxe : ?t= a la reprise, deplacement par le service, duree annoncee', async () => {
  const p = await planVod({
    lecture: '/api/v1/vod/iptva:77',
    decalage: 300,
    fetchImpl: async () => reponse(200, { 'Accept-Ranges': 'none', 'X-Mytv-Duree': '6000' }),
  })
  assert.equal(p.mode, 'remux')
  assert.equal(p.url, '/api/v1/vod/iptva:77?t=300.000')
  assert.equal(p.dureeSecondes, 6000)
  assert.equal(deplacementParService(p), true)
})

test('415 : format non lisible nomme (HEVC)', async () => {
  await assert.rejects(
    planVod({ lecture: '/api/v1/vod/iptva:1', fetchImpl: async () => reponse(415) }),
    (e: { couche: string; message: string }) => e.couche === 'codec' && /HEVC/.test(e.message),
  )
})

test('503 : place occupee avec le Retry-After du serveur', async () => {
  await assert.rejects(
    planVod({ lecture: '/api/v1/vod/iptva:1', fetchImpl: async () => reponse(503, { 'Retry-After': '4' }) }),
    (e: { couche: string; attenteSecondes?: number }) => e.couche === 'limite' && e.attenteSecondes === 4,
  )
})

// US-25 CA5 : un HEAD n'a pas de corps ; le code du fournisseur est dans l'en-tete.
test('502 fournisseur_compte_invalide lu dans X-Mytv-Erreur (HEAD) : abonnement expire, sans reessai', async () => {
  await assert.rejects(
    planVod({
      lecture: '/api/v1/vod/iptva:1',
      fetchImpl: async () => reponse(502, { 'X-Mytv-Erreur': 'fournisseur_compte_invalide', 'X-Mytv-Expiration': '2026-10-01T00:00:00Z' }),
    }),
    (e: { couche: string; message: string }) => e.couche === 'fournisseur' && /Abonnement expiré ou refusé par le fournisseur \(.*1 octobre 2026\)/.test(e.message),
  )
  await assert.rejects(
    planVod({ lecture: '/api/v1/vod/iptva:1', fetchImpl: async () => reponse(502, { 'X-Mytv-Erreur': 'fournisseur_adresse_refusee' }) }),
    (e: { couche: string; message: string }) => e.couche === 'fournisseur' && /Adresse du serveur refusée/.test(e.message),
  )
  await assert.rejects(
    planVod({ lecture: '/api/v1/vod/iptva:1', fetchImpl: async () => reponse(502, { 'X-Mytv-Erreur': 'fournisseur_indisponible' }) }),
    (e: { couche: string }) => e.couche === 'relais',
  )
})

test('401 : couche auth, et la session expiree est signalee', async () => {
  let signale = 0
  const g = globalThis as { window?: unknown }
  g.window = { dispatchEvent: () => ((signale += 1), true) }
  try {
    await assert.rejects(
      planVod({ lecture: '/api/v1/vod/iptva:1', fetchImpl: async () => reponse(401) }),
      (e: { couche: string }) => e.couche === 'auth',
    )
  } finally {
    delete g.window
  }
  assert.equal(signale, 1)
})

test('serveur injoignable : erreur reseau, pas une exception brute', async () => {
  await assert.rejects(
    planVod({ lecture: '/api/v1/vod/iptva:1', fetchImpl: async () => { throw new TypeError('fetch failed') } }),
    (e: { couche: string }) => e.couche === 'reseau',
  )
})

import { bornerPosition } from '../../src/lib/flux'

test('deplacement sans duree connue (remux sans X-Mytv-Duree) : la cible est gardee, pas ramenee a 0', () => {
  // Regression : Math.min(duree || 0, cible) renvoyait chaque deplacement au debut du film.
  assert.equal(bornerPosition(610, 0), 610)
  assert.equal(bornerPosition(610, NaN), 610)
  assert.equal(bornerPosition(-5, 0), 0)
})

test('avec une duree, la cible est bornee au film', () => {
  assert.equal(bornerPosition(610, 5000), 610)
  assert.equal(bornerPosition(6000, 5000), 5000)
  assert.equal(bornerPosition(-1, 5000), 0)
  assert.equal(bornerPosition(NaN, 5000), 0)
})
