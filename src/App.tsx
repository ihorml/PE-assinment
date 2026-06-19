import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useAnimationControls,
} from 'framer-motion'
import { submitEvidence, type MatchResult } from './lib/api'
import { readPrefill } from './lib/prefill'
import {
  buttonMotion,
  collapseVariants,
  dur,
  ease,
  emojiPop,
  layoutTransition,
  phaseVariants,
  popoverVariants,
  resultCardVariants,
  shakeKeyframes,
  staggerItem,
} from './lib/motion'

type Errors = {
  email?: string
  merchantClientId?: string
  evidence?: string
}

type Phase = 'form' | 'submitting' | 'result'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_FILE_MB = 10

// Fake progress shown while the backend works (real matcher can take minutes).
// The last step intentionally never auto-completes — it holds until the real
// response arrives and swaps this screen out.
const PROCESSING_STEPS = [
  'Uploading your screenshot',
  'Scanning the image',
  'Reading payment details',
  'Searching for your payment',
  'Verifying the transaction',
  'Finishing up',
]
// Demo pace so all steps are visible during the short mock wait, and the last
// step is reached well before the response so it visibly holds. For the real
// ~5-minute budget, raise this to ~45000 (≈45s/step).
const STEP_INTERVAL_MS = 1400

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
  // Bumped on a failed submit so fields with errors can shake.
  const [shakeNonce, setShakeNonce] = useState(0)

  const [phase, setPhase] = useState<Phase>('form')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const values = { email, merchantClientId, evidence }
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setShakeNonce((n) => n + 1)
      return
    }

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
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-svh items-center justify-center px-4 py-10">
        <motion.main
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: dur.slow, ease: ease.out }}
          className="w-full max-w-sm"
        >
          {/* Inner layout box morphs height smoothly as phases swap. */}
          <motion.div layout transition={layoutTransition}>
            <AnimatePresence mode="wait" initial={false}>
              {phase === 'submitting' && (
                <motion.div
                  key="submitting"
                  variants={phaseVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <Submitting />
                </motion.div>
              )}

              {phase === 'result' && result && (
                <motion.div
                  key="result"
                  variants={phaseVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <Result result={result} onRetry={retryWithNewPhoto} />
                </motion.div>
              )}

              {phase === 'form' && (
                <motion.div
                  key="form"
                  variants={phaseVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {/* Title + subtitle live with the form so they fade in/out WITH the
                      state instead of gliding as a persistent, re-centering header. */}
                  <h1 className="text-xl font-semibold text-white">Report a stuck payment</h1>
                  <p className="mt-2 mb-4 text-sm text-gray-400">
                    Upload a screenshot of your payment and we'll check it right away.
                  </p>
                  <form
                    onSubmit={handleSubmit}
                    noValidate
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl"
                  >
                    <AnimatePresence initial={false}>
                      {submitError && (
                        <motion.div
                          key="submitError"
                          variants={collapseVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="overflow-hidden"
                        >
                          <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                            {submitError} — please try again.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Field
                      id="email"
                      label="Email"
                      type="email"
                      placeholder="jane@example.com"
                      value={email}
                      error={errors.email}
                      shakeNonce={shakeNonce}
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
                        shakeNonce={shakeNonce}
                        onChange={(e) => changeMerchantClientId(e.target.value)}
                      />
                    )}

                    <FileField
                      id="evidence"
                      label="Payment screenshot(s)"
                      files={evidence}
                      error={errors.evidence}
                      shakeNonce={shakeNonce}
                      onChange={changeEvidence}
                    />

                    <motion.button
                      type="submit"
                      {...buttonMotion}
                      className="mt-2 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                    >
                      Submit evidence
                    </motion.button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.main>
      </div>
    </MotionConfig>
  )
}

type StepState = 'done' | 'active' | 'pending'

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: dur.base, ease: ease.spring }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </motion.span>
    )
  }
  if (state === 'active') {
    return (
      <span
        className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400"
        aria-hidden
      />
    )
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border border-white/15" aria-hidden />
}

function Submitting() {
  const total = PROCESSING_STEPS.length
  const [step, setStep] = useState(0)

  // Advance one step per interval, holding on the last until the response lands.
  useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, total - 1)),
      STEP_INTERVAL_MS,
    )
    return () => clearInterval(id)
  }, [total])

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl">
      <motion.p
        className="text-sm font-medium text-white"
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
      >
        Checking your payment…
      </motion.p>
      <p className="mt-1 text-xs text-gray-400">This usually takes 1–3 minutes.</p>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-indigo-500"
          initial={{ width: '0%' }}
          // +0.5 so the active step sits mid-fill; the last (holding) step lands
          // near ~92%, never a "done-looking" 100% while we're still waiting.
          animate={{ width: `${((step + 0.5) / total) * 100}%` }}
          transition={{ duration: 0.5, ease: ease.out }}
        />
      </div>

      <ul className="mt-4 space-y-2.5">
        {PROCESSING_STEPS.map((label, i) => {
          const state: StepState = i < step ? 'done' : i === step ? 'active' : 'pending'
          return (
            <li key={label} className="flex items-center gap-2.5 text-sm">
              <StepIcon state={state} />
              <span
                className={`transition-colors duration-300 ${
                  state === 'active'
                    ? 'text-white'
                    : state === 'done'
                      ? 'text-gray-400'
                      : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="mt-5 text-xs font-medium text-amber-300">
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
      <motion.div
        variants={resultCardVariants}
        initial="initial"
        animate="animate"
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center"
      >
        <motion.p variants={emojiPop} className="text-2xl">
          🎉
        </motion.p>
        <motion.p variants={staggerItem} className="mt-2 text-sm font-semibold text-emerald-300">
          Payment confirmed
        </motion.p>
        <motion.p variants={staggerItem} className="mt-1.5 text-sm text-gray-300">
          We matched your payment — it's all sorted. You're good to go.
        </motion.p>
      </motion.div>
    )
  }

  if (result.status === 'needs_evidence') {
    return (
      <motion.div
        variants={resultCardVariants}
        initial="initial"
        animate="animate"
        className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6"
      >
        <motion.p variants={staggerItem} className="text-sm font-semibold text-amber-300">
          We need another screenshot
        </motion.p>
        <motion.p variants={staggerItem} className="mt-1.5 text-sm text-gray-300">
          {result.message}
        </motion.p>
        <motion.button
          variants={staggerItem}
          type="button"
          onClick={onRetry}
          {...buttonMotion}
          className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400"
        >
          Upload another screenshot
        </motion.button>
      </motion.div>
    )
  }

  // ticket
  return (
    <motion.div
      variants={resultCardVariants}
      initial="initial"
      animate="animate"
      className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-6 text-center"
    >
      <motion.p variants={staggerItem} className="text-sm font-semibold text-indigo-300">
        We're on it — ticket created
      </motion.p>
      <motion.p variants={staggerItem} className="mt-1.5 text-sm text-gray-300">
        We couldn't match this automatically, so our team will review it. Your
        reference is{' '}
        <span className="font-mono font-medium text-white">{result.ticketId}</span>.
        We'll email you with an update.
      </motion.p>
    </motion.div>
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
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popRef}
            id={tipId}
            role="tooltip"
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ transformOrigin: 'bottom left' }}
            // Opens upward so it never covers this field's input; left-0 + max-w-full
            // pin it inside the field, so it can't overflow the viewport on any device.
            className="absolute bottom-full left-0 z-30 mb-2 w-72 max-w-full rounded-lg border border-white/15 bg-[#161922] px-3 py-2 text-xs font-normal leading-relaxed text-gray-200 shadow-xl"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
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
  shakeNonce: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function Field({
  id,
  label,
  type,
  placeholder,
  value,
  error,
  hint,
  shakeNonce,
  onChange,
}: FieldProps) {
  const controls = useAnimationControls()
  const lastShake = useRef(shakeNonce)

  // Shake only when a *new* failed submit lands on a field that has an error.
  useEffect(() => {
    if (shakeNonce !== lastShake.current) {
      lastShake.current = shakeNonce
      if (error) controls.start(shakeKeyframes)
    }
  }, [shakeNonce, error, controls])

  return (
    <div className="mb-4">
      {/* Full-width relative wrapper so the popover clamps to the field, never the screen edge. */}
      <div className="relative mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-gray-300">
          {label}
        </label>
        {hint && <HintBadge text={hint} />}
      </div>
      <motion.input
        animate={controls}
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus:outline-none focus-visible:ring-2 ${
          error
            ? 'border-red-500/60 focus-visible:ring-red-500/50'
            : 'border-white/10 focus-visible:ring-indigo-400/60'
        }`}
      />
      <FieldError id={id} error={error} />
    </div>
  )
}

// Animated, collapsing error line shared by inputs.
function FieldError({ id, error }: { id: string; error?: string }) {
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.div
          variants={collapseVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="overflow-hidden"
        >
          <p id={`${id}-error`} className="pt-1.5 text-xs text-red-400">
            {error}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type FileFieldProps = {
  id: string
  label: string
  files: File[]
  error?: string
  shakeNonce: number
  onChange: (files: File[]) => void
}

const fileKey = (f: File) => `${f.name}:${f.size}`

function FileField({ id, label, files, error, shakeNonce, onChange }: FileFieldProps) {
  const controls = useAnimationControls()
  const lastShake = useRef(shakeNonce)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (shakeNonce !== lastShake.current) {
      lastShake.current = shakeNonce
      if (error) controls.start(shakeKeyframes)
    }
  }, [shakeNonce, error, controls])

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
      {/* Native file input is visually hidden (`peer sr-only`) but fully
          accessible; the styled label below is the real, themeable trigger and
          doubles as a drag-and-drop zone. */}
      <motion.div animate={controls}>
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
          className="peer sr-only"
        />
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition-[color,background-color,border-color,box-shadow] duration-150 ease-out peer-focus-visible:ring-2 ${
            error
              ? 'border-red-500/60 bg-red-500/5 peer-focus-visible:ring-red-500/50'
              : dragOver
                ? 'border-indigo-400/70 bg-indigo-500/10 peer-focus-visible:ring-indigo-400/60'
                : 'border-white/15 bg-black/30 hover:border-white/30 hover:bg-white/[0.04] peer-focus-visible:ring-indigo-400/60'
          }`}
        >
          <div className="pointer-events-none flex items-center gap-3">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 16V4m0 0L8 8m4-4 4 4" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">
                {files.length ? 'Tap to add more' : 'Tap to upload'}{' '}
                <span className="text-gray-400">or drag &amp; drop</span>
              </span>
              <span className="text-xs text-gray-500">
                Images · up to {MAX_FILE_MB} MB each
              </span>
            </div>
          </div>
        </label>
      </motion.div>
      {/* Always-mounted so the FIRST row animates in like the rest (an empty,
          conditionally-mounted AnimatePresence skips its first child's enter
          animation, which made row 1 pop full-height and the card lurch). */}
      <ul>
        <AnimatePresence initial={false}>
          {files.map((f) => (
            <motion.li
              key={fileKey(f)}
              variants={collapseVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="overflow-hidden"
            >
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-gray-300">
                <span className="truncate">
                  {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <motion.button
                  type="button"
                  onClick={() => removeFile(fileKey(f))}
                  aria-label={`Remove ${f.name}`}
                  whileHover={{ rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: dur.fast, ease: ease.standard }}
                  className="shrink-0 text-gray-500 hover:text-gray-200"
                >
                  ✕
                </motion.button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <FieldError id={id} error={error} />
    </div>
  )
}

export default App
