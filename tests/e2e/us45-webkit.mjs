// US-45 CA9 (D16) : WebKit (moteur de tout iPhone) -- zapping apres un echec de flux HLS : la page ne
// doit pas planter (« Target crashed »). Reproduction de /opt/mytv-work/audit/D/crash-webkit.mjs, en
// verification : chaine en erreur (le faux serveur n'a pas de HLS : 404), puis changement de chaine par
// ↓, par « Chaîne suivante », par la liste de zapping, trois fois de suite.
//   npm run build && NODE_OPTIONS=--tls-max-v1.2 node tests/e2e/us45-webkit.mjs
import { ouvrirSession, lancer, creerVerificateur, attendre, pause } from './us45-banc.mjs'

const v = creerVerificateur('US-45 CA9 webkit zapping')
const navigateur = await lancer('webkit')
const s = await ouvrirSession({ navigateur, moteur: 'webkit', gabarit: 'bureau' })
const { page, serveur, commandes, chemin } = s
try {
  const attendreErreur = () => page.locator('[role="alert"]').waitFor({ timeout: 25_000 })
  await page.goto(`${serveur.origine}/lecture/live:iptva:100003`)
  await page.locator('[data-role="commandes"]').waitFor({ state: 'attached' })
  await attendreErreur()
  v.ok(/Impossible de lire|Ce contenu|flux/i.test(await page.locator('[role="alert"]').innerText()), 'chaine en echec HLS : erreur nommee (le faux serveur n a pas de direct)')
  // 1. ↓ (clavier)
  await page.locator('[tabindex="-1"]').first().focus()
  await page.keyboard.press('ArrowDown')
  await attendre(async () => (await chemin()) !== '/lecture/live:iptva:100003', { quoi: 'zap clavier' })
  await pause(2500)
  v.ok(!s.plante(), `CA9 zap par ↓ apres un echec HLS : la page vit (${await chemin()})`)
  // 2. « Chaîne suivante » (bouton)
  await attendreErreur().catch(() => {})
  await page.mouse.move(600, 100)
  await commandes().getByRole('button', { name: 'Chaîne suivante' }).evaluate((b) => b.click())
  await pause(2500)
  v.ok(!s.plante(), `CA9 zap par « Chaîne suivante » : la page vit (${await chemin()})`)
  // 3. Liste de zapping (colonne)
  await attendreErreur().catch(() => {})
  const ligne = page.locator('aside button').filter({ hasText: /Chaîne 1\b/ }).first()
  if (await ligne.count()) await ligne.evaluate((b) => b.click())
  else await page.keyboard.press('ArrowDown')
  await pause(2500)
  v.ok(!s.plante(), `CA9 zap par la liste : la page vit (${await chemin()})`)
  // 4. Encore trois ↓ rapides.
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await pause(800) }
  await pause(2000)
  v.ok(!s.plante(), 'CA9 trois zaps rapides : la page vit')
  v.ok((await page.locator('[data-role="commandes"]').count()) === 1, 'le lecteur est toujours la')
} catch (e) {
  v.ok(false, `exception : ${e.stack} (plante=${s.plante()})`)
} finally {
  await s.fermer()
  await navigateur.close()
  v.termine()
}
