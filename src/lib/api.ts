// Fake backend for a stuck-payment report (screenshot or manual). There is no
// real network call — we just wait (to mimic the slow auto-matcher / ticket
// creation) and return a mocked outcome. This avoids CORS and works offline.
//
// The match outcome is random by default, but can be forced for demos/testing
// with a `?mock=approved|unmatched` URL parameter.

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

export async function submitReport(_input: ReportInput): Promise<MatchResult> {
  // Simulate the slow auto-matcher.
  await wait(PROCESSING_MS)
  return pickMatch()
}

// User-initiated escalation when a manual report can't be matched.
export async function createTicket(_input: ReportInput): Promise<{ ticketId: string }> {
  await wait(TICKET_MS)
  return { ticketId: makeTicketId() }
}
