import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from './Icone'
import { encreLogo, monogramme, plaque, plaqueTexte } from './couleurs'
import { titreCourt } from './titres'
import { db, type EntreeCatalogue, type TypeContenu } from '../lib/db'
import {
  DELAI_FRAPPE,
  chercherPanneau,
  demarrerIndex,
  type Groupes,
  type Totaux,
} from '../lib/recherche-client'
import {
  oublierRecherche,
  recherchesRecentes,
  retenirRecherche,
} from '../lib/recherches-recentes'
import type { ResultatRecherche } from '../lib/recherche.worker'

// Panneau de suggestions du dossier de conception, monté en surimpression sous
// le champ de l'en-tête. Il ne reçoit aucune propriété de l'en-tête : il
// s'accroche au champ par le DOM et écoute au niveau du document, ce qui le
// rend insensible au montage et au démontage du champ selon l'écran.
//
// Mesures relevées au getComputedStyle sur « Lecteur IPTV.dc.html » (1440 px) :
// champ 600 × 36 à x=510 ; panneau 600 px de large, 6 px sous le champ, retrait
// 6 px, rayon 8 px, fond --elev, filet --line2, hauteur plafonnée à
// min(560px, 100vh - 80px) ; en-tête de section 11 px / 600 / .04em en
// capitales --fg3 ; ligne récente 36 px, ligne de résultat 52 px, rayon 4 px,
// sélection --acc-bg ; pied « voir tout » 41 px, --acc-fg, filet supérieur.
//
// Lot 10 (US-47 CA1, audit A bug 3 / D E7) : AUCUNE ligne n'est présélectionnée.
// Entrée dans le champ soumet le formulaire de l'en-tête, donc ouvre la page de
// résultats ; une suggestion ne s'ouvre qu'en la choisissant (↓ puis Entrée,
// ou clic), et s'ouvre sur sa FICHE — jamais une lecture depuis le champ, qui
// sur un abonnement à une connexion couperait ce qui est regardé ailleurs.

/** Indice de « rien de retenu » : Entrée laisse alors le formulaire se soumettre. */
const AUCUNE = -1

const LARGEUR_MINIMALE = 560
const ECART_SOUS_CHAMP = 6

const LIBELLE: Record<TypeContenu, string> = { live: 'Chaînes', vod: 'Films', series: 'Séries' }
const UNITE: Record<TypeContenu, string> = { live: 'chaîne', vod: 'film', series: 'série' }
const ORDRE: TypeContenu[] = ['live', 'vod', 'series']

const VIDE: Groupes = { live: [], vod: [], series: [] }
const ZERO: Totaux = { live: 0, vod: 0, series: 0 }

const fr = (n: number) => n.toLocaleString('fr-FR')

interface Position {
  gauche: number
  haut: number
  largeur: number
}

export interface PanneauSuggestionsProps {
  surOuvrir: (e: EntreeCatalogue) => void
  /** « Voir tout » et la soumission du champ mènent à l'écran de résultats. */
  surVoirTout: (requete: string) => void
  /** Champ auquel s'accrocher ; par défaut celui de l'en-tête. */
  selecteurChamp?: string
}

