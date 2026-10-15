// Capture les trois gabarits de la maquette pour chaque ecran : la reference
// que les agents doivent reproduire. Aucun flux reel : la maquette est fictive.
import { chromium } from 'playwright'
const ECRANS = ['', 'direct', 'guide', 'films', 'fiche-film', 'series', 'fiche-serie', 'lecteur']
const TAILLES = { bureau: [1440, 900], tablette: [820, 1180], mobile: [390, 844] }
const nav = await chromium.launch()
for (const [nom, [l, h]] of Object.entries(TAILLES)) {
  const page = await nav.newPage({ viewport: { width: l, height: h } })
  for (const e of ECRANS) {
    await page.goto(`http://127.0.0.1:8777/Lecteur%20IPTV.dc.html${e ? '?ecran=' + e : ''}`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `captures/resp-${nom}-${e || 'accueil'}.png` })
  }
  await page.close()
}
await nav.close()
console.log('captures de reference : captures/resp-{bureau,tablette,mobile}-<ecran>.png')
