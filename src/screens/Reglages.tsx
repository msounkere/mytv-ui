import { For, Show, createResource, createSignal } from 'solid-js'
import { choisirProfil, creerProfil, deconnexion, profilActifId, profils, session, supprimerProfil } from '../lib/auth'
import { json, versErreurLecteur } from '../lib/api'
import { LIBELLE_COUCHE, type ErreurLecteur } from '../lib/errors'
import {
  avancementCatalogue, dernierImportLe, erreurCatalogue, etatCatalogue, mettreAJourCatalogue,
  versionCatalogue,
} from '../lib/catalogue'
import { db } from '../lib/db'
import { etatSynchro } from '../lib/synchro'
import { messageErreur } from './ChoixProfil'

// Écran minimal : compte et profils, catalogue, état du service.
//
// POURQUOI plus aucune saisie ni affichage d'identifiants de relais : le
// serveur les détient seul et l'API v1 n'en expose aucun. Le navigateur ne
// connaît qu'un cookie de session qu'il ne peut même pas lire.

const LIBELLE_SYNCHRO = {
  inactif: 'En attente',
  'en-cours': 'Synchronisation…',
  ok: 'À jour',
  erreur: 'Erreur — nouvel essai automatique',
  'hors-ligne': 'Hors ligne — les gestes sont gardés et partiront au retour du réseau',
} as const

