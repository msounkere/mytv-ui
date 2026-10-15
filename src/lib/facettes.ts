import type { Categorie, EntreeCatalogue } from './db'

// Le fournisseur n'expose ni genre ni langue : il empile tout dans le nom de
// catégorie (« VOD - CRIME-THRILLER [FR] », « SRS - KINDER SERIEN [DE] »,
// « مسلسلات مصريه »). Les 143 catégories de films et les 98 de séries sont donc
// la seule source de facettes dont nous disposons, et ce module les démonte.
//
// Trois gisements, de fiabilité décroissante :
//   1. le suffixe « [XX] » de la catégorie   → marché, donc pays ET langue ;
//   2. le reste du libellé                   → genre, service, jeunesse… ;
//   3. le préfixe du titre (« FR - », « NF - ») → langue, quand le code en est
//      vraiment une. Relevé sur les 107 159 films, ce préfixe est souvent une
//      étiquette d'édition (NF = Netflix, TG/TM/KD = langues indiennes, TOP =
//      classement IMDb) : il affine, il ne décide jamais seul.
// L'année ne vient d'aucune des trois : elle est dans le titre lui-même,
// « (2025) », présente sur 92 % des films.

/** Majuscules sans accents. L'arabe passe par le même tamis : NFD sépare la
 *  hamza de son support (أ → ا + ٔ) et il faut la retirer, sinon « آسيوية » et
 *  « اسيوي » ne se reconnaissent plus. Ta-marbouta et alef maqsura sont unifiés
 *  pour que « مصريه » et « مصرية » tombent sur le même jeton. */
function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ØÖ]/g, 'O')
    .replace(/[ŁĽ]/g, 'L')
    .replace(/Đ/g, 'D')
    .replace(/[\u064B-\u0655\u0670]/g, '')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toUpperCase()
}

export interface Terme {
  cle: string
  libelle: string
}

// --- Vocabulaires ----------------------------------------------------------

export const GENRES: Terme[] = [
  { cle: 'action', libelle: 'Action' },
  { cle: 'aventure', libelle: 'Aventure' },
  { cle: 'comedie', libelle: 'Comédie' },
  { cle: 'drame', libelle: 'Drame' },
  { cle: 'thriller', libelle: 'Thriller' },
  { cle: 'policier', libelle: 'Policier' },
  { cle: 'horreur', libelle: 'Horreur' },
  { cle: 'sf', libelle: 'Science-fiction' },
  { cle: 'fantastique', libelle: 'Fantastique' },
  { cle: 'animation', libelle: 'Animation' },
  { cle: 'jeunesse', libelle: 'Jeunesse' },
  { cle: 'famille', libelle: 'Famille' },
  { cle: 'documentaire', libelle: 'Documentaire' },
  { cle: 'romance', libelle: 'Romance' },
  { cle: 'guerre', libelle: 'Guerre' },
  { cle: 'western', libelle: 'Western' },
  { cle: 'musical', libelle: 'Musique' },
  { cle: 'sport', libelle: 'Sport' },
  { cle: 'telerealite', libelle: 'Téléréalité' },
  { cle: 'theatre', libelle: 'Théâtre' },
  { cle: 'noel', libelle: 'Noël' },
  { cle: 'religion', libelle: 'Religion' },
  { cle: 'heros', libelle: 'Super-héros' },
]

export const LANGUES: Terme[] = [
  { cle: 'fr', libelle: 'Français' }, { cle: 'en', libelle: 'Anglais' },
  { cle: 'ar', libelle: 'Arabe' }, { cle: 'de', libelle: 'Allemand' },
  { cle: 'es', libelle: 'Espagnol' }, { cle: 'pt', libelle: 'Portugais' },
  { cle: 'it', libelle: 'Italien' }, { cle: 'nl', libelle: 'Néerlandais' },
  { cle: 'pl', libelle: 'Polonais' }, { cle: 'ru', libelle: 'Russe' },
  { cle: 'tr', libelle: 'Turc' }, { cle: 'el', libelle: 'Grec' },
  { cle: 'da', libelle: 'Danois' }, { cle: 'no', libelle: 'Norvégien' },
  { cle: 'fi', libelle: 'Finnois' }, { cle: 'is', libelle: 'Islandais' },
  { cle: 'hu', libelle: 'Hongrois' }, { cle: 'ro', libelle: 'Roumain' },
  { cle: 'bg', libelle: 'Bulgare' }, { cle: 'sq', libelle: 'Albanais' },
  { cle: 'sh', libelle: 'Serbo-croate' }, { cle: 'hi', libelle: 'Langues indiennes' },
  { cle: 'fa', libelle: 'Persan' }, { cle: 'so', libelle: 'Somali' },
  { cle: 'multi', libelle: 'Multi-langues' }, { cle: 'vostfr', libelle: 'Sous-titré' },
]

