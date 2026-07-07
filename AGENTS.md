# MVP Kickoff Brief — General Multi-LLM Orchestration Prototype
## Hand this to Claude Code as CLAUDE.md for this project

This is the first deliverable: a general-purpose (not cinema-specific) prototype demonstrating multi-model orchestration. A user submits one prompt, it's sent to multiple LLMs in parallel, and the user can view all individual outputs or a synthesized summary comparing them. This needs to look polished and work reliably for a live presentation, but the scope is intentionally small — no auth complexity, no domain features, no long-term data architecture decisions locked in yet. Domain-specific (Malayalam cinema) features come later, as a separate, later-scoped phase, once this concept is validated.

---

## 0. How to Use This Document

The content below (Sections 1–6) is identical regardless of tool — only the filename and setup step change.

**If using Google Antigravity:**
1. New project folder, save this entire document as `AGENTS.md` in the project root (Antigravity's equivalent of Claude Code's `CLAUDE.md` — read automatically at the start of every agent session).
2. Open the folder in Antigravity IDE.
3. Start a new conversation and send: *"Read AGENTS.md fully. Propose a step-by-step plan for the full MVP scope in Section 3, and wait for my approval before writing code. We'll go section by section, and I'll test after each one."*
4. Antigravity does **not** retain in-session coaching between conversations — corrections you make mid-session are forgotten once you close the window unless written down. If you find yourself repeating a correction, add it to `.agents/rules/conventions.md` in the project (e.g., "always use Tailwind for styling," "never hardcode API keys") so future sessions follow it automatically.
5. Antigravity produces a written plan (`implementation_plan.md`) before executing — read it properly before approving, the same discipline as reviewing Claude Code's proposed plan.

**If using GitHub Copilot (agent mode in VS Code):**
1. New project folder, save this entire document as `.github/copilot-instructions.md` (the path Copilot reads automatically as repo-wide custom instructions).
2. Open the folder in VS Code, open Copilot Chat, switch to **Agent mode** (not plain chat/edit mode — agent mode is what plans and executes multi-step changes like this).
3. First message: *"Read the custom instructions fully. Propose a step-by-step plan for the full MVP scope in Section 3, and wait for my approval before writing code. We'll go section by section, and I'll test after each one."*
4. Copilot's agent mode tends to be less autonomous end-to-end than Antigravity — expect to approve file edits and terminal commands more frequently, and be ready to redirect it if it drifts from the section-by-section approach.

Either tool is fine for this scope — it's small and well-specified. Use whichever you already have working access to; don't spend this week comparing them.

---

## 1. Project Context

This is a demo-ready prototype of a multi-LLM orchestration tool, built to present internally to a production company evaluating whether to fund a larger, domain-specific platform (for Malayalam film production — not part of this scope). This first version must be general-purpose: no film-industry features, no domain-specific prompts or workflows. It should look like a clean, professional product, not a rough experiment, because it will be shown live in a meeting.

Build for speed and clarity over long-term architecture perfection — but don't write throwaway code either. Core pieces (the model gateway logic especially) should be solid enough to carry forward into the larger platform later, since this is genuinely the foundation of that future system, just without the domain layer on top yet.

---

## 2. Tech Stack

