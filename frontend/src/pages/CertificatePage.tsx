import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import {
  generateCertificateAtPositions,
  hashPdfBytes,
  downloadPdf,
  defaultPositions,
  type CertificateData,
} from '../utils/certificate'
import TemplateFieldEditor, { type FieldPositions } from '../components/Certificate/TemplateFieldEditor'
import { notarisationApi, type NotarisationRecord } from '../api/notarisation'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const TEMPLATE_URL = '/template-cert.pdf'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'single' | 'batch'

interface ExcelRow {
  firstName: string
  lastName:  string
}

interface BatchResult {
  name:    string
  status:  'ok' | 'error'
  message?: string
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

/** Extrait les lignes du fichier Excel (colonnes Prénom / Nom) */
function parseExcel(file: File): Promise<ExcelRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

        // Accepte les colonnes : prénom/prenom/firstname/first_name/first name
        //                        nom/lastname/last_name/last name
        const normalize = (s: string) =>
          s.toLowerCase().replace(/[\s_-]/g, '').normalize('NFD').replace(/\p{M}/gu, '')

        const FIRST = ['prenom', 'firstname', 'prénom']
        const LAST  = ['nom', 'lastname', 'name']

        const findCol = (keys: string[], candidates: string[]) =>
          keys.find(k => candidates.some(c => normalize(k) === c))

        const allKeys   = rows.length ? Object.keys(rows[0]) : []
        const firstCol  = findCol(allKeys, FIRST)
        const lastCol   = findCol(allKeys, LAST)

        if (!firstCol || !lastCol) {
          // Tentative position : col A = Prénom, col B = Nom
          const fallback = rows
            .map(r => {
              const vals = Object.values(r)
              return { firstName: String(vals[0] ?? '').trim(), lastName: String(vals[1] ?? '').trim() }
            })
            .filter(r => r.firstName || r.lastName)
          resolve(fallback)
          return
        }

