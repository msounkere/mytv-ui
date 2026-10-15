// Garde-fou partage par les tests : l'abonnement n'autorise QU'UN SEUL flux
// simultane et l'utilisateur regarde la television. Aucun test n'ouvre de flux.
//
// Les motifs sont ancres sur la RACINE du chemin : `/flux/relais/resource/live/
// <id>/logo` n'est qu'une image de chaine et doit passer, sinon la moitie de
// l'interface se teste sans logos.
const INTERDITS = [
  /^\/live\//, /^\/movie\//, /^\/series\//,
  /^\/flux\/live\//, /^\/flux\/movie\//, /^\/flux\/series\//,
  /^\/flux\/seg\//, /^\/flux\/hls\//,
  // La sonde de codec LIT le flux chez le relais : elle compte comme une
  // connexion ouverte, donc elle tombe aussi.
  /^\/flux\/sonde\//,
]

export async function couperLesFlux(page) {
  const bloques = []
  await page.route('**/*', (route) => {
    const chemin = new URL(route.request().url()).pathname
    if (INTERDITS.some((r) => r.test(chemin))) {
      bloques.push(chemin)
      return route.abort()
    }
    return route.continue()
  })
  return bloques
}

export async function connecter(page) {
  const champs = page.locator('input[type="password"]')
  if ((await champs.count()) === 0) return false
  const tous = page.locator('input')
  await tous.nth(0).fill('sounkere')
  await tous.nth(1).fill('hktsIKymwGvDs2')
  await page.keyboard.press('Enter')
  await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 30000 })
  await page.waitForTimeout(1500)
  return true
}
