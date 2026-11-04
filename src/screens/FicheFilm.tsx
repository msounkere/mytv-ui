import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from '../components/Icone'
import SubstitutLogo from '../components/SubstitutLogo'
import EtiquettePays from '../components/EtiquettePays'
import ResumeContenu from '../components/ResumeContenu'
import FaitsContenu from '../components/FaitsContenu'
import BarreProgression from '../components/BarreProgression'
import MenuContextuel, { type EntreeMenu } from '../components/MenuContextuel'
import { titreCourt } from '../components/titres'
import { cibleDe, dureeLongue, useDetails } from '../lib/details'
import { marquerNonVu as marquerNonVuCommun, marquerVu as marquerVuCommun, noterPosition } from '../lib/preferences'
import { estBureau, estMobile } from '../lib/gabarit'
import { BoutonMaListe, useAVoirCles } from '../components/BoutonMaListe'
import { listeAVoir } from '../lib/ma-liste'
import { libelleDisponibilite, type Disponibilite } from '../lib/ma-liste-regles'
import { invaliderReprises } from '../lib/requetes'
import { estPret } from '../lib/a-voir-serveur'
import { useDisponibilite } from '../lib/disponibilite'
import { FRAICHEUR, cles, requete, requeteClefee } from '../lib/requetes'
import { lectureEnCours } from '../etat'
import { actionFilm, dateCourte, etatLecture, partVue, resteLisible } from '../lib/fiche-regles'
import { ChipPreparation, PART_VUE, type PropsChipPreparation } from '../lib/ui7-contrat'
import { db, type EntreeCatalogue, type Reprise } from '../lib/db'

// Fiche d'un film (US-28, US-43, US-45 CA3). Les details -- synopsis, genre, duree,
// casting, realisateur, bande-annonce, image de fond -- sont demandes A L'OUVERTURE
// de la fiche, une seule fois par film, et jamais pour une carte d'une liste.
//
// US-45 CA3 (modele cible, rapport C §5.3-5.5) : l'action principale dit ou l'on
// en est -- `Regarder` / `Reprendre · 42 min` (+ `Recommencer`) / `Regarder a
// nouveau` quand le film est vu -- avec une barre de progression sous le titre ;
// la question « Reprendre ou recommencer ? » se pose ICI, plus jamais dans le
// lecteur ; sous une minute, « Regarder » (la carte ne montre pas de barre non
// plus). L'etat de preparation (Ma liste) est un chip commun ; la sonde ne
// s'affiche que hors liste et tant que rien n'est pret. Le menu « ⋯ » porte
// « Marquer comme vu / non vu », « Recommencer », « Bande-annonce ». Les favoris
// ne concernent plus que les chaines : l'etoile a quitte la fiche.

const marge = () => (estBureau() ? 24 : 14)

function Action(props: { principal?: boolean; icone: string; plein?: boolean; libelle: string; surClic: () => void }) {
  return (
    <button
      onClick={props.surClic}
      style={{
        display: 'flex', 'align-items': 'center', gap: '6px',
        height: estMobile() ? '44px' : '36px', padding: '0 14px 0 10px', 'border-radius': 'var(--r-btn-sm)',
        'font-weight': 'var(--w-strong)', cursor: 'pointer',
        ...(props.principal
          ? { background: 'var(--acc)', color: '#fff', border: '1px solid transparent' }
          : { border: '1px solid var(--line2)' }),
      }}
    >
      <Icone nom={props.icone} taille={18} plein={props.plein} />
      {props.libelle}
    </button>
  )
}

/** Le bouton « ⋯ » des fiches : visible, 44 px au tactile, focalisable (Entree / OK). */
export function BoutonMenu(props: { libelle: string; compact?: boolean; surOuvrir: (p: { x: number; y: number }) => void }) {
  const ouvrir = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    props.surOuvrir({ x: Math.max(12, r.right - 260), y: r.bottom + 6 })
  }
  const cote = () => (estMobile() ? '44px' : props.compact ? '32px' : '36px')
  return (
    <button
      type="button"
      data-role="menu-fiche"
      aria-label={props.libelle}
      title={props.libelle}
      aria-haspopup="menu"
      onClick={(e) => { e.stopPropagation(); ouvrir(e.currentTarget) }}
      style={{
        display: 'grid', 'place-items': 'center', width: cote(), height: cote(), flex: '0 0 auto',
        'border-radius': 'var(--r-btn-sm)', border: props.compact ? '0' : '1px solid var(--line2)', cursor: 'pointer',
      }}
    >
      <Icone nom="more_horiz" taille={20} />
    </button>
  )
}

