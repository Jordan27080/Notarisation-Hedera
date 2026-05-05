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
const PAGE_H = 445.5

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
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