- **Framework**: Next.js (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Persistence**: none required for v1 — keep prompt/response state in the browser session (React state) unless Section 3.5 below is included, in which case use Supabase (Postgres) for lightweight history storage
- **Hosting**: Vercel
- **Package manager**: pnpm
- **No auth required for v1** — assume single-user/internal-demo use for now; do not build a login system yet

Keep dependencies minimal. Don't introduce a database, job queue, or background worker system unless Section 3.5 is explicitly included — for a synchronous demo tool, direct parallel API calls without a queue are simpler and sufficient.

---

## 3. MVP Scope — Build These, In Order

### 3.1 Prompt Input & Model Selection
- A clean text area for the user's prompt (support reasonably long prompts, not just a single line)
- A model selection UI: checkboxes or toggle chips for available models, grouped by provider — for example:
  - Anthropic: Claude (pick a current model)
  - OpenAI: GPT (pick a current model)
  - Google: Gemini (pick a current model)
- At least 3 models selectable simultaneously, with sensible defaults pre-checked
- A "Run" button, disabled until at least one model is selected and the prompt isn't empty

### 3.2 Model Gateway (Core Logic)
Build `lib/models/gateway.ts`:
- A function `callModel({ provider, model, prompt })` that calls the correct provider's API and returns `{ text, inputTokens, outputTokens, latencyMs, cost, error }`
- A function `callModelsInParallel(prompts)` using `Promise.allSettled` so one provider failing doesn't break the others — each result should clearly indicate success or failure independently
- API keys read from environment variables (`.env.local`), never hardcoded; document required variables in `.env.example`
- A small internal pricing table (per-model input/output cost per token) so cost can be estimated and shown in the UI — this is a nice, tangible detail to show in the demo ("here's what that just cost")

### 3.3 Results View — "View All" Mode
- After running, display each model's response in its own clearly labeled card (model name/provider visible), showing: the output text, latency, token counts, and estimated cost
- Handle partial failures gracefully — if one model errors out, show a clear error state on that card while the others still display normally
- Support basic formatting in the output (markdown rendering) since model responses are often markdown-formatted

### 3.4 Results View — "Summary" Mode
- A toggle or tab to switch from "View All" to "View Summary"
- Summary mode makes one additional model call: send all the individual outputs to a chosen model (default: your best/primary model) with a prompt instructing it to synthesize a comparison — noting where the models agree, where they meaningfully differ, and which response seems strongest and why
- Display this synthesized summary clearly, with an option to still expand and see the individual full outputs below it if the user wants to verify

### 3.5 (Optional, include only if time allows before the meeting) Lightweight History
- If time permits: a simple Supabase table logging each run (prompt, models used, responses, costs, timestamp) and a basic history page listing past runs
- This is a "nice to have" for the demo (shows the product remembers past work) but should not delay the core 3.1–3.4 flow — build this last, and skip it entirely if the timeline is tight

### 3.6 Polish Pass Before Presenting
- Loading states while models are running (this can take several seconds — show something better than a frozen screen; a simple per-model "thinking" indicator that resolves independently as each model finishes is a good demo moment)
- Clear empty state before a first run
- Basic responsive layout so it looks fine on a laptop screen during the meeting
- A short, clear page title/header so it reads as a real product, not a bare test page

---

## 4. What This MVP Explicitly Does NOT Include

- No authentication/login
- No cinema-specific or any other domain-specific features, prompts, or terminology
- No multi-user roles or organizations
- No background job queue (direct synchronous calls are fine at this scale)
- No billing/cost limits enforcement (just cost *display*, not enforcement)
- No fine-tuning or custom model routing logic yet — model selection is manual (user picks which models to run), not automatic task-based routing. Intelligent routing is a future phase once there's a specific use case to route for.

If Claude Code suggests building any of these now, decline and stay focused on Section 3.

---

## 5. Definition of Done

- [ ] User can type a prompt, select 2+ models, click Run, and see all results appear (independently, as each finishes)
- [ ] If one model fails (bad API key, rate limit, etc.), the others still display correctly and the failure is shown clearly, not silently
- [ ] Summary mode produces a real synthesized comparison, not just a concatenation of the outputs
- [ ] Cost and latency are shown per model and look accurate
- [ ] The whole flow works smoothly enough to run live in front of people without errors or awkward waiting
- [ ] You have reviewed the gateway code specifically (Section 3.2) closely, since this logic will carry forward into the larger platform later

---

## 6. Note for After the Meeting

Everything in Section 3.2 (the model gateway) is designed to be reusable as-is when you move toward the larger Malayalam cinema platform — it's the same core piece described in the earlier Phase 0 foundation plan. Once this MVP is validated and the company wants to proceed, the next step is layering the domain-specific project/document/approval schema (from the earlier cinema platform plan) on top of this same gateway, rather than starting over.