# Jew Knows

OSINT, News, and Important World Announcements.

Website source only: the reader experience and the server code needed for RSS publishing, attribution, search, comments, ads, streaming, polls, market data, email briefs, and evidence-linked intelligence. The local management desk, its source and launchers are excluded. Live data, credentials and configuration exports are excluded.

The owner's desktop console stays on their own computer and manages the hosted website through authenticated owner-only APIs. Those APIs and the authenticated connection bridge are necessary website services; their presence does not give readers management access. Hosted `/admin` returns 404.

Requires Node.js 22.13 or later. Install with `npm run install:ci`; build with `npm run build`. Copy `.openai/hosting.example.json` to `.openai/hosting.json` for your own deployment bindings. Configure trusted authentication, Cloudflare D1/R2 resources, and runtime secrets separately. Provider variable names are in `.env.example`; never commit real values. Set `PRIVATE_UPDATER=false` and a secret `MAINTENANCE_TOKEN` before a public deployment.

GitHub stores this source. GitHub Pages alone cannot run its server, database or background updater. The existing hosted publication continues operating separately; pushing here does not migrate or deploy it.
