# PE Interview — Live Coding Session

## Format

- **90 minutes** of work + 20 minutes of discussion afterwards
- Screen sharing, your usual setup (Cursor / Claude Code / whatever)
- First ~15 minutes — we discuss your approach: you ask questions, walk us through how you plan to solve it. We play product / stakeholders
- Then you build what you designed
- Questions are welcome at any time — ask as many as you need

## The problem

Some of our users make deposits via UPI, but the automatic payment matching on our side fails — their money gets "stuck". Right now the ops team has no way to help them: there's no flow for the user to confirm the transaction themselves.

**What we need:** a standalone web page on a separate domain. An operator sends the user there via a chat link. On this page, the user:

- provides their User ID (so we know whose transaction we're confirming)
- attaches a screenshot of the UPI payment
- sees what's happening with their request
- gets the final status

**V1:** client-side only, no backend integration. The file is sent to a predefined endpoint (mock it however you like).

The rest — **your decisions:** how many screens, what flow, what states, what to show at each step, what edge cases to handle, how it all looks. We're here as stakeholders — ask whatever you need.

## Technical constraints

- Empty Vite repo (`React + TS`), no UI library pre-installed — bring whatever you want
- Dark theme (our brand is fintech, we look serious)
- Mobile-first: users come in from a phone
- 90 minutes — scope it yourself, decide what to ship

## How we evaluate

The main thing is the **process**, not the final pixel. We look at:

- What questions you ask before you start coding
- How you decompose the task and set priorities
- How you work with AI: how you give it context, verify its output, push back when you disagree
- What you notice on your own (edge cases, UX moments, product risks), and what you miss
- What you ship in 90 minutes vs what you cut and why

**Work the way you normally work.** Google things, read docs, argue with the agent, rewrite — all fine.

## Running it

```bash
npm install
npm run dev
# open localhost:5173
```
