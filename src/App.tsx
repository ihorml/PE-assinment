import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useAnimationControls,
} from 'framer-motion'
import confetti from 'canvas-confetti'
import {
  createTicket,
  submitReport,
  type Mode,
  type ReportInput,
} from './lib/api'
import { readPrefill } from './lib/prefill'
import {
  buttonMotion,
  collapseVariants,
  dur,
  ease,
  layoutTransition,
  phaseVariants,
  popoverVariants,
  resultCardVariants,
  shakeKeyframes,
  staggerItem,
  tabVariants,
} from './lib/motion'

type FormValues = {
  email: string
  merchantClientId: string
  evidence: File[]
  datetime: string
  upi: string
  amount: string
  description: string
}

type Errors = {
  email?: string
  merchantClientId?: string
  evidence?: string
  datetime?: string
  upi?: string
  amount?: string
}

type Phase = 'form' | 'processing' | 'result'
type ProcessingKind = 'match' | 'ticket'

type ResultState =
  | { kind: 'approved' }
  | { kind: 'unmatched'; mode: Mode }
  | { kind: 'ticket'; ticketId: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_FILE_MB = 10

// Fake progress shown while the backend works (real matcher can take minutes).
// The last step intentionally never auto-completes — it holds until the real
// response arrives and swaps this screen out.
const PROCESSING_STEPS = [
  'Uploading your details',
  'Scanning for a match',
  'Reading payment details',
  'Searching for your payment',
  'Verifying the transaction',
  'Finishing up',
]
// Demo pace so all steps are visible during the short mock wait, and the last
// step is reached well before the response so it visibly holds. For the real
// ~5-minute budget, raise this to ~45000 (≈45s/step).
const STEP_INTERVAL_MS = 1400

function validate(v: FormValues, mode: Mode): Errors {
  const errors: Errors = {}

  if (!v.email.trim()) {
    errors.email = 'Email is required'
  } else if (!EMAIL_RE.test(v.email.trim())) {
    errors.email = 'Enter a valid email address'
  }

  if (!v.merchantClientId.trim()) {
    errors.merchantClientId = 'This is required'
  }

  if (mode === 'screenshot') {
    if (v.evidence.length === 0) {
      errors.evidence = 'Please attach at least one screenshot'
    } else if (v.evidence.some((f) => !f.type.startsWith('image/'))) {
      errors.evidence = 'Every file must be an image'
    } else if (v.evidence.some((f) => f.size > MAX_FILE_MB * 1024 * 1024)) {
      errors.evidence = `Each image must be under ${MAX_FILE_MB} MB`
    }
  } else {
    if (!v.datetime) errors.datetime = 'Please add the date & time'
    if (!v.upi.trim()) errors.upi = 'Please add the UPI transaction ID'
    if (!v.amount.trim()) {
      errors.amount = 'Please add the amount'
    } else if (!(Number(v.amount) > 0)) {
      errors.amount = 'Enter a valid amount'
    }
  }

  return errors
}

function App() {
  const prefill = useMemo(readPrefill, [])

  const [mode, setMode] = useState<Mode>('screenshot')
  const [form, setForm] = useState<FormValues>(() => ({
    email: prefill.email,
    merchantClientId: prefill.merchantClientId,
    evidence: [],
    datetime: '',
    upi: '',
    amount: '',
    description: '',
  }))
  const [errors, setErrors] = useState<Errors>({})
  // Bumped on a failed submit so fields with errors can shake.
  const [shakeNonce, setShakeNonce] = useState(0)

  const [phase, setPhase] = useState<Phase>('form')
  const [processingKind, setProcessingKind] = useState<ProcessingKind>('match')
  const [result, setResult] = useState<ResultState | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Live re-validation: recompute only fields that are *already* showing an
  // error, so fixing a bad value clears it on the keystroke that fixes it —
  // without popping new errors on fields the user hasn't finished typing.
  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    const next = { ...form, [key]: value }
    setForm(next)
    setErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const fresh = validate(next, mode)
      const out: Errors = {}
      for (const k of Object.keys(prev) as (keyof Errors)[]) {
        if (fresh[k]) out[k] = fresh[k]
      }
      return out
    })
  }

  function changeMode(next: Mode) {
    setMode(next)
    setErrors({}) // drop the other mode's errors when switching
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors = validate(form, mode)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setShakeNonce((n) => n + 1)
      return
    }

    setSubmitError(null)
    setProcessingKind('match')
    setPhase('processing')
    try {
      const r = await submitReport(reportInput(form, mode))
      setResult(r.status === 'approved' ? { kind: 'approved' } : { kind: 'unmatched', mode })
      setPhase('result')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('form')
    }
  }

  // Escalate an unmatched manual report to the support team → creates a ticket.
  async function escalate() {
    setProcessingKind('ticket')
    setPhase('processing')
    try {
      const { ticketId } = await createTicket(reportInput(form, 'manual'))
      setResult({ kind: 'ticket', ticketId })
      setPhase('result')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
      setPhase('result') // keep the unmatched screen so they can retry
    }
  }

  function backToForm(nextMode: Mode, patch?: Partial<FormValues>) {
    if (patch) setForm((f) => ({ ...f, ...patch }))
    setMode(nextMode)
    setErrors({})
    setResult(null)
    setSubmitError(null)
    setPhase('form')
  }

  const resultActions = {
    retryScreenshot: () => backToForm('screenshot', { evidence: [] }),
    switchToManual: () => backToForm('manual'),
    fixManual: () => backToForm('manual'), // keeps the typed details
    escalate,
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-svh overflow-x-hidden">
        {/* Ambient depth — separation without borders. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute left-1/2 top-[-12%] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#15171d] blur-[130px]" />
        </div>

        {/* Success wash — the whole screen turns green when the payment matches. */}
        <AnimatePresence>
          {phase === 'result' && result?.kind === 'approved' && (
            <motion.div
              key="success-wash"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: ease.out }}
              className="pointer-events-none fixed inset-0 -z-10"
            >
              <div className="absolute left-1/2 top-[-15%] h-[32rem] w-[42rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[120px]" />
              <div className="absolute bottom-[-15%] left-1/2 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-emerald-600/15 blur-[120px]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edge-to-edge on mobile (px only); centered focused card on sm+.
            The form stays top-aligned (long + has the sticky CTA); the short
            message screens center vertically. */}
        <div
          className={`flex min-h-svh w-full flex-col px-5 sm:items-center sm:justify-center sm:px-4 sm:py-10 ${
            phase === 'form' ? 'pb-32 pt-14' : 'justify-center py-10'
          }`}
        >
          <motion.main
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: dur.slow, ease: ease.out }}
            className="w-full sm:max-w-sm"
          >
          {/* Inner layout box morphs height smoothly as phases swap. */}
          <motion.div layout transition={layoutTransition}>
            <AnimatePresence mode="wait" initial={false}>
              {phase === 'processing' && (
                <motion.div
                  key={processingKind}
                  variants={phaseVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {processingKind === 'ticket' ? <CreatingTicket /> : <Submitting />}
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
                  <Result
                    result={result}
                    actions={resultActions}
                    email={form.email.trim()}
                  />
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
                    Tell us about your stuck payment and we'll track it down.
                  </p>
                  <form
                    id="reportForm"
                    onSubmit={handleSubmit}
                    noValidate
                    className="border-0 bg-transparent p-0 shadow-none sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/[0.03] sm:p-6 sm:shadow-xl"
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
                      value={form.email}
                      error={errors.email}
                      shakeNonce={shakeNonce}
                      onChange={(v) => setField('email', v)}
                    />

                    {!prefill.merchantClientIdLocked && (
                      <Field
                        id="merchantClientId"
                        label="Your account number"
                        hint="This is your account or customer number from the service you used. Not sure where to find it? Check your receipt or confirmation email, or ask the service where you made your payment."
                        placeholder="e.g. your account or customer number"
                        value={form.merchantClientId}
                        error={errors.merchantClientId}
                        shakeNonce={shakeNonce}
                        onChange={(v) => setField('merchantClientId', v)}
                      />
                    )}

                    <ModeTabs mode={mode} onChange={changeMode} />

                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={mode}
                        variants={tabVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        {mode === 'screenshot' ? (
                          <FileField
                            id="evidence"
                            label="Payment screenshot(s)"
                            files={form.evidence}
                            error={errors.evidence}
                            shakeNonce={shakeNonce}
                            onChange={(files) => setField('evidence', files)}
                          />
                        ) : (
                          <>
                            <Field
                              id="datetime"
                              label="Date & time of payment"
                              type="datetime-local"
                              value={form.datetime}
                              error={errors.datetime}
                              shakeNonce={shakeNonce}
                              onChange={(v) => setField('datetime', v)}
                            />
                            <Field
                              id="upi"
                              label="UTR / UPI reference number"
                              hint="A 12-digit number that identifies your payment. In your payment app (GPay, PhonePe, Paytm), open the payment and look for UTR, UPI Ref. No., or transaction ID. This is what we use to trace your money."
                              placeholder="e.g. 412345678901"
                              inputMode="numeric"
                              value={form.upi}
                              error={errors.upi}
                              shakeNonce={shakeNonce}
                              onChange={(v) => setField('upi', v)}
                            />
                            <Field
                              id="amount"
                              label="Amount (₹)"
                              placeholder="e.g. 500"
                              inputMode="decimal"
                              value={form.amount}
                              error={errors.amount}
                              shakeNonce={shakeNonce}
                              onChange={(v) => setField('amount', v)}
                            />
                            <Field
                              id="description"
                              label="Anything else?"
                              optional
                              multiline
                              placeholder="Add any details that might help us find it…"
                              value={form.description}
                              shakeNonce={shakeNonce}
                              onChange={(v) => setField('description', v)}
                            />
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>

                    {/* Desktop submit lives in the card; mobile uses the sticky CTA. */}
                    <motion.button
                      type="submit"
                      {...buttonMotion}
                      className="mt-2 hidden w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 sm:block"
                    >
                      {mode === 'screenshot' ? 'Submit evidence' : 'Submit details'}
                    </motion.button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          </motion.main>
        </div>

        {/* Sticky CTA on mobile — lives outside the animated tree so `fixed`
            isn't broken by ancestor transforms; submits via the form attr. */}
        <AnimatePresence initial={false}>
          {phase === 'form' && (
            <motion.div
              key="mobile-cta"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: dur.base, ease: ease.out }}
              className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12] to-transparent px-5 pt-10 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:hidden"
            >
              <motion.button
                type="submit"
                form="reportForm"
                whileTap={{ scale: 0.98 }}
                className="w-full rounded-xl bg-indigo-500 px-4 py-3.5 text-base font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
              >
                {mode === 'screenshot' ? 'Submit evidence' : 'Submit details'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

function reportInput(form: FormValues, mode: Mode): ReportInput {
  return {
    mode,
    email: form.email.trim(),
    merchantClientId: form.merchantClientId.trim(),
    evidence: form.evidence,
    datetime: form.datetime,
    upi: form.upi.trim(),
    amount: form.amount.trim(),
    description: form.description.trim(),
  }
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: { id: Mode; label: string }[] = [
    { id: 'screenshot', label: 'Upload screenshot' },
    { id: 'manual', label: 'Type manually' },
  ]
  return (
    <div className="mb-4 flex rounded-xl bg-white/[0.06] p-1">
      {tabs.map((t) => {
        const active = mode === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            className={`relative flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
              active ? 'text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId="mode-tab"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute inset-0 rounded-lg bg-indigo-500"
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        )
      })}
    </div>
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
    <div className="p-0 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/[0.03] sm:p-6 sm:shadow-xl">
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

function CreatingTicket() {
  return (
    <div className="p-0 text-center sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/[0.03] sm:p-6 sm:shadow-xl">
      <div
        className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400"
        aria-hidden
      />
      <motion.p
        className="text-sm font-medium text-white"
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
      >
        Creating your support ticket…
      </motion.p>
      <p className="mt-1.5 text-sm text-gray-400">This will only take a moment.</p>
    </div>
  )
}

function ApprovedResult() {
  // A small, tasteful confetti burst once the check has drawn in.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => {
      confetti({
        particleCount: 55,
        spread: 70,
        startVelocity: 32,
        ticks: 160,
        scalar: 0.9,
        origin: { y: 0.38 },
        colors: ['#34d399', '#10b981', '#6ee7b7', '#a7f3d0', '#ffffff', '#fcd34d'],
        disableForReducedMotion: true,
      })
    }, 450)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div
      variants={resultCardVariants}
      initial="initial"
      animate="animate"
      className="p-0 text-center sm:rounded-2xl sm:border sm:border-emerald-500/30 sm:bg-emerald-500/10 sm:p-6"
    >
      <CheckmarkDraw />
      <motion.p variants={staggerItem} className="mt-3 text-sm font-semibold text-emerald-300">
        Payment confirmed
      </motion.p>
      <motion.p variants={staggerItem} className="mt-1.5 text-sm text-gray-300">
        We matched your payment — it's all sorted. You're good to go.
      </motion.p>
    </motion.div>
  )
}

// SVG checkmark that strokes itself on: the ring draws, then the tick.
function CheckmarkDraw() {
  return (
    <motion.svg
      viewBox="0 0 52 52"
      className="mx-auto h-16 w-16"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: dur.base, ease: ease.spring }}
      aria-hidden
    >
      <motion.circle
        cx="26"
        cy="26"
        r="23"
        fill="none"
        stroke="#34d399"
        strokeWidth="3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      />
      <motion.path
        d="M15 27 l7 7 l15 -15"
        fill="none"
        stroke="#34d399"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut', delay: 0.45 }}
      />
    </motion.svg>
  )
}

type ResultActions = {
  retryScreenshot: () => void
  switchToManual: () => void
  fixManual: () => void
  escalate: () => void
}

function Result({
  result,
  actions,
  email,
}: {
  result: ResultState
  actions: ResultActions
  email: string
}) {
  if (result.kind === 'approved') {
    return <ApprovedResult />
  }

  if (result.kind === 'ticket') {
    return (
      <motion.div
        variants={resultCardVariants}
        initial="initial"
        animate="animate"
        className="p-0 text-center sm:rounded-2xl sm:border sm:border-indigo-500/30 sm:bg-indigo-500/10 sm:p-6"
      >
        <motion.p variants={staggerItem} className="text-sm font-semibold text-indigo-300">
          Support ticket created
        </motion.p>
        <motion.p variants={staggerItem} className="mt-1.5 text-sm text-gray-300">
          Our team will review your payment manually and email{' '}
          <span className="font-semibold break-words text-white">{email}</span> with an
          update, usually <span className="font-medium text-white">within 24 hours</span>.
        </motion.p>
        <motion.p
          variants={staggerItem}
          className="mt-3 border-t border-white/10 pt-3 text-xs text-gray-400"
        >
          Your reference:{' '}
          <span className="font-mono font-medium text-gray-200">{result.ticketId}</span>
        </motion.p>
      </motion.div>
    )
  }

  // unmatched — actions depend on which mode was submitted
  const screenshot = result.mode === 'screenshot'
  return (
    <motion.div
      variants={resultCardVariants}
      initial="initial"
      animate="animate"
      className="p-0 sm:rounded-2xl sm:border sm:border-amber-500/30 sm:bg-amber-500/10 sm:p-6"
    >
      <motion.p variants={staggerItem} className="text-sm font-semibold text-amber-300">
        {screenshot ? "We couldn't match your screenshot" : "We couldn't match your payment"}
      </motion.p>
      <motion.p variants={staggerItem} className="mt-1.5 text-sm text-gray-300">
        {screenshot
          ? "The screenshot didn't give us enough to find your payment. Try a clearer one, or type the details yourself."
          : "We couldn't find a payment with those details. Double-check them, or send it to our support team."}
      </motion.p>
      <motion.div variants={staggerItem} className="mt-4 flex flex-col gap-2">
        <motion.button
          type="button"
          onClick={screenshot ? actions.retryScreenshot : actions.fixManual}
          {...buttonMotion}
          className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-amber-400"
        >
          {screenshot ? 'Upload a new screenshot' : 'Check & edit the details'}
        </motion.button>
        <motion.button
          type="button"
          onClick={screenshot ? actions.switchToManual : actions.escalate}
          {...buttonMotion}
          className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5"
        >
          {screenshot ? 'Type the details manually' : 'Submit to our support team'}
        </motion.button>
      </motion.div>
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
  type?: string
  placeholder?: string
  value: string
  error?: string
  hint?: string
  optional?: boolean
  multiline?: boolean
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode']
  shakeNonce: number
  onChange: (value: string) => void
}

function Field({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  error,
  hint,
  optional,
  multiline,
  inputMode,
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

  // Filled (borderless) inputs; 16px on mobile so iOS doesn't zoom on focus.
  const inputClass = `w-full rounded-xl bg-white/[0.06] px-3.5 py-3 text-base text-white placeholder:text-gray-500 transition-[color,background-color,box-shadow] duration-150 ease-out focus:outline-none sm:py-2.5 sm:text-sm ${
    error
      ? 'bg-red-500/[0.07] ring-2 ring-red-500/50'
      : 'hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-indigo-400/60'
  }`

  return (
    <div className="mb-4">
      {/* Full-width relative wrapper so the popover clamps to the field, never the screen edge. */}
      <div className="relative mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-gray-300">
          {label}
          {optional && <span className="ml-1 font-normal text-gray-500">(optional)</span>}
        </label>
        {hint && <HintBadge text={hint} />}
      </div>
      {multiline ? (
        <motion.textarea
          animate={controls}
          id={id}
          name={id}
          rows={3}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <motion.input
          animate={controls}
          id={id}
          name={id}
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={inputClass}
        />
      )}
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
          <span className="font-semibold text-amber-300">UTR / UPI reference number</span>
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
                : 'border-white/15 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.07] peer-focus-visible:ring-indigo-400/60'
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
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-gray-300">
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
