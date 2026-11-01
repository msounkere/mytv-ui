// US-43 CA4 : enchainement de fin d'episode dans le lecteur seul (harnais), contre le
// faux serveur (serveur-fictif.mjs) -- jamais le vrai fournisseur.
//   NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us43-lecteur.mjs
import { construireHarnais, ouvrirBanc, creerVerificateur, jusqua, attendre, film } from './banc.mjs'

const v = creerVerificateur('US-43 lecteur')
await construireHarnais()

const banc = await ouvrirBanc({ ecran: 'lecture' })
const { page } = banc
try {
  // Le film iptva:100 est un MP3 de 20 s servi tel quel : le decompte de 10 s demarre
  // a 15 s de la fin, donc vers 5 s de lecture.
  const episode = (n) => ({ ...film(n), cle: `series:iptva:${n}.mkv`, type: 'series', idServeur: `iptva:${n}.mkv`, lecture: `/api/v1/vod/iptva:${n}`, nom: `Serie — S01E0${n - 99}` })
  const suivant = (n, pret) => ({ titre: `Serie — S01E0${n - 99}`, pret, entree: episode(n), url: `/api/v1/vod/iptva:${n}` })
  const ouvrir = (e, s) => page.evaluate(([x, y]) => window.harnais.ouvrir(x, undefined, y), [e, s])
  const fermer = () => page.evaluate(() => window.harnais.fermer())
  const ouvertures = () => page.evaluate(() => window.harnais.ouvertures.slice())
  const decompte = () => page.locator('[data-role="prochain-episode"]')
  const reinit = async () => {
    await fermer()
    await attendre(1500)
    banc.serveur.reinit()
  }

  // --- 1. CA4 : le decompte s'annule a Echap et ne lance PAS l'episode suivant ----------
  console.log('1. decompte annule par Echap')
  await ouvrir(episode(100), suivant(100, false))
  v.ok(await jusqua(async () => (await decompte().count()) > 0, 20_000), 'CA4 le decompte « Épisode suivant dans N s » apparait avant la fin')
  v.ok(/Épisode suivant dans \d+ s/.test(await decompte().innerText()), 'CA4 il affiche les secondes restantes')
  v.ok(!/prêt/.test(await decompte().innerText()), 'CA4 sans fichier prepare, rien ne dit « prêt »')
  await page.keyboard.press('Escape')
  v.ok(await jusqua(async () => (await decompte().count()) === 0, 3000), 'CA4 Échap ferme le decompte')
  const avant = (await ouvertures()).length
  await attendre(11_500)
  v.ok((await ouvertures()).length === avant, "CA4 l'episode suivant n'a PAS demarre apres l'annulation")
  v.ok((await decompte().count()) === 0, 'CA4 le decompte ne revient pas sur le meme episode')

  // --- 2. CA4 : demarrage automatique au bout du decompte, avec la mention « prêt » ------
  console.log('2. demarrage automatique, suivant prepare')
  await reinit()
  await ouvrir(episode(100), suivant(100, true))
  v.ok(await jusqua(async () => (await decompte().count()) > 0, 20_000), 'CA4 decompte affiche')
  v.ok((await page.locator('[data-role="suivant-pret"]').count()) === 1, 'CA4 le decompte dit que le suivant est prêt (préparé d’avance)')
  v.ok(await jusqua(async () => (await ouvertures()).at(-1) === 'series:iptva:100.mkv' && (await ouvertures()).length === 2, 20_000), "CA4 l'episode suivant demarre tout seul a la fin du decompte")
  v.ok(await jusqua(() => banc.api((r) => r.chemin === '/api/v1/vod/iptva:100' && r.methode === 'GET').length >= 1, 10_000), 'CA4 et son flux est demande par le lecteur habituel (/api/v1/vod/<id>, aucune adresse speciale)')

  // --- 3. CA4 : « Lire maintenant » n'attend pas ------------------------------------------
  console.log('3. lire maintenant')
  await reinit()
  await ouvrir(episode(100), suivant(100, false))
  v.ok(await jusqua(async () => (await decompte().count()) > 0, 20_000), 'decompte affiche')
  await decompte().getByRole('button', { name: 'Lire maintenant' }).click()
  v.ok(await jusqua(async () => (await ouvertures()).at(-1) === 'series:iptva:100.mkv', 5000), 'CA4 « Lire maintenant » lance le suivant sans attendre')

  v.ok(banc.externes.length === 0, 'aucune requete hors 127.0.0.1')
  v.ok(banc.erreursPage.length === 0, `aucune erreur de page (${banc.erreursPage.join(' | ')})`)
} finally {
  await banc.fermer()
  v.termine()
}