/**
 * Resultat de la sonde, SANS bouton : la fiche n'a qu'un seul « + Ma liste » (C11).
 * Phrases : `libelleDisponibilite` (modele cible, ui-7) ; `inconnu` n'affiche rien.
 */
export function LigneSonde(props: { disponibilite: Disponibilite | undefined; prefixe?: string }) {
  const l = () => libelleDisponibilite(props.disponibilite)
  return (
    <Show when={l()}>
      {(x) => (
        <div
          data-role="disponibilite"
          data-etat={props.disponibilite?.etat}
          title={x().detail}
          style={{
            display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '6px 10px', 'font-size': '13px', 'min-width': 0,
            color: x().ton === 'lent' ? 'var(--lim)' : x().ton === 'pret' ? 'var(--ok)' : 'var(--fg2)',
          }}
        >
          <Icone nom={x().ton === 'lent' ? 'warning' : x().ton === 'pret' ? 'check_circle' : 'speed'} taille={16} plein={x().ton === 'pret'} />
          <span style={{ 'min-width': 0 }}>
            <Show when={props.prefixe}>{(p) => <span class="num">{p()} · </span>}</Show>
            {x().texte}
          </span>
          <Show when={estMobile() ? undefined : x().detail}>
            {(d) => <span class="num" data-role="disponibilite-detail" style={{ 'font-size': '12px', color: 'var(--fg3)' }}>{d()}</span>}
          </Show>
        </div>
      )}
    </Show>
  )
}

/** Chip « ✓ Vu le 3 nov. ». */
export function ChipVu(props: { le?: number }) {
  return (
    <span
      data-role="chip-vu"
      style={{
        display: 'inline-flex', 'align-items': 'center', gap: '4px', 'font-size': '12px', 'line-height': '18px',
        padding: '0 8px', 'border-radius': 'var(--r-2xs)', border: '1px solid var(--ok)', color: 'var(--ok)', 'white-space': 'nowrap',
      }}
    >
      ✓ Vu{dateCourte(props.le) ? ` le ${dateCourte(props.le)}` : ''}
    </span>
  )
}

/** Etat de preparation d'un element de la liste, tel que le chip commun l'attend (contrat US-44). */
export function propsChip(p: Record<string, unknown> | undefined): Omit<PropsChipPreparation, 'surReessayer'> | undefined {
  if (!p) return undefined
  const etat = p['etat']
  if (etat !== 'attente' && etat !== 'en_cours' && etat !== 'pret' && etat !== 'echec') return undefined
  const n = (v: unknown) => (typeof v === 'number' ? v : undefined)
  const t = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    etat,
    octets: n(p['octets']), total: n(p['total']), debit_kbps: n(p['debitKbps']) ?? n(p['debit_kbps']),
    raison: t(p['raison']) as PropsChipPreparation['raison'], position: n(p['position']), cause: t(p['cause']), reessai: t(p['reessai']),
  }
}

