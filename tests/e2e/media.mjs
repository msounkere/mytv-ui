// Medias factices, generes ici : aucun fichier binaire dans le depot, aucun
// ffmpeg. Chromium headless ne decode ni le H.264 ni l'AAC ; il decode le MP3.
// On fabrique donc du MP3 silencieux, nu (pour <video> en lecture directe) ou
// range dans du MPEG-TS (pour hls.js) : de vrais octets, un vrai demultiplexage,
// et pas un seul octet venu d'un fournisseur.

/** Une trame MPEG-1 Layer III, 128 kb/s, 44,1 kHz, mono : 417 octets, 26,12 ms. */
export function trameMp3() {
  const t = Buffer.alloc(417)
  t[0] = 0xff; t[1] = 0xfb; t[2] = 0x90; t[3] = 0xc0
  return t
}
export const DUREE_TRAME = 1152 / 44100

/** `secondes` de silence MP3 : lisible tel quel par un <video>. */
export function mp3(secondes) {
  const n = Math.ceil(secondes / DUREE_TRAME)
  return Buffer.concat(Array.from({ length: n }, trameMp3))
}

function crc32Mpeg(octets) {
  let crc = 0xffffffff
  for (const b of octets) {
    crc ^= b << 24
    for (let i = 0; i < 8; i++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1
  }
  return crc >>> 0
}

function section(tableId, corpsApresLongueur) {
  const longueur = corpsApresLongueur.length + 4
  const tete = Buffer.from([tableId, 0xb0 | (longueur >> 8), longueur & 0xff])
  const sansCrc = Buffer.concat([tete, corpsApresLongueur])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32Mpeg(sansCrc))
  return Buffer.concat([sansCrc, crc])
}

const PID_PMT = 0x1000
const PID_AUDIO = 0x100

function paquets(pid, charge, compteurs, { debutUnite = true, pcr } = {}) {
  const out = []
  let reste = charge
  let premier = true
  while (reste.length > 0 || premier) {
    const p = Buffer.alloc(188, 0xff)
    p[0] = 0x47
    p[1] = ((premier && debutUnite ? 0x40 : 0) | (pid >> 8)) & 0xff
    p[2] = pid & 0xff
    const cc = (compteurs.get(pid) ?? 0) & 0x0f
    compteurs.set(pid, cc + 1)
    let place = 184
    let decal = 4
    const besoinAdaptation = reste.length < 184 || (premier && pcr !== undefined)
    if (besoinAdaptation) {
      // Champ d'adaptation : porte le PCR, ou bourre le dernier paquet.
      const pcrLen = premier && pcr !== undefined ? 6 : 0
      const lenAdapt = Math.max(1 + pcrLen, 184 - reste.length - 1)
      p[3] = 0x30 | cc
      p[4] = Math.min(lenAdapt, 183)
      p[5] = pcrLen ? 0x10 : 0x00
      if (pcrLen) {
        const base = pcr
        p[6] = Math.floor(base / 2 ** 25) & 0xff; p[7] = Math.floor(base / 2 ** 17) & 0xff
        p[8] = Math.floor(base / 2 ** 9) & 0xff; p[9] = Math.floor(base / 2) & 0xff
        p[10] = ((base % 2) << 7) | 0x7e; p[11] = 0
      }
      decal = 5 + p[4]
      place = 188 - decal
      // Octets de bourrage deja a 0xff.
    } else {
      p[3] = 0x10 | cc
    }
    const n = Math.min(place, reste.length)
    reste.copy(p, decal, 0, n)
    reste = reste.subarray(n)
    out.push(p)
    premier = false
  }
  return out
}

function pts(valeur) {
  // 33 bits : un Number les tient, et evite de melanger BigInt et octets.
  const v = valeur
  const haut = Math.floor(v / 2 ** 30) & 0x07
  const milieu = Math.floor(v / 2 ** 15) & 0x7fff
  const bas = v % 2 ** 15
  return Buffer.from([
    0x21 | (haut << 1),
    milieu >> 7,
    0x01 | ((milieu & 0x7f) << 1),
    bas >> 7,
    0x01 | ((bas & 0x7f) << 1),
  ])
}

/**
 * Un segment HLS de `secondes` de silence MP3 en MPEG-TS, dont les horodatages
 * continuent d'un segment a l'autre (`indice` × `secondes`).
 */
export function segmentTs(indice, secondes = 2) {
  const compteurs = new Map()
  const out = []
  // PAT puis PMT, en tete de chaque segment.
  const pat = Buffer.concat([Buffer.from([0x00]), section(0x00, Buffer.from([0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe0 | (PID_PMT >> 8), PID_PMT & 0xff]))])
  out.push(...paquets(0, pat, compteurs))
  const pmt = Buffer.concat([Buffer.from([0x00]), section(0x02, Buffer.from([
    0x00, 0x01, 0xc1, 0x00, 0x00, 0xe0 | (PID_AUDIO >> 8), PID_AUDIO & 0xff, 0xf0, 0x00,
    0x03, 0xe0 | (PID_AUDIO >> 8), PID_AUDIO & 0xff, 0xf0, 0x00,
  ]))])
  out.push(...paquets(PID_PMT, pmt, compteurs))

  const trames = Math.ceil(secondes / DUREE_TRAME)
  const parPes = 8
  const t0 = Math.round(indice * secondes * 90000) + 90000
  for (let i = 0; i < trames; i += parPes) {
    const n = Math.min(parPes, trames - i)
    const donnees = Buffer.concat(Array.from({ length: n }, trameMp3))
    const horodatage = t0 + Math.round(i * DUREE_TRAME * 90000)
    const entete = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x01, 0xc0]),
      Buffer.from([(donnees.length + 8) >> 8, (donnees.length + 8) & 0xff]),
      Buffer.from([0x80, 0x80, 0x05]),
      pts(horodatage),
    ])
    out.push(...paquets(PID_AUDIO, Buffer.concat([entete, donnees]), compteurs, { pcr: i === 0 ? horodatage : undefined }))
  }
  return Buffer.concat(out)
}