export const PAYS: Terme[] = [
  { cle: 'anglo', libelle: 'Anglophone' }, { cle: 'fr', libelle: 'France' },
  { cle: 'qc', libelle: 'Québec' }, { cle: 'es', libelle: 'Espagne' },
  { cle: 'lat', libelle: 'Amérique latine' }, { cle: 'pt', libelle: 'Portugal' },
  { cle: 'de', libelle: 'Allemagne' }, { cle: 'it', libelle: 'Italie' },
  { cle: 'nl', libelle: 'Pays-Bas' }, { cle: 'pl', libelle: 'Pologne' },
  { cle: 'gr', libelle: 'Grèce' }, { cle: 'ro', libelle: 'Roumanie' },
  { cle: 'bg', libelle: 'Bulgarie' }, { cle: 'exyu', libelle: 'Ex-Yougoslavie' },
  { cle: 'tr', libelle: 'Turquie' }, { cle: 'hu', libelle: 'Hongrie' },
  { cle: 'ru', libelle: 'Russie' }, { cle: 'scandi', libelle: 'Scandinavie' },
  { cle: 'dk', libelle: 'Danemark' }, { cle: 'no', libelle: 'Norvège' },
  { cle: 'fi', libelle: 'Finlande' }, { cle: 'is', libelle: 'Islande' },
  { cle: 'al', libelle: 'Albanie' }, { cle: 'ir', libelle: 'Iran' },
  { cle: 'in', libelle: 'Inde' }, { cle: 'pk', libelle: 'Pakistan' },
  { cle: 'asie', libelle: 'Asie' }, { cle: 'af', libelle: 'Afrique' },
  { cle: 'so', libelle: 'Somalie' }, { cle: 'ar', libelle: 'Monde arabe' },
  { cle: 'ma', libelle: 'Maroc' }, { cle: 'tn', libelle: 'Tunisie' },
  { cle: 'dz', libelle: 'Algérie' }, { cle: 'eg', libelle: 'Égypte' },
  { cle: 'levant', libelle: 'Syrie et Liban' }, { cle: 'golfe', libelle: 'Golfe' },
  { cle: 'iq', libelle: 'Irak' },
]

export const SERVICES: Terme[] = [
  { cle: 'netflix', libelle: 'Netflix' }, { cle: 'disney', libelle: 'Disney+' },
  { cle: 'prime', libelle: 'Prime Video' }, { cle: 'apple', libelle: 'Apple TV+' },
  { cle: 'hbo', libelle: 'HBO Max' }, { cle: 'hulu', libelle: 'Hulu' },
  { cle: 'paramount', libelle: 'Paramount+' }, { cle: 'canal', libelle: 'Canal+ / TF1' },
  { cle: 'shahid', libelle: 'Shahid' }, { cle: 'movistar', libelle: 'Movistar+' },
  { cle: 'videoland', libelle: 'Videoland' }, { cle: 'tabii', libelle: 'TABII' },
  { cle: 'imdb', libelle: 'Classement IMDb' },
]

/** Mêmes tranches que la maquette. Le catalogue ne porte aucune durée : le
 *  filtre « Durée » du dossier n'a aucune donnée pour exister, l'année oui. */
export const ANNEES: Array<Terme & { garde: (a: number) => boolean }> = [
  { cle: '2025', libelle: '2025 et après', garde: (a) => a >= 2025 },
  { cle: '2020', libelle: '2020 – 2024', garde: (a) => a >= 2020 && a < 2025 },
  { cle: '2010', libelle: '2010 – 2019', garde: (a) => a >= 2010 && a < 2020 },
  { cle: '2000', libelle: '2000 – 2009', garde: (a) => a >= 2000 && a < 2010 },
  { cle: 'avant', libelle: 'Avant 2000', garde: (a) => a > 0 && a < 2000 },
]

