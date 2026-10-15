import { Show, createSignal, onMount } from 'solid-js'
import Icone from '../components/Icone'
import {
  amorcageOuvert, amorcer, connexion, etatAuth, verifierSession, type Echec,
} from '../lib/auth'

// Page de connexion. Tant qu'elle est affichee, AUCUN ecran de l'application
// n'est monte (voir Portail.tsx) : l'URL publique ne montre donc plus une
// interface utilisable mais une porte.
//
// POURQUOI l'etat du service est dit franchement : sans lui, un service arrete
// donnerait un formulaire qui refuse tout sans jamais expliquer pourquoi --
// exactement l'ecran muet que le brief interdit.

export default function Connexion() {
  const [identifiant, poserIdentifiant] = createSignal('')
  const [motDePasse, poserMotDePasse] = createSignal('')
  const [code, poserCode] = createSignal('')
  const [confirmation, poserConfirmation] = createSignal('')
  const [echec, poserEchec] = createSignal<Echec | null>(null)
  const [enCours, poserEnCours] = createSignal(false)
  // L'amorcage est propose, pas impose : on peut avoir cree le compte en ligne
  // de commande et vouloir simplement se connecter.
  const [creation, poserCreation] = createSignal(false)

  onMount(() => {
    if (etatAuth() === 'inconnu') void verifierSession()
  })

  const injoignable = () => etatAuth() === 'injoignable'
  const amorcage = () => amorcageOuvert() && creation()

  async function envoyer(e: Event) {
    e.preventDefault()
    if (enCours()) return
    poserEchec(null)
    if (amorcage() && motDePasse() !== confirmation()) {
      poserEchec({ message: 'Les deux saisies du mot de passe diffèrent.' })
      return
    }
    poserEnCours(true)
    const r = amorcage()
      ? await amorcer(code(), identifiant().trim(), motDePasse())
      : await connexion(identifiant().trim(), motDePasse())
    poserEnCours(false)
    if (r) {
      poserEchec(r)
      poserMotDePasse('')
      poserConfirmation('')
    }
  }

  async function reessayer() {
    poserEchec(null)
    poserEnCours(true)
    await verifierSession()
    poserEnCours(false)
  }

  return (
    <div
      style={{
        height: '100%', display: 'grid', 'place-items': 'center',
        padding: '24px', background: 'var(--bgfx, var(--bg))',
      }}
    >
      <form
        onSubmit={envoyer}
        style={{
          width: 'min(360px, 100%)', display: 'grid', gap: '14px',
          padding: '28px 26px', background: 'var(--panel)',
          border: '1px solid var(--line)', 'border-radius': 'var(--r-xl)',
          'box-shadow': 'var(--moov-shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <span style={{ display: 'grid', color: 'var(--acc-fg)' }}>
            <Icone nom="vpn_lock" taille={24} />
          </span>
          <div style={{ display: 'grid' }}>
            <h1 style={{ 'font-size': '18px' }}>MyTV</h1>
            <span class="secondaire" style={{ 'font-size': '12px' }}>
              {amorcage() ? 'Création du premier compte' : 'Connexion'}
            </span>
          </div>
        </div>

        <Show when={injoignable()}>
          <Encadre couche="err" titre="Service injoignable">
            Le service <code>/flux</code> ne répond pas. La connexion est impossible
            tant qu'il est arrêté — les favoris et l'historique déjà présents sur
            cette machine, eux, ne sont pas perdus.
          </Encadre>
        </Show>

        <Show when={!injoignable()}>
          <Show when={amorcage()}>
            <p class="secondaire" style={{ margin: 0, 'font-size': '12px' }}>
              Aucun compte n'existe encore. Le code d'installation se trouve dans
              le fichier <code>.env</code> du service.
            </p>
            <Champ
              libelle="Code d'installation"
              valeur={code()}
              surSaisie={poserCode}
              masque
              auto="off"
            />
          </Show>

          <Champ
            libelle="Identifiant"
            valeur={identifiant()}
            surSaisie={poserIdentifiant}
            auto="username"
            premier
          />
          <Champ
            libelle="Mot de passe"
            valeur={motDePasse()}
            surSaisie={poserMotDePasse}
            masque
            auto={amorcage() ? 'new-password' : 'current-password'}
          />
          <Show when={amorcage()}>
            <Champ
              libelle="Confirmation"
              valeur={confirmation()}
              surSaisie={poserConfirmation}
              masque
              auto="new-password"
            />
            <p class="tertiaire" style={{ margin: 0, 'font-size': '12px' }}>
              Douze caractères au minimum.
            </p>
          </Show>
        </Show>

        <Show when={echec()}>
          {(e) => (
            <Encadre couche="err" titre="Connexion refusée">
              {e().message}
              <Show when={e().retardSecondes}>
                {(s) => <> Nouvel essai dans {s()} s.</>}
              </Show>
            </Encadre>
          )}
        </Show>

        <Show
          when={!injoignable()}
          fallback={
            <button
              type="button"
              onClick={reessayer}
              disabled={enCours()}
              style={{ border: '1px solid var(--line2)', padding: '9px 16px' }}
            >
              {enCours() ? 'Vérification…' : 'Réessayer'}
            </button>
          }
        >
          <button
            type="submit"
            disabled={enCours() || !identifiant() || !motDePasse()}
            style={{
              background: 'var(--acc)', color: 'var(--acc-ink)',
              padding: '9px 16px', opacity: enCours() ? 0.7 : 1,
            }}
          >
            {enCours()
              ? 'Vérification…'
              : amorcage()
                ? 'Créer le compte'
                : 'Se connecter'}
          </button>
        </Show>

        <Show when={amorcageOuvert() && !injoignable()}>
          <button
            type="button"
            onClick={() => {
              poserEchec(null)
              poserCreation((c) => !c)
            }}
            class="secondaire"
            style={{ 'font-size': '12px', padding: '4px' }}
          >
            {creation() ? "J'ai déjà un compte" : 'Créer le premier compte'}
          </button>
        </Show>
      </form>
    </div>
  )
}

function Encadre(props: { couche: 'err'; titre: string; children: unknown }) {
  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px', background: 'var(--err-bg)',
        border: '1px solid var(--err)', 'border-radius': 'var(--r-md)',
        'font-size': '13px',
      }}
    >
      <strong style={{ color: 'var(--err)' }}>{props.titre}</strong>
      <p style={{ margin: '3px 0 0' }}>{props.children as never}</p>
    </div>
  )
}

function Champ(props: {
  libelle: string
  valeur: string
  surSaisie: (v: string) => void
  masque?: boolean
  auto?: string
  premier?: boolean
}) {
  return (
    <label style={{ display: 'grid', gap: '4px' }}>
      <span class="secondaire" style={{ 'font-size': '12px' }}>{props.libelle}</span>
      <input
        type={props.masque ? 'password' : 'text'}
        value={props.valeur}
        autocomplete={props.auto}
        autofocus={props.premier}
        spellcheck={false}
        onInput={(e) => props.surSaisie(e.currentTarget.value)}
      />
    </label>
  )
}
