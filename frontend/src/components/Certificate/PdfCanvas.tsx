import { useEffect, useRef } from 'react'
import { pdfjsLib } from '../../utils/pdfjs'

interface Props {
  pdfBytes: Uint8Array
}

/**
 * Rendu d'un PDF (Uint8Array) sur <canvas> via PDF.js.
 * Fonctionne quel que soit le réglage "Télécharger les PDF automatiquement"
 * du navigateur (contrairement à <object> ou <iframe>).
 */
export default function PdfCanvas({ pdfBytes }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const pdf  = await pdfjsLib.getDocument({ data: pdfBytes }).promise
      const page = await pdf.getPage(1)
      if (cancelled || !canvasRef.current) return

      const cw    = containerRef.current?.clientWidth ?? 800
      const vp1   = page.getViewport({ scale: 1 })
      const scale = cw / vp1.width
      const vp    = page.getViewport({ scale })

      const canvas = canvasRef.current
      canvas.width  = vp.width
      canvas.height = vp.height

      await page.render({
        canvas,
        canvasContext: canvas.getContext('2d')!,
        viewport: vp,
      }).promise
    })()
    return () => { cancelled = true }
  }, [pdfBytes])

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width:  '100%',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      />
    </div>
  )
}