/** Les quatre tris de la maquette, et les quatre reposent sur un champ réel :
 *  `ajouteLe` est renseigné sur 100 % du catalogue, `note` sur 84 %, l'année
 *  se lit dans le titre sur 92 %. */
export const TRIS: Terme[] = [
  { cle: 'ajout', libelle: "Date d'ajout" },
  { cle: 'titre', libelle: 'Titre (A–Z)' },
  { cle: 'annee', libelle: 'Année' },
  { cle: 'note', libelle: 'Popularité' },
]

// --- Lexiques --------------------------------------------------------------

/** Suffixe « [XX] » : le marché visé, qui donne à la fois le pays et la langue. */
const MARCHES: Record<string, { langue?: string; pays?: string }> = {
  EN: { langue: 'en', pays: 'anglo' }, ENG: { langue: 'en', pays: 'anglo' },
  FR: { langue: 'fr', pays: 'fr' }, QC: { langue: 'fr', pays: 'qc' },
  ES: { langue: 'es', pays: 'es' }, PT: { langue: 'pt', pays: 'pt' },
  DE: { langue: 'de', pays: 'de' }, IT: { langue: 'it', pays: 'it' },
  NL: { langue: 'nl', pays: 'nl' }, PL: { langue: 'pl', pays: 'pl' },
  GR: { langue: 'el', pays: 'gr' }, RO: { langue: 'ro', pays: 'ro' },
  BG: { langue: 'bg', pays: 'bg' }, EXYU: { langue: 'sh', pays: 'exyu' },
  TR: { langue: 'tr', pays: 'tr' }, HU: { langue: 'hu', pays: 'hu' },
  RU: { langue: 'ru', pays: 'ru' }, DK: { langue: 'da', pays: 'dk' },
  NO: { langue: 'no', pays: 'no' }, FI: { langue: 'fi', pays: 'fi' },
  IS: { langue: 'is', pays: 'is' }, AL: { langue: 'sq', pays: 'al' },
  ALB: { langue: 'sq', pays: 'al' }, IR: { langue: 'fa', pays: 'ir' },
  AF: { pays: 'af' }, SO: { langue: 'so', pays: 'so' },
  AR: { langue: 'ar', pays: 'ar' }, MA: { langue: 'ar', pays: 'ma' },
  MU: { langue: 'multi' }, MULTISUB: { langue: 'multi' },
}

/** Préfixe du titre : seuls les codes qui sont vraiment une langue comptent. */
const LANGUE_PREFIXE: Record<string, string> = {
  FR: 'fr', EN: 'en', ENG: 'en', AR: 'ar', DE: 'de', ES: 'es', LAT: 'es',
  NL: 'nl', PL: 'pl', IT: 'it', PT: 'pt', RU: 'ru', TR: 'tr', GR: 'el',
  DK: 'da', NO: 'no', FI: 'fi', IS: 'is', HU: 'hu', RO: 'ro', BG: 'bg',
  AL: 'sq', EX: 'sh', IR: 'fa', SOM: 'so', MA: 'ar',
  IN: 'hi', TG: 'hi', TM: 'hi', KD: 'hi', STH: 'hi', MR: 'hi', PB: 'hi',
  IND: 'hi', PK: 'hi',
}

type Lexique = Array<[string, string[]]>

