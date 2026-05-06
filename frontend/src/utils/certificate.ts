import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { FieldPositions } from '../components/Certificate/TemplateFieldEditor'

export interface CertificateData {
  firstName:    string
  lastName:     string
  trainingName: string
  startDate:    string   // format DD/MM/YYYY
  endDate:      string
}

// ─── Positions par défaut pour le template drag-and-drop ─────────────────────
// (points PDF, y depuis le BAS)
export function defaultPositions(pageW: number, pageH: number): FieldPositions {
  return {
    name:      { x: pageW / 2,       y: pageH * 0.56 },
    training:  { x: pageW / 2,       y: pageH * 0.38 },
    startDate: { x: pageW * 0.35,    y: pageH * 0.22 },
    endDate:   { x: pageW * 0.65,    y: pageH * 0.22 },
  }
}

/** Génère le certificat avec positions librement choisies par l'utilisateur */
export async function generateCertificateAtPositions(
  data:         CertificateData,
  templateUrl:  string,
  positions:    FieldPositions,
): Promise<Uint8Array> {
  const templateBytes = await fetch(templateUrl).then(r => r.arrayBuffer())
  const pdfDoc   = await PDFDocument.load(templateBytes)
  const page     = pdfDoc.getPages()[0]
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const white    = rgb(1, 1, 1)
  const black    = rgb(0.05, 0.05, 0.05)

  const { width: W } = page.getSize()

  const fields: [keyof FieldPositions, string][] = [
    ['name',      `${data.firstName.trim().toUpperCase()} ${data.lastName.trim().toUpperCase()}`],
    ['training',  data.trainingName.trim()],
    ['startDate', data.startDate],
    ['endDate',   data.endDate],
  ]

  for (const [key, text] of fields) {
    const pos  = positions[key]
    const size = key === 'name' || key === 'training' ? 14 : 11

    // Largeur max adaptative : centrée sur x, limitée par les bords
    const maxW = key === 'name' || key === 'training'
      ? Math.min(pos.x, W - pos.x) * 2 - 8   // centré sur pos.x
      : 120

    let finalSize = size
    while (finalSize > 6 && boldFont.widthOfTextAtSize(text, finalSize) > maxW) finalSize -= 0.5
    const textW = boldFont.widthOfTextAtSize(text, finalSize)

    // Ancrage : le chip pointe sur pos.x (centré horizontalement)
    const tx = pos.x - textW / 2
    const ty = pos.y

    // Rectangle blanc couvrant la zone du texte
    const pad = 4
    page.drawRectangle({
      x:      tx - pad,
      y:      ty - 3,
      width:  textW + pad * 2,
      height: finalSize + 6,
      color:  white,
    })

    page.drawText(text, { x: tx, y: ty, size: finalSize, font: boldFont, color: black })
  }

  return pdfDoc.save()
}

// ─── Dimensions réelles mesurées avec PyMuPDF ────────────────────────────────
const PAGE_W = 631.5   // pt  (Y = depuis le BAS, convention pdf-lib)

// ─── Coordonnées calibrées par analyse pixel (8× zoom, seuil R<80 G<80 B<80)
//
//  NOMS ET PRENOMS      x=247.5→384.2  y_baseline=248.5  h=9.8
//  NOM DE LA FORMATION  x=235.1→400.1  y_baseline=158.4  h=9.8
//  DATE DEBUT           x=240.9→304.4  y_baseline=111.6  h=10.9
//  DATE FIN             x=339.4→384.0  y_baseline=111.6  h=10.9
//
const SLOTS = {
  name: {
    // NOMS ET PRENOMS  y_baseline≈248.5  h≈9.8  → couvre y=243..264
    cover:    { x: 80, y: 243, w: 472, h: 21 },
    baseline: 249,
    maxSize:  14,
  },
  training: {
    // NOM DE LA FORMATION  y_baseline≈158.4  h≈9.8  → couvre y=153..170
    cover:    { x: 80, y: 153, w: 472, h: 21 },
    baseline: 159,
    maxSize:  14,
  },
  startDate: {
    // DATE DEBUT  y_baseline≈111.6  h≈10.9  → couvre y=106..124
    cover:    { x: 234, y: 106, w: 76, h: 20 },
    baseline: 112,
    anchorX:  241,
    maxSize:  11,
  },
  endDate: {
    // DATE FIN  y_baseline≈111.6  h≈10.9  → couvre y=106..124
    cover:    { x: 333, y: 106, w: 56, h: 20 },
    baseline: 112,
    anchorX:  340,
    maxSize:  11,
  },
} as const

function fitSize(
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  text: string,
  maxWidth: number,
  maxSize: number,
): number {
  let size = maxSize
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5
  return size
}

export async function generateCertificate(data: CertificateData): Promise<Uint8Array> {
  const templateBytes = await fetch('/template-certification.pdf').then(r => r.arrayBuffer())

  // ── Stratégie : PDFDocument.load() ──────────────────────────────────────
  // Avec load(), le contenu ajouté (drawRectangle / drawText) est APPENDÉ
  // au flux de contenu de la page existante → il s'affiche PAR-DESSUS
  // l'image de fond baked dans le template.
  const pdfDoc   = await PDFDocument.load(templateBytes)
  const page     = pdfDoc.getPages()[0]
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const white    = rgb(1, 1, 1)
  const black    = rgb(0.05, 0.05, 0.05)

  const fullName = `${data.firstName.trim().toUpperCase()} ${data.lastName.trim().toUpperCase()}`

  // ── Champ centré : Nom / Formation ───────────────────────────────────────
  function drawCentered(
    slot: typeof SLOTS.name | typeof SLOTS.training,
    text: string,
  ) {
    const { cover, baseline, maxSize } = slot
    // Rectangle blanc couvrant le placeholder de l'image de fond
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: white })
    // Texte centré sur la page
    const size = fitSize(boldFont, text, cover.w - 4, maxSize)
    const cx   = (PAGE_W - boldFont.widthOfTextAtSize(text, size)) / 2
    page.drawText(text, { x: cx, y: baseline, size, font: boldFont, color: black })
  }

  // ── Champ à position fixe : dates ────────────────────────────────────────
  function drawAt(
    slot: typeof SLOTS.startDate | typeof SLOTS.endDate,
    text: string,
  ) {
    const { cover, baseline, anchorX, maxSize } = slot
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: white })
    const size = fitSize(boldFont, text, cover.w - 2, maxSize)
    page.drawText(text, { x: anchorX, y: baseline, size, font: boldFont, color: black })
  }

  // ── Remplissage ──────────────────────────────────────────────────────────
  drawCentered(SLOTS.name,     fullName)
  drawCentered(SLOTS.training, data.trainingName.trim())
  drawAt(SLOTS.startDate,      data.startDate)
  drawAt(SLOTS.endDate,        data.endDate)

  return pdfDoc.save()
}

/** Convertit un Uint8Array en chaîne base64 (chunks pour éviter le stack overflow) */
export function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK)
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

/** SHA-256 du PDF généré → notarisation Hedera */
export async function hashPdfBytes(pdfBytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', pdfBytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Télécharge le PDF dans le navigateur */
export function downloadPdf(pdfBytes: Uint8Array, filename: string) {
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  // L'élément doit être dans le DOM avant .click() — sinon Chrome bloque le blob URL
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
