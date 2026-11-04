// Navigation spatiale MINIMALE au clavier et a la telecommande (US-47 CA7) :
// ← → entre les cartes d'une rangee horizontale et entre les onglets ; ↑ ↓
// entre les rangees (sections) de l'Accueil. Le guide et les grilles
// d'affiches restent au Tab : ils n'ont pas de rangee, donc rien ici ne s'y
// declenche. Aucune dependance a un composant : tout se lit dans le DOM, ce
// qui vaut pour les rangees de ui-7 comme pour les onglets de ui-6.

const FOCALISABLES = 'a[href], button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]'
const SAISIE = 'input, textarea, select, [contenteditable="true"]'
/** A l'interieur, les fleches ont deja un sens (menu, liste de suggestions, feuille). */
const RESERVE = '[role="menu"], [role="listbox"], [role="dialog"][aria-modal="true"], [role="radiogroup"], [data-role="commandes"]'

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  for (let a: Element | null = el; a; a = a.parentElement) {
    if (a.getAttribute('aria-hidden') === 'true') return false
    const cs = getComputedStyle(a)
    // Les actions revelees au survol (opacite nulle) ne sont pas des cibles.
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false
  }
  return true
}

/**
 * Cibles d'une rangee : les elements focalisables VISIBLES les plus externes.
 * Une carte contient ses propres boutons (« ⋯ », lecture) : les fleches vont de
 * carte en carte, pas de bouton en bouton a l'interieur d'une carte.
 */
function focalisables(conteneur: Element): HTMLElement[] {
  const tous = [...conteneur.querySelectorAll<HTMLElement>(FOCALISABLES)].filter(visible)
  return tous.filter((e) => !tous.some((a) => a !== e && a.contains(e)))
}

function centreX(el: Element): number {
  const r = el.getBoundingClientRect()
  return r.left + r.width / 2
}

function focaliser(el: HTMLElement): void {
  el.focus({ preventScroll: true })
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Rangee d'un element : un conteneur de navigation declare, sinon sa section. */
function rangeeDe(el: Element): Element | null {
  return el.closest('[data-navigation="rangee"]') ?? el.closest('section')
}

/** Voisin de gauche ou de droite SUR LA MEME LIGNE visuelle d'une rangee. */
export function voisinHorizontal(actif: HTMLElement, sens: -1 | 1): HTMLElement | null {
  const onglets = actif.closest('[role="tablist"]')
  if (onglets) {
    const liste = [...onglets.querySelectorAll<HTMLElement>('[role="tab"]')].filter(visible)
    const i = liste.indexOf(actif)
    return i < 0 ? null : (liste[i + sens] ?? null)
  }
  const rangee = rangeeDe(actif)
  if (!rangee) return null
  // Depuis un bouton INTERNE a une carte, on raisonne depuis la carte.
  const cibles = focalisables(rangee)
  const porteur = cibles.find((e) => e.contains(actif)) ?? actif
  const rp = porteur.getBoundingClientRect()
  const memeLigne = cibles.filter((e) => {
    if (e === porteur || porteur.contains(e) || e.contains(porteur)) return false
    const q = e.getBoundingClientRect()
    return Math.abs(q.top + q.height / 2 - (rp.top + rp.height / 2)) < Math.max(rp.height, q.height) / 2
  })
  const candidats = memeLigne
    .filter((e) => (sens > 0 ? e.getBoundingClientRect().left > rp.left + 1 : e.getBoundingClientRect().right < rp.right - 1))
    .sort((a, b) => sens * (a.getBoundingClientRect().left - b.getBoundingClientRect().left))
  return candidats[0] ?? null
}

/** Rangee du dessus ou du dessous : l'element le plus proche horizontalement. */
export function voisinVertical(actif: HTMLElement, sens: -1 | 1, racine: Element): HTMLElement | null {
  const rangee = rangeeDe(actif)
  if (!rangee) return null
  const rangees = [...racine.querySelectorAll('[data-navigation="rangee"], section')]
    .filter((s) => visible(s) && !s.querySelector('[data-navigation="rangee"], section') && focalisables(s).length > 0)
  const i = rangees.indexOf(rangee)
  if (i < 0) return null
  const cible = rangees[i + sens]
  if (!cible) return null
  const x = centreX(actif)
  // Les cartes hors du champ de la rangee (defilement horizontal) ne comptent pas.
  const cadre = cible.getBoundingClientRect()
  const dedans = focalisables(cible).filter((e) => {
    const q = e.getBoundingClientRect()
    return q.right > cadre.left && q.left < cadre.right
  })
  const liste = dedans.length ? dedans : focalisables(cible)
  return liste.sort((a, b) => Math.abs(centreX(a) - x) - Math.abs(centreX(b) - x))[0] ?? null
}

/**
 * Gestionnaire `keydown` de la coque. `racine` : la zone de contenu (`main`),
 * seule concernee ; le rail et l'en-tete gardent le Tab.
 */
export function brancherNavigationClavier(racine: () => HTMLElement | null): () => void {
  const auClavier = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const actif = document.activeElement
    const zone = racine()
    if (!(actif instanceof HTMLElement) || !zone || !zone.contains(actif)) return
    if (actif.matches(SAISIE) || actif.closest(RESERVE)) return
    let cible: HTMLElement | null = null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') cible = voisinHorizontal(actif, e.key === 'ArrowRight' ? 1 : -1)
    else cible = voisinVertical(actif, e.key === 'ArrowDown' ? 1 : -1, zone)
    if (!cible) return
    e.preventDefault()
    focaliser(cible)
    // Un onglet se choisit en y arrivant (comme un vrai `tablist`).
    if (cible.getAttribute('role') === 'tab') cible.click()
  }
  document.addEventListener('keydown', auClavier)
  return () => document.removeEventListener('keydown', auClavier)
}

const ACTION_PRINCIPALE = /^(regarder|reprendre|recommencer|lire|épisode suivant|episode suivant)/i

/**
 * Focus initial d'une fiche sur son action principale (US-47 CA7) : douze
 * tabulations pour atteindre « Regarder » etaient le constat de l'audit B. La
 * fiche se charge a la demande : on attend qu'elle soit la, un court instant.
 */
export function focaliserActionPrincipale(racine: () => HTMLElement | null, delaiMs = 2500): () => void {
  const debut = Date.now()
  let arret = false
  const essayer = () => {
    if (arret) return
    const zone = racine()
    const fiche = zone?.querySelector('[data-role="fiche-film"], [data-role="fiche-serie"]')
    if (fiche) {
      const explicite = fiche.querySelector<HTMLElement>('[data-role="action-principale"]')
      const bouton =
        explicite ??
        [...fiche.querySelectorAll<HTMLElement>('button')].find(
          (b) => visible(b) && ACTION_PRINCIPALE.test((b.getAttribute('aria-label') || b.textContent || '').trim()),
        )
      if (bouton) {
        // Un champ deja en cours de saisie ne doit pas perdre le focus.
        const actif = document.activeElement
        if (!(actif instanceof HTMLElement) || !actif.matches(SAISIE)) bouton.focus({ preventScroll: true })
        return
      }
    }
    if (Date.now() - debut < delaiMs) requestAnimationFrame(essayer)
  }
  requestAnimationFrame(essayer)
  return () => {
    arret = true
  }
}