const LEX_GENRE: Lexique = [
  ['action', ['ACTION', 'ACTIE', 'AKCJA', 'WALKI']],
  ['aventure', ['AVENTUR', 'ADVENTURE', 'AVVENTURA']],
  ['comedie', ['COMEDI', 'COMEDY', 'KOMEDI', 'COMMEDIA', 'كوميدي']],
  ['drame', ['DRAME', 'DRAMA', 'DRAMMATICO', 'دراما']],
  ['thriller', ['THRILLER', 'SUSPENSE']],
  ['policier', ['CRIME', 'POLICIER', 'MYSTER', 'KRIMI', 'POLAR']],
  ['horreur', ['HORREUR', 'HORROR', 'GRIEZEL', 'TERROR', 'رعب']],
  ['sf', ['SCIENCE-FICTION', 'SCIENCE FICTION', 'SCI-FI', 'FANTASCIENZA']],
  ['fantastique', ['FANTASTIQUE', 'FANTASY', 'FANTASIE', 'FANTASTIC']],
  ['animation', ['ANIME', 'ANIMATION', 'ANIMAZIONE', 'MANGA', 'CARTOON', 'CRTAN', 'مانجا', 'كرتون', 'انمي']],
  ['jeunesse', ['KIDS', 'ENFANTS', 'KINDER', 'NINOS', 'BAJKI', 'ORNEFILM', 'BARNEFILMER',
    'LASTEN', 'KRAKKABIO', 'DETSA', 'DZIECI', 'JEUNESSE', 'ATFAL', 'اطفال']],
  ['famille', ['FAMILI', 'FAMILY', 'FAMILLE', 'FAMILJ']],
  ['documentaire', ['DOCUMENTAIRE', 'DOCUMENTAR', 'DOCUMENTAL', 'DOKUS', 'DOKUMENT', 'وثائقي']],
  ['romance', ['ROMANCE', 'ROMANTI', 'رومانسي']],
  ['guerre', ['GUERRE', 'KRIEG', 'WOJENNE', 'حربي']],
  ['western', ['WESTERN']],
  ['musical', ['MUSICAL', 'MUSIQUE', 'MUSIC', 'اغاني', 'طرب']],
  ['sport', ['SPORT', 'UFC', 'PPV', 'BOXE']],
  ['telerealite', ['REALITY', 'TELEREALITE', 'منوع']],
  ['theatre', ['THEATRE', 'TEATR', 'مسرحيات']],
  ['noel', ['CHRISTMAS', 'NOEL', 'SWIATECZ', 'WEIHNACHT']],
  ['religion', ['QURAN', "QUR'AN", 'CORAN', 'ISLAM', 'دينيه', 'القران']],
  ['heros', ['MARVEL', ' DC/']],
]

const LEX_PAYS: Lexique = [
  ['anglo', ['ENGLISH']],
  ['fr', ['FRENCH', 'FRANCE']],
  ['qc', ['QUEBEC']],
  ['es', ['SPAIN', 'ESPANA']],
  ['lat', ['LATINO']],
  ['pt', ['PORTUGAL']],
  ['de', ['GERMANY', 'DEUTSCH']],
  ['it', ['ITALY', 'ITALIA']],
  ['nl', ['NETHERLAND', 'BIOSCOOP']],
  ['pl', ['POLSKIE', 'POLISH']],
  ['gr', ['GREECE']],
  ['ro', ['ROMANIA']],
  ['bg', ['BULGARIA']],
  ['exyu', ['DOMACI', 'SERIJE', 'FILMOVI']],
  ['tr', ['TURKISH', 'TURKEY', 'TURQUIE', 'تركي']],
  ['hu', ['HUNGARIA', 'SOROZAT']],
  ['ru', ['RUSSIA']],
  ['scandi', ['SCANDINAVIA']],
  ['dk', ['DANMARK']],
  ['no', ['NORWAY']],
  ['fi', ['FINLAND']],
  ['is', ['ICELAND']],
  ['al', ['ALBANIA']],
  ['ir', ['IRAN', 'ايراني']],
  ['in', ['INDIA', 'PUNJABI', 'هندي']],
  ['pk', ['PAKISTAN']],
  ['asie', ['ASIA', 'ASIATIQUE', 'اسيوي', 'اسيوي']],
  ['af', ['AFRICA', 'AFRICAN', 'امازيغي']],
  ['so', ['SOMALIA']],
  ['ar', ['عربي', 'عربيه', 'ARAB']],
  ['ma', ['MOROCCO', 'MAROC', 'مغربي']],
  ['tn', ['TUNIS', 'تونسي']],
  ['dz', ['ALGER', 'جزائري']],
  ['eg', ['مصري', 'EGYPT']],
  ['levant', ['سوري', 'لبناني']],
  ['golfe', ['خليجي']],
  ['iq', ['عراقي']],
]

const LEX_SERVICE: Lexique = [
  ['netflix', ['NETFLIX', 'نيتفليكس']],
  ['disney', ['DISNEY']],
  ['prime', ['PRIME+', 'AMAZON PRIME', 'PRIME VIDEO']],
  ['apple', ['APPLE']],
  ['hbo', ['HBO', ' MAX ']],
  ['hulu', ['HULU']],
  ['paramount', ['PARAMOUNT']],
  ['canal', ['CANAL+', 'TF1']],
  ['shahid', ['SHAHID']],
  ['movistar', ['MOVISTAR']],
  ['videoland', ['VIDEOLAND']],
  ['tabii', ['TABII', 'تابي']],
  ['imdb', ['IMDB']],
]

