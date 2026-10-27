// US-39 CA1 et CA3 dans la liste du DIRECT : une ligne par groupe de variantes,
// badges des qualites, ouverture de la variante recommandee. Application
// complete (dist) contre serveur-factice.mjs (127.0.0.1 ; aucun vrai fournisseur).
//   NODE_OPTIONS=--tls-max-v1.2 npm run build && node tests/e2e/us39-direct.mjs
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerServeurFactice, COMPTE, MOT_DE_PASSE } from './serveur-factice.mjs'
import { creerVerificateur, jusqua } from './banc.mjs'

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const v = creerVerificateur('US-39 Direct (groupes de variantes)')

const lireIdb = (page, table, cle) =>
  page.evaluate(
    ([t, c]) =>
      new Promise((ok, ko) => {
        const r = indexedDB.open('mytv')
        r.onerror = () => ko(r.error)
        r.onsuccess = () => {
          const base = r.result
          const st = base.transaction(t).objectStore(t)
          const q = c === undefined ? st.getAll() : st.get(c)
          q.onsuccess = () => { base.close(); ok(q.result) }
          q.onerror = () => { base.close(); ko(q.error) }
        }
      }),
    [table, cle],
  )

const serveur = await demarrerServeurFactice({ dist: DIST, taille: { chaines: 30, films: 20, series: 5, variantes: 3 } })
const navigateur = await chromium.launch()
const externes = []
try {
  const ctx = await navigateur.newContext({ viewport: { width: 1360, height: 860 } })
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url())
    if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue()
    externes.push(route.request().url())
    return route.abort()
  })
  ctx.setDefaultTimeout(15_000)
  const page = await ctx.newPage()
  const erreurs = []
  page.on('pageerror', (e) => erreurs.push(e.message))
  await page.goto(`${serveur.origine}/`)
  await page.getByLabel('Identifiant').fill(COMPTE)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByPlaceholder('Nom du profil').fill('Salon')
  await page.getByRole('button', { name: 'Créer et utiliser' }).click()
  const total = serveur.etat.catalogue.live.length + serveur.etat.catalogue.vod.length + serveur.etat.catalogue.series.length
  v.ok(await jusqua(async () => (await lireIdb(page, 'catalogue'))?.length === total, 30_000, 300), `catalogue importe (${total} entrees, dont ${serveur.etat.catalogue.live.length} chaines)`)

  // CA1 : l'import pose la cle de groupe sur chaque chaine.
  const base = await lireIdb(page, 'catalogue', 'live:iptva:100000')
  const hd = await lireIdb(page, 'catalogue', 'live:iptva:110000')
  const k4 = await lireIdb(page, 'catalogue', 'live:iptva:120000')
  v.ok(base?.groupe === 'fr|chaine 0' && hd?.groupe === 'fr|chaine 0' && k4?.groupe === 'fr|chaine 0', `cle de groupe identique pour les trois variantes (${base?.groupe}, ${hd?.groupe}, ${k4?.groupe})`)
  v.ok(k4?.categorie !== base?.categorie, 'la 4K est dans une autre categorie')
  v.ok((await lireIdb(page, 'catalogue', 'vod:iptva:5000'))?.groupe === undefined, 'un film n a pas de groupe')

  // CA1 : une seule ligne par groupe dans la liste du Direct.
  await page.goto(`${serveur.origine}/direct`)
  const lignes = page.locator('button[title^="Chaîne "]')
  v.ok(await jusqua(async () => (await lignes.count()) > 0, 15_000, 200), 'liste du Direct affichee')
  const titres = await lignes.evaluateAll((els) => els.map((e) => e.getAttribute('title')))
  v.ok(titres.includes('Chaîne 0'), `la ligne « Chaîne 0 » est la (${titres.slice(0, 6).join(', ')})`)
  v.ok(!titres.includes('Chaîne 0 HD'), '« Chaîne 0 HD » (meme categorie) n a PAS sa propre ligne')
  v.ok(titres.filter((t) => t === 'Chaîne 0').length === 1, 'une seule ligne pour le groupe')
  const ligne0 = page.locator('button[title="Chaîne 0"]')
  const badge = ligne0.locator('[data-role="variantes"]')
  v.ok((await badge.count()) === 1, 'badge des variantes sur la ligne')
  v.ok((await badge.innerText()) === '4K · HD · standard', `badge « 4K · HD · standard » (${await badge.innerText()})`)
  v.ok((await page.locator('button[title="Chaîne 3"] [data-role="variantes"]').count()) === 0, 'une chaine sans variante n a pas de badge et reste telle quelle')
  const compte = await page.locator('h1 + span.num').first().innerText()
  v.ok(/chaînes sur/.test(compte), `le compte dit « n chaînes sur m » (${compte})`)

  // CA3 : ouvrir le groupe ouvre la variante recommandee (sans mesure ni historique :
  // la plus haute definition tenable, la 4K/HEVC etant illisible ici -> HD).
  await ligne0.click()
  v.ok(await jusqua(() => page.url().endsWith('/lecture/live:iptva:110000'), 10_000, 100), `la variante HD (iptva:110000) est ouverte (${page.url()})`)
  v.ok(externes.length === 0, `aucune requete hors 127.0.0.1 (${externes.length})`)
  v.ok(erreurs.length === 0, `aucune erreur de page (${erreurs.join(' | ').slice(0, 200)})`)
} finally {
  await navigateur.close()
  await serveur.fermer()
}
v.termine()
