import { For, Show, createSignal, type JSX } from 'solid-js'
import Icone from './Icone'
import { estMobile, estTablette } from '../lib/gabarit'
import { plaqueTexte } from './couleurs'
import { couverture } from './aplats'
import { titreCourt } from './titres'
import type { EntreeCatalogue } from '../lib/db'
import { FRAICHEUR, cles, requeteClefee } from '../lib/requetes'
import { ClientXtream, type ActionCatalogue } from '../lib/xtream'

// Bloc « À la une » : cinq contenus récents, navigation strictement MANUELLE.
// Le dossier interdit le défilement automatique — un carrousel qui tourne seul
// déplace la cible sous le curseur et rend l'écran impossible à lire à la
// télécommande. Flèches et pastilles, rien d'autre.

// Le catalogue local ne porte que le nom et la jaquette : ni synopsis, ni
// genre, ni durée. Ces métadonnées existent côté relais mais uniquement à
// l'unité. On ne les demande donc que pour la fiche RÉELLEMENT affichée, soit
// un aller-retour par changement de contenu, et jamais au chargement des 154 000
// entrées.
const INFOS_FILM = 'get_vod_info' as ActionCatalogue

interface InfosFilmBrut {
  info?: {
    releasedate?: string
    genre?: string
    duration?: string
    country?: string
    plot?: string
    description?: string
    backdrop_path?: string[]
  }
}

interface InfosSerieBrut {
  info?: {
    releaseDate?: string
    genre?: string
    plot?: string
    backdrop_path?: string[]
  }
  seasons?: unknown[]
}

interface Fiche {
  meta: string[]
  resume?: string
  image?: string
}

/** « 01:59:00 » → « 1 h 59 » : la seconde ne sert à rien dans un encart. */
function dureeLisible(brut: string | undefined): string | undefined {
  const m = /^(\d+):(\d{2})/.exec(brut?.trim() ?? '')
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h === 0 && min === 0) return undefined
  return h > 0 ? `${h} h ${String(min).padStart(2, '0')}` : `${min} min`
}

function annee(brut: string | undefined): string | undefined {
  const m = /(19|20)\d{2}/.exec(brut ?? '')
  return m?.[0]
}

/** Le relais sépare les genres par virgule ou slash ; deux suffisent à situer. */
function genres(brut: string | undefined): string | undefined {
  const liste = (brut ?? '').split(/[,/]/).map((g) => g.trim()).filter(Boolean)
  return liste.length > 0 ? liste.slice(0, 2).join(', ') : undefined
}

async function chargerFiche(entree: EntreeCatalogue): Promise<Fiche> {
  const client = new ClientXtream()
  const meta: string[] = []
  if (entree.type === 'series') {
    const brut = await client.appelBrut<InfosSerieBrut>('get_series_info', { series_id: entree.id })
    const i = brut.info ?? {}
    const saisons = brut.seasons?.length ?? 0
    const a = annee(i.releaseDate)
    if (a) meta.push(a)
    const g = genres(i.genre)
    if (g) meta.push(g)
    if (saisons > 0) meta.push(`${saisons} saison${saisons > 1 ? 's' : ''}`)
    if (entree.pays) meta.push(entree.pays)
    return { meta, resume: i.plot || undefined, image: i.backdrop_path?.[0] }
  }
  const brut = await client.appelBrut<InfosFilmBrut>(INFOS_FILM, { vod_id: entree.id })
  const i = brut.info ?? {}
  const a = annee(i.releasedate) ?? annee(entree.nom)
  if (a) meta.push(a)
  const g = genres(i.genre)
  if (g) meta.push(g)
  const d = dureeLisible(i.duration)
  if (d) meta.push(d)
  const langue = genres(i.country) ?? entree.pays
  if (langue) meta.push(langue)
  return { meta, resume: i.plot || i.description || undefined, image: i.backdrop_path?.[0] }
}

function Bouton(props: { children: JSX.Element; principal?: boolean; libelle?: string; surClic: () => void }) {
  const [survol, poserSurvol] = createSignal(false)
  return (
    <div
      role="button"
      tabindex="0"
      aria-label={props.libelle}
      title={props.libelle}
      onClick={props.surClic}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.surClic()
        }
      }}
      onMouseEnter={() => poserSurvol(true)}
      onMouseLeave={() => poserSurvol(false)}
      style={{
        height: estMobile() ? '44px' : '36px', display: 'flex', 'align-items': 'center', gap: '6px',
        'border-radius': 'var(--r-btn-sm)', cursor: 'pointer', 'font-weight': 'var(--w-strong)',
        ...(props.principal
          ? { padding: '0 16px 0 12px', background: survol() ? '#0f6cbd' : 'var(--acc)', color: '#fff' }
          : {
              padding: props.children ? '0 14px 0 10px' : '0',
              background: survol() ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.24)', color: 'inherit',
            }),
      }}
    >
      {props.children}
    </div>
  )
}