const GENRE = preparer(LEX_GENRE)
const ORIGINE = preparer(LEX_PAYS)
const SERVICE = preparer(LEX_SERVICE)

const JETONS_NOUVEAUTE = ['NEW ADDED', 'RECEMMENT', 'NUEVO', 'NOUVEAU', 'جديد', 'يعرض الان', 'NEWLY']
  .map(normaliser)
/** Une année à venir dans le libellé fait la nouveauté aussi sûrement qu'un
 *  « NEW ADDED » : « GERMANY 2024-2026 », « 2026 برامج رمضان ». */
const ANNEE_PROCHE = /\b20(2[5-9]|3\d)\b/

/** Quand le marché est muet, l'origine dit encore la langue : « VOD - INDIA »
 *  n'a ni suffixe ni préfixe mais n'est pas pour autant sans langue. */
const LANGUE_DU_PAYS: Record<string, string> = {
  anglo: 'en', fr: 'fr', qc: 'fr', es: 'es', lat: 'es', pt: 'pt', de: 'de',
  it: 'it', nl: 'nl', pl: 'pl', gr: 'el', ro: 'ro', bg: 'bg', exyu: 'sh',
  tr: 'tr', hu: 'hu', ru: 'ru', dk: 'da', no: 'no', fi: 'fi', is: 'is',
  al: 'sq', ir: 'fa', in: 'hi', pk: 'hi', so: 'so',
  ar: 'ar', ma: 'ar', tn: 'ar', dz: 'ar', eg: 'ar', levant: 'ar',
  golfe: 'ar', iq: 'ar',
}

const PREFIXE_TYPE = /^\s*(?:VOD|SRS|SER|SERIES|FILMS?|MOVIES?)\s*[-–—:]\s*/i
const SUFFIXE_MARCHE = /\[([^\]]+)\]\s*$/
const ANNEE_TITRE = /\((19|20)\d{2}\)/

export interface FacettesCategorie {
  langue?: string
  pays?: string
  genres: string[]
  service?: string
  nouveaute: boolean
  /** Le libellé débarrassé du préfixe de type et du suffixe de marché. */
  libelle: string
}

/** Les lexiques sont normalisés une fois pour toutes : un jeton écrit « ئ » et
 *  un libellé décomposé par NFD ne se croiseraient jamais autrement. */
function preparer(lex: Lexique): Lexique {
  return lex.map(([cle, jetons]) => [cle, jetons.map(normaliser)])
}

function cherche(hay: string, lex: Lexique): string[] {
  const out: string[] = []
  for (const [cle, jetons] of lex) {
    for (const j of jetons) if (hay.includes(j)) { out.push(cle); break }
  }
  return out
}

/** Démonte un nom de catégorie du fournisseur en facettes exploitables. */
export function analyserCategorie(nom: string): FacettesCategorie {
  const brut = nom.replace(PREFIXE_TYPE, '').trim()
  const marque = SUFFIXE_MARCHE.exec(brut)
  const corps = marque ? brut.slice(0, marque.index).trim() : brut
  const n = ` ${normaliser(corps)} `
  const marche = marque ? MARCHES[normaliser(marque[1]!)] : undefined

  // « VOD - LATINO [ES] » est espagnol mais pas espagnol d'Espagne : le corps
  // du libellé prime sur le suffixe quand il nomme explicitement une origine.
  const paysCorps = cherche(n, ORIGINE)
  // L'écriture arabe est à elle seule une facette : plus d'un tiers des
  // catégories n'ont ni préfixe ni suffixe, seulement leur alphabet.
  const arabe = /[؀-ۿ]/.test(corps)

  const pays = paysCorps[0] ?? marche?.pays ?? (arabe ? 'ar' : undefined)

  return {
    langue: marche?.langue ?? (arabe ? 'ar' : undefined) ?? (pays ? LANGUE_DU_PAYS[pays] : undefined),
    pays,
    genres: cherche(n, GENRE),
    service: cherche(n, SERVICE)[0],
    nouveaute: JETONS_NOUVEAUTE.some((j) => n.includes(j)) || ANNEE_PROCHE.test(n),
    libelle: corps,
  }
}

