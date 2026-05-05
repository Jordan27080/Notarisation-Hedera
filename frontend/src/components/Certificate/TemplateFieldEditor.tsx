import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Worker servi depuis /public
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

// ─── Types ───────────────────────────────────────────────────────────────────

export type FieldKey = 'name' | 'training' | 'startDate' | 'endDate'

/** Coordonnées en points PDF (x depuis gauche, y depuis BAS — convention pdf-lib) */
export type PdfPoint = { x: number; y: number }
export type FieldPositions = Record<FieldKey, PdfPoint>

interface FieldMeta { label: string; color: string }
const FIELD_META: Record<FieldKey, FieldMeta> = {
  name:      { label: 'Nom & Prénom',  color: '#6c47ff' },
  training:  { label: 'Formation',      color: '#0891b2' },
  startDate: { label: 'Date début',     color: '#059669' },
  endDate:   { label: 'Date fin',       color: '#d97706' },
}

interface Props {
  templateUrl:  string
  /** Texte prévisualisé dans chaque chip */
  previews:     Record<FieldKey, string>
  positions:    FieldPositions
  onChange:     (positions: FieldPositions) => void
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function TemplateFieldEditor({ templateUrl, previews, positions, onChange }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale]       = useState(0)           // px / pt
  const [pageH, setPageH]       = useState(0)           // hauteur page en pt
  const [ready, setReady]       = useState(false)

  // ref utilisée dans les handlers globaux (évite stale-closure)
  const posRef  = useRef(positions)
  posRef.current = positions

  const drag = useRef<{
    key:   FieldKey
    ox:    number   // offset souris → coin sup-gauche du chip (px canvas)
    oy:    number
  } | null>(null)

  // ── Rendu PDF → canvas ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setReady(false)
      const loadingTask = pdfjsLib.getDocument(templateUrl)
      const pdf      = await loadingTask.promise
      const pdfPage  = await pdf.getPage(1)
      if (cancelled) return

      const vp1  = pdfPage.getViewport({ scale: 1 })
      const cw   = containerRef.current?.clientWidth ?? 780
      const s    = cw / vp1.width
      const vp   = pdfPage.getViewport({ scale: s })

      if (!canvasRef.current || cancelled) return
      const canvas = canvasRef.current
      canvas.width  = vp.width
      canvas.height = vp.height

      await pdfPage.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
      if (cancelled) return

      setScale(s)
      setPageH(vp1.height)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [templateUrl])

  // ── Conversions coords ────────────────────────────────────────────────────
  /** pt PDF → pixel canvas  (y axe inversé) */
  function pt2px(pt: PdfPoint) {
    return { cx: pt.x * scale, cy: (pageH - pt.y) * scale }
  }

  /** pixel canvas → pt PDF */
  function px2pt(cx: number, cy: number): PdfPoint {
    return { x: cx / scale, y: pageH - cy / scale }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function onMouseDown(key: FieldKey, e: React.MouseEvent) {
    e.preventDefault()
    const { cx, cy } = pt2px(posRef.current[key])
    const rect = containerRef.current!.getBoundingClientRect()
    drag.current = {
      key,
      ox: e.clientX - rect.left - cx,
      oy: e.clientY - rect.top  - cy,
    }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!drag.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const rawCx = e.clientX - rect.left - drag.current.ox
      const rawCy = e.clientY - rect.top  - drag.current.oy
      const cw = canvasRef.current?.width  ?? rect.width
      const ch = canvasRef.current?.height ?? rect.height
      const cx = Math.max(0, Math.min(cw, rawCx))
      const cy = Math.max(0, Math.min(ch, rawCy))
      const newPt = px2pt(cx, cy)
      onChange({ ...posRef.current, [drag.current.key]: newPt })
    }
    function onUp() { drag.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, pageH])           // recrée les handlers si le scale change

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', userSelect: 'none' }}
    >
      {/* Template PDF rendu */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width:   '100%',
          border:  '1px solid var(--border)',
          borderRadius: 6,
        }}
      />

      {!ready && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,.7)',
        }}>
          <span className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      )}

      {/* Chips draggables */}
      {ready && (Object.keys(FIELD_META) as FieldKey[]).map(key => {
        const { cx, cy } = pt2px(positions[key])
        const meta   = FIELD_META[key]
        const text   = previews[key] || meta.label
        return (
          <div
            key={key}
            onMouseDown={e => onMouseDown(key, e)}
            title={`Faites glisser pour repositionner « ${meta.label} »`}
            style={{
              position:   'absolute',
              left:       cx,
              top:        cy,
              transform:  'translate(-50%, -100%)',
              cursor:     'grab',
              background: meta.color,
              color:      '#fff',
              padding:    '3px 10px',
              borderRadius: 5,
              fontSize:   12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              boxShadow:  '0 2px 6px rgba(0,0,0,.35)',
              lineHeight: 1.4,
            }}
          >
            {text}
            {/* petite flèche vers le bas pour indiquer le point d'ancrage */}
            <span style={{
              position: 'absolute',
              bottom: -6, left: '50%',
              transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: `6px solid ${meta.color}`,
            }} />
          </div>
        )
      })}

      {/* Légende */}
      {ready && (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end',
        }}>
          {(Object.entries(FIELD_META) as [FieldKey, FieldMeta][]).map(([k, m]) => (
            <span key={k} style={{
              background: m.color, color: '#fff',
              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
            }}>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
