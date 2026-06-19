import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { submitEvidence, type MatchResult } from './lib/api'
import { readPrefill } from './lib/prefill'

type Errors = {
  email?: string
  merchantClientId?: string
  evidence?: string
}

type Phase = 'form' | 'submitting' | 'result'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_FILE_MB = 10

function validate(values: {
  email: string
  merchantClientId: string
  evidence: File[]
}): Errors {
  const errors: Errors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Enter a valid email address'
  }

  if (!values.merchantClientId.trim()) {
    errors.merchantClientId = 'This is required'
  }

  if (values.evidence.length === 0) {
    errors.evidence = 'Please attach at least one screenshot'
  } else if (values.evidence.some((f) => !f.type.startsWith('image/'))) {
    errors.evidence = 'Every file must be an image'
  } else if (values.evidence.some((f) => f.size > MAX_FILE_MB * 1024 * 1024)) {
    errors.evidence = `Each image must be under ${MAX_FILE_MB} MB`
  }

  return errors
}

function App() {
  const prefill = useMemo(readPrefill, [])

  const [email, setEmail] = useState(prefill.email)
  const [merchantClientId, setMerchantClientId] = useState(prefill.merchantClientId)
  const [evidence, setEvidence] = useState<File[]>([])
  const [errors, setErrors] = useState<Errors>({})

  const [phase, setPhase] = useState<Phase>('form')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const values = { email, merchantClientId, evidence }
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitError(null)
    setPhase('submitting')
    try {
      const r = await submitEvidence({
        email: email.trim(),
        merchantClientId: merchantClientId.trim(),
        evidence,
      })
      setResult(r)
      setPhase('result')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('form')
    }
  }

  // Live re-validation: recompute only fields that are *already* showing an
  // error, so fixing a bad value clears it on the keystroke that fixes it —
  // without popping new errors on fields the user hasn't finished typing.
  function revalidate(next: {
    email: string
    merchantClientId: string
    evidence: File[]
  }) {
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const fresh = validate(next)
      const out: Errors = {}
      for (const key of Object.keys(prev) as (keyof Errors)[]) {
        if (fresh[key]) out[key] = fresh[key]
      }
      return out
    })
  }

  function changeEmail(value: string) {
    setEmail(value)
    revalidate({ email: value, merchantClientId, evidence })
  }

  function changeMerchantClientId(value: string) {
    setMerchantClientId(value)
    revalidate({ email, merchantClientId: value, evidence })
  }

  function changeEvidence(files: File[]) {
    setEvidence(files)
    revalidate({ email, merchantClientId, evidence: files })
  }

  // Back to the form to submit a fresh screenshot (keeps email + id).
  function retryWithNewPhoto() {
    setEvidence([])
    setErrors({})
    setResult(null)
    setSubmitError(null)
    setPhase('form')
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <main className="w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-white">Report a stuck payment</h1>
          {phase === 'form' && (
            <p className="mt-1 text-sm text-gray-400">
              Upload a screenshot of your payment and we'll check it right away.
            </p>
          )}
        </header>

        {phase === 'submitting' && <Submitting />}

        {phase === 'result' && result && (
          <Result result={result} onRetry={retryWithNewPhoto} />
        )}

        {phase === 'form' && (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl"
          >
            {submitError && (
              <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {submitError} — please try again.
              </p>
            )}

            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="jane@example.com"
              value={email}
              error={errors.email}
              onChange={(e) => changeEmail(e.target.value)}
            />

            {!prefill.merchantClientIdLocked && (
              <Field
                id="merchantClientId"
                label="Your account number"
                hint="This is your account or customer number from the service you used. Not sure where to find it? Check your receipt or confirmation email, or ask the service where you made your payment."
                type="text"
                placeholder="e.g. your account or customer number"
                value={merchantClientId}
                error={errors.merchantClientId}
                onChange={(e) => changeMerchantClientId(e.target.value)}
              />
            )}

            <FileField
              id="evidence"
              label="Payment screenshot(s)"
              files={evidence}
              error={errors.evidence}
              onChange={changeEvidence}
            />

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              Submit evidence
            </button>
          </form>
        )}
      </main>
    </div>
  )
}

function Submitting() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center shadow-xl">
      <div
        className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400"
        aria-hidden
      />
      <p className="text-sm font-medium text-white">Checking your payment…</p>
      <p className="mt-1.5 text-sm text-gray-400">
        Reading your screenshot usually takes 1–3 minutes.
      </p>
      <p className="mt-3 text-xs font-medium text-amber-300">
        Please don't close this page.
      </p>
    </div>
  )
}

