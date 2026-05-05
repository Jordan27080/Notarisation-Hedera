import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

export interface CertificateData {
  firstName:    string
  lastName:     string
  trainingName: string
  startDate:    string   // format DD/MM/YYYY
  endDate:      string
}

// ─── Dimensions réelles de la page (mesurées avec PyMuPDF) ───────────────────
const PAGE_W = 631.5   // pt (toutes les coordonnées Y ci-dessous : depuis le BAS)

// ─── Positions mesurées par superposition pixel (6× zoom + lignes de calibration)
//     Cover  = rectangle blanc couvrant le texte placeholder de l'image
//     baseline = Y de la ligne de base du texte de remplacement (depuis bas)
const SLOTS = {

  // ── Première ligne pointillée : NOMS ET PRENOMS ──────────────────────────
  name: {
    cover:     { x: 195, y: 236, w: 242, h: 22 },
    baseline:  247,
    maxSize:   14,
    centered:  true,
  },

  // ── Deuxième ligne pointillée : NOM DE LA FORMATION ─────────────────────
  training: {
    cover:     { x: 110, y: 157, w: 412, h: 24 },
    baseline:  168,
    maxSize:   14,
    centered:  true,
  },

  // ── Date de début (après "Du / From") ────────────────────────────────────
  startDate: {
    cover:     { x: 176, y: 104, w: 112, h: 18 },
    baseline:  114,
    anchorX:   180,
    maxSize:   11,
    centered:  false,
  },

  // ── Date de fin (après "Au / To") ────────────────────────────────────────
  endDate: {
    cover:     { x: 305, y: 104, w: 90, h: 18 },
    baseline:  114,
    anchorX:   309,
    maxSize:   11,
    centered:  false,
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
  const pdfDoc  = await PDFDocument.load(templateBytes)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page  = pdfDoc.getPages()[0]
  const white = rgb(1, 1, 1)
  const black = rgb(0.06, 0.06, 0.06)   // quasi-noir, comme le template

  const fullName = `${data.firstName.trim().toUpperCase()} ${data.lastName.trim().toUpperCase()}`

  // ── Applique un champ centré (Nom / Formation) ────────────────────────────
  function drawCentered(slot: typeof SLOTS.name | typeof SLOTS.training, text: string) {
    const { cover, baseline, maxSize } = slot
    // 1. Couvrir le placeholder avec un rectangle blanc
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: white })
    // 2. Ajuster la taille pour que le texte tienne
    const size = fitSize(boldFont, text, cover.w - 4, maxSize)
    // 3. Centrer sur la largeur de la page
    const tw = boldFont.widthOfTextAtSize(text, size)
    const cx = (PAGE_W - tw) / 2
    page.drawText(text, { x: cx, y: baseline, size, font: boldFont, color: black })
  }

  // ── Applique un champ à position fixe (dates) ─────────────────────────────
  function drawAt(
    slot: typeof SLOTS.startDate | typeof SLOTS.endDate,
    text: string,
  ) {
    const { cover, baseline, anchorX, maxSize } = slot
    page.drawRectangle({ x: cover.x, y: cover.y, width: cover.w, height: cover.h, color: white })
    const size = fitSize(boldFont, text, cover.w - 2, maxSize)
    page.drawText(text, { x: anchorX, y: baseline, size, font: boldFont, color: black })
  }

  // ── Remplissage ───────────────────────────────────────────────────────────
  drawCentered(SLOTS.name,      fullName)
  drawCentered(SLOTS.training,  data.trainingName.trim())
  drawAt(SLOTS.startDate,       data.startDate)
  drawAt(SLOTS.endDate,         data.endDate)

  return pdfDoc.save()
}

/** SHA-256 du PDF généré → hash pour la notarisation Hedera */
export async function hashPdfBytes(pdfBytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', pdfBytes.buffer as ArrayBuffer)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Télécharge le PDF généré dans le navigateur */
export function downloadPdf(pdfBytes: Uint8Array, filename: string) {
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
