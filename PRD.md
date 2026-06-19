# PRD — Stuck Payment Evidence Submission (MVP)

**Status:** Draft · **Owner:** Payments · **Scope:** MVP, client-side only

---

## 1. What we're building

A simple, mobile-first page where a client whose UPI deposit got "stuck"
uploads a screenshot as evidence and immediately sees the result returned by
our backend.

That's the whole MVP: **upload photo evidence → show the response.**

---

## 2. Flow

Per `process-schema.png`:

```
User submits the evidence
        │
        ▼
Auto-matcher processes the evidence   (takes time — show loader)
        │
        ├──► Approved            → congratulate the user
        ├──► Need more evidence  → show error, ask for another screenshot, retry
        └──► Could not match     → transformed into a ZenDesk ticket
```

We don't build the auto-matcher or ZenDesk integration — we just render
whichever of these outcomes the backend returns.

---

## 3. The form

Three things:

| Field | Notes |
|-------|-------|
| **Email** | Communication channel. Required. |
| **Merchant-client-id** | The shop's internal id for this user. Labeled **"Your user"**. Required. |
| **Evidence photo** | The screenshot. Required. |

Plus a **Submit** button.

### Pre-fill from URL

`email` and `merchant-client-id` may arrive as GET parameters.

- When present, **auto-fill** the fields.
- **Hide the merchant-client-id field** when supplied this way (it's an
  internal id the user shouldn't see or edit).

---

## 4. Submitting state

Backend image recognition is slow, so while it runs:

- Show a **loader**.
- Show a message that it takes a moment and **"please don't close the page."**
- Disable the submit button to prevent double submission.

---

## 5. Result states

| Result | UI |
|--------|-----|
| **Approved** | Success / congratulations message. |
| **Needs another screenshot** | Error message + let the user submit a new photo (retry). |
| **Ticket created** | Inform the user it's been handed off (ZenDesk ticket), expect follow-up. |
| **Upload failed (network)** | Inline error + retry without re-entering data. |

---

## 6. Constraints

- Vite + React + TS, Tailwind. Client-side only, no real backend.
- Upload POSTs to the mock endpoint `https://httpbin.org/post`.
- Mobile-first (target ~390px / iPhone 12 Pro).
