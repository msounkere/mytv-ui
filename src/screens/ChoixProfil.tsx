import { For, Show, createSignal, onMount } from 'solid-js'
import Icone from '../components/Icone'
import { choisirProfil, creerProfil, deconnexion, profils } from '../lib/auth'
import { ErreurApi, ErreurReseau } from '../lib/api'

// Choix du profil actif. Tant qu'aucun profil n'est actif, le service refuse
// favoris, historique et reglages (`409 profil_requis`) : la coque n'a donc rien
// de sensé a montrer. Cet ecran est la seule sortie, d'ou aussi la creation et
// la deconnexion -- un compte sans profil ne doit pas etre une impasse.

function teinteDe(nom: string): number {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

export function messageErreur(e: unknown): string {
  if (e instanceof ErreurReseau) return 'Le service est injoignable.'
  if (e instanceof ErreurApi) return e.message
  return String(e)
}

export default function ChoixProfil() {
  const [nom, poserNom] = createSignal('')
  const [erreur, poserErreur] = createSignal('')
  const [occupe, poserOccupe] = createSignal(false)
  let racine: HTMLDivElement | undefined

  // Focus initial sur le premier element utile (US-47 CA4, A UX1) : le premier
  // profil, sinon le champ du nouveau profil — indispensable a la telecommande.
  onMount(() => {
    requestAnimationFrame(() => {
      racine?.querySelector<HTMLElement>('[data-role="profil"], input')?.focus()
    })
  })

  async function agir(f: () => Promise<unknown>) {
    if (occupe()) return
    poserErreur('')
    poserOccupe(true)
    try {
      await f()
    } catch (e) {
      poserErreur(messageErreur(e))
    } finally {
      poserOccupe(false)
    }
  }

  const creer = (ev: Event) => {
    ev.preventDefault()
    const n = nom().trim()
    if (!n) return
    void agir(async () => {
      const p = await creerProfil(n)
      poserNom('')
      await choisirProfil(p.id)
    })
  }

  return (
    <div
      style={{
        height: '100%', display: 'grid', 'place-items': 'center',
        padding: '24px', background: 'var(--bgfx, var(--bg))',
      }}
    >
      <div
        ref={racine}
        role="dialog"
        aria-label="Choisir un profil"
        style={{
          width: 'min(420px, 100%)', display: 'grid', gap: '14px',
          padding: '28px 26px', background: 'var(--panel)',
          border: '1px solid var(--line)', 'border-radius': 'var(--r-xl)',
          'box-shadow': 'var(--moov-shadow-xl)',
        }}
      >
        <div style={{ display: 'grid' }}>
          <h1 style={{ 'font-size': '18px' }}>Qui regarde ?</h1>
          <span class="secondaire" style={{ 'font-size': '12px' }}>
            Les favoris, l'historique et les réglages suivent le profil.
          </span>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <For each={profils()}>
            {(p) => (
              <button
                data-role="profil"
                onClick={() => void agir(() => choisirProfil(p.id))}
                disabled={occupe()}
                style={{
                  display: 'flex', 'align-items': 'center', gap: '12px', 'min-height': '44px',
                  padding: '10px 12px', border: '1px solid var(--line2)',
                  'border-radius': 'var(--r-md)', 'text-align': 'left',
                }}
              >
                <span class="avatar" style={{ '--teinte': `${teinteDe(p.nom)}` }}>
                  {p.nom.slice(0, 1).toUpperCase()}
                </span>
                <strong class="tronque" style={{ flex: 1 }}>{p.nom}</strong>
                <Icone nom="chevron_right" taille={18} />
              </button>
            )}
          </For>
        </div>

        <form onSubmit={creer} style={{ display: 'grid', gap: '8px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span class="secondaire" style={{ 'font-size': '12px' }}>
              {profils().length === 0 ? 'Créer votre premier profil' : 'Nouveau profil'}
            </span>
            <input
              type="text"
              value={nom()}
              maxLength={64}
              placeholder="Nom du profil"
              onInput={(e) => poserNom(e.currentTarget.value)}
              style={{ 'min-height': '44px' }}
            />
          </label>
          <button
            type="submit"
            disabled={occupe() || nom().trim() === ''}
            style={{ background: 'var(--acc)', color: 'var(--acc-ink)', padding: '9px 16px' }}
          >
            Créer et utiliser
          </button>
        </form>

        <Show when={erreur()}>
          <p role="alert" style={{ color: 'var(--err)', margin: 0, 'font-size': '13px' }}>{erreur()}</p>
        </Show>

        <button
          onClick={() => void deconnexion()}
          class="secondaire"
          style={{ 'font-size': '12px', padding: '4px' }}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
