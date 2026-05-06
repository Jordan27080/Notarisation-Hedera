import { useRef } from 'react'
import React from 'react'
import { readKeyFile } from '../../utils/hedera'

interface Props {
  value: string
  onChange: (value: string) => void
  label?: React.ReactNode
}

export default function PrivateKeyInput({ value, onChange, label = 'Clé privée ED25519' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const content = await readKeyFile(file)
      onChange(content.trim())
    } catch {
      alert('Impossible de lire le fichier')
    }
    // Reset pour permettre de recharger le même fichier
    e.target.value = ''
  }

  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label>{label}</label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            fontSize: '.72rem',
            padding: '.2rem .6rem',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--primary)',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          📂 Importer un fichier
        </button>
      </div>

      <input
        type="password"
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="302e020100300506032b657004220420...  ou coller le contenu PEM"
        autoComplete="off"
      />

      <input
        ref={fileRef}
        type="file"
        accept=".pem,.key,.txt,.priv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
        Formats acceptés : hex DER, PEM, raw hex — la clé reste dans votre navigateur.
      </span>
    </div>
  )
}
