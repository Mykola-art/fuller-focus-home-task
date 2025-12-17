import React, { useRef, useState } from 'react'
import Button from './Button'
import { useJobStore } from '../store/useJobStore'

export default function UploadCard() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')

  const step = useJobStore((s) => s.step)
  const upload = useJobStore((s) => s.actions.upload)
  const reset = useJobStore((s) => s.actions.reset)

  const busy = step === 'uploading' || step === 'verifying' || step === 'enriching'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-bold text-gray-900">Upload CSV</div>
          <div className="text-sm text-gray-600">Upload the CSV, then run Verify → Enrich Emails → Export.</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setFileName(f?.name ?? '')
            }}
          />
          <Button variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
          <Button
            disabled={busy || !inputRef.current?.files?.[0]}
            onClick={async () => {
              const f = inputRef.current?.files?.[0]
              if (!f) return
              await upload(f)
            }}
          >
            Upload
          </Button>
          <Button variant="ghost" disabled={busy} onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-700">
        Selected: <span className="font-semibold">{fileName || '—'}</span>
      </div>
    </div>
  )
}
