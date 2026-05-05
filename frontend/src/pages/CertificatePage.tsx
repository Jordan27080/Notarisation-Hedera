import { useState } from 'react'
import { generateCertificate, hashPdfBytes, downloadPdf, type CertificateData } from '../utils/certificate'
import { notarisationApi, type NotarisationRecord } from '../api/notarisation'

const EMPTY: CertificateData = {
  firstName: '',
  lastName: '',
  trainingName: '',
  startDate: '',
  endDate: '',
}

function toInputDate(fr: string): string {
  // DD/MM/YYYY → YYYY-MM-DD  (pour <input type="date">)
  const [d, m, y] = fr.split('/')
  return y && m && d ? `${y}-${m}-${d}` : ''
}

function fromInputDate(iso: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

export default function CertificatePage() {
  const [form, setForm]         = useState(EMPTY)
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [hash, setHash]         = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [notarising, setNotarising] = useState(false)
  const [record, setRecord]     = useState<NotarisationRecord | null>(null)
  const [error, setError]       = useState('')

  function set(field: keyof CertificateData, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    // Réinitialise le PDF si les données changent
    setPdfBytes(null)
    setPreviewUrl(null)
    setHash(null)
    setRecord(null)
    setError('')
  }

  const canGenerate =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.trainingName.trim() &&
    form.startDate &&
    form.endDate

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const bytes = await generateCertificate(form)
      const docHash = await hashPdfBytes(bytes)
      const name = `Attestation_${form.lastName.trim()}_${form.firstName.trim()}.pdf`
        .replace(/\s+/g, '_')

      // Libère l'URL précédente avant d'en créer une nouvelle
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const url  = URL.createObjectURL(blob)

      setPdfBytes(bytes)
      setPreviewUrl(url)
      setHash(docHash)
      setFileName(name)
    } catch (e) {
      setError("Erreur lors de la génération du PDF : " + (e instanceof Error ? e.message : String(e)))
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

  return (
    <div style={{ maxWidth: 1100, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.25rem' }}>
        🎓 Générer une attestation de formation
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '.875rem', marginBottom: '2rem' }}>
        Remplissez les informations — l'attestation est générée dans votre navigateur, puis notarisée sur Hedera.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Formulaire ── */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Informations du bénéficiaire</h2>

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
                  <Field label="Hash SHA-256" value={record.documentHash} mono />
                  <Field label="Transaction Hedera" value={record.hederaTransactionId} mono />
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

        {/* ── Prévisualisation PDF ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 480 }}>
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="Prévisualisation de l'attestation"
              style={{ width: '100%', height: 580, border: 'none', display: 'block' }}
            />
          ) : (
            <div style={{
              height: 480,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: '.75rem',
              padding: '2rem',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: '3rem' }}>📄</span>
              <p style={{ fontSize: '.875rem' }}>
                Remplissez le formulaire et cliquez sur <strong>Générer l'attestation</strong> pour voir l'aperçu ici.
              </p>
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
      <p style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', fontSize: '.8rem' }}>{value}</p>
    </div>
  )
}
