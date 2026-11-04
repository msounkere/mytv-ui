import { For, Show, createEffect, createResource, createSignal, onCleanup } from 'solid-js'
import { liveQuery } from 'dexie'
import { choisirProfil, creerProfil, deconnexion, profilActifId, profils, session, supprimerProfil } from '../lib/auth'
import type { ProfilApi } from '../lib/api'
import { json, versErreurLecteur } from '../lib/api'
import { LIBELLE_COUCHE, type ErreurLecteur } from '../lib/errors'
import {
  avancementCatalogue, dernierImportLe, erreurCatalogue, etatCatalogue, mettreAJourCatalogue,
  versionCatalogue,
} from '../lib/catalogue'
import { db, type Categorie } from '../lib/db'
import { etatSynchro } from '../lib/synchro'
import { invaliderCategories } from '../lib/requetes'
import { emettreToast } from '../lib/toasts'
import { estBureau } from '../lib/gabarit'
import { messageErreur } from './ChoixProfil'
import { LIBELLE_QUALITE_MODE, choisirQualite, qualite, type ModeQualite } from '../lib/qualite'
import { choisirTeleviseurEac3, choisirTeleviseurHevc, televiseurEac3, televiseurHevc } from '../lib/cast'
import { noter } from '../lib/diagnostic'

// Qualité du flux (US-38 CA4) : Auto laisse le serveur décider ; Éco demande un
// réencodage à débit réduit (480p, ~1,2 Mbit/s) à chaque ouverture, pour une
// liaison lente. Mémorisée par appareil, jamais par profil : c'est la liaison
// de CET appareil qui est lente.
const QUALITES: Array<{ cle: ModeQualite; detail: string }> = [
  { cle: 'auto', detail: 'le serveur choisit (direct, ou conversion seulement si le navigateur ne lit pas le format)' },
  { cle: 'eco', detail: 'flux réencodé à débit réduit (480p, ~1,2 Mbit/s) — pour une liaison à moins de 5 Mbit/s' },
]

// Capacités du téléviseur (US-41 CA2) : distinctes de celles du navigateur, elles
// décident de ce que le serveur convertit pour l'appareil de diffusion. Par
// défaut un téléviseur décode tout ; mémorisées par appareil, comme la qualité.
const CAPACITES_TV: Array<{ cle: 'eac3' | 'hevc'; libelle: string; lire: () => boolean; poser: (v: boolean) => void }> = [
  { cle: 'eac3', libelle: 'Le téléviseur décode EAC3/AC3', lire: televiseurEac3, poser: choisirTeleviseurEac3 },
  { cle: 'hevc', libelle: 'Le téléviseur décode HEVC', lire: televiseurHevc, poser: choisirTeleviseurHevc },
]

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

/** Cibles tactiles : 44 px des qu'on n'est pas au bureau (D21), 32 px sinon. */
const hauteurBouton = () => (estBureau() ? undefined : '44px')