        resolve(
          rows
            .map(r => ({
              firstName: String(r[firstCol] ?? '').trim(),
              lastName:  String(r[lastCol]  ?? '').trim(),
            }))
            .filter(r => r.firstName || r.lastName),
        )
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
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
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [pdfBytes,  setPdfBytes]  = useState<Uint8Array | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hash,      setHash]      = useState<string | null>(null)
  const [fileName,  setFileName]  = useState('')
  const [record,    setRecord]    = useState<NotarisationRecord | null>(null)
  const [notarising, setNotarising] = useState(false)

  // Mode batch
  const [excelRows,   setExcelRows]   = useState<ExcelRow[]>([])
  const [excelError,  setExcelError]  = useState('')
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [batchProgress, setBatchProgress] = useState(0)   // 0-100

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

  const canGenerate =
    firstName.trim() && lastName.trim() &&
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

  async function handleNotarise() {
    if (!pdfBytes || !hash) return
    setNotarising(true)
    setError('')
    try {
      const rec = await notarisationApi.notarise({ documentHash: hash, fileName })
      setRecord(rec)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Erreur lors de la notarisation')
    } finally {
      setNotarising(false)
    }
  }

  // ── Mode batch ───────────────────────────────────────────────────────────

  async function handleExcelFile(file: File) {
    setExcelError('')
    setExcelRows([])
    setBatchResults([])
    try {
      const rows = await parseExcel(file)
      if (rows.length === 0) { setExcelError('Aucune ligne trouvée dans le fichier.'); return }
      setExcelRows(rows)
    } catch {
      setExcelError('Impossible de lire le fichier Excel.')
    }
  }

  const canBatch = excelRows.length > 0 && trainingName.trim() && startDate && endDate && positions

  async function handleBatchGenerate() {
    if (!positions) return
    setGenerating(true)
    setBatchResults([])
    setBatchProgress(0)
    const zip = new JSZip()
    const results: BatchResult[] = []

    for (let i = 0; i < excelRows.length; i++) {
      const row = excelRows[i]
      const label = `${row.lastName.trim()}_${row.firstName.trim()}`
      try {
        const data: CertificateData = {
          firstName:    row.firstName,
          lastName:     row.lastName,
          trainingName, startDate, endDate,
        }
        const bytes = await generateCertificateAtPositions(data, TEMPLATE_URL, positions)
        zip.file(`Attestation_${label}.pdf`.replace(/\s+/g, '_'), bytes)
        results.push({ name: `${row.firstName} ${row.lastName}`, status: 'ok' })
      } catch (e) {
        results.push({ name: `${row.firstName} ${row.lastName}`, status: 'error',
          message: e instanceof Error ? e.message : String(e) })
      }
      setBatchProgress(Math.round(((i + 1) / excelRows.length) * 100))
      setBatchResults([...results])
    }

    // Télécharge le ZIP
    const blob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `Attestations_${trainingName.replace(/\s+/g, '_')}.zip`
    a.click()
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
                <FormField label="Nom">
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
              <SectionTitle icon="📋" label="Liste des bénéficiaires" />
              <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: '.75rem' }}>
                Fichier .xlsx avec colonnes <strong>Prénom</strong> et <strong>Nom</strong>
                (ou colonnes A et B si pas d'en-tête).
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

              {/* Aperçu tableau */}
              {excelRows.length > 0 && (
                <div style={{ marginTop: '.85rem' }}>
                  <p style={{ fontSize: '.78rem', fontWeight: 600, marginBottom: '.4rem' }}>
                    {excelRows.length} bénéficiaire{excelRows.length > 1 ? 's' : ''} détecté{excelRows.length > 1 ? 's' : ''}
                  </p>
                  <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', fontSize: '.8rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-hover)' }}>
                          <Th>#</Th><Th>Prénom</Th><Th>Nom</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelRows.map((r, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <Td>{i + 1}</Td>
                            <Td>{r.firstName}</Td>
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
            <FormField label="Nom de la formation">
              <input
                className="form-input"
                placeholder="ex : Développement Web avec React"
                value={trainingName}
                onChange={e => { setTrainingName(e.target.value); resetPdf() }}
              />
            </FormField>
            <FormRow style={{ marginTop: '.75rem' }}>
              <FormField label="Date de début">
                <input
                  className="form-input"
                  type="date"
                  value={toInputDate(startDate)}
                  onChange={e => { setStartDate(fromInputDate(e.target.value)); resetPdf() }}
                />
              </FormField>
              <FormField label="Date de fin">
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

          {/* Résultats batch */}
          {mode === 'batch' && batchResults.length > 0 && (
            <div className="card" style={{ padding: '.75rem', maxHeight: 200, overflowY: 'auto' }}>
              {batchResults.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '.5rem',
                  fontSize: '.8rem', padding: '.2rem 0',
                }}>
                  <span>{r.status === 'ok' ? '✅' : '❌'}</span>
                  <span style={{ flex: 1 }}>{r.name}</span>
                  {r.message && <span style={{ color: 'var(--error)', fontSize: '.75rem' }}>{r.message}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Actions post-génération individuelle */}
          {mode === 'single' && pdfBytes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <button
                className="btn-secondary"
                style={{ padding: '.65rem', fontWeight: 600 }}
                onClick={() => downloadPdf(pdfBytes, fileName)}
              >
                ⬇️ Télécharger le PDF
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
              ) : (
                <button
                  className="btn-primary"
                  style={{ padding: '.65rem', fontWeight: 600 }}
                  disabled={notarising}
                  onClick={handleNotarise}
                >
                  {notarising ? <span className="spinner" /> : '⛓️ Notariser sur Hedera'}
                </button>
              )}
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

          {/* Aperçu PDF individuel */}
          {mode === 'single' && previewUrl && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: '.5rem' }}>
                ✅ Aperçu de l'attestation générée
              </p>
              <iframe
                src={previewUrl}
                title="Aperçu"
                style={{
                  width: '100%', height: 520,
                  border: '1px solid var(--border)', borderRadius: 8,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Micro-composants UI ────────────────────────────────────────────────────

function SectionTitle({ icon, label }: { icon: string; label: string }) {
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

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
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
