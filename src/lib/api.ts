// Submits a stuck-payment report (screenshot or manual) to the backend and
// resolves to a match result, plus a separate support-ticket escalation.
//
// V1 reality: there is no real auto-matcher. We POST to the httpbin mock
// endpoint (so the loading + network-error paths are genuine), add an
// artificial delay to mimic slow processing, then return an outcome.
//
// The match outcome is random by default, but can be forced for demos/testing
// with a `?mock=approved|unmatched` URL parameter.

const MOCK_ENDPOINT = 'https://httpbin.org/post'
// Long enough to watch the fake progress stepper run through its steps.
const PROCESSING_MS = 10000
const TICKET_MS = 2500

export type Mode = 'screenshot' | 'manual'

export type MatchResult = { status: 'approved' } | { status: 'unmatched' }

export type ReportInput = {
  mode: Mode
  email: string
  merchantClientId: string
  evidence?: File[]
  datetime?: string
  upi?: string
  amount?: string
  description?: string
}

function pickMatch(): MatchResult {
  const forced = new URLSearchParams(window.location.search).get('mock')
  if (forced === 'approved') return { status: 'approved' }
  // `needs_evidence` kept as a backward-compatible alias for `unmatched`.
  if (forced === 'unmatched' || forced === 'needs_evidence') {
    return { status: 'unmatched' }
  }
  return Math.random() < 0.5 ? { status: 'approved' } : { status: 'unmatched' }
}

function makeTicketId(): string {
  const n = Math.floor(Math.random() * 900000) + 100000
  return `ZD-${n}`
}

function toFormData(input: ReportInput): FormData {
  const body = new FormData()
  body.append('mode', input.mode)
  body.append('email', input.email)
  body.append('merchant_client_id', input.merchantClientId)
  if (input.mode === 'screenshot') {
    input.evidence?.forEach((file) => body.append('evidence', file))
  } else {
    body.append('datetime', input.datetime ?? '')
    body.append('upi', input.upi ?? '')
    body.append('amount', input.amount ?? '')
    body.append('description', input.description ?? '')
  }
  return body
}

export async function submitReport(input: ReportInput): Promise<MatchResult> {
  // Real network call — surfaces genuine upload failures to the UI.
  const res = await fetch(MOCK_ENDPOINT, { method: 'POST', body: toFormData(input) })
  if (!res.ok) {
    throw new Error(`Submission failed (${res.status})`)
  }

  // Simulate the slow auto-matcher.
  await new Promise((r) => setTimeout(r, PROCESSING_MS))

  return pickMatch()
}

// User-initiated escalation when a manual report can't be matched.
export async function createTicket(input: ReportInput): Promise<{ ticketId: string }> {
  const body = toFormData(input)
  body.append('escalate', 'support_ticket')

  const res = await fetch(MOCK_ENDPOINT, { method: 'POST', body })
  if (!res.ok) {
    throw new Error(`Couldn't create the ticket (${res.status})`)
  }

  await new Promise((r) => setTimeout(r, TICKET_MS))

  return { ticketId: makeTicketId() }
}