export default function Reglages() {
  const [etat, poserEtat] = createSignal('')
  const [erreur, poserErreur] = createSignal<ErreurLecteur | null>(null)
  const [erreurProfil, poserErreurProfil] = createSignal('')
  const [nouveau, poserNouveau] = createSignal('')
  const [version] = createResource(() => etatCatalogue(), () => versionCatalogue())
  const [effectif] = createResource(() => etatCatalogue(), () => db.catalogue.count())
  // Profil dont on demande la suppression : un dialogue de l'application, pas
  // `confirm()` (bloque dans certains navigateurs de televiseur, A UX21).
  const [aSupprimer, poserASupprimer] = createSignal<ProfilApi | null>(null)
  let ancreSuppression: HTMLElement | null = null

  // Categories masquees (A UX11) : la liste vit ici, avec « Réafficher ».
  const [masquees, poserMasquees] = createSignal<Categorie[]>([])
  const abonnement = liveQuery(() => db.categories.filter((c) => c.masquee === 1).toArray()).subscribe({
    next: poserMasquees,
    error: () => poserMasquees([]),
  })
  onCleanup(() => abonnement.unsubscribe())

  async function reafficher(c: Categorie) {
    await db.categories.update(c.cle, { masquee: 0 })
    void invaliderCategories(c.type)
    emettreToast({
      message: `${c.nom} · catégorie réaffichée`,
      ton: 'ok',
      action: async () => {
        await db.categories.update(c.cle, { masquee: 1 })
        void invaliderCategories(c.type)
      },
    })
  }

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
        ? r.mode === 'difference'
          ? `${r.traitees.toLocaleString('fr-FR')} changements appliqués, ${r.entrees.toLocaleString('fr-FR')} entrées en base.`
          : `${r.entrees.toLocaleString('fr-FR')} entrées importées, ${r.categories} catégories.`
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
          style={{ border: '1px solid var(--line2)', padding: '7px 14px', 'min-height': hauteurBouton() }}
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
                  style={{ border: '1px solid var(--line2)', padding: '4px 10px', 'min-height': hauteurBouton() }}
                >
                  Utiliser
                </button>
              </Show>
              <button
                aria-label={`Supprimer le profil ${p.nom}`}
                onClick={(e) => {
                  ancreSuppression = e.currentTarget
                  poserASupprimer(p)
                }}
                style={{ border: '1px solid var(--line2)', padding: '4px 10px', 'min-height': hauteurBouton() }}
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
          style={{ flex: 1, 'min-height': hauteurBouton() }}
        />
        <button type="submit" disabled={nouveau().trim() === ''} style={{ border: '1px solid var(--line2)', padding: '6px 14px', 'min-height': hauteurBouton() }}>
          Ajouter
        </button>
      </form>
      <Show when={erreurProfil()}>
        <p role="alert" data-role="erreur-profil" style={{ color: 'var(--err)', 'font-size': '13px' }}>{erreurProfil()}</p>
      </Show>

      <Show when={aSupprimer()}>
        {(p) => (
          <DialogueSuppression
            profil={p()}
            surAnnuler={() => {
              poserASupprimer(null)
              ancreSuppression?.focus()
            }}
            surConfirmer={() => {
              const id = p().id
              poserASupprimer(null)
              void agirProfil(() => supprimerProfil(id))
            }}
          />
        )}
      </Show>

      <h2 style={{ 'margin-top': '24px' }}>Lecture</h2>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Qualité du flux sur cet appareil. Le lecteur propose aussi « Éco » de lui-même quand la liaison est trop juste.
      </p>
      <div role="radiogroup" aria-label="Qualité" style={{ display: 'grid', gap: '6px', margin: '0 0 16px' }}>
        <For each={QUALITES}>
          {(q) => (
            <button
              type="button"
              role="radio"
              aria-checked={qualite() === q.cle}
              data-role={`qualite-${q.cle}`}
              onClick={() => {
                choisirQualite(q.cle)
                noter('eco:choix', { qualite: q.cle, origine: 'reglages' })
              }}
              style={{
                display: 'flex', gap: '10px', 'align-items': 'baseline', 'text-align': 'left', 'min-height': hauteurBouton(),
                padding: '8px 12px', border: `1px solid ${qualite() === q.cle ? 'var(--acc-fg)' : 'var(--line)'}`,
                'border-radius': 'var(--r-md)', background: qualite() === q.cle ? 'var(--acc-bg)' : 'transparent',
              }}
            >
              <strong style={{ width: '48px', 'flex-shrink': 0 }}>{LIBELLE_QUALITE_MODE[q.cle]}</strong>
              <span class="secondaire" style={{ 'font-size': '12px' }}>{q.detail}</span>
            </button>
          )}
        </For>
      </div>

      <h3 style={{ 'font-size': '14px', margin: '0 0 4px' }}>Diffusion vers un téléviseur</h3>
      <p class="secondaire" style={{ margin: '0 0 8px', 'font-size': '12px' }}>
        Ce que le téléviseur sait décoder : le serveur ne convertit que le reste. La diffusion n’est jamais en qualité Éco.
      </p>
      <div style={{ display: 'grid', gap: '6px', margin: '0 0 16px' }}>
        <For each={CAPACITES_TV}>
          {(c) => (
            <button
              type="button"
              role="switch"
              aria-checked={c.lire()}
              data-role={`televiseur-${c.cle}`}
              onClick={() => {
                c.poser(!c.lire())
                noter('televiseur:capacite', { capacite: c.cle, actif: c.lire() })
              }}
              style={{
                display: 'flex', gap: '10px', 'align-items': 'center', 'text-align': 'left', 'min-height': hauteurBouton(),
                padding: '8px 12px', border: `1px solid ${c.lire() ? 'var(--acc-fg)' : 'var(--line)'}`,
                'border-radius': 'var(--r-md)', background: c.lire() ? 'var(--acc-bg)' : 'transparent',
              }}
            >
              <strong style={{ width: '48px', 'flex-shrink': 0 }}>{c.lire() ? 'Oui' : 'Non'}</strong>
              <span style={{ 'font-size': '13px' }}>{c.libelle}</span>
            </button>
          )}
        </For>
      </div>

      <h2 style={{ 'margin-top': '24px' }}>Catégories masquées</h2>
      <p class="secondaire" style={{ margin: '6px 0 12px', 'font-size': '12px' }}>
        Les catégories du Direct masquées depuis la liste. Elles restent dans le catalogue : les réafficher ne coûte rien.
      </p>
      <div style={{ display: 'grid', gap: '6px', margin: '0 0 16px' }} data-role="categories-masquees">
        <Show when={masquees().length > 0} fallback={<p class="tertiaire" style={{ margin: 0, 'font-size': '13px' }}>Aucune catégorie masquée.</p>}>
          <For each={masquees()}>
            {(c) => (
              <div style={{ display: 'flex', 'align-items': 'center', gap: '10px', padding: '6px 12px', border: '1px solid var(--line)', 'border-radius': 'var(--r-md)' }}>
                <span class="tronque" style={{ flex: 1 }}>{c.nom}</span>
                <span class="num tertiaire" style={{ 'font-size': '12px', 'flex': 'none' }}>{c.compte.toLocaleString('fr-FR')}</span>
                <button
                  aria-label={`Réafficher ${c.nom}`}
                  onClick={() => void reafficher(c)}
                  style={{ border: '1px solid var(--line2)', padding: '4px 10px', 'min-height': hauteurBouton(), 'flex': 'none' }}
                >
                  Réafficher
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>

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
        <button onClick={verifier} style={{ background: 'var(--acc)', color: 'var(--acc-ink)', padding: '8px 16px', 'min-height': hauteurBouton() }}>
          Vérifier le service
        </button>
        <button
          onClick={() => void importer(false)}
          disabled={enImport()}
          style={{ border: '1px solid var(--line2)', padding: '8px 16px', 'min-height': hauteurBouton() }}
        >
          Mettre à jour le catalogue
        </button>
        <button
          onClick={() => void importer(true)}
          disabled={enImport()}
          style={{ border: '1px solid var(--line2)', padding: '8px 16px', 'min-height': hauteurBouton() }}
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

/**
 * Confirmation de suppression d'un profil : dialogue modal de l'application,
 * focus sur « Annuler » (le choix sur), Échap annule, le focus revient au
 * bouton d'origine (A UX21, US-47 CA5).
 */
function DialogueSuppression(props: { profil: ProfilApi; surAnnuler: () => void; surConfirmer: () => void }) {
  let boutonAnnuler: HTMLButtonElement | undefined
  createEffect(() => {
    requestAnimationFrame(() => boutonAnnuler?.focus())
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        props.surAnnuler()
      }
    }
    document.addEventListener('keydown', clavier, true)
    onCleanup(() => document.removeEventListener('keydown', clavier, true))
  })
  return (
    <>
      <div aria-hidden="true" onClick={props.surAnnuler} style={{ position: 'fixed', inset: '0', 'z-index': '80', background: 'var(--ov1)' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogue-suppression-titre"
        data-role="dialogue-suppression"
        style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', 'z-index': '81',
          width: 'min(420px, calc(100vw - 32px))', padding: '20px', display: 'grid', gap: '14px',
          background: 'var(--panel)', border: '1px solid var(--line2)', 'border-radius': 'var(--r-xl)',
          'box-shadow': 'var(--moov-shadow-2xl)',
        }}
      >
        <h2 id="dialogue-suppression-titre" style={{ 'font-size': '16px' }}>Supprimer le profil « {props.profil.nom} » ?</h2>
        <p class="secondaire" style={{ margin: 0, 'font-size': '13px' }}>
          Ses favoris, son historique, sa liste et ses réglages seront supprimés du serveur. Cette action ne se défait pas.
        </p>
        <div style={{ display: 'flex', gap: '8px', 'justify-content': 'flex-end', 'flex-wrap': 'wrap' }}>
          <button ref={boutonAnnuler} onClick={props.surAnnuler} style={{ border: '1px solid var(--line2)', padding: '0 16px', 'min-height': '44px' }}>
            Annuler
          </button>
          <button onClick={props.surConfirmer} style={{ background: 'var(--err)', color: '#fff', padding: '0 16px', 'min-height': '44px', 'font-weight': 'var(--w-strong)' }}>
            Supprimer
          </button>
        </div>
      </div>
    </>
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
