import { useEffect, useRef, useState } from 'react'
import { pdfjsLib } from '../utils/pdfjs'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import {
  generateCertificateAtPositions,
  hashPdfBytes,
  downloadPdf,
  defaultPositions,
  uint8ToBase64,
  type CertificateData,
} from '../utils/certificate'
import TemplateFieldEditor, { type FieldPositions } from '../components/Certificate/TemplateFieldEditor'
import PdfCanvas from '../components/Certificate/PdfCanvas'
import { notarisationApi, type NotarisationRecord } from '../api/notarisation'
import Req from '../components/ui/Req'

const TEMPLATE_URL = '/template-cert.pdf'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'single' | 'batch'

interface ExcelRow {
  firstName: string
  lastName:  string
}

interface BatchResult {
  name:     string
  status:   'ok' | 'error'
  txId?:    string
  message?: string
}

interface ExcelValidation {
  rowsTotal:    number
  rowsValid:    number
  rowsSkipped:  number
  hasFirstName: boolean
  detectedCols: string[]
  warnings:     string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInputDate(fr: string) {
  const [d, m, y] = fr.split('/')
  return y && m && d ? `${y}-${m}-${d}` : ''
}
function fromInputDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

async function getPageSize(url: string) {
  const pdf  = await pdfjsLib.getDocument(url).promise
  const page = await pdf.getPage(1)
  const vp   = page.getViewport({ scale: 1 })
  return { w: vp.width, h: vp.height }
}

const MAX_EXCEL_SIZE = 5 * 1024 * 1024   // 5 MB
const ALLOWED_EXT   = ['.xlsx', '.xls', '.ods', '.csv']

const NORM_FIRST = ['prenom', 'firstname', 'prénom', 'givenname', 'given']
const NORM_LAST  = ['nom', 'lastname', 'name', 'surname', 'familyname']

function normalizeKey(s: string) {
  return s.toLowerCase().replace(/[\s_-]/g, '').normalize('NFD').replace(/\p{M}/gu, '')
}
function findCol(keys: string[], candidates: string[]) {
  return keys.find(k => candidates.some(c => normalizeKey(k) === c))
}

/** Valide et parse le fichier Excel — retourne les lignes + un résumé de validation */
function parseExcel(file: File): Promise<{ rows: ExcelRow[]; validation: ExcelValidation }> {
  return new Promise((resolve, reject) => {
    // ── 1. Vérifications préliminaires ───────────────────────────────────────
    const ext = '.' + file.name.split('.').pop()!.toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      return reject(new Error(`Format non supporté : ${ext}. Utilisez ${ALLOWED_EXT.join(', ')}`))
    }
    if (file.size > MAX_EXCEL_SIZE) {
      return reject(new Error(`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : 5 Mo.`))
    }

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })

        if (!wb.SheetNames.length) return reject(new Error('Le fichier ne contient aucune feuille.'))

        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

        if (!raw.length) return reject(new Error('La feuille est vide — aucune ligne de données trouvée.'))

        // ── 2. Détection des colonnes ─────────────────────────────────────────
        const allKeys  = Object.keys(raw[0])
        const firstCol = findCol(allKeys, NORM_FIRST)   // facultatif
        const lastCol  = findCol(allKeys, NORM_LAST)
        const warnings: string[] = []
        const detectedCols: string[] = []

        let rows: ExcelRow[]
        let hasFirstName: boolean