// --- Index ----------------------------------------------------------------

export const DRAPEAU_NOUVEAUTE = 1
export const DRAPEAU_SON = 2

/** Fenêtre de la bascule « Nouveautés ». Relevé sur le catalogue réel : les
 *  catégories « NEW ADDED » du fournisseur couvrent 18,5 % des films, dont
 *  1,4 % seulement ont moins de 30 jours — ce sont des bacs de rangement, pas
 *  un signal de fraîcheur. La date d'ajout, elle, en isole 901, et c'est elle
 *  qui décide. Le libellé de catégorie ne sert plus que de repli pour les
 *  entrées importées avant que `ajouteLe` n'existe. */
export const FENETRE_NOUVEAUTE = 30 * 86_400_000

/** Conteneurs que le lecteur HTML5 sait ouvrir sans transcodage. Les autres
 *  (mkv, avi) transportent presque toujours de l'EAC3 ou du DTS, que le
 *  navigateur refuse : c'est la bascule « Son lisible » du dossier. */
const CONTENEURS_LISIBLES = new Set(['mp4', 'm4v', 'mov'])

export interface Vocabulaire {
  genres: Terme[]
  langues: Terme[]
  pays: Terme[]
  services: Terme[]
  annees: Terme[]
}

export interface IndexFacettes {
  entrees: EntreeCatalogue[]
  genres: Int32Array
  langue: Uint8Array
  pays: Uint8Array
  service: Uint8Array
  annee: Int16Array
  /** Jours depuis l'époque, −1 sans date : suffit au tri comme au badge, et
   *  tient dans un Int32 là où l'horodatage demanderait un Float64. */
  jourAjout: Int32Array
  /** Note × 10, −1 sans note. */
  note: Int16Array
  drapeaux: Uint8Array
  /** Catégories que le fournisseur annonce comme nouvelles, et année à partir
   *  de laquelle un titre l'est de lui-même : de quoi badger une affiche sans
   *  retenir un ensemble de 26 000 clés. */
  categoriesNouvelles: Set<string>
  /** Horodatage en deçà duquel un titre n'est plus une nouveauté. */
  seuilNouveaute: number
  vocabulaire: Vocabulaire
  /** Un ordre par tri, calculé une seule fois : refaire le tri à chaque
   *  changement de filtre coûterait cent fois le filtrage lui-même. */
  ordres: Map<string, Int32Array>
}

const INCONNU = 255

function rang(liste: Terme[]): Map<string, number> {
  return new Map(liste.map((t, i) => [t.cle, i]))
}

const RANG_GENRE = rang(GENRES)
const RANG_LANGUE = rang(LANGUES)
const RANG_PAYS = rang(PAYS)
const RANG_SERVICE = rang(SERVICES)

/** Ne garde du vocabulaire que ce qui a vraiment des titres, du plus fourni au
 *  moins fourni : un menu « Pays » de 37 lignes dont 30 vides ne sert personne. */
