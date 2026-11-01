import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deplacer, libelleDisponibilite, libellePreparation, prochainDansListe, resumeSerie, trierPretsDabord,
  type Preparation,
} from '../../src/lib/a-voir-regles'
import { cheminAVoir, cleDeIdAVoir, idAVoirDeCle } from '../../src/lib/identifiants'
import { episodeApres, episodesOrdonnes, prochainAVoir } from '../../src/lib/episodes-suivants'
import type { SaisonApi } from '../../src/lib/api'

// US-43 : regles pures de la liste « À voir » (lot 9).

// CA1 : la cle locale et l'identifiant du serveur se traduisent a la frontiere, dans les deux sens.
test('CA1 un film et une serie ont un identifiant « À voir » type ; un episode ou une chaine, non', () => {
  assert.equal(idAVoirDeCle('vod:iptva:5521'), 'vod:iptva:5521')
  assert.equal(idAVoirDeCle('series:iptva:s77'), 'serie:iptva:s77')
  assert.throws(() => idAVoirDeCle('series:iptva:77123.mkv'), /sans place/)
  assert.throws(() => idAVoirDeCle('live:iptva:100'), /sans place/)
  assert.equal(cleDeIdAVoir('vod:iptva:5521'), 'vod:iptva:5521')
  assert.equal(cleDeIdAVoir('serie:iptva:s77'), 'series:iptva:s77')
  assert.equal(cleDeIdAVoir('iptva:5521'), undefined)
  assert.equal(cheminAVoir('serie:iptva:s77'), 'serie:iptva:s77')
  assert.throws(() => cheminAVoir('serie:iptva:s77/../x'), /invalide/)
})

// CA2 : chaque etat a sa ligne, avec pourcentage et debit en cours, cause en echec.
test('CA2 libelle d etat : attente, en cours avec pourcentage et debit, pret, echec avec cause', () => {
  assert.equal(libellePreparation({ etat: 'attente' }), 'En attente')
  assert.equal(libellePreparation({ etat: 'en_cours', octets: 420, total: 1000, debitKbps: 2100 }), 'En cours · 42 % · 2,1 Mbit/s')
  assert.equal(libellePreparation({ etat: 'en_cours' }), 'En cours')
  assert.equal(libellePreparation({ etat: 'pret' }), 'Prêt')
  assert.equal(libellePreparation({ etat: 'echec', cause: 'disque plein' }), 'Échec : disque plein')
  assert.equal(libellePreparation(undefined), 'État inconnu')
})

// CA2 : une serie tient en une ligne, jamais ses douze episodes.
test('CA2 une serie se resume « S02E05 · prêt · suivant en préparation »', () => {
  const p: Preparation = {
    etat: 'pret',
    episodes: [
      { contenu: 'iptva:1.mkv', saison: 2, episode: 5, etat: 'pret' },
      { contenu: 'iptva:2.mkv', saison: 2, episode: 6, etat: 'en_cours', octets: 1, total: 4 },
      { contenu: 'iptva:3.mkv', saison: 2, episode: 7, etat: 'attente' },
    ],
  }
  assert.equal(resumeSerie(p), 'S02E05 · prêt · suivant en préparation')
  assert.equal(resumeSerie({ etat: 'en_cours', episodes: [{ contenu: 'x', saison: 1, episode: 1, etat: 'en_cours', octets: 50, total: 100 }] }), 'S01E01 · en cours · 50 %')
  assert.equal(resumeSerie({ etat: 'attente' }), 'En attente')
  assert.ok(!resumeSerie(p).includes('S02E07'), 'le troisieme episode n est pas enumere')
})