function Result({
  result,
  onRetry,
}: {
  result: MatchResult
  onRetry: () => void
}) {
  if (result.status === 'approved') {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="text-2xl">🎉</p>
        <p className="mt-2 text-sm font-semibold text-emerald-300">
          Payment confirmed
        </p>
        <p className="mt-1.5 text-sm text-gray-300">
          We matched your payment — it's all sorted. You're good to go.
        </p>
      </div>
    )
  }

  if (result.status === 'needs_evidence') {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
        <p className="text-sm font-semibold text-amber-300">
          We need another screenshot
        </p>
        <p className="mt-1.5 text-sm text-gray-300">{result.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400"
        >
          Upload another screenshot
        </button>
      </div>
    )
  }

  // ticket
  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6 text-center">
      <p className="text-sm font-semibold text-indigo-300">
        We're on it — ticket created
      </p>
      <p className="mt-1.5 text-sm text-gray-300">
        We couldn't match this automatically, so our team will review it. Your
        reference is{' '}
        <span className="font-mono font-medium text-white">{result.ticketId}</span>.
        We'll email you with an update.
      </p>
    </div>
  )
}

// Tap-to-toggle help popover. Built for touch first: `title` tooltips never
// fire on mobile, so this opens on tap/click, closes on outside-tap or Escape,
// and is clamped to the field width so it can't run off a phone screen.
function HintBadge({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const tipId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="More information"
        aria-expanded={open}
        aria-controls={tipId}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((v) => !v)}
        // after:* enlarges the touch target to ~40px without changing the visual size.
        className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 text-[11px] font-semibold leading-none text-gray-400 transition-colors hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 after:absolute after:-inset-2.5 after:content-['']"
      >
        ?
      </button>
      {open && (
        <div
          ref={popRef}
          id={tipId}
          role="tooltip"
          // Opens upward so it never covers this field's input; left-0 + max-w-full
          // pin it inside the field, so it can't overflow the viewport on any device.
          className="absolute bottom-full left-0 z-30 mb-2 w-72 max-w-full rounded-lg border border-white/15 bg-[#161922] px-3 py-2 text-xs font-normal leading-relaxed text-gray-200 shadow-xl"
        >
          {text}
        </div>
      )}
    </>
  )
}

type FieldProps = {
  id: string
  label: string
  type: string
  placeholder: string
  value: string
  error?: string
  hint?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function Field({ id, label, type, placeholder, value, error, hint, onChange }: FieldProps) {
  return (
    <div className="mb-4">
      {/* Full-width relative wrapper so the popover clamps to the field, never the screen edge. */}
      <div className="relative mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-gray-300">
          {label}
        </label>
        {hint && <HintBadge text={hint} />}
      </div>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 ${
          error
            ? 'border-red-500/60 focus-visible:ring-red-500/50'
            : 'border-white/10 focus-visible:ring-indigo-400/60'
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

type FileFieldProps = {
  id: string
  label: string
  files: File[]
  error?: string
  onChange: (files: File[]) => void
}

const fileKey = (f: File) => `${f.name}:${f.size}`

function FileField({ id, label, files, error, onChange }: FileFieldProps) {
  // Accumulate across picks so adding more doesn't drop earlier ones; dedupe by name+size.
  function addFiles(picked: FileList | null) {
    if (!picked) return
    const seen = new Set(files.map(fileKey))
    const next = [...files]
    for (const f of picked) {
      if (!seen.has(fileKey(f))) {
        seen.add(fileKey(f))
        next.push(f)
      }
    }
    onChange(next)
  }

  function removeFile(key: string) {
    onChange(files.filter((f) => fileKey(f) !== key))
  }

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-300">
        {label}
      </label>
      <p className="mb-2 text-xs text-gray-400">Make sure the screenshot clearly shows:</p>
      <ul className="mb-2.5 space-y-1 text-xs text-gray-400">
        <li className="flex gap-1.5">
          <span className="text-indigo-400">✓</span> Date &amp; time clearly visible
        </li>
        <li className="flex gap-1.5">
          <span className="text-indigo-400">✓</span> Amount is present
        </li>
        <li className="flex gap-1.5">
          <span className="text-indigo-400">✓</span>{' '}
          <span className="font-semibold text-amber-300">UPI transaction ID</span>
        </li>
      </ul>
      <input
        id={id}
        name={id}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = '' // allow re-picking the same file after removal
        }}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-black/30 px-3.5 py-2.5 text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-white/15 focus:outline-none focus-visible:ring-2 ${
          error
            ? 'border-red-500/60 focus-visible:ring-red-500/50'
            : 'border-white/10 focus-visible:ring-indigo-400/60'
        }`}
      />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li
              key={fileKey(f)}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-gray-300"
            >
              <span className="truncate">
                {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
              </span>
              <button
                type="button"
                onClick={() => removeFile(fileKey(f))}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 text-gray-500 hover:text-gray-200"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export default App