export default function PanneauSuggestions(props: PanneauSuggestionsProps) {
  const [ouvert, poserOuvert] = createSignal(false)
  const [requete, poserRequete] = createSignal('')
  const [groupes, poserGroupes] = createSignal<Groupes>(VIDE)
  const [totaux, poserTotaux] = createSignal<Totaux>(ZERO)
  const [cherche, poserCherche] = createSignal(false)
  const [position, poserPosition] = createSignal<Position>({ gauche: 0, haut: 52, largeur: 560 })
  const [selection, poserSelection] = createSignal(AUCUNE)

  let minuterie: number | undefined
  let serie = 0
  let racine: HTMLDivElement | undefined

  const selecteur = () => props.selecteurChamp ?? '.entete-recherche input'
  const champ = (): HTMLInputElement | null => document.querySelector(selecteur())
  const estLeChamp = (c: EventTarget | null) => c instanceof Element && c.matches(selecteur())

  // Liste à plat de ce que ↑ ↓ parcourt : les récentes quand le champ est vide,
  // sinon les résultats suivis de « voir tout ».
  const plat = createMemo<ResultatRecherche[]>(() =>
    ORDRE.flatMap((t) => groupes()[t]),
  )
  const totalTrouve = () => ORDRE.reduce((n, t) => n + totaux()[t], 0)
  const aDesResultats = () => plat().length > 0
  const dernierIndice = () =>
    requete().trim() ? plat().length : Math.max(0, recherchesRecentes().length - 1)

  function placer() {
    const c = champ()
    if (!c) return
    const r = c.getBoundingClientRect()
    const largeur = Math.min(
      Math.max(r.width, LARGEUR_MINIMALE),
      window.innerWidth - 16,
    )
    poserPosition({
      haut: Math.round(r.bottom + ECART_SOUS_CHAMP),
      gauche: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8))),
      largeur: Math.round(largeur),
    })
  }

  function ouvrirPanneau() {
    placer()
    poserOuvert(true)
    void demarrerIndex()
  }

  function fermer() {
    poserOuvert(false)
    poserSelection(AUCUNE)
  }

  function lancer(v: string) {
    poserRequete(v)
    poserSelection(AUCUNE)
    clearTimeout(minuterie)
    if (!v.trim()) {
      poserGroupes(VIDE)
      poserTotaux(ZERO)
      poserCherche(false)
      return
    }
    poserCherche(true)
    // 180 ms sans frappe avant d'interroger l'index : le dossier refuse une
    // recherche par caractère, et le worker n'a pas à classer « f », « fr »,
    // « fra » pour n'afficher que le dernier.
    minuterie = window.setTimeout(() => {
      serie += 1
      const mien = serie
      void chercherPanneau(v).then((r) => {
        if (mien !== serie) return
        poserGroupes(r.groupes)
        poserTotaux(r.totaux)
        poserCherche(false)
      })
    }, DELAI_FRAPPE)
  }

  /** Renseigne le champ de l'en-tête sans y toucher : l'évènement `input`
   *  remonte au gestionnaire délégué de Solid, qui met son signal à jour. */
  function remplir(v: string) {
    const c = champ()
    if (!c) return
    c.value = v
    c.dispatchEvent(new Event('input', { bubbles: true }))
    c.focus()
  }

  async function ouvrirResultat(r: ResultatRecherche) {
    retenirRecherche(requete())
    fermer()
    const entree = await db.catalogue.get(r.cle)
    if (entree) props.surOuvrir(entree)
  }

  function voirTout() {
    const q = requete().trim()
    if (!q) return
    retenirRecherche(q)
    fermer()
    champ()?.blur()
    props.surVoirTout(q)
  }

  function auClavier(e: KeyboardEvent) {
    if (!estLeChamp(e.target)) return
    if (e.key === 'Escape') {
      if (ouvert()) {
        e.stopPropagation()
        fermer()
      }
      return
    }
    if (!ouvert()) {
      if (e.key === 'ArrowDown') ouvrirPanneau()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      poserSelection((s) => Math.min(dernierIndice(), s + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      poserSelection((s) => Math.max(AUCUNE, s - 1))
      return
    }
    if (e.key !== 'Enter') return

    if (!requete().trim()) {
      const recente = selection() >= 0 ? recherchesRecentes()[selection()] : undefined
      if (recente) {
        e.preventDefault()
        remplir(recente)
        lancer(recente)
      }
      return
    }
    if (selection() >= 0 && !cherche()) {
      const choix = plat()[selection()]
      if (choix) {
        e.preventDefault()
        void ouvrirResultat(choix)
        return
      }
      if (selection() === plat().length) {
        e.preventDefault()
        voirTout()
        return
      }
    }
    // Aucune ligne retenue : on laisse le formulaire de l'en-tête se soumettre,
    // ce qui ouvre la page de résultats. Rien à empêcher, juste à refermer.
    retenirRecherche(requete())
    fermer()
  }

  function surSaisie(e: Event) {
    if (!estLeChamp(e.target)) return
    // Une valeur posée par le code alors que le champ n'a plus le focus — au
    // retour de « voir tout », par exemple — n'est pas une frappe : la prendre
    // pour telle rouvrirait le panneau par-dessus la page qu'on vient d'ouvrir.
    if (document.activeElement !== e.target) return
    if (!ouvert()) ouvrirPanneau()
    lancer((e.target as HTMLInputElement).value)
  }

  function surFocus(e: FocusEvent) {
    if (!estLeChamp(e.target)) return
    poserRequete((e.target as HTMLInputElement).value)
    ouvrirPanneau()
  }

  function surClicAilleurs(e: MouseEvent) {
    if (!ouvert()) return
    const c = e.target as Node
    if (racine?.contains(c) || estLeChamp(e.target)) return
    fermer()
  }

  // Cliquer (ou toucher) un champ déjà focalisé, après Échap, rouvre les
  // suggestions : `focusin` ne repart pas, le clic si (audit A, mineur).
  function surClicChamp(e: MouseEvent) {
    if (!estLeChamp(e.target) || ouvert()) return
    const c = e.target as HTMLInputElement
    if (c.value !== requete()) lancer(c.value)
    ouvrirPanneau()
  }

  onMount(() => {
    document.addEventListener('focusin', surFocus)
    document.addEventListener('input', surSaisie)
    document.addEventListener('keydown', auClavier)
    document.addEventListener('mousedown', surClicAilleurs)
    document.addEventListener('click', surClicChamp)
    window.addEventListener('resize', placer)
  })
  onCleanup(() => {
    clearTimeout(minuterie)
    document.removeEventListener('focusin', surFocus)
    document.removeEventListener('input', surSaisie)
    document.removeEventListener('keydown', auClavier)
    document.removeEventListener('mousedown', surClicAilleurs)
    document.removeEventListener('click', surClicChamp)
    window.removeEventListener('resize', placer)
  })

  // La ligne retenue au clavier doit rester visible quand la liste défile.
  createEffect(() => {
    const i = selection()
    if (!ouvert() || i < 0) return
    queueMicrotask(() => {
      racine?.querySelectorAll('[data-indice]')[i]?.scrollIntoView({ block: 'nearest' })
    })
  })

  const indiceDe = (type: TypeContenu, i: number) =>
    ORDRE.slice(0, ORDRE.indexOf(type)).reduce((n, t) => n + groupes()[t].length, 0) + i

  return (
    <Show when={ouvert()}>
      <div
        ref={racine}
        role="listbox"
        aria-label="Suggestions de recherche"
        // Solid délègue ses gestionnaires au document : si le panneau se
        // démontait entre `mousedown` et `mouseup`, le `click` ne partirait
        // jamais. Empêcher le défaut du `mousedown` garde le focus dans le
        // champ, donc le panneau ouvert, donc le clic vivant.
        onMouseDown={(e) => e.preventDefault()}
        style={{
          position: 'fixed',
          left: `${position().gauche}px`,
          top: `${position().haut}px`,
          width: `${position().largeur}px`,
          'max-height': 'min(560px, calc(100vh - 80px))',
          overflow: 'auto',
          'z-index': 70,
          padding: '6px',
          'border-radius': '8px',
          background: 'var(--elev)',
          border: '1px solid var(--line2)',
          'box-shadow': '0 0 8px rgba(0,0,0,.24), 0 32px 64px rgba(0,0,0,.4)',
        }}
      >
        <Show when={requete().trim()} fallback={<Recentes selection={selection()} surChoisir={(t) => { remplir(t); lancer(t) }} surSurvol={poserSelection} />}>
          <Show when={cherche()}>
            <div class="tertiaire" style={{ display: 'flex', 'align-items': 'center', gap: '10px', padding: '14px 10px' }}>
              <Icone nom="progress_activity" taille={16} />
              Recherche en cours…
            </div>
          </Show>

          <Show when={!cherche() && aDesResultats()}>
            <For each={ORDRE.filter((t) => groupes()[t].length > 0)}>
              {(type) => (
                <>
                  <div style={{ display: 'flex', 'align-items': 'baseline', 'justify-content': 'space-between', padding: '10px 10px 4px' }}>
                    <span style={{ 'font-size': '11px', 'font-weight': '600', 'letter-spacing': '.04em', 'text-transform': 'uppercase', color: 'var(--fg3)' }}>
                      {LIBELLE[type]}
                    </span>
                    <span class="num" style={{ 'font-size': '11px', color: 'var(--fg3)' }}>
                      {fr(totaux()[type])} {UNITE[type]}{totaux()[type] > 1 ? 's' : ''}
                    </span>
                  </div>
                  <For each={groupes()[type]}>
                    {(r, i) => (
                      <Ligne
                        resultat={r}
                        indice={indiceDe(type, i())}
                        retenu={selection() === indiceDe(type, i())}
                        surSurvol={poserSelection}
                        surOuvrir={() => void ouvrirResultat(r)}
                      />
                    )}
                  </For>
                </>
              )}
            </For>

            <div
              role="option"
              data-indice={plat().length}
              aria-selected={selection() === plat().length}
              onMouseEnter={() => poserSelection(plat().length)}
              onClick={voirTout}
              style={{
                display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
                gap: '10px', 'margin-top': '6px', padding: '10px',
                'border-top': '1px solid var(--line)', 'border-radius': '4px',
                background: selection() === plat().length ? 'var(--acc-bg)' : 'transparent',
                cursor: 'pointer', color: 'var(--acc-fg)', 'font-weight': '600',
              }}
            >
              <span>Voir les {fr(totalTrouve())} résultats</span>
              {/* Le temps de recherche n'intéresse que le panneau technique (A UX20). */}
              <span class="num" style={{ 'font-size': '11px', 'font-weight': '400', color: 'var(--fg3)' }}>
                Entrée
              </span>
            </div>
          </Show>

          <Show when={!cherche() && !aDesResultats()}>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', padding: '12px 10px' }}>
              <span class="secondaire">Aucun résultat pour « {requete().trim()} ».</span>
              <span class="tertiaire" style={{ 'font-size': '12px' }}>
                Essayez une orthographe différente, ou parcourez le catalogue.
              </span>
              <span
                role="button"
                onClick={voirTout}
                style={{ 'align-self': 'flex-start', 'font-size': '13px', 'font-weight': '600', color: 'var(--acc-fg)', cursor: 'pointer' }}
              >
                Ouvrir la page de résultats
              </span>
            </div>
          </Show>
        </Show>
      </div>
    </Show>
  )
}

function Recentes(props: {
  selection: number
  surChoisir: (t: string) => void
  surSurvol: (i: number) => void
}) {
  return (
    <Show
      when={recherchesRecentes().length > 0}
      fallback={
        <div class="tertiaire" style={{ padding: '12px 10px', 'font-size': '13px' }}>
          Tapez pour chercher une chaîne, un film ou une série.
        </div>
      }
    >
      <div style={{ padding: '8px 10px 4px', 'font-size': '11px', 'font-weight': '600', 'letter-spacing': '.04em', 'text-transform': 'uppercase', color: 'var(--fg3)' }}>
        Recherches récentes
      </div>
      <For each={recherchesRecentes()}>
        {(t, i) => (
          <div
            role="option"
            data-indice={i()}
            aria-selected={props.selection === i()}
            onMouseEnter={() => props.surSurvol(i())}
            onClick={() => props.surChoisir(t)}
            style={{
              display: 'flex', 'align-items': 'center', gap: '10px', height: '36px',
              padding: '0 6px 0 10px', 'border-radius': '4px', cursor: 'pointer',
              background: props.selection === i() ? 'var(--acc-bg)' : 'transparent',
            }}
          >
            <span style={{ display: 'flex', color: 'var(--fg3)' }}><Icone nom="history" taille={16} /></span>
            <span class="tronque" style={{ flex: 1, 'min-width': 0 }}>{t}</span>
            <span
              role="button"
              aria-label={`Retirer « ${t} » des recherches récentes`}
              title="Retirer"
              onClick={(e) => {
                e.stopPropagation()
                oublierRecherche(t)
              }}
              style={{
                width: '26px', height: '26px', 'border-radius': '4px', display: 'flex',
                'align-items': 'center', 'justify-content': 'center', color: 'var(--fg3)', cursor: 'pointer',
              }}
            >
              <Icone nom="close" taille={14} />
            </span>
          </div>
        )}
      </For>
    </Show>
  )
}

function Ligne(props: {
  resultat: ResultatRecherche
  indice: number
  retenu: boolean
  surSurvol: (i: number) => void
  surOuvrir: () => void
}) {
  const direct = () => props.resultat.type === 'live'
  const titre = () => (direct() ? props.resultat.nom : titreCourt(props.resultat.nom))
  const sousTitre = () =>
    direct()
      ? 'Direct'
      : props.resultat.type === 'vod'
        ? `Film${props.resultat.note ? ` · ${props.resultat.note.toFixed(1)}/10` : ''}`
        : 'Série'

  return (
    <div
      role="option"
      data-indice={props.indice}
      aria-selected={props.retenu}
      title={props.resultat.nom}
      onMouseEnter={() => props.surSurvol(props.indice)}
      onClick={props.surOuvrir}
      style={{
        display: 'flex', 'align-items': 'center', gap: '10px', padding: '6px 10px',
        'border-radius': '4px', cursor: 'pointer',
        background: props.retenu ? 'var(--acc-bg)' : 'transparent',
      }}
    >
      <Vignette resultat={props.resultat} />
      <div style={{ 'min-width': 0, flex: 1 }}>
        <div class="tronque" style={{ 'font-weight': '600' }}>{titre()}</div>
        <div class="tronque tertiaire" style={{ 'font-size': '12px' }}>{sousTitre()}</div>
      </div>
      <Show when={props.resultat.pays}>
        <span
          class="num"
          style={{
            flex: 'none', 'font-size': '10px', 'line-height': '14px', padding: '0 4px',
            'border-radius': '3px', border: '1px solid var(--line2)', color: 'var(--fg3)',
          }}
        >
          {props.resultat.pays}
        </span>
      </Show>
    </div>
  )
}

/** 44 × 30 pour une chaîne, 20 × 30 pour une affiche : les deux gabarits
 *  relevés sur la maquette, qui gardent les lignes à 52 px quoi qu'il arrive. */
function Vignette(props: { resultat: ResultatRecherche }) {
  const [charge, poserCharge] = createSignal(false)
  const direct = () => props.resultat.type === 'live'
  const nom = () => props.resultat.nom
  const texte = () => (direct() ? monogramme(nom()) : '')

  return (
    <div
      style={{
        position: 'relative', flex: 'none',
        width: direct() ? '44px' : '20px', height: '30px',
        'border-radius': '3px', overflow: 'hidden',
        background: direct() ? 'var(--plate)' : plaque(nom()),
        color: direct() ? encreLogo(nom()) : plaqueTexte(nom()),
        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
        'font-size': texte().length > 6 ? '9px' : texte().length > 4 ? '11px' : '13px',
        'font-weight': '600', 'white-space': 'nowrap',
      }}
    >
      {/* Le logo réel est souvent transparent : laisser le monogramme dessous
          le ferait transparaître à travers. */}
      <span style={{ opacity: charge() ? '0' : '1' }}>{texte()}</span>
      <Show when={props.resultat.icone}>
        <img
          src={props.resultat.icone}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => poserCharge(true)}
          onError={() => poserCharge(false)}
          style={{
            position: 'absolute', inset: '0', width: '100%', height: '100%',
            'object-fit': direct() ? 'contain' : 'cover',
            opacity: charge() ? '1' : '0',
          }}
        />
      </Show>
    </div>
  )
}