function retenir(liste: Terme[], comptes: Map<number, number>): Terme[] {
  return liste
    .map((t, i) => ({ t, n: comptes.get(i) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.t)
}

export function construireIndex(entrees: EntreeCatalogue[], categories: Categorie[]): IndexFacettes {
  const parCategorie = new Map<string, FacettesCategorie>()
  for (const c of categories) parCategorie.set(c.id, analyserCategorie(c.nom))

  const n = entrees.length
  const genres = new Int32Array(n)
  const langue = new Uint8Array(n).fill(INCONNU)
  const pays = new Uint8Array(n).fill(INCONNU)
  const service = new Uint8Array(n).fill(INCONNU)
  const annee = new Int16Array(n)
  const jourAjout = new Int32Array(n).fill(-1)
  const note = new Int16Array(n).fill(-1)
  const drapeaux = new Uint8Array(n)

  const cg = new Map<number, number>()
  const cl = new Map<number, number>()
  const cp = new Map<number, number>()
  const cs = new Map<number, number>()
  const ca = new Map<number, number>()
  const inc = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1)

  const seuilNouveaute = Date.now() - FENETRE_NOUVEAUTE
  const categoriesNouvelles = new Set<string>()
  for (const [id, f] of parCategorie) if (f.nouveaute) categoriesNouvelles.add(id)

  for (let i = 0; i < n; i++) {
    const e = entrees[i]!
    const f = e.categorie ? parCategorie.get(e.categorie) : undefined

    const m = ANNEE_TITRE.exec(e.nom)
    const a = m ? +m[0].slice(1, 5) : 0
    annee[i] = a

    let bits = 0
    if (f) for (const g of f.genres) {
      const r = RANG_GENRE.get(g)
      if (r !== undefined) { bits |= 1 << r; inc(cg, r) }
    }
    genres[i] = bits

    // Le préfixe du titre l'emporte quand il nomme une langue : « LAT - » dans
    // une catégorie espagnole reste de l'espagnol, « EX - » du serbo-croate.
    const depuisPrefixe = e.pays ? LANGUE_PREFIXE[e.pays.toUpperCase()] : undefined
    const l = depuisPrefixe ?? f?.langue
    if (l !== undefined) { const r = RANG_LANGUE.get(l); if (r !== undefined) { langue[i] = r; inc(cl, r) } }
    if (f?.pays !== undefined) { const r = RANG_PAYS.get(f.pays); if (r !== undefined) { pays[i] = r; inc(cp, r) } }
    if (f?.service !== undefined) { const r = RANG_SERVICE.get(f.service); if (r !== undefined) { service[i] = r; inc(cs, r) } }

    if (e.ajouteLe !== undefined) jourAjout[i] = Math.floor(e.ajouteLe / 86_400_000)
    if (e.note !== undefined) note[i] = Math.round(Math.min(10, e.note) * 10)

    let d = 0
    if (e.ajouteLe !== undefined ? e.ajouteLe >= seuilNouveaute : Boolean(f?.nouveaute)) {
      d |= DRAPEAU_NOUVEAUTE
    }
    if (CONTENEURS_LISIBLES.has(e.extension ?? '')) d |= DRAPEAU_SON
    drapeaux[i] = d

    if (a > 0) {
      for (let k = 0; k < ANNEES.length; k++) if (ANNEES[k]!.garde(a)) { inc(ca, k); break }
    }
  }

  return {
    entrees, genres, langue, pays, service, annee, jourAjout, note, drapeaux,
    categoriesNouvelles, seuilNouveaute,
    vocabulaire: {
      genres: retenir(GENRES, cg),
      langues: retenir(LANGUES, cl),
      pays: retenir(PAYS, cp),
      services: retenir(SERVICES, cs),
      annees: ANNEES.filter((_, i) => (ca.get(i) ?? 0) > 0),
    },
    // Trois des quatre tris sont des tris par comptage, calculés d'emblée :
    // ils coûtent une passe chacun, et plus rien au moment du clic.
    ordres: new Map([
      ['ajout', ordreDecroissant(n, jourAjout, 1)],
      ['annee', ordreDecroissant(n, annee, 0)],
      ['note', ordreDecroissant(n, note, 0)],
    ]),
  }
}

/** Tri par comptage décroissant sur une valeur entière bornée — année, jour
 *  d'ajout, note × 10. Une passe au lieu d'un comparateur, soit quelques
 *  millisecondes là où `sort` sur 107 159 entrées en coûte cent. Stable : à
 *  valeur égale, l'ordre du fournisseur est conservé. Les entrées sans valeur
 *  (`< minimum`) ferment la marche plutôt que d'ouvrir le classement. */
function ordreDecroissant(n: number, valeurs: ArrayLike<number>, minimum: number): Int32Array {
  let haut = minimum
  for (let i = 0; i < n; i++) { const v = valeurs[i]!; if (v > haut) haut = v }
  const seaux = haut - minimum + 1
  const compte = new Int32Array(seaux + 1)
  const seau = (i: number) => { const v = valeurs[i]!; return v < minimum ? seaux : v - minimum }

  for (let i = 0; i < n; i++) compte[seau(i)]!++
  const curseur = new Int32Array(seaux + 1)
  let pos = 0
  for (let k = seaux - 1; k >= 0; k--) { curseur[k] = pos; pos += compte[k]! }
  curseur[seaux] = pos

  const out = new Int32Array(n)
  for (let i = 0; i < n; i++) out[curseur[seau(i)]!++] = i
  return out
}

/** Le tri alphabétique est le seul qui demande un comparateur : on le prépare
 *  dès que le fil principal n'a rien de mieux à faire, pour qu'un clic sur
 *  « Titre (A–Z) » ne paie jamais ses 100 ms. */
export function preparerTriTitre(idx: IndexFacettes): void {
  if (idx.ordres.has('titre')) return
  const lancer = () => {
    const debut = performance.now()
    void ordre(idx, 'titre')
    performance.measure('mytv:tri-titre', { start: debut, end: performance.now() })
  }
  const au = (globalThis as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback
  if (au) au(lancer)
  else setTimeout(lancer, 0)
}

// --- Filtrage -------------------------------------------------------------

export interface Criteres {
  genres: string[]
  langues: string[]
  annee: string | null
  pays: string[]
  services: string[]
  nouveautes: boolean
  favoris: boolean
  enCours: boolean
  sonLisible: boolean
  tri: string
}

export const CRITERES_VIDES: Criteres = {
  genres: [], langues: [], annee: null, pays: [], services: [],
  nouveautes: false, favoris: false, enCours: false, sonLisible: false,
  tri: 'ajout',
}

/** Même règle que le drapeau de l'index, mais sans l'index : l'affiche n'a que
 *  son entrée sous la main au moment d'être badgée. */
export function estNouveaute(idx: IndexFacettes, e: EntreeCatalogue): boolean {
  if (e.ajouteLe !== undefined) return e.ajouteLe >= idx.seuilNouveaute
  return e.categorie !== undefined && idx.categoriesNouvelles.has(e.categorie)
}

export function nombreDeFiltres(c: Criteres): number {
  return c.genres.length + c.langues.length + c.pays.length + c.services.length +
    (c.annee ? 1 : 0) + (c.nouveautes ? 1 : 0) + (c.favoris ? 1 : 0) +
    (c.enCours ? 1 : 0) + (c.sonLisible ? 1 : 0)
}

function masque(cles: string[], r: Map<string, number>): number {
  let m = 0
  for (const c of cles) { const i = r.get(c); if (i !== undefined) m |= 1 << i }
  return m
}

function ensemble(cles: string[], r: Map<string, number>): Set<number> | null {
  if (cles.length === 0) return null
  const s = new Set<number>()
  for (const c of cles) { const i = r.get(c); if (i !== undefined) s.add(i) }
  return s
}

function ordre(idx: IndexFacettes, tri: string): Int32Array {
  const deja = idx.ordres.get(tri)
  if (deja) return deja
  const n = idx.entrees.length
  const o = new Int32Array(n)
  for (let i = 0; i < n; i++) o[i] = i
  // `recherche` est déjà minuscule et sans accents : une comparaison brute
  // suffit, là où localeCompare sur 107 159 titres prendrait des secondes.
  const cles = idx.entrees.map((e) => e.recherche)
  o.sort((a, b) => (cles[a]! < cles[b]! ? -1 : cles[a]! > cles[b]! ? 1 : a - b))
  idx.ordres.set(tri, o)
  return o
}

export function filtrer(
  idx: IndexFacettes,
  c: Criteres,
  favoris: Set<string>,
  enCours: Set<string>,
): EntreeCatalogue[] {
  const o = ordre(idx, c.tri)
  const mg = masque(c.genres, RANG_GENRE)
  const sl = ensemble(c.langues, RANG_LANGUE)
  const sp = ensemble(c.pays, RANG_PAYS)
  const ss = ensemble(c.services, RANG_SERVICE)
  const an = c.annee ? ANNEES.find((a) => a.cle === c.annee)?.garde : undefined
  const ent = idx.entrees
  const out: EntreeCatalogue[] = []

  for (let j = 0; j < o.length; j++) {
    const i = o[j]!
    if (mg && (idx.genres[i]! & mg) === 0) continue
    if (sl && !sl.has(idx.langue[i]!)) continue
    if (sp && !sp.has(idx.pays[i]!)) continue
    if (ss && !ss.has(idx.service[i]!)) continue
    if (an && !an(idx.annee[i]!)) continue
    const d = idx.drapeaux[i]!
    if (c.nouveautes && (d & DRAPEAU_NOUVEAUTE) === 0) continue
    if (c.sonLisible && (d & DRAPEAU_SON) === 0) continue
    const e = ent[i]!
    if (c.favoris && !favoris.has(e.cle)) continue
    if (c.enCours && !enCours.has(e.cle)) continue
    out.push(e)
  }
  return out
}
