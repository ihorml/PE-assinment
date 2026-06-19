// Submits the evidence to the backend and resolves to a match result.
//
// V1 reality: there is no real auto-matcher. We POST to the httpbin mock
// endpoint (so the loading + network-error paths are genuine), add an
// artificial delay to mimic slow image recognition, then return one of the
// outcomes from process-schema.png.
//
// The outcome is random by default, but can be forced for demos/testing with a
// `?mock=approved|needs_evidence|ticket` URL parameter.

const MOCK_ENDPOINT = 'https://httpbin.org/post'
const PROCESSING_MS = 2500

export type MatchResult =
  | { status: 'approved' }
  | { status: 'needs_evidence'; message: string }
  | { status: 'ticket'; ticketId: string }

export type SubmitInput = {
  email: string
  merchantClientId: string
  evidence: File[]
}

function pickOutcome(): MatchResult {
  const forced = new URLSearchParams(window.location.search).get('mock')

  switch (forced) {
    case 'approved':
      return { status: 'approved' }
    case 'needs_evidence':
      return { status: 'needs_evidence', message: forcedNeedsMessage }
    case 'ticket':
      return { status: 'ticket', ticketId: makeTicketId() }
  }

  const roll = Math.random()
  if (roll < 0.45) return { status: 'approved' }
  if (roll < 0.75) return { status: 'needs_evidence', message: forcedNeedsMessage }
  return { status: 'ticket', ticketId: makeTicketId() }
}

const forcedNeedsMessage =
  "We couldn't read the payment details from this screenshot. Please upload a clearer image showing the amount, date, and transaction reference."

function makeTicketId(): string {
  const n = Math.floor(Math.random() * 900000) + 100000
  return `ZD-${n}`
}

export async function submitEvidence(input: SubmitInput): Promise<MatchResult> {
  const body = new FormData()
  body.append('email', input.email)
  body.append('merchant_client_id', input.merchantClientId)
  input.evidence.forEach((file) => body.append('evidence', file))

  // Real network call — surfaces genuine upload failures to the UI.
  const res = await fetch(MOCK_ENDPOINT, { method: 'POST', body })
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`)
  }

  // Simulate the slow auto-matcher.
  await new Promise((r) => setTimeout(r, PROCESSING_MS))

  return pickOutcome()
}