export default function Reglages() {
  const [etat, poserEtat] = createSignal('')
  const [erreur, poserErreur] = createSignal<ErreurLecteur | null>(null)
  const [erreurProfil, poserErreurProfil] = createSignal('')
  const [nouveau, poserNouveau] = createSignal('')
  const [version] = createResource(() => etatCatalogue(), () => versionCatalogue())
  const [effectif] = createResource(() => etatCatalogue(), () => db.catalogue.count())

  async function verifier() {
    poserErreur(null)
    poserEtat('Vérification du service…')
    try {
      await json<{ statut: string }>('/sante', { sansDetectionSession: true })
      poserEtat('Le service répond.')
    } catch (e) {
      poserErreur(versErreurLecteur(e))
      poserEtat('')
    }
  }

  async function importer(force: boolean) {
    poserErreur(null)
    poserEtat('')
    const r = await mettreAJourCatalogue(force)
    if (!r) return
    poserEtat(
      r.importe
        ? `${r.entrees.toLocaleString('fr-FR')} entrées importées, ${r.categories} catégories.`
        : 'Le catalogue est déjà à jour : rien à télécharger.',
    )
  }

  async function agirProfil(f: () => Promise<unknown>) {
    poserErreurProfil('')
    try {
      await f()
    } catch (e) {
      poserErreurProfil(messageErreur(e))
    }
  }

  const enImport = () => etatCatalogue() === 'import'
  const erreurAffichee = () => erreur() ?? erreurCatalogue()

  return (
    <div style={{ 'max-width': '560px', padding: '32px 24px' }}>
      <h1>Réglages</h1>

      <h2 style={{ 'margin-top': '24px' }}>Compte</h2>
      <div
        style={{
          display: 'flex', 'align-items': 'center', gap: '12px',
          margin: '12px 0 16px', padding: '12px 14px',
          background: 'var(--elev)', border: '1px solid var(--line)',
          'border-radius': 'var(--r-md)',
        }}
      >
        <div style={{ flex: 1, display: 'grid', gap: '2px', 'min-width': 0 }}>
          <strong class="tronque">{session()?.identifiant || 'Session ouverte'}</strong>
          <span class="secondaire" style={{ 'font-size': '12px' }} data-testid="etat-synchro">
            Favoris, historique et réglages suivent le profil — {LIBELLE_SYNCHRO[etatSynchro()]}.
          </span>
        </div>
        <button
          onClick={() => void deconnexion()}
          style={{ border: '1px solid var(--line2)', padding: '7px 14px' }}
        >
          Se déconnecter
        </button>
      </div>

      <h2 style={{ 'margin-top': '24px' }}>Profils</h2>
      <div style={{ display: 'grid', gap: '6px', margin: '12px 0' }} data-testid="liste-profils">
        <For each={profils()}>
          {(p) => (
            <div
              style={{
                display: 'flex', 'align-items': 'center', gap: '10px', padding: '8px 12px',
                border: '1px solid var(--line)', 'border-radius': 'var(--r-md)',
              }}
            >
              <span class="tronque" style={{ flex: 1 }}>
                {p.nom}
                <Show when={p.id === profilActifId()}>
                  <span class="secondaire" style={{ 'margin-left': '8px', 'font-size': '12px' }}>actif</span>
                </Show>
              </span>
              <Show when={p.id !== profilActifId()}>
                <button
                  onClick={() => void agirProfil(() => choisirProfil(p.id))}
                  style={{ border: '1px solid var(--line2)', padding: '4px 10px' }}
                >
                  Utiliser
                </button>
              </Show>
              <button
                aria-label={`Supprimer le profil ${p.nom}`}
                onClick={() => {
                  if (confirm(`Supprimer le profil « ${p.nom} » et son état (favoris, historique) ?`))
                    void agirProfil(() => supprimerProfil(p.id))
                }}
                style={{ border: '1px solid var(--line2)', padding: '4px 10px' }}
              >
                Supprimer
              </button>
            </div>
          )}
        </For>
      </div>
      <form
        style={{ display: 'flex', gap: '8px' }}
        onSubmit={(ev) => {
          ev.preventDefault()
          const n = nouveau().trim()
          if (n) void agirProfil(async () => { await creerProfil(n); poserNouveau('') })
        }}
      >
        <input
          type="text"
          value={nouveau()}
          maxLength={64}
          placeholder="Nouveau profil"
          aria-label="Nom du nouveau profil"
          onInput={(e) => poserNouveau(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={nouveau().trim() === ''} style={{ border: '1px solid var(--line2)', padding: '6px 14px' }}>
          Ajouter
        </button>
      </form>
      <Show when={erreurProfil()}>
        <p role="alert" style={{ color: 'var(--err)', 'font-size': '13px' }}>{erreurProfil()}</p>
      </Show>

      <h2 style={{ 'margin-top': '24px' }}>Catalogue</h2>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Importé depuis le service et gardé sur cette machine. Il se met à jour tout seul
        quand le serveur en a un nouveau ; ces boutons ne servent qu'à le forcer.
      </p>
      <div style={{ display: 'grid', gap: '8px', margin: '0 0 16px' }}>
        <Ligne libelle="Entrées" valeur={effectif()?.toLocaleString('fr-FR') ?? '—'} />
        <Ligne libelle="Version" valeur={version() ?? '—'} />
        <Ligne
          libelle="Dernier import"
          valeur={dernierImportLe() ? new Date(dernierImportLe()!).toLocaleString('fr-FR') : '—'}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
        <button onClick={verifier} style={{ background: 'var(--acc)', color: 'var(--acc-ink)', padding: '8px 16px' }}>
          Vérifier le service
        </button>
        <button
          onClick={() => void importer(false)}
          disabled={enImport()}
          style={{ border: '1px solid var(--line2)', padding: '8px 16px' }}
        >
          Mettre à jour le catalogue
        </button>
        <button
          onClick={() => void importer(true)}
          disabled={enImport()}
          style={{ border: '1px solid var(--line2)', padding: '8px 16px' }}
        >
          Réimporter tout
        </button>
      </div>

      <Show when={enImport() ? avancementCatalogue() : null}>
        {(a) => (
          <div style={{ 'margin-top': '16px' }}>
            <p class="secondaire" style={{ margin: '0 0 6px' }}>{a().etape}…</p>
            <div style={{ height: '4px', background: 'var(--elev)', 'border-radius': '2px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%', background: 'var(--acc)',
                  width: `${Math.round((a().part ?? 0) * 100)}%`,
                  transition: 'width var(--dur) var(--ease)',
                }}
              />
            </div>
          </div>
        )}
      </Show>

      <Show when={etat()}>
        <p style={{ color: 'var(--ok)', 'margin-top': '16px' }} data-testid="etat-reglages">{etat()}</p>
      </Show>

      <Show when={erreurAffichee()}>
        {(e) => (
          <div
            style={{
              'margin-top': '16px', padding: '12px 14px',
              background: 'var(--err-bg)', border: '1px solid var(--err)',
              'border-radius': 'var(--r-md)',
            }}
          >
            <strong style={{ color: 'var(--err)' }}>{LIBELLE_COUCHE[e().couche]}</strong>
            <p style={{ margin: '4px 0' }}>{e().message}</p>
            <p class="secondaire" style={{ margin: 0 }}>{e().action}</p>
            <Show when={e().detail}>
              <p class="tertiaire" style={{ margin: '6px 0 0', 'font-family': 'var(--moov-font-mono)', 'font-size': '12px' }}>
                {e().detail}
              </p>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

function Ligne(props: { libelle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', gap: '12px', 'align-items': 'baseline' }}>
      <span class="secondaire" style={{ width: '130px', 'flex-shrink': 0, 'font-size': '12px' }}>
        {props.libelle}
      </span>
      <span class="tronque" style={{ 'font-family': 'var(--moov-font-mono)', 'font-size': '12px' }}>
        {props.valeur}
      </span>
    </div>
  )
}
