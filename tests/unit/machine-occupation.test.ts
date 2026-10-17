import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REPOS, surErreur, tic, delaiOccupation, ATTENTE_OCCUPATION_DEFAUT, PLAFOND_ATTENTE_OCCUPATION, type EtatOccupation,
} from '../../src/lib/machine-occupation'
import { erreurDeStatut, enCoupure, estOccupation, ErreurLecteur } from '../../src/lib/errors'
import { statutPlacePrise } from '../../src/lib/lecteur'

/** Deroule la machine seconde par seconde et rend les secondes auxquelles une requete part. */
function derouler(retryAfters: Array<number | undefined>, plafond = PLAFOND_ATTENTE_OCCUPATION) {
  let etat: EtatOccupation = REPOS
  let seconde = 0
  const requetes: number[] = []
  let issue = ''
  for (const ra of retryAfters) {
    const ev = surErreur(etat, ra, plafond)
    if (ev.action === 'plafond') { issue = 'plafond'; break }
    etat = ev.etat
    for (let garde = 0; etat.actif; garde++) {
      assert.ok(garde < 10_000, 'decompte sans fin')
      seconde++
      const t = tic(etat)
      etat = t.etat
      if (t.relancer) requetes.push(seconde)
    }
  }
  return { requetes, issue, etat, seconde }
}

test('CA2 decompte : la requete part apres Retry-After, jamais avant', () => {
  assert.deepEqual(derouler([15]).requetes, [15])
  // 15 puis 30 puis 60 (paliers du serveur) : 15, 15+30, 15+30+60
  assert.deepEqual(derouler([15, 30, 60]).requetes, [15, 45, 105])
})

test('CA2 pas de boucle serree : Retry-After absent, 0 ou illisible -> delai par defaut', () => {
  for (const ra of [undefined, 0, -3, Number.NaN]) assert.equal(delaiOccupation(ra), ATTENTE_OCCUPATION_DEFAUT)
  assert.equal(delaiOccupation(1), 1)
  assert.equal(delaiOccupation(2.2), 3)
  // 40 refus d'affilee sans Retry-After : un espacement d'au moins 15 s entre requetes
  const r = derouler(Array(40).fill(undefined), 100_000).requetes
  for (let i = 1; i < r.length; i++) assert.ok(r[i]! - r[i - 1]! >= ATTENTE_OCCUPATION_DEFAUT)
})

test('CA2 une seule requete en vol : une erreur pendant le decompte est ignoree', () => {
  const a = surErreur(REPOS, 30)
  assert.equal(a.action, 'attendre')
  let etat = a.etat
  for (let i = 0; i < 5; i++) etat = tic(etat).etat
  const b = surErreur(etat, 30)
  assert.equal(b.action, 'ignorer')
  assert.equal(b.etat, etat, 'le decompte en cours n est pas relance')
  assert.equal(b.etat.essai, 1)
})

test('CA2 plafond : au-dela de 10 min cumulees, abandon (bouton Reessayer)', () => {
  // 60 s x 10 = 600 s autorises ; la onzieme attente depasse
  const r = derouler(Array(12).fill(60))
  assert.equal(r.requetes.length, 10)
  assert.equal(r.issue, 'plafond')
  assert.equal(r.seconde, 600)
  // Retry-After enorme : abandon d'emblee, sans attendre
  assert.equal(derouler([3600]).issue, 'plafond')
  assert.equal(derouler([3600]).requetes.length, 0)
})

test('CA2 repartir de zero (Reessayer / succes) rend tout le plafond', () => {
  const plein = derouler(Array(10).fill(60)).etat
  assert.equal(surErreur(plein, 60).action, 'plafond')
  assert.equal(surErreur(REPOS, 60).action, 'attendre')
})

test('CA2 tic hors decompte ne relance jamais', () => {
  for (let i = 0; i < 100; i++) assert.equal(tic(REPOS).relancer, false)
})

test('CA1 un code serveur donne son message', () => {
  const ailleurs = erreurDeStatut(503, { code: 'compte_utilise_ailleurs', retryAfter: '30' })
  assert.equal(ailleurs.message, 'Le compte IPTV est utilisé sur un autre appareil. Fermez-le pour regarder ici.')
  assert.equal(ailleurs.attenteSecondes, 30)
  assert.ok(estOccupation(ailleurs))
  assert.equal(erreurDeStatut(503, { code: 'compte_utilise_par_mytv' }).message, 'Une autre fenêtre de MyTV utilise la connexion.')
  assert.equal(
    erreurDeStatut(503, { code: 'compte_occupe', retryAfter: '15' }).message,
    'Connexion du fournisseur occupée, nouvelle tentative automatique…',
  )
  // 503 sans code : l'ancien comportement
  const sans = erreurDeStatut(503, { retryAfter: '5' })
  assert.equal(sans.message, 'Place occupée chez le fournisseur.')
  assert.equal(estOccupation(sans), false)
})

test('CA3 coupure en cours de lecture : message dedie', () => {
  const brute = erreurDeStatut(403, {})
  const c = enCoupure(brute)
  assert.equal(c.message, 'Lecture interrompue : le compte est utilisé ailleurs.')
  assert.ok(c.coupure && estOccupation(c))
  assert.equal(enCoupure(erreurDeStatut(503, { code: 'compte_utilise_par_mytv' })).message,
    'Lecture interrompue : une autre fenêtre de MyTV utilise la connexion.')
  // pas de confusion : segment expire, session, codec, trop de requetes
  assert.equal(enCoupure(erreurDeStatut(403, { code: 'segment_expire' })).coupure, undefined)
  assert.equal(enCoupure(erreurDeStatut(401)).couche, 'auth')
  assert.equal(enCoupure(erreurDeStatut(429)).coupure, undefined)
  assert.equal(enCoupure(new ErreurLecteur('codec', 'x', 'y')).coupure, undefined)
})

test('hls.js ne reessaie pas en silence une place prise', () => {
  for (const c of [503, 429, 403, 407]) assert.equal(statutPlacePrise(c), true)
  for (const c of [500, 404, 401, undefined]) assert.equal(statutPlacePrise(c), false)
})