        if (!lastCol) {
          // Fallback positionnel
          const singleCol = allKeys.length === 1
          detectedCols.push(singleCol
            ? `Colonne A → Nom`
            : `Colonne A → Prénom, Colonne B → Nom (détection positionnelle)`)
          warnings.push('Aucun en-tête reconnu — colonnes interprétées par position.')
          hasFirstName = !singleCol

          rows = raw.map(r => {
            const vals = Object.values(r)
            if (singleCol) return { firstName: '', lastName: String(vals[0] ?? '').trim() }
            return { firstName: String(vals[0] ?? '').trim(), lastName: String(vals[1] ?? '').trim() }
          })
        } else {
          if (firstCol) detectedCols.push(`"${firstCol}" → Prénom`)
          detectedCols.push(`"${lastCol}" → Nom`)
          hasFirstName = !!firstCol

          rows = raw.map(r => ({
            firstName: firstCol ? String(r[firstCol] ?? '').trim() : '',
            lastName:  String(r[lastCol] ?? '').trim(),
          }))
        }

        // ── 3. Filtrage et avertissements ─────────────────────────────────────
        const rowsTotal   = rows.length
        const validRows   = rows.filter(r => r.lastName)
        const rowsSkipped = rowsTotal - validRows.length

        if (rowsSkipped > 0)
          warnings.push(`${rowsSkipped} ligne${rowsSkipped > 1 ? 's' : ''} ignorée${rowsSkipped > 1 ? 's' : ''} (Nom vide).`)

        if (!validRows.length)
          return reject(new Error('Aucune ligne valide : toutes les valeurs de la colonne Nom sont vides.'))

        // Doublons
        const seen = new Set<string>()
        let dupes = 0
        for (const r of validRows) {
          const key = `${r.firstName}|${r.lastName}`.toLowerCase()
          if (seen.has(key)) dupes++
          else seen.add(key)
        }
        if (dupes > 0)
          warnings.push(`${dupes} doublon${dupes > 1 ? 's' : ''} détecté${dupes > 1 ? 's' : ''} dans la liste.`)

