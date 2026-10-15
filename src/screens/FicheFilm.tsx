import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import Icone from '../components/Icone'
import SubstitutLogo from '../components/SubstitutLogo'
import EtiquettePays from '../components/EtiquettePays'
import ResumeContenu from '../components/ResumeContenu'
import FaitsContenu from '../components/FaitsContenu'
import { titreCourt } from '../components/titres'
import { cibleDe, dureeLongue, useDetails } from '../lib/details'
import { basculerFavori, estFavori } from '../lib/preferences'
import { estBureau, estMobile } from '../lib/gabarit'
import type { EntreeCatalogue } from '../lib/db'

// Fiche d'un film (US-28). Les details -- synopsis, genre, duree, casting,
// realisateur, bande-annonce, image de fond -- sont demandes A L'OUVERTURE de la
// fiche, une seule fois par film, et jamais pour une carte d'une liste. Le service
// ne fait pas echouer la fiche quand le fournisseur est en panne : nom, annee et
// note du catalogue restent affiches, et le resume dit pourquoi il manque.

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

export default function FicheFilm(props: {
  film: EntreeCatalogue
  surLire: (e: EntreeCatalogue) => void
  surRetour: () => void
}) {
  const [details, { refetch }] = useDetails(() => cibleDe(props.film))
  const [favori, poserFavori] = createSignal(false)

  onMount(() => {
    void estFavori(props.film.cle).then(poserFavori)
    const auClavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props.surRetour()
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

  return (
    <div data-role="fiche-film" style={{ display: 'grid', 'grid-template-rows': 'auto 1fr', height: '100%', 'min-height': 0 }}>
      <nav style={{ display: 'flex', 'align-items': 'center', gap: '10px', padding: `8px ${marge()}px`, 'border-bottom': '1px solid var(--line)' }}>
        <button
          onClick={() => props.surRetour()}
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
              <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                <EtiquettePays pays={props.film.pays} />
                <h1 title={titre()} style={{ margin: 0, 'text-wrap': 'balance' }}>{titre()}</h1>
              </div>

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

              <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', 'margin-top': '4px' }}>
                <Action principal icone="play_arrow" plein libelle="Regarder" surClic={() => props.surLire(props.film)} />
                <Action
                  icone="star"
                  plein={favori()}
                  libelle={favori() ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  surClic={() => void basculerFavori(props.film.cle).then(poserFavori)}
                />
                <Show when={details()?.bandeAnnonce}>
                  {(href) => (
                    <a
                      href={href()}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-role="bande-annonce"
                      style={{
                        display: 'flex', 'align-items': 'center', gap: '6px', height: estMobile() ? '44px' : '36px',
                        padding: '0 14px 0 10px', 'border-radius': 'var(--r-btn-sm)', border: '1px solid var(--line2)',
                        'font-weight': 'var(--w-strong)', 'text-decoration': 'none', color: 'inherit',
                      }}
                    >
                      <Icone nom="movie" taille={18} />
                      Bande-annonce
                    </a>
                  )}
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
