# Siftbox Technical Whitepaper

**v2.0.0** | September 2026

An inbox fills up the same way every day: real mail mixed in with junk that
outnumbers it ten to one. Siftbox connects to Gmail directly — web, iOS,
macOS — reads the inbox, scores each message, and clears the junk in one tap.

## What it does

Sign-in with Google grants read/modify access to Gmail (OAuth, scoped to
`gmail.modify`). A Cloudflare Worker backend lists the inbox over the Gmail
API and scores each message before anything is touched: sender/display-name
domain mismatch, generic bulk greeting plus a call to action, urgency
language, an unsubscribe header from a sender nobody recognizes, a reply-to
domain that doesn't match the sender. Two or more signals confirms junk; a
real person or a service the user has an account with is never scored here
regardless of tone.

## Unsubscribing

Most bulk senders already support RFC 8058 one-click unsubscribe —
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` alongside a
`List-Unsubscribe` URL. Siftbox POSTs to it directly; a 2xx/204 confirms it,
no browser required. The message is archived either way once you act on it —
archive, delete, or unsubscribe are each one tap, nothing happens on its own.

## Cross-platform auth

Google blocks OAuth consent screens from loading inside an embedded WebView.
The web app runs a normal confidential-client OAuth flow. The iOS/macOS
wrapper instead intercepts the "Connect Gmail" action, opens the system
browser via `ASWebAuthenticationSession` against a second, public PKCE OAuth
client, exchanges the code directly with Google, and hands the resulting
tokens to the same backend — one shared UI, one shared API, two login paths.

## Where the old skill fits

The original Claude Code skill (`/mail`) still exists for the half of the
job that needs a coding agent, not a mail client: matching an App Store
Connect or GitHub Actions alert to the right project, pulling the real
failure log, and fixing or filing it. Siftbox and `/mail` share the same
spam-scoring rules but run independently.

## Design

- **Nothing moves until you tap it.** Reading and scoring never mutates
  anything; archive/delete/unsubscribe are each an explicit action.
- **No background automation.** No cron, no polling — every read is
  triggered by opening the app.

## License

MIT 2026, Joshua Trommel
