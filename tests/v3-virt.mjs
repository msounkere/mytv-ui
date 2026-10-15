import { chromium } from 'playwright'
const PROFIL = '/tmp/claude-0/-root/af0bfe04-324f-47cd-9f6b-faadeffb4ea5/scratchpad/profil-mytv'
const nav = await chromium.launchPersistentContext(PROFIL, { viewport: { width: 1440, height: 900 } })
const page = nav.pages()[0] ?? await nav.newPage()
page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 200)))
await page.goto('http://localhost:5173/app/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('.rail-item', { hasText: 'Direct' }).first().click()
await page.waitForTimeout(2500)
// Une recherche large déplie tous les groupes : la colonne porte alors ses 358
// catégories d'un coup, c'est le pire cas pour la virtualisation.
await page.getByPlaceholder('Rechercher une catégorie').fill('a')
await page.waitForTimeout(1200)
console.log('colonne, tout déplié :', JSON.stringify(await page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Catégories"]')
  const z = [...aside.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto')
  const total = parseFloat(z.firstElementChild.style.height)
  return { compte: aside.querySelector('.num')?.textContent, hauteurTotale: z.firstElementChild.style.height,
    lignesTotal: Math.round(total / 34), lignesDOM: z.firstElementChild.children.length }
})))
await page.getByLabel('Effacer la recherche').click()
await page.waitForTimeout(1200)
console.log('colonne, par défaut  :', JSON.stringify(await page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Catégories"]')
  const z = [...aside.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto')
  return { hauteurTotale: z.firstElementChild.style.height, lignesDOM: z.firstElementChild.children.length }
})))
await nav.close()
