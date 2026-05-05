import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface CertificateData {
  firstName:    string
  lastName:     string
  trainingName: string
  startDate:    string   // format DD/MM/YYYY
  endDate:      string
}

// ─── Dimensions réelles mesurées avec PyMuPDF ────────────────────────────────
const PAGE_W = 631.5   // pt  (Y = depuis le BAS, convention pdf-lib)

// ─── Coordonnées mesurées par analyse pixel (8× zoom, seuil R<80 G<80 B<80) ──
//
//  NOMS ET PRENOMS      x=247.5→384.2  y_baseline=248.5  h_texte=9.8
//  NOM DE LA FORMATION  x=235.1→400.1  y_baseline=158.4  h_texte=9.8
//  DATE DEBUT           x=240.9→304.4  y_baseline=111.6  h_texte=10.9
//  DATE FIN             x=339.4→384.0  y_baseline=111.6  h_texte=10.9
//
const SLOTS = {

  name: {
    // Rectangle blanc : légèrement plus large pour couvrir n'importe quel prénom/nom
    cover:    { x: 100, y: 244, w: 432, h: 17 },
    baseline: 249,          // y depuis le bas (≈ y_bottom mesuré)
    maxSize:  14,
  },

  training: {
    cover:    { x: 100, y: 154, w: 432, h: 17 },
    baseline: 159,
    maxSize:  14,
  },

  startDate: {
    // Couvre uniquement "DATE DEBUT" (x=240.9→304.4) avec marge de 3pt
    cover:    { x: 238, y: 108, w: 70, h: 17 },
    baseline: 112,
    anchorX:  241,
    maxSize:  11,
  },

  endDate: {
    // Couvre uniquement "DATE FIN" (x=339.4→384.0) avec marge de 3pt
    cover:    { x: 337, y: 108, w: 50, h: 17 },
    baseline: 112,
    anchorX:  340,
    maxSize:  11,
  },
} as const

// Réduit le corps si le texte dépasse la largeur disponible
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
  const pdfDoc   = await PDFDocument.load(templateBytes)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page  = pdfDoc.getPages()[0]
  const white = rgb(1, 1, 1)
  const black = rgb(0.05, 0.05, 0.05)

  const fullName = `${data.firstName.trim().toUpperCase()} ${data.lastName.trim().toUpperCase()}`

  // ── Champ centré : couvre le placeholder + écrit le texte centré sur la page ──
  function drawCentered(
    slot: typeof SLOTS.name | typeof SLOTS.training,
    text: string,
  ) {
    const { cover, baseline, maxSize } = slot
    // 1. Rectangle blanc couvrant le placeholder dans l'image de fond
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: white })
    // 2. Taille ajustée si le texte est trop long
    const size = fitSize(boldFont, text, cover.w - 4, maxSize)
    // 3. Centrage horizontal sur toute la largeur de page
    const tw = boldFont.widthOfTextAtSize(text, size)
    const cx = (PAGE_W - tw) / 2
    page.drawText(text, { x: cx, y: baseline, size, font: boldFont, color: black })
  }

  // ── Champ à position fixe : dates ──────────────────────────────────────────
  function drawAt(
    slot: typeof SLOTS.startDate | typeof SLOTS.endDate,
    text: string,
  ) {
    const { cover, baseline, anchorX, maxSize } = slot
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: white })
    const size = fitSize(boldFont, text, cover.w - 2, maxSize)
    page.drawText(text, { x: anchorX, y: baseline, size, font: boldFont, color: black })
  }

  // ── Remplissage des 4 champs ───────────────────────────────────────────────
  drawCentered(SLOTS.name,      fullName)
  drawCentered(SLOTS.training,  data.trainingName.trim())
  drawAt(SLOTS.startDate,       data.startDate)
  drawAt(SLOTS.endDate,         data.endDate)

  return pdfDoc.save()
}

/** SHA-256 du PDF généré → pour la notarisation Hedera */
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
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
