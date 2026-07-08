# LLM Orchestrator MVP - Project Handoff Document

This document serves as a comprehensive overview of the current state of the LLM Orchestrator MVP. It is intended to bring Claude (or any other agent) fully up to speed on the project's architecture, features, and strict technical conventions before beginning the next phase of development (the Malayalam cinema platform integration).

## 1. Project Context & Current State
- **Purpose:** A general-purpose multi-LLM orchestration tool that allows a user to submit a single prompt, route it to multiple models/providers in parallel, and view individual outputs or a synthesized summary.
- **Phase:** The MVP phase is **complete**. The core Gateway logic, Reddit integration, and background webhook handling have been implemented, strictly typed, and verified via Next.js build.
- **Next Steps:** The core infrastructure is now ready to serve as the foundation for the upcoming domain-specific phase (Malayalam cinema project/document/approval schema).

## 2. Architecture & Tech Stack
- **Framework:** Next.js (App Router), React, TypeScript.
- **Styling:** Tailwind CSS (Dark/Light mode support).
- **Core Principle:** Stateless execution (browser session based). 
- **State Management:** Extensive use of custom React hooks (`useHistory`). We explicitly avoid synchronous state updates in `useEffect` during component mount to prevent strict-mode hydration cascading renders. (We wrap initial state loads in `setTimeout` macrotasks).

## 3. Core Features Implemented

### The Model Gateway (`lib/models/gateway.ts`)
The central hub for all model routing. It exports `callModel()` and `callModelsInParallel()`.
- **Parallel Execution:** Uses `Promise.allSettled` so one provider's failure does not block the rest.
- **Metrics:** Tracks token counts (input/output), calculates latency (ms), and estimates cost per provider.
- **Make.com Webhook Truncation Detection:** Implements a strict `try/catch` wrapper around `response.json()`. Since Make.com drops connections abruptly at ~40s (causing a `SyntaxError: Unexpected end of JSON input`), the Gateway specifically catches this and returns a clean truncation error to the UI, avoiding silent client-side hanging.

### Web Mode
- Standard LLM orchestration.
- Supports streaming via Groq, Claude, and Gemini API integrations.

### Reddit Mode (`lib/models/reddit.ts`)
- **Integration:** Uses a direct, unauthenticated fetch against Reddit's `search.json` endpoint (`https://www.reddit.com/search.json?q=...&limit=5`).
- **Processing:** Formats Reddit thread titles, contents, and comments into a pure text context string.
- **Synthesis:** Feeds the raw Reddit context directly into `gemini-2.5-flash` to summarize the threads. It **explicitly avoids** using Google Search Grounding to prevent block-evasion policy violations.

### Research & YouTube Modes
- Handled via external Make.com webhooks that process lengthy tasks (e.g., scraping, transcript extraction) and return JSON results to the Gateway.

### Summary Mode
- Upon receiving multiple parallel outputs, triggers a final call (usually to a stronger model like Llama 3.3 70B via Groq) to synthesize, compare, and highlight discrepancies across the model answers.

## 4. Important Technical Conventions

- **Strict TypeScript (No `any`):** The `@typescript-eslint/no-explicit-any` rule is strictly enforced.
  - API responses and JSON payloads must be parsed as `unknown` or explicitly defined interfaces (e.g., `GeminiCandidate`, `GeminiGroundingMetadata`, `WebhookResult`).
  - Error catching must use `catch (error: unknown)` followed by type narrowing (`error instanceof Error`).
- **ESLint Integrity:** Do not use `// eslint-disable-next-line` or disable global rules in `eslint.config.mjs` to bypass errors. Fix the underlying TypeScript/React Hook issues instead.
- **UI Components:** Found in `components/`, they heavily rely on Lucide React icons, standard Tailwind layout primitives, and handle independent loading states gracefully (a partial failure of one model will still display the successful ones).

## 5. Definition of Done Checklist (Completed)
- [x] User can type a prompt, select 2+ models, and run in parallel.
- [x] Failures are graceful and independent.
- [x] Summary mode produces synthesized comparisons.
- [x] Token counts, latencies, and costs are accurately tracked and displayed.
- [x] Build passes completely with `pnpm run build` (zero TypeScript `any` errors or hook warnings).