export default function FicheFilm(props: {
  film: EntreeCatalogue
  surLire: (e: EntreeCatalogue) => void
  surRetour: () => void
}) {
  const [details, { refetch }] = useDetails(() => cibleDe(props.film))
  const aVoir = useAVoirCles()
  const dansAVoir = () => aVoir()?.has(props.film.cle) ?? false
  const [ligneListe] = requete([...cles.aVoir, 'fiche'], listeAVoir, { fraicheur: FRAICHEUR.geste, suspendre: false })
  const preparation = () => propsChip(ligneListe()?.find((l) => l.cle === props.film.cle)?.preparation as Record<string, unknown> | undefined)
  const pret = () => estPret(props.film.cle)
  // Position memorisee : relue a chaque geste (cle sous `reprises`, invalidee par preferences.ts).
  const [reprise] = requeteClefee<string, Reprise | undefined>(
    (c) => [...cles.reprises, 'fiche', c],
    () => props.film.cle,
    (c) => db.reprises.get(c),
    { fraicheur: FRAICHEUR.geste, suspendre: false },
  )
  const etat = () => etatLecture(reprise(), PART_VUE)
  const action = () => actionFilm(reprise(), PART_VUE)
  // La sonde part a l'ouverture, hors lecture ; elle ne s'affiche ni pour un element
  // de Ma liste (le chip dit l'etat) ni pour un fichier pret (C10).
  const disponibilite = useDisponibilite(() => props.film.idServeur, () => lectureEnCours() === null)
  const [menu, poserMenu] = createSignal<{ x: number; y: number } | null>(null)

  // Retour et Echap : l'ecran precedent (pile d'historique, US-45 CA2) -- la coque
  // passe `revenirEnArriere('/')`, et c'est elle qui compte la pile.
  const retour = () => props.surRetour()
  onMount(() => {
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || menu()) return
      e.preventDefault()
      retour()
    }
    window.addEventListener('keydown', auClavier)
    onCleanup(() => window.removeEventListener('keydown', auClavier))
  })

  const titre = createMemo(() => titreCourt(props.film.nom))
  const annee = () => details()?.annee ?? (props.film.annee ? String(props.film.annee) : undefined)
  const note = () => details()?.note ?? props.film.note
  const fond = () => details()?.fond ?? props.film.icone
  const affiche = () => details()?.affiche ?? props.film.icone

  const meta = createMemo(() => {
    const m: string[] = []
    if (annee()) m.push(annee()!)
    const duree = dureeLongue(details()?.dureeSecondes)
    if (duree) m.push(duree)
    if (note()) m.push(`★ ${note()!.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`)
    if (details()?.genre) m.push(details()!.genre!)
    const age = details()?.age
    if (age) m.push(/^\d+$/.test(age) ? `${age}+` : age)
    return m
  })

  /** Duree connue : la position memorisee, sinon les details, sinon une duree symbolique. */
  const dureeConnue = () => reprise()?.duree || details()?.dureeSecondes || 1

  // --- Gestes « vu » : helpers communs d'ui-7 (toast « Annuler » inclus) -----------
  const marquerVu = () => marquerVuCommun(props.film.cle, { duree: dureeConnue() })
  const marquerNonVu = () => marquerNonVuCommun(props.film.cle)
  /** Recommencer : la position repart de zero AVANT d'ouvrir le flux (une seule ouverture). */
  async function recommencer() {
    const r = reprise()
    if (r) {
      await noterPosition(props.film.cle, 0, r.duree)
      await invaliderReprises()
    }
    props.surLire(props.film)
  }

  const entreesMenu = (): EntreeMenu[] => {
    const e: EntreeMenu[] = []
    if (etat() === 'vu') e.push({ icone: 'check_circle', libelle: 'Marquer comme non vu', action: () => void marquerNonVu() })
    else e.push({ icone: 'check', libelle: 'Marquer comme vu', action: () => void marquerVu() })
    if (etat() !== 'jamais') e.push({ icone: 'refresh', libelle: 'Recommencer', action: () => void recommencer() })
    const ba = details()?.bandeAnnonce
    if (ba) e.push({ icone: 'movie', libelle: 'Bande-annonce', action: () => void window.open(ba, '_blank', 'noopener,noreferrer') })
    return e
  }

  return (
    <div data-role="fiche-film" style={{ display: 'grid', 'grid-template-rows': 'auto 1fr', height: '100%', 'min-height': 0 }}>
      <nav style={{ display: 'flex', 'align-items': 'center', gap: '10px', padding: `8px ${marge()}px`, 'border-bottom': '1px solid var(--line)' }}>
        <button
          onClick={retour}
          style={{ padding: '5px 12px', border: '1px solid var(--line2)', 'min-height': estMobile() ? '44px' : undefined }}
        >
          ← Retour
        </button>
        <span class="secondaire tronque" style={{ 'font-size': '13px' }}>Film</span>
      </nav>

      <div style={{ overflow: 'auto', 'min-height': 0 }}>
        <div
          style={{
            position: 'relative', overflow: 'hidden', 'border-bottom': '1px solid var(--line)',
            'min-height': estMobile() ? undefined : '220px',
          }}
        >
          <Show when={fond()}>
            {(src) => (
              <img
                data-role="fond"
                src={src()}
                alt=""
                decoding="async"
                onError={(e) => (e.currentTarget.style.display = 'none')}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', 'object-fit': 'cover', opacity: 0.22, filter: 'blur(2px)' }}
              />
            )}
          </Show>
          <div
            style={{
              position: 'relative', display: 'grid', 'grid-template-columns': 'auto minmax(0, 1fr)',
              gap: estMobile() ? '12px' : '20px', padding: `${estBureau() ? 22 : 14}px ${marge()}px`,
            }}
          >
            <SubstitutLogo nom={titre()} src={affiche()} taille={estMobile() ? 96 : 150} affiche />

            <div style={{ 'min-width': 0, display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', 'flex-wrap': 'wrap', gap: '8px' }}>
                <EtiquettePays pays={props.film.pays} />
                <h1 title={titre()} style={{ margin: 0, 'text-wrap': 'balance' }}>{titre()}</h1>
                {/* Chip d'etat a cote du titre : preparation (Ma liste), ou « ✓ Vu le … ». */}
                <Show when={preparation()}>{(p) => <ChipPreparation {...p()} />}</Show>
                <Show when={!preparation() && pret()}><ChipPreparation etat="pret" /></Show>
                <Show when={etat() === 'vu'}><ChipVu le={reprise()?.vuLe} /></Show>
              </div>

              {/* Film entame : la barre et le reste, pour decider si l'on a le temps de finir. */}
              <Show when={etat() === 'entame'}>
                <div data-role="reprise-fiche" style={{ display: 'flex', 'align-items': 'center', gap: '10px', 'max-width': '420px' }}>
                  <BarreProgression part={partVue(reprise())} />
                  <span class="num secondaire" style={{ 'font-size': '12px', 'white-space': 'nowrap' }}>
                    reste {resteLisible(reprise()!.duree - reprise()!.position)}
                  </span>
                </div>
              </Show>

              <p class="secondaire num" data-role="meta" style={{ margin: 0, 'font-size': '13px', 'min-height': '18px' }}>
                {meta().join(' · ')}
              </p>

              <ResumeContenu
                details={details()}
                erreur={details.error}
                attendu={cibleDe(props.film) !== undefined}
                surReessayer={() => void refetch()}
                hauteurMin="44px"
                style={{ 'font-size': '14px', 'line-height': '20px', 'max-width': '70ch' }}
              />

              <FaitsContenu details={details()} />

              <Show when={!dansAVoir() && !pret()}>
                <LigneSonde disponibilite={disponibilite()} />
              </Show>

              <div data-role="actions-fiche" style={{ display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '8px', 'margin-top': '4px' }}>
                <button
                  data-role="action-principale"
                  onClick={() => props.surLire(props.film)}
                  style={{
                    display: 'flex', 'align-items': 'center', gap: '6px',
                    height: estMobile() ? '44px' : '36px', padding: '0 14px 0 10px', 'border-radius': 'var(--r-btn-sm)',
                    'font-weight': 'var(--w-strong)', cursor: 'pointer', background: 'var(--acc)', color: '#fff', border: '1px solid transparent',
                  }}
                >
                  <Icone nom={action().icone} taille={18} plein />
                  {action().libelle}
                </button>
                <Show when={action().secondaire}>
                  {(l) => <Action icone="refresh" libelle={l()} surClic={() => void recommencer()} />}
                </Show>
                <BoutonMaListe cle={props.film.cle} present={dansAVoir()} />
                <BoutonMenu libelle={`Plus d’options pour ${titre()}`} surOuvrir={poserMenu} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <Show when={menu()}>
        {(m) => <MenuContextuel x={m().x} y={m().y} entrees={entreesMenu()} surFermer={() => poserMenu(null)} />}
      </Show>
    </div>
  )
}