export interface ALaUneProps {
  elements: EntreeCatalogue[]
  estFavori: (cle: string) => boolean
  surOuvrir: (e: EntreeCatalogue) => void
  surLire: (e: EntreeCatalogue) => void
  surBasculerFavori: (e: EntreeCatalogue) => void
}

export default function ALaUne(props: ALaUneProps) {
  const [index, poserIndex] = createSignal(0)
  const courant = () => props.elements[index() % Math.max(1, props.elements.length)]
  // Clefee par contenu : revenir sur la premiere pastille du carrousel ne
  // redemande rien au relais, qui est aussi celui qui pousse la video.
  const [fiche] = requeteClefee(
    (e: EntreeCatalogue) => cles.ficheRelais(e.type, e.id),
    courant,
    chargerFiche,
    { fraicheur: FRAICHEUR.relais, reessais: 2, peremption: FRAICHEUR.relais },
  )

  const deplacer = (d: number) => {
    const n = props.elements.length
    poserIndex((i) => (i + d + n) % n)
  }

  return (
    <Show when={courant()}>
      {(e) => (
        <section
          aria-label="À la une"
          aria-roledescription="carrousel"
          style={{
            position: 'relative', display: 'flex', 'flex-direction': 'column', 'justify-content': 'flex-end',
            // Mobile : l'image d'abord, le texte dessous — un bandeau posé sur une
            // image de 205 px la cacherait entièrement. Tablette : 380 px, valeur
            // mesurée sur la maquette à 820 px.
            'min-height': estMobile() ? undefined : estTablette() ? '380px' : 'clamp(400px, 36vw, 560px)',
            'border-radius': 'var(--r-md)', overflow: 'hidden',
            background: couverture(e().nom), border: '1px solid var(--line)',
          }}
        >
          <div
            style={
              estMobile()
                ? { position: 'relative', height: '205px', 'flex': 'none', overflow: 'hidden' }
                : { position: 'absolute', inset: 0, overflow: 'hidden' }
            }
          >
            <div
              style={{
                position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)', width: '52%',
                'font-family': 'var(--moov-font-heading)',
                'font-size': estMobile() ? '40px' : estTablette() ? '49px' : 'clamp(48px, 6vw, 96px)',
                'line-height': 1, 'font-weight': 700, 'letter-spacing': '-.03em',
                color: plaqueTexte(e().nom), opacity: 0.18, 'text-align': 'right', 'text-wrap': 'balance',
              }}
            >
              {titreCourt(e().nom)}
            </div>
            <Show when={fiche()?.image ?? e().icone}>
              {(src) => (
                <img
                  src={src()}
                  alt=""
                  decoding="async"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', 'object-fit': 'cover' }}
                />
              )}
            </Show>
          </div>

          <div
            style={
              estMobile()
                ? {
                    position: 'relative', display: 'flex', 'flex-direction': 'column', gap: '10px',
                    padding: '16px', background: 'var(--panel)', color: '#fff', 'z-index': 1,
                  }
                : {
                    position: 'absolute', left: estTablette() ? '20px' : '28px', bottom: estTablette() ? '20px' : '28px',
                    width: '520px', 'max-width': 'calc(100% - 56px)',
                    display: 'flex', 'flex-direction': 'column', gap: '10px', padding: '20px 22px',
                    'border-radius': 'var(--r-md)', background: 'rgba(24,24,24,.74)',
                    'backdrop-filter': 'blur(30px) saturate(1.3)', '-webkit-backdrop-filter': 'blur(30px) saturate(1.3)',
                    border: '1px solid rgba(255,255,255,.12)', color: '#fff', 'z-index': 1,
                  }
            }
          >
            <span style={{ 'font-size': '12px', 'line-height': '16px', 'font-weight': 'var(--w-strong)', color: 'rgba(255,255,255,.84)' }}>
              {`À la une · ${e().type === 'series' ? 'Série' : 'Film'} · ${index() + 1} sur ${props.elements.length}`}
            </span>
            <h1
              style={{
                margin: 0, 'font-family': 'var(--moov-font-heading)',
                'font-size': estMobile() ? '22px' : estTablette() ? '26px' : '32px',
                'line-height': 1.15, 'font-weight': 'var(--w-strong)', 'text-wrap': 'balance',
              }}
            >
              {titreCourt(e().nom)}
            </h1>
            <div
              class="num"
              style={{
                display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '8px',
                'font-size': '13px', 'line-height': '18px', color: 'rgba(255,255,255,.84)', 'min-height': '18px',
              }}
            >
              <span>{fiche()?.meta.join(' · ') ?? (fiche.loading ? '…' : '')}</span>
            </div>
            <p
              style={{
                margin: 0, 'font-size': '14px', 'line-height': '20px', color: 'rgba(255,255,255,.84)',
                display: '-webkit-box', '-webkit-line-clamp': 2, '-webkit-box-orient': 'vertical',
                overflow: 'hidden', 'text-wrap': 'pretty', 'min-height': '40px',
              }}
            >
              {fiche()?.resume ?? (fiche.loading ? '' : 'Aucun résumé fourni par le relais pour ce contenu.')}
            </p>
            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', 'margin-top': '6px' }}>
              <Bouton principal surClic={() => props.surLire(e())}>
                <Icone nom="play_arrow" taille={20} plein />
                Regarder
              </Bouton>
              <Bouton surClic={() => props.surOuvrir(e())}>
                <Icone nom="info" taille={18} />
                Voir les détails
              </Bouton>
              <div style={{ width: estMobile() ? '44px' : '36px', display: 'flex' }}>
                <Bouton
                  libelle={props.estFavori(e().cle) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  surClic={() => props.surBasculerFavori(e())}
                >
                  <span style={{ width: estMobile() ? '44px' : '36px', display: 'flex', 'align-items': 'center', 'justify-content': 'center' }}>
                    <Icone nom="star" taille={18} plein={props.estFavori(e().cle)} />
                  </span>
                </Bouton>
              </div>
            </div>
          </div>

          <div
            style={{
              position: 'absolute', right: estMobile() ? '10px' : estTablette() ? '20px' : '28px',
              ...(estMobile() ? { top: '10px' } : { bottom: estTablette() ? '20px' : '28px' }),
              display: 'flex', 'align-items': 'center',
              gap: '6px', 'z-index': 2, height: estMobile() ? '44px' : '36px', padding: '0 6px', 'border-radius': '22px',
              background: 'rgba(24,24,24,.66)', 'backdrop-filter': 'blur(20px)',
              '-webkit-backdrop-filter': 'blur(20px)', color: '#fff',
            }}
          >
            <Pastille sens={-1} surClic={() => deplacer(-1)} />
            <For each={props.elements}>
              {(_, i) => (
                <span
                  role="button"
                  tabindex="0"
                  aria-label={`Afficher le contenu ${i() + 1}`}
                  aria-current={i() === index() ? 'true' : undefined}
                  onClick={() => poserIndex(i())}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault()
                      poserIndex(i())
                    }
                  }}
                  style={{
                    width: i() === index() ? '20px' : '8px', height: '8px', 'border-radius': '4px',
                    background: i() === index() ? '#fff' : 'rgba(255,255,255,.45)', cursor: 'pointer',
                    transition: 'width 200ms var(--ease)',
                  }}
                />
              )}
            </For>
            <Pastille sens={1} surClic={() => deplacer(1)} />
          </div>
        </section>
      )}
    </Show>
  )
}

function Pastille(props: { sens: -1 | 1; surClic: () => void }) {
  const [survol, poserSurvol] = createSignal(false)
  return (
    <span
      role="button"
      tabindex="0"
      aria-label={props.sens < 0 ? 'Contenu précédent' : 'Contenu suivant'}
      onClick={props.surClic}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.surClic()
        }
      }}
      onMouseEnter={() => poserSurvol(true)}
      onMouseLeave={() => poserSurvol(false)}
      style={{
        width: estMobile() ? '36px' : '28px', height: estMobile() ? '36px' : '28px', 'border-radius': '50%', display: 'flex',
        'align-items': 'center', 'justify-content': 'center', cursor: 'pointer',
        background: survol() ? 'rgba(255,255,255,.14)' : 'transparent',
      }}
    >
      <Icone nom={props.sens < 0 ? 'chevron_left' : 'chevron_right'} taille={18} />
    </span>
  )
}