// CA2 : monter / descendre au clavier et a la telecommande.
test('CA2 deplacer : monter, descendre, bornes', () => {
  assert.deepEqual(deplacer(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b'])
  assert.deepEqual(deplacer(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c'])
  assert.deepEqual(deplacer(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'])
  assert.deepEqual(deplacer(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c'])
})

// CA3 : la rangee de l'Accueil met les prets d'abord, puis suit l'ordre de la liste.
test('CA3 tri de l Accueil : les prets d abord, puis le rang', () => {
  const l = [
    { cle: 'a', rang: 1, preparation: { etat: 'attente' } as Preparation },
    { cle: 'b', rang: 2, preparation: { etat: 'pret' } as Preparation },
    { cle: 'c', rang: 3 },
    { cle: 'd', rang: 4, preparation: { etat: 'pret' } as Preparation },
  ]
  assert.deepEqual(trierPretsDabord(l).map((e) => e.cle), ['b', 'd', 'a', 'c'])
})

// CA4 : pour un film termine, le prochain element de la liste est propose (jamais le film lui-meme).
test('CA4 prochain element de la liste apres un contenu', () => {
  const l = [{ cle: 'a' }, { cle: 'b' }, { cle: 'c' }]
  assert.equal(prochainDansListe(l, 'a')?.cle, 'b')
  assert.equal(prochainDansListe(l, 'c')?.cle, 'a')
  assert.equal(prochainDansListe(l, 'z')?.cle, 'a')
  assert.equal(prochainDansListe([{ cle: 'a' }], 'a'), undefined)
  assert.equal(prochainDansListe([], 'a'), undefined)
})

const saisons: SaisonApi[] = [
  { numero: 2, episodes: [{ id: 'iptva:21.mkv', numero: 1, titre: 'E1', extension: 'mkv', duree: 1, lecture: '/api/v1/vod/iptva:21.mkv' }] },
  {
    numero: 1,
    episodes: [
      { id: 'iptva:12.mkv', numero: 2, titre: 'E2', extension: 'mkv', duree: 1, lecture: '/api/v1/vod/iptva:12.mkv' },
      { id: 'iptva:11.mkv', numero: 1, titre: 'E1', extension: 'mkv', duree: 1, lecture: '/api/v1/vod/iptva:11.mkv' },
      { id: 'iptva:13.mkv', numero: 3, titre: 'E3', extension: '', duree: 1, lecture: '' },
    ],
  },
]

// CA4 : l'enchainement passe d'une saison a l'autre et s'arrete sur le dernier.
test('CA4 episode suivant : saisons dans l ordre, passage de saison, fin de serie', () => {
  assert.deepEqual(episodesOrdonnes(saisons, 'Ma serie').map((e) => e.nom), ['Ma serie — S01E01', 'Ma serie — S01E02', 'Ma serie — S02E01'])
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:11.mkv')?.cle, 'series:iptva:12.mkv')
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:12.mkv')?.cle, 'series:iptva:21.mkv')
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:21.mkv'), undefined)
  assert.equal(episodeApres(saisons, 'Ma serie', 'series:iptva:99.mkv'), undefined)
})

// CA5 : la sonde vise le prochain episode non vu, a partir du point indique.
test('CA5 prochain episode a regarder : premier non vu, a partir de « depuis »', () => {
  const vus = new Map([['series:iptva:11.mkv', 1]])
  assert.equal(prochainAVoir(saisons, 'S', vus, 0.95)?.cle, 'series:iptva:12.mkv')
  assert.equal(prochainAVoir(saisons, 'S', new Map(), 0.95, { saison: 2, episode: 1 })?.cle, 'series:iptva:21.mkv')
  assert.equal(prochainAVoir(saisons, 'S', new Map([['series:iptva:11.mkv', 1], ['series:iptva:12.mkv', 1], ['series:iptva:21.mkv', 0.99]]), 0.95), undefined)
})

// CA5 : les trois messages de la sonde ; « inconnu » n'affiche rien.
test('CA5 libelle de disponibilite', () => {
  assert.deepEqual(libelleDisponibilite({ etat: 'pret', debit_kbps: 0 }), { texte: 'Prêt', proposerAVoir: false, ton: 'pret' })
  assert.deepEqual(libelleDisponibilite({ etat: 'immediat', debit_kbps: 12000 }), { texte: 'Disponible immédiatement', proposerAVoir: false, ton: 'ok' })
  assert.deepEqual(libelleDisponibilite({ etat: 'lent', debit_kbps: 2700, requis_kbps: 4400 }), {
    texte: "Lent (2,7 Mbit/s pour 4,4 nécessaires) : préparer d'avance ?", proposerAVoir: true, ton: 'lent',
  })
  assert.equal(libelleDisponibilite({ etat: 'lent', debit_kbps: 2700 })?.texte, "Lent (2,7 Mbit/s) : préparer d'avance ?")
  assert.equal(libelleDisponibilite({ etat: 'inconnu', debit_kbps: 0 }), undefined)
  assert.equal(libelleDisponibilite(undefined), undefined)
})
