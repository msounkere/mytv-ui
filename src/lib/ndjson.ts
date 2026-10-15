// Lecture d'un flux NDJSON (`/catalogue/export`) par lots.
//
// Module PUR (aucun import local) : il se teste sous node sans navigateur.
//
// POURQUOI par lots et en flux : l'export compte jusqu'a ~150 000 lignes. Tout
// lire puis `JSON.parse` d'un bloc tiendrait le catalogue deux fois en memoire
// et figerait le worker. On decode au fil des octets, on coupe aux fins de
// ligne (un octet de plus que `\n` n'a jamais de sens en UTF-8, mais une ligne
// peut chevaucher deux morceaux reseau, d'ou le reste conserve), et on rend la
// main a chaque lot pour que l'appelant ecrive dans IndexedDB pendant que le
// reseau continue de remplir.

export class ErreurNdjson extends Error {
  // Pas de « propriete de parametre » : elle n'est pas du TypeScript effacable,
  // et ce module est execute tel quel par les tests node (strip-types).
  readonly numeroLigne: number
  constructor(numeroLigne: number, detail: string) {
    super(`Ligne ${numeroLigne} illisible dans le flux : ${detail}`)
    this.name = 'ErreurNdjson'
    this.numeroLigne = numeroLigne
  }
}

/**
 * Rend les objets du flux par lots d'au plus `taille`. Un lot n'est jamais vide.
 * Une ligne vide est ignoree (fin de fichier, `\r\n`) ; une ligne qui n'est pas
 * du JSON leve `ErreurNdjson` : mieux vaut echouer et reprendre que d'importer
 * un catalogue troue sans le dire.
 */
export async function* lireNdjson<T = unknown>(
  corps: ReadableStream<Uint8Array>,
  taille = 5000,
): AsyncGenerator<T[]> {
  const lecteur = corps.getReader()
  const decodeur = new TextDecoder('utf-8')
  let reste = ''
  let lot: T[] = []
  let numero = 0

  const analyser = (ligne: string): void => {
    const nette = ligne.endsWith('\r') ? ligne.slice(0, -1) : ligne
    if (nette.trim() === '') return
    numero++
    try {
      lot.push(JSON.parse(nette) as T)
    } catch (e) {
      throw new ErreurNdjson(numero, e instanceof Error ? e.message : String(e))
    }
  }

  try {
    for (;;) {
      const { done, value } = await lecteur.read()
      reste += decodeur.decode(value, { stream: !done })
      let debut = 0
      for (;;) {
        const fin = reste.indexOf('\n', debut)
        if (fin === -1) break
        analyser(reste.slice(debut, fin))
        debut = fin + 1
        if (lot.length >= taille) {
          yield lot
          lot = []
        }
      }
      reste = reste.slice(debut)
      if (done) break
    }
    // Derniere ligne sans saut de ligne final.
    analyser(reste)
    if (lot.length > 0) yield lot
  } finally {
    // Si l'appelant abandonne (erreur d'ecriture, annulation), on libere la
    // connexion plutot que de laisser le serveur emettre dans le vide.
    void lecteur.cancel().catch(() => undefined)
    lecteur.releaseLock()
  }
}
