import { useEffect, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
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

const EMPTY: CertificateData = {
  firstName:    '',
  lastName:     '',
  trainingName: '',
  startDate:    '',
  endDate:      '',
}

function toInputDate(fr: string) {
  const [d, m, y] = fr.split('/')
  return y && m && d ? `${y}-${m}-${d}` : ''
}
function fromInputDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

// Charge la première page du template pour connaître ses dimensions
async function getPageSize(url: string) {
  const pdf  = await pdfjsLib.getDocument(url).promise
  const page = await pdf.getPage(1)
  const vp   = page.getViewport({ scale: 1 })
  return { w: vp.width, h: vp.height }
}

export default function CertificatePage() {
  const [form, setForm]         = useState<CertificateData>(EMPTY)
  const [positions, setPositions] = useState<FieldPositions | null>(null)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hash, setHash]         = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [notarising, setNotarising] = useState(false)
  const [record, setRecord]     = useState<NotarisationRecord | null>(null)
  const [error, setError]       = useState('')

  // Charge les dimensions de la page au montage pour initialiser les positions
  useEffect(() => {
    getPageSize(TEMPLATE_URL).then(({ w, h }) => {
      setPositions(defaultPositions(w, h))
    })
  }, [])

  function set(field: keyof CertificateData, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    // Invalide le PDF généré si les données changent
    setPdfBytes(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setHash(null)
    setRecord(null)
    setError('')
  }

  const canGenerate =
    form.firstName.trim() &&
    form.lastName.trim()  &&
    form.trainingName.trim() &&
    form.startDate &&
    form.endDate  &&
    positions !== null

  async function handleGenerate() {
    if (!positions) return
    setGenerating(true)
    setError('')
    try {
      const bytes    = await generateCertificateAtPositions(form, TEMPLATE_URL, positions)
      const docHash  = await hashPdfBytes(bytes)
      const name     = `Attestation_${form.lastName.trim()}_${form.firstName.trim()}.pdf`
        .replace(/\s+/g, '_')

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const url  = URL.createObjectURL(blob)

      setPdfBytes(bytes)
      setPreviewUrl(url)
      setHash(docHash)
      setFileName(name)
    } catch (e) {
      setError('Erreur lors de la génération : ' + (e instanceof Error ? e.message : String(e)))
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

  // Textes prévisualisés dans les chips
  const previews = {
    name:      form.firstName || form.lastName
      ? `${form.firstName.trim().toUpperCase()} ${form.lastName.trim().toUpperCase()}`.trim()
      : 'NOM & PRÉNOM',
    training:  form.trainingName.trim() || 'NOM DE LA FORMATION',
    startDate: form.startDate || 'DATE DÉBUT',
    endDate:   form.endDate   || 'DATE FIN',
  }

  return (
    <div style={{ maxWidth: 1200, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.25rem' }}>
        🎓 Générer une attestation de formation
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', marginBottom: '1.5rem' }}>
        Remplissez le formulaire, positionnez les champs sur le template en les <strong>glissant</strong>,
        puis générez l'attestation.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Formulaire ── */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
            Informations du bénéficiaire
          </h2>

          <label className="form-label">Prénom</label>
          <input
            className="form-input"
            placeholder="ex : Jean"
            value={form.firstName}
            onChange={e => set('firstName', e.target.value)}
          />

          <label className="form-label" style={{ marginTop: '.75rem' }}>Nom</label>
          <input
            className="form-input"
            placeholder="ex : DUPONT"
            value={form.lastName}
            onChange={e => set('lastName', e.target.value)}
          />

          <label className="form-label" style={{ marginTop: '1.25rem' }}>Nom de la formation</label>
          <input
            className="form-input"
            placeholder="ex : Développement Web avec React"
            value={form.trainingName}
            onChange={e => set('trainingName', e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '.75rem' }}>
            <div>
              <label className="form-label">Date de début</label>
              <input
                className="form-input"
                type="date"
                value={toInputDate(form.startDate)}
                onChange={e => set('startDate', fromInputDate(e.target.value))}
              />
            </div>
            <div>
              <label className="form-label">Date de fin</label>
              <input
                className="form-input"
                type="date"
                value={toInputDate(form.endDate)}
                onChange={e => set('endDate', fromInputDate(e.target.value))}
              />
            </div>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>
          )}

          {/* ── Bouton Générer ── */}
          <button
            className="btn-primary"
            style={{ width: '100%', marginTop: '1.5rem', padding: '.65rem' }}
            disabled={!canGenerate || generating}
            onClick={handleGenerate}
          >
            {generating ? <span className="spinner" /> : '⚙️ Générer l\'attestation'}
          </button>

          {/* ── Actions post-génération ── */}
          {pdfBytes && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <button
                className="btn-secondary"
                style={{ width: '100%', padding: '.6rem' }}
                onClick={() => downloadPdf(pdfBytes, fileName)}
              >
                ⬇️ Télécharger le PDF
              </button>

              {record ? (
                <div className="card" style={{ borderLeft: '4px solid var(--success)', padding: '1rem' }}>
                  <span className="badge badge-success" style={{ marginBottom: '.75rem', display: 'inline-block' }}>
                    ✓ Notarisé sur Hedera
                  </span>
                  <Field label="Hash SHA-256"            value={record.documentHash} mono />
                  <Field label="Transaction Hedera"      value={record.hederaTransactionId} mono />
                  <Field
                    label="Horodatage blockchain"
                    value={record.consensusTimestamp
                      ? new Date(record.consensusTimestamp).toLocaleString('fr')
                      : '—'}
                  />
                </div>
              ) : (
                <button
                  className="btn-primary"
                  style={{ width: '100%', padding: '.65rem' }}
                  disabled={notarising}
                  onClick={handleNotarise}
                >
                  {notarising ? <span className="spinner" /> : '⛓️ Notariser sur Hedera'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Template interactif ── */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '.6rem',
          }}>
            <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              ✋ Glissez chaque champ coloré à la bonne position sur le template
            </p>
            {positions && (
              <button
                className="btn-secondary"
                style={{ fontSize: '.75rem', padding: '.25rem .7rem' }}
                onClick={async () => {
                  const { w, h } = await getPageSize(TEMPLATE_URL)
                  setPositions(defaultPositions(w, h))
                  setPdfBytes(null)
                  setPreviewUrl(null)
                  setRecord(null)
                }}
              >
                ↺ Réinitialiser positions
              </button>
            )}
          </div>

          {positions ? (
            <TemplateFieldEditor
              templateUrl={TEMPLATE_URL}
              previews={previews}
              positions={positions}
              onChange={pos => {
                setPositions(pos)
                // Invalide le PDF si on re-positionne un champ
                setPdfBytes(null)
                if (previewUrl) URL.revokeObjectURL(previewUrl)
                setPreviewUrl(null)
                setRecord(null)
              }}
            />
          ) : (
            <div style={{
              height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)', borderRadius: 6,
            }}>
              <span className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          )}

          {/* Aperçu PDF généré */}
          {previewUrl && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: '.5rem' }}>
                Aperçu de l'attestation générée
              </p>
              <iframe
                src={previewUrl}
                title="Aperçu de l'attestation"
                style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 6 }}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: '.6rem' }}>
      <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: '.1rem' }}>{label}</p>
      <p style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', fontSize: '.8rem' }}>
        {value}
      </p>
    </div>
  )
}