        resolve({
          rows: validRows,
          validation: { rowsTotal, rowsValid: validRows.length, rowsSkipped, hasFirstName, detectedCols, warnings },
        })
      } catch (err) {
        reject(new Error('Impossible de lire le fichier : ' + (err instanceof Error ? err.message : String(err))))
      }
    }
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'))
    reader.readAsArrayBuffer(file)
  })
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function CertificatePage() {
  const [mode, setMode]               = useState<Mode>('single')

  // Champs communs
  const [trainingName, setTrainingName] = useState('')
  const [startDate,    setStartDate]    = useState('')
  const [endDate,      setEndDate]      = useState('')

  // Mode individuel
  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [pdfBytes,   setPdfBytes]   = useState<Uint8Array | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hash,       setHash]       = useState<string | null>(null)
  const [fileName,   setFileName]   = useState('')
  const [record,     setRecord]     = useState<NotarisationRecord | null>(null)
  const [downloading, setDownloading] = useState(false)  // notarisation auto en cours

  // Mode batch
  const [excelRows,      setExcelRows]      = useState<ExcelRow[]>([])
  const [excelError,     setExcelError]     = useState('')
  const [excelValidation, setExcelValidation] = useState<ExcelValidation | null>(null)
  const [batchResults,   setBatchResults]   = useState<BatchResult[]>([])
  const [batchProgress,  setBatchProgress]  = useState(0)

  // Positions champs
  const [positions, setPositions] = useState<FieldPositions | null>(null)

  // Génération
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Charge les dimensions du template pour initialiser les positions
  useEffect(() => {
    getPageSize(TEMPLATE_URL).then(({ w, h }) => setPositions(defaultPositions(w, h)))
  }, [])

  function resetPdf() {
    setPdfBytes(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setHash(null)
    setRecord(null)
    setError('')
  }

  // ── Mode individuel ──────────────────────────────────────────────────────

  // Prénom est facultatif
  const canGenerate =
    lastName.trim() &&
    trainingName.trim() && startDate && endDate && positions

  async function handleGenerate() {
    if (!positions) return
    setGenerating(true)
    setError('')
    try {
      const data: CertificateData = { firstName, lastName, trainingName, startDate, endDate }
      const bytes   = await generateCertificateAtPositions(data, TEMPLATE_URL, positions)
      const docHash = await hashPdfBytes(bytes)
      const name    = `Attestation_${lastName.trim()}_${firstName.trim()}.pdf`.replace(/\s+/g, '_')

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      setPdfBytes(bytes)
      setPreviewUrl(URL.createObjectURL(blob))
      setHash(docHash)
      setFileName(name)
    } catch (e) {
      setError('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGenerating(false)
    }
  }

  /** Télécharge le PDF ET notarise automatiquement sur Hedera */
  async function handleDownload() {
    if (!pdfBytes || !hash) return
    // 1. Téléchargement immédiat
    downloadPdf(pdfBytes, fileName)
    // 2. Notarisation automatique (affiche un spinner pendant l'opération)
    if (record) return   // déjà notarisé
    setDownloading(true)
    setError('')
    try {
      const rec = await notarisationApi.notarise({
        documentHash: hash,
        fileName,
        folder:    trainingName.trim() || undefined,
        pdfBase64: uint8ToBase64(pdfBytes!),
      })
      setRecord(rec)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Erreur lors de la notarisation automatique')
    } finally {
      setDownloading(false)
    }
  }

  // ── Mode batch ───────────────────────────────────────────────────────────

  async function handleExcelFile(file: File) {
    setExcelError('')
    setExcelRows([])
    setExcelValidation(null)
    setBatchResults([])
    try {
      const { rows, validation } = await parseExcel(file)
      setExcelRows(rows)
      setExcelValidation(validation)
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : 'Impossible de lire le fichier Excel.')
    }
  }

  const canBatch = excelRows.length > 0 && trainingName.trim() && startDate && endDate && positions

  async function handleBatchGenerate() {
    if (!positions) return
    setGenerating(true)
    setBatchResults([])
    setBatchProgress(0)
    const zip     = new JSZip()
    const results: BatchResult[] = []
    const folder  = trainingName.trim() || undefined

    for (let i = 0; i < excelRows.length; i++) {
      const row   = excelRows[i]
      const label = `${row.lastName.trim()}_${row.firstName.trim()}`.replace(/\s+/g, '_')
      const displayName = [row.firstName, row.lastName].filter(Boolean).join(' ')
      try {
        // 1. Génère le PDF
        const data: CertificateData = { firstName: row.firstName, lastName: row.lastName, trainingName, startDate, endDate }
        const bytes    = await generateCertificateAtPositions(data, TEMPLATE_URL, positions)
        const docHash  = await hashPdfBytes(bytes)
        const pdfName  = `Attestation_${label}.pdf`

        // 2. Ajoute au ZIP
        zip.file(pdfName, bytes)

        // 3. Notarise automatiquement sur Hedera (avec PDF pour re-téléchargement)
        const rec = await notarisationApi.notarise({ documentHash: docHash, fileName: pdfName, folder, pdfBase64: uint8ToBase64(bytes) })
        results.push({ name: displayName, status: 'ok', txId: rec.hederaTransactionId })
      } catch (e) {
        results.push({ name: displayName, status: 'error', message: e instanceof Error ? e.message : String(e) })
      }
      setBatchProgress(Math.round(((i + 1) / excelRows.length) * 100))
      setBatchResults([...results])
    }

    // Télécharge le ZIP
    const blob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `Attestations_${(trainingName || 'Formation').replace(/\s+/g, '_')}.zip`
    // L'élément doit être dans le DOM avant .click() — sinon Chrome bloque le blob URL
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setGenerating(false)
  }

  // ── Previews chips ───────────────────────────────────────────────────────

  const previews = {
    name:      firstName || lastName
      ? `${firstName.trim().toUpperCase()} ${lastName.trim().toUpperCase()}`.trim()
      : mode === 'batch' && excelRows.length
        ? `${excelRows[0].firstName.toUpperCase()} ${excelRows[0].lastName.toUpperCase()}`.trim()
        : 'NOM & PRÉNOM',
    training:  trainingName.trim() || 'FORMATION',
    startDate: startDate || 'DATE DÉBUT',
    endDate:   endDate   || 'DATE FIN',
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1280, margin: '2rem auto', padding: '0 1.25rem' }}>

      {/* ── En-tête ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '.3rem' }}>
          🎓 Générer des attestations de formation
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>
          Positionnez les champs sur le template, remplissez le formulaire et générez vos attestations.
        </p>
      </div>

      {/* ── Sélecteur de mode ── */}
      <div style={{
        display: 'inline-flex', borderRadius: 10, overflow: 'hidden',
        border: '1px solid var(--border)', marginBottom: '1.5rem',
      }}>
        {(['single', 'batch'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); resetPdf(); setBatchResults([]); setBatchProgress(0) }}
            style={{
              padding: '.5rem 1.4rem',
              fontWeight: 600, fontSize: '.85rem',
              background: mode === m ? 'var(--primary)' : 'transparent',
              color:      mode === m ? '#fff'           : 'var(--text-muted)',
              border: 'none', cursor: 'pointer',
              transition: 'background .15s',
            }}
          >
            {m === 'single' ? '👤 Individuel' : '📋 Import Excel'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.75rem', alignItems: 'start' }}>

        {/* ════════════════ FORMULAIRE ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Bénéficiaire ── */}
          {mode === 'single' && (
            <div className="card">
              <SectionTitle icon="👤" label="Bénéficiaire" />
              <FormRow>
                <FormField label="Prénom">
                  <input
                    className="form-input"
                    placeholder="ex : Jean"
                    value={firstName}
                    onChange={e => { setFirstName(e.target.value); resetPdf() }}
                  />
                </FormField>
                <FormField label={<>Nom <Req /></>}>
                  <input
                    className="form-input"
                    placeholder="ex : DUPONT"
                    value={lastName}
                    onChange={e => { setLastName(e.target.value); resetPdf() }}
                  />
                </FormField>
              </FormRow>
            </div>
          )}

          {/* ── Import Excel (mode batch) ── */}
          {mode === 'batch' && (
            <div className="card">
              <SectionTitle icon="📋" label={<>Liste des bénéficiaires <Req /></>} />
              <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
                Fichier .xlsx avec colonne <strong>Nom</strong> obligatoire,
                et colonne <strong>Prénom</strong> facultative
                (ou colonnes A et B si pas d'en-tête, ou colonne A seule pour le Nom uniquement).
              </p>

              {/* Zone de dépôt */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 8, padding: '1.25rem',
                  textAlign: 'center', cursor: 'pointer',
                  background: 'var(--surface-hover)',
                  transition: 'border-color .15s',
                }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) handleExcelFile(f)
                }}
              >
                <span style={{ fontSize: '2rem' }}>📂</span>
                <p style={{ fontSize: '.82rem', marginTop: '.4rem', color: 'var(--text-muted)' }}>
                  Cliquez ou déposez votre fichier Excel ici
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.ods,.csv"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f) }}
              />

              {excelError && (
                <div className="alert alert-error" style={{ marginTop: '.75rem' }}>{excelError}</div>
              )}

              {/* ── Résumé de validation ── */}
              {excelValidation && (
                <div style={{ marginTop: '.85rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {/* Colonnes détectées */}
                  <div style={{ background: 'var(--surface-hover)', borderRadius: 6, padding: '.55rem .75rem', fontSize: '.78rem' }}>
                    <span style={{ fontWeight: 600 }}>🔍 Colonnes détectées : </span>
                    {excelValidation.detectedCols.map((c, i) => (
                      <span key={i} style={{ marginLeft: i > 0 ? '.5rem' : 0 }}>
                        <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: '.72rem' }}>{c}</span>
                      </span>
                    ))}
                  </div>

                  {/* Avertissements */}
                  {excelValidation.warnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.78rem', color: '#b45309', background: '#fffbeb', borderRadius: 6, padding: '.4rem .7rem' }}>
                      <span>⚠️</span><span>{w}</span>
                    </div>
                  ))}

                  {/* Compteurs */}
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    <Pill color="var(--success)">✅ {excelValidation.rowsValid} valide{excelValidation.rowsValid > 1 ? 's' : ''}</Pill>
                    {excelValidation.rowsSkipped > 0 &&
                      <Pill color="#b45309">⏭ {excelValidation.rowsSkipped} ignorée{excelValidation.rowsSkipped > 1 ? 's' : ''}</Pill>}
                  </div>
                </div>
              )}

              {/* Aperçu tableau */}
              {excelRows.length > 0 && (
                <div style={{ marginTop: '.6rem' }}>
                  <p style={{ fontSize: '.78rem', fontWeight: 600, marginBottom: '.4rem' }}>
                    Aperçu — {excelRows.length} bénéficiaire{excelRows.length > 1 ? 's' : ''}
                  </p>
                  <div style={{ maxHeight: 170, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', fontSize: '.78rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-hover)', position: 'sticky', top: 0 }}>
                          <Th>#</Th>
                          {excelValidation?.hasFirstName && <Th>Prénom</Th>}
                          <Th>Nom</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelRows.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <Td>{i + 1}</Td>
                            {excelValidation?.hasFirstName && <Td>{r.firstName}</Td>}
                            <Td>{r.lastName}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Formation ── */}
          <div className="card">
            <SectionTitle icon="📚" label="Formation" />
            <FormField label={<>Nom de la formation <Req /></>}>
              <input
                className="form-input"
                placeholder="ex : Développement Web avec React"
                value={trainingName}
                onChange={e => { setTrainingName(e.target.value); resetPdf() }}
              />
            </FormField>
            <FormRow style={{ marginTop: '.75rem' }}>
              <FormField label={<>Date de début <Req /></>}>
                <input
                  className="form-input"
                  type="date"
                  value={toInputDate(startDate)}
                  onChange={e => { setStartDate(fromInputDate(e.target.value)); resetPdf() }}
                />
              </FormField>
              <FormField label={<>Date de fin <Req /></>}>
                <input
                  className="form-input"
                  type="date"
                  value={toInputDate(endDate)}
                  onChange={e => { setEndDate(fromInputDate(e.target.value)); resetPdf() }}
                />
              </FormField>
            </FormRow>
          </div>

          {/* ── Erreurs + Actions ── */}
          {error && <div className="alert alert-error">{error}</div>}

          {/* Bouton Générer */}
          {mode === 'single' ? (
            <button
              className="btn-primary"
              style={{ padding: '.7rem', fontWeight: 700 }}
              disabled={!canGenerate || generating}
              onClick={handleGenerate}
            >
              {generating ? <span className="spinner" /> : '⚙️ Générer l\'attestation'}
            </button>
          ) : (
            <button
              className="btn-primary"
              style={{ padding: '.7rem', fontWeight: 700 }}
              disabled={!canBatch || generating}
              onClick={handleBatchGenerate}
            >
              {generating
                ? <><span className="spinner" style={{ marginRight: 8 }} />{batchProgress}%</>
                : `⚙️ Générer ${excelRows.length > 0 ? excelRows.length : ''} attestation${excelRows.length > 1 ? 's' : ''} (.zip)`}
            </button>
          )}

          {/* Barre de progression batch */}
          {mode === 'batch' && generating && (
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: 'var(--primary)',
                width: `${batchProgress}%`,
                transition: 'width .2s',
              }} />
            </div>
          )}

          {/* Résultats batch (avec TX Hedera) */}
          {mode === 'batch' && batchResults.length > 0 && (
            <div className="card" style={{ padding: '.75rem', maxHeight: 220, overflowY: 'auto' }}>
              {batchResults.map((r, i) => (
                <div key={i} style={{ fontSize: '.78rem', padding: '.3rem 0', borderBottom: i < batchResults.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <span>{r.status === 'ok' ? '✅' : '❌'}</span>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    {r.message && <span style={{ color: 'var(--error)' }}>{r.message}</span>}
                  </div>
                  {r.txId && (
                    <p style={{ fontFamily: 'monospace', fontSize: '.7rem', color: 'var(--text-muted)', marginLeft: '1.4rem', marginTop: '.1rem', wordBreak: 'break-all' }}>
                      ⛓ {r.txId}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions post-génération individuelle */}
          {mode === 'single' && pdfBytes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {/* Bouton unique : télécharge + notarise automatiquement */}
              <button
                className="btn-primary"
                style={{ padding: '.65rem', fontWeight: 700 }}
                disabled={downloading}
                onClick={handleDownload}
              >
                {downloading
                  ? <><span className="spinner" style={{ marginRight: 8 }} />Notarisation en cours…</>
                  : record ? '⬇️ Re-télécharger le PDF' : '⬇️ Télécharger & Notariser sur Hedera'}
              </button>

              {record ? (
                <div className="card" style={{ borderLeft: '4px solid var(--success)', padding: '.9rem' }}>
                  <span className="badge badge-success" style={{ marginBottom: '.6rem', display: 'inline-block' }}>
                    ✓ Notarisé sur Hedera
                  </span>
                  <InfoField label="Hash SHA-256"       value={record.documentHash} mono />
                  <InfoField label="Transaction Hedera" value={record.hederaTransactionId} mono />
                  <InfoField
                    label="Horodatage blockchain"
                    value={record.consensusTimestamp
                      ? new Date(record.consensusTimestamp).toLocaleString('fr')
                      : '—'}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ════════════════ TEMPLATE INTERACTIF ════════════════ */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '.6rem',
          }}>
            <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: 0 }}>
              ✋ <strong>Glissez</strong> chaque chip coloré à la bonne position sur le template
            </p>
            {positions && (
              <button
                className="btn-secondary"
                style={{ fontSize: '.75rem', padding: '.25rem .75rem' }}
                onClick={async () => {
                  const { w, h } = await getPageSize(TEMPLATE_URL)
                  setPositions(defaultPositions(w, h))
                  resetPdf()
                }}
              >
                ↺ Réinitialiser
              </button>
            )}
          </div>

          {positions ? (
            <TemplateFieldEditor
              templateUrl={TEMPLATE_URL}
              previews={previews}
              positions={positions}
              onChange={pos => { setPositions(pos); resetPdf() }}
            />
          ) : (
            <div style={{
              height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: 8,
            }}>
              <span className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          )}

          {/* Aperçu PDF individuel — rendu via PDF.js canvas */}
          {/* Fonctionne quel que soit le réglage "Télécharger les PDF auto" du navigateur */}
          {mode === 'single' && pdfBytes && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: '.5rem' }}>
                ✅ Aperçu de l'attestation générée
              </p>
              <PdfCanvas pdfBytes={pdfBytes} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Micro-composants UI ────────────────────────────────────────────────────

function SectionTitle({ icon, label }: { icon: string; label: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '1rem' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <h2 style={{ fontSize: '.95rem', fontWeight: 700, margin: 0 }}>{label}</h2>
    </div>
  )
}

function FormRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', ...style }}>
      {children}
    </div>
  )
}

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '4px 8px' }}>{children}</td>
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: color, color: '#fff',
      padding: '2px 8px', borderRadius: 12, fontSize: '.72rem', fontWeight: 600,
    }}>
      {children}
    </span>
  )
}

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: '.5rem' }}>
      <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: '.1rem' }}>{label}</p>
      <p style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', fontSize: '.78rem' }}>
        {value}
      </p>
    </div>
  )
}
