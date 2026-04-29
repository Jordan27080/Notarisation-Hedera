import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { notarisationApi, type NotarisationRecord } from '../../api/notarisation'
import { hashFile } from '../../utils/crypto'

export default function NotariseForm() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState('')
  const [result, setResult] = useState<NotarisationRecord | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')
    setHash(await hashFile(f))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false })

  async function handleNotarise() {
    if (!file || !hash) return
    setLoading(true)
    setError('')
    try {
      const record = await notarisationApi.notarise({ documentHash: hash, fileName: file.name })
      setResult(record)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Erreur lors de la notarisation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem' }}>Notariser un document</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: '2.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragActive ? '#f0ebff' : 'var(--bg)',
            transition: 'all .15s'
          }}
        >
          <input {...getInputProps()} />
          <div style={{ fontSize: '2rem', marginBottom: '.5rem' }}>📄</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>
            {isDragActive ? 'Déposez le fichier ici...' : 'Glissez un fichier ou cliquez pour sélectionner'}
          </p>
        </div>

        {file && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
            <p style={{ fontWeight: 500, marginBottom: '.25rem' }}>{file.name}</p>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              SHA-256: {hash}
            </p>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result ? (
        <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
            <span className="badge badge-success">✓ Notarisé</span>
          </div>
          <Field label="Hash SHA-256" value={result.documentHash} mono />
          <Field label="ID de transaction Hedera" value={result.hederaTransactionId} mono />
          <Field label="Horodatage blockchain" value={result.consensusTimestamp ? new Date(result.consensusTimestamp).toLocaleString('fr') : '—'} />
          <Field label="Enregistré le" value={new Date(result.notarisedAt).toLocaleString('fr')} />
        </div>
      ) : (
        <button
          className="btn-primary"
          onClick={handleNotarise}
          disabled={!file || loading}
          style={{ width: '100%', padding: '.65rem' }}
        >
          {loading ? <span className="spinner" /> : 'Notariser sur Hedera'}
        </button>
      )}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: '.75rem' }}>
      <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: '.1rem' }}>{label}</p>
      <p style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all', fontSize: '.875rem' }}>{value}</p>
    </div>
  )
}
