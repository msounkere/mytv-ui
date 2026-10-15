import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// US-20 CA5 : plus aucune reference a l'ancien service ni aux URL a identifiants
// du fournisseur dans le code source. Le test greppe src/ ENTIER.

// Le test est empaquete dans un dossier temporaire : la racine vient du lanceur.
const racine = join(process.env['MYTV_RACINE'] ?? process.cwd(), 'src')

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((nom) => {
    const p = join(dir, nom)
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx|css)$/.test(nom) ? [p] : []
  })
}

const INTERDITS: Array<[string, RegExp]> = [
  ['/flux/ (ancien service)', /\/flux\//],
  ['player_api.php', /player_api\.php/],
  ['xmltv.php', /xmltv\.php/],
  ['worker XMLTV', /xmltv\.worker/],
  ['/live|movie|series/<utilisateur>/<mot de passe>', /\/(live|movie|series)\/<[^>]+>\/<[^>]+>/],
  ['URL de flux construite avec des identifiants', /\/(live|movie|series)\/\$\{[^}]*\}\/\$\{[^}]*\}/],
  ['URL de flux avec des identifiants (concatenation)', /['"`]\/(live|movie|series)\/['"`]\s*\+/],
]

test('src/ ne contient aucune reference a /flux/, player_api.php, xmltv.php ni aux URL a identifiants', () => {
  const trouvailles: string[] = []
  for (const f of fichiers(racine)) {
    const lignes = readFileSync(f, 'utf8').split('\n')
    lignes.forEach((l, i) => {
      for (const [nom, re] of INTERDITS) if (re.test(l)) trouvailles.push(`${relative(racine, f)}:${i + 1} [${nom}] ${l.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(trouvailles, [], `references interdites :\n${trouvailles.join('\n')}`)
})
