import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluerAbonnement, type EtatFournisseur } from '../../src/lib/abonnement'
import { decider } from '../../src/lib/politique-reprise'

const ligne = (extra: Partial<EtatFournisseur>): EtatFournisseur => ({
  id: 'iptva', etat: 'ok', statut_compte: 'Active', expiration: null, expire_dans_secondes: null, alerte_expiration: false, ...extra,
})

// US-25 CA5 : le bandeau de l'administrateur.
test('rien a dire quand l abonnement est loin ou inconnu', () => {
  assert.equal(evaluerAbonnement([]), undefined)
  assert.equal(evaluerAbonnement([ligne({})]), undefined)
  assert.equal(evaluerAbonnement([ligne({ expiration: '2027-01-01T00:00:00Z', expire_dans_secondes: 90 * 86400 })]), undefined)
  // Panne passagere ou etat inconnu : pas de faux bandeau d'abonnement.
  assert.equal(evaluerAbonnement([ligne({ etat: 'indisponible' }), ligne({ id: 'b', etat: 'inconnu' })]), undefined)
})

test('expiration proche : jours restants et date', () => {
  const a = evaluerAbonnement([ligne({ expiration: '2026-10-18T12:00:00Z', expire_dans_secondes: 3 * 86400 + 600, alerte_expiration: true })])
  assert.equal(a?.niveau, 'proche')
  assert.match(a!.texte, /expire dans 3 jours \(le 18 octobre 2026\)\./)
  assert.match(evaluerAbonnement([ligne({ expire_dans_secondes: 86400 + 5, alerte_expiration: true })])!.texte, /dans 1 jour\./)
  assert.match(evaluerAbonnement([ligne({ expire_dans_secondes: 5 * 3600, alerte_expiration: true })])!.texte, /dans 5 heures\./)
  assert.match(evaluerAbonnement([ligne({ expire_dans_secondes: 600, alerte_expiration: true })])!.texte, /moins de 2 heures/)
})

test('la cle change avec la date : un bandeau masque reparait apres un renouvellement', () => {
  const avant = evaluerAbonnement([ligne({ expiration: '2026-10-18T00:00:00Z', expire_dans_secondes: 3 * 86400, alerte_expiration: true })])
  const lendemain = evaluerAbonnement([ligne({ expiration: '2026-10-18T00:00:00Z', expire_dans_secondes: 2 * 86400, alerte_expiration: true })])
  const renouvele = evaluerAbonnement([ligne({ expiration: '2026-10-22T00:00:00Z', expire_dans_secondes: 6 * 86400, alerte_expiration: true })])
  assert.equal(avant?.cle, lendemain?.cle)
  assert.notEqual(avant?.cle, renouvele?.cle)
})

test('compte refuse ou expire : prime sur une expiration proche', () => {
  const a = evaluerAbonnement([
    ligne({ id: 'a', expire_dans_secondes: 86400, alerte_expiration: true }),
    ligne({ id: 'b', etat: 'compte_invalide', statut_compte: 'Expired', expiration: '2026-10-01T00:00:00Z', expire_dans_secondes: -1200000, alerte_expiration: true }),
  ])
  assert.equal(a?.niveau, 'expire')
  assert.match(a!.texte, /Abonnement du fournisseur expiré ou refusé \(échéance : 1 octobre 2026\)/)
  assert.equal(evaluerAbonnement([ligne({ etat: 'adresse_refusee' })])?.niveau, 'adresse')
})

// US-25 CA5 : un compte refuse ne se reessaie pas (pas de martelage du fournisseur).
test('la politique de reprise abandonne tout de suite sur un compte ou une adresse refuses', () => {
  assert.deepEqual(decider({ couche: 'fournisseur' }, 0), { action: 'abandonner' })
  assert.equal(decider({ couche: 'relais' }, 0).action, 'reessayer')
})
