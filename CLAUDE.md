\# Tiloca Development Rules



\## Product context



Tiloca is not a generic lead generation tool.



Tiloca is a territory intelligence system for C\&I photovoltaic scouting.



Core workflow:



territory scan → roof assets → vision analysis → company enrichment → scan review → delivery/export



Current stage:



\- internal operator tool

\- service-first business model

\- not yet full SaaS

\- no auth

\- no billing

\- no public self-service scanner

\- avoid overbuilding until commercially validated



Current commercial direction:



\- Do not position Tiloca as "lead lists"

\- Position Tiloca as territory intelligence / access to a commercial territory

\- Main early offers:

&#x20; - Territory Map Light

&#x20; - Territory Pipeline

&#x20; - Qualified Pipeline only if explicitly requested

\- The app is currently a delivery engine and internal operator tool before becoming a SaaS product



\## Development principles



1\. One feature per session.

2\. Always inspect existing code before editing.

3\. Use read-only exploration before implementation.

4\. Do not introduce new core models unless explicitly approved.

5\. Prefer extending existing Scan, Asset, AssetAnalysis, CompanyMatch, PipelineState and Delivery flow before adding new entities.

6\. No hardcoded API keys.

7\. No production OpenAPI calls unless explicitly confirmed by Ermias.

8\. No UI redesign unless requested.

9\. No auth, billing, SaaS self-service, CRM, or Opportunity model unless explicitly approved.

10\. Every provider-dependent feature needs clear failure/debug output.

11\. Every completed operational change must update RUNBOOK.md, CHANGELOG.md, or KNOWN\_ISSUES.md when relevant.

12\. Prefer small, reversible changes.

13\. Do not make unrelated cleanup changes while implementing a feature.

14\. If there is uncertainty, stop and ask before editing.



\## Provider rules



\### OpenAI Vision



\- Never silently collapse vision failures into `suitability="errore"` without a structured reason.

\- Keep `scripts.vision\_health\_check` working.

\- If scan/vision logic changes, run the vision health check.



\### Google Maps / Satellite



\- No hardcoded Google API keys.

\- Use environment variables only.

\- If image fetch fails, expose clear error/debug info.



\### OpenAPI



\- Sandbox is for technical validation only.

\- Production calls may spend credit.

\- Never run OpenAPI production calls unless explicitly confirmed.

\- Default to low limits for tests.

\- Use diagnostic scripts before real production scans.



\## Required workflow for every new feature



\### Step 1 — Explore only



Before editing code, perform a read-only exploration:



1\. Inspect relevant backend/frontend files.

2\. Explain how the current system handles the workflow.

3\. List the exact files likely to change.

4\. Identify risks, duplication, and existing models/services to reuse.

5\. Suggest 2-3 implementation options.

6\. Recommend the smallest safe option.



Do not edit files during this step.



\### Step 2 — Implementation



Only after the plan is approved:



1\. Implement the smallest safe option.

2\. Do not change unrelated UI.

3\. Do not introduce new models unless approved.

4\. Do not run production OpenAPI calls.

5\. Do not hardcode secrets.

6\. Update docs if workflow or commands change.

7\. Run validation.



\### Step 3 — Validation



Backend changes:



\- Python compile for changed files

\- `python -m scripts.api\_smoke\_test`

\- `python -m scripts.delivery\_smoke\_test`



Vision or scan changes:



\- `python -m scripts.vision\_health\_check`

\- If running a real scan, use `max\_assets <= 2` unless explicitly approved



Frontend changes:



\- `npm run build`



Database changes:



\- Use Alembic migrations only

\- Do not manually mutate schema outside migrations

\- Document migration chain



\### Step 4 — Commit



Before commit:



\- run `git status --short`

\- verify `.env` is not staged

\- verify no API keys are staged

\- commit only after tests/build pass



\## Current known strategic constraints



Do not build these unless explicitly approved:



\- login/auth

\- billing/subscriptions

\- public SaaS self-service

\- CRM features

\- full Opportunity model

\- Vapi/AI calling workflow

\- public marketplace

\- public exclusivity map

\- FullEnrich/Kaspr integrations

\- major frontend redesign



\## Current preferred next product direction



Allowed near-term product work:



1\. Scan Review improvements

2\. Filtered export from Scan Review

3\. Scan Profiles inside the app

4\. Profile-aware ranking

5\. Delivery/map light only after commercial validation

6\. Internal territory lock tracking only if needed



\## Commercial validation rule



Before building client-facing SaaS features, validate with prospects first.



Every new feature should satisfy at least one of these:



\- helps sell this week

\- helps deliver a client already interested

\- reduces repeated manual work already happening

\- prevents a technical failure that already happened



If a feature does not satisfy one of these, do not build it yet.



\## Security rules



\- Never commit `.env`

\- Never commit API keys

\- Never add fallback hardcoded credentials

\- If a key is exposed, treat it as compromised and rotate it

\- Prefer environment variables and documented setup steps



\## Important current commands



Backend:



```powershell

cd C:\\Users\\Ermias\\Documents\\Codex\\2026-05-13\\files-mentioned-by-the-user-tiloca\\tiloca-mvp-backend



.\\.venv\\Scripts\\python.exe -m scripts.api\_smoke\_test

.\\.venv\\Scripts\\python.exe -m scripts.delivery\_smoke\_test

.\\.venv\\Scripts\\python.exe -m scripts.vision\_health\_check

