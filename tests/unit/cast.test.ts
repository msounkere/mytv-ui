import test from 'node:test'
import assert from 'node:assert/strict'
import {
  capacitesTeleviseur, demanderLien, detailsDiffusion, libelleExpiration, lienAbsolu, lienValide, lireReglageTeleviseur,
  parametresDiffusion,
  avecPosition,
} from '../../src/lib/cast'
import { origineLocale } from '../../src/sonde-debit'

// US-41 : diffuser depuis n'importe ou, par lien signe (contrat US-40).

const UA_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const UA_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'

test('CA1 : la demande de lien est POST /cast/lien { lecture, parametres } et rend { url, expire }', async () => {
  const appels: Array<{ chemin: string; o: { methode: string; corps: unknown } }> = []
  const faux = async <T,>(chemin: string, o: { methode: 'POST'; corps: unknown }): Promise<T> => {
    appels.push({ chemin, o })
    return { url: '/api/v1/cast/jeton.abc/live/845410.m3u8?cap=hevc,eac3,ac3', expire: '2026-10-31T23:00:00Z' } as T
  }
  const lien = await demanderLien('/api/v1/live/845410.m3u8', 'cap=hevc,eac3,ac3', faux)
  assert.equal(appels.length, 1)
  assert.equal(appels[0]!.chemin, '/cast/lien')
  assert.equal(appels[0]!.o.methode, 'POST')
  assert.deepEqual(appels[0]!.o.corps, { lecture: '/api/v1/live/845410.m3u8', parametres: 'cap=hevc,eac3,ac3' })
  assert.equal(lien.url, '/api/v1/cast/jeton.abc/live/845410.m3u8?cap=hevc,eac3,ac3')
  assert.equal(lien.expire, '2026-10-31T23:00:00Z')
})

test('CA1 : seul un chemin signe du contrat est accepte (rien d autre n est donne a un appareil)', async () => {
  assert.equal(lienValide('/api/v1/cast/j1/live/845410.m3u8'), true)
  assert.equal(lienValide('/api/v1/cast/j1/vod/iptva:5521?cap=hevc'), true)
  assert.equal(lienValide('/api/v1/live/845410.m3u8'), false, 'l adresse normale (cookie) n est pas un lien signe')
  assert.equal(lienValide('http://fournisseur.example/live/x.m3u8'), false)
  assert.equal(lienValide(undefined), false)
  await assert.rejects(
    demanderLien('/api/v1/live/1.m3u8', 'cap=', async <T,>() => ({ url: '/api/v1/live/1.m3u8', expire: 'x' }) as T),
    /inattendu/,
  )
})

test('CA1 : plus aucune notion de reseau local pour diffuser (origineLocale ne sert qu a nommer la liaison)', () => {
  assert.equal(origineLocale('192.168.50.3'), true)
  assert.equal(origineLocale('mytv.msocasa.com'), false)
  // Le lien se demande et se rend absolu quelle que soit l'origine, publique comprise.
  assert.equal(lienAbsolu('/api/v1/cast/j1/live/1.m3u8', 'https://mytv.msocasa.com'), 'https://mytv.msocasa.com/api/v1/cast/j1/live/1.m3u8')
})

test('CA2 : par defaut cap=hevc,eac3,ac3 ; jamais qualite=eco, meme si le navigateur est en Eco', () => {
  const p = parametresDiffusion({ eac3: true, hevc: true }, 'eco')
  assert.equal(p, 'cap=hevc,eac3,ac3')
  assert.doesNotMatch(p, /qualite/, 'le televiseur a le debit : Eco couterait un coeur pour rien')
  assert.match(p, /\beac3\b/, 'un televiseur decode EAC3')
  assert.equal(parametresDiffusion({ eac3: true, hevc: true }, 'auto'), 'cap=hevc,eac3,ac3')
})

test('CA2 : les reglages « le televiseur decode EAC3/AC3 » et « HEVC » retirent la capacite', () => {
  assert.deepEqual(capacitesTeleviseur({ eac3: true, hevc: true }), ['hevc', 'eac3', 'ac3'])
  assert.deepEqual(capacitesTeleviseur({ eac3: false, hevc: true }), ['hevc'])
  assert.deepEqual(capacitesTeleviseur({ eac3: true, hevc: false }), ['eac3', 'ac3'])
  assert.equal(parametresDiffusion({ eac3: false, hevc: false }), 'cap=', 'rien decode : parametre present mais vide, comme pour le navigateur')
  // Memorisation par appareil : vrai par defaut, seul « non » desactive.
  assert.equal(lireReglageTeleviseur(null), true)
  assert.equal(lireReglageTeleviseur('oui'), true)
  assert.equal(lireReglageTeleviseur('non'), false)
  assert.equal(lireReglageTeleviseur('false'), true)
})

test('CA4 : le lien a copier est absolu sur l origine de la page, et l expiration se lit en heure locale', () => {
  const u = lienAbsolu('/api/v1/cast/j1/vod/iptva:5521?cap=hevc,eac3,ac3', 'https://mytv.msocasa.com')
  assert.equal(u, 'https://mytv.msocasa.com/api/v1/cast/j1/vod/iptva:5521?cap=hevc,eac3,ac3')
  const maintenant = Date.parse('2026-10-31T10:00:00Z')
  assert.match(libelleExpiration('2026-10-31T22:05:00Z', maintenant), /^valable jusqu’à \d{2}:05$/)
  assert.match(libelleExpiration('2026-11-01T09:05:00Z', maintenant), /demain \d{2}:05$/)
  assert.equal(libelleExpiration('n importe quoi', maintenant), 'valable 12 h')
})

test('CA4/CA5 : la telemetrie porte la ressource, le navigateur, la duree — jamais le jeton ni le lien', () => {
  const d = detailsDiffusion('/api/v1/live/845410.m3u8?cap=hevc', UA_CHROME)
  assert.deepEqual(d, { ressource: '/api/v1/live/845410.m3u8', navigateur: 'Chrome' })
  const f = detailsDiffusion('/api/v1/vod/iptva:5521', UA_FIREFOX, 1234.6)
  assert.deepEqual(f, { ressource: '/api/v1/vod/iptva:5521', navigateur: 'Firefox', duree: 1235 })
  // Meme si on lui donnait le lien signe par erreur, le jeton n'en sort pas.
  const s = detailsDiffusion('/api/v1/cast/JETON-SECRET/live/845410.m3u8?cap=hevc', UA_CHROME, 0)
  assert.doesNotMatch(JSON.stringify(s), /JETON-SECRET|\/cast\//)
  assert.equal(s.ressource, '/api/v1/live/845410.m3u8')
  assert.equal(s.duree, 0)
})

// US-41 complement : un film diffuse repart de la position atteinte (t= accepte par le serveur).
test('CA5 : t= ajoute pour un film a la position atteinte, jamais pour le direct ni sous 1 s', () => {
  assert.equal(avecPosition('cap=hevc,eac3,ac3', 1427.8), 'cap=hevc,eac3,ac3&t=1427')
  assert.equal(avecPosition('cap=hevc,eac3,ac3', undefined), 'cap=hevc,eac3,ac3')
  assert.equal(avecPosition('cap=hevc,eac3,ac3', 0.4), 'cap=hevc,eac3,ac3')
  assert.equal(avecPosition('cap=hevc,eac3,ac3', NaN), 'cap=hevc,eac3,ac3')
})
