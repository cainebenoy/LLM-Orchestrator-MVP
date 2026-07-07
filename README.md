# Multi-LLM Orchestrator MVP

A general-purpose, high-performance LLM Orchestrator prototype. This dashboard allows you to submit a single prompt, routes it intelligently to appropriate execution paths, queries multiple models in parallel, and presents a synthesized comparison report.

## 🚀 Key Features

*   **Intelligent Auto-Routing**: Analyzes prompts using fast heuristics to route them between **Compare Mode** (multi-model evaluation) and **Research Mode** (summarizing topics or extracting data from URLs).
*   **Hybrid API Gateway**:
    *   **Compare Webhook (Make.com)**: Runs Claude 3.5 Sonnet and GPT-4o in parallel.
    *   **Direct SDKs**: Bypasses webhook limits to run Gemini 2.5 Flash and Llama 3.3 70B (via Groq) directly from the server.
*   **Synthesized Summaries**: Consolidates responses from all models and asks Gemini 2.5 Flash to generate a detailed comparison (where they agree, where they differ, and which is strongest).
*   **Reddit Search & Sentiment Mode**: Toggle dedicated Reddit search to query `reddit.com` discussions utilizing Google Search Grounding to bypass strict WAF blocks and 403 errors, returning cited threads and community analysis.
*   **Cost & Latency Tracker**: Aggregates and displays exact orchestration costs in **Indian Rupees (INR)** based on live token counts and calculates total execution latency.
*   **LocalStorage Run History**: Cache previous searches locally in the browser to reload past runs instantly from a slide-out drawer.
*   **Typewriter UI & Copy Utilities**: Copy markdown outputs with a single click, choose between light/dark mode, and enjoy a fully responsive interface.

---

## 🛠️ Tech Stack

*   **Framework**: Next.js 16 (App Router)
*   **Styling**: Tailwind CSS v4 (incorporating `@tailwindcss/typography` plugin)
*   **SDKs**: `@google/generative-ai` (Gemini), `openai` (Groq SDK wrapper)
*   **Package Manager**: `pnpm`
*   **Deployment**: Production-ready for Vercel

---

## 🔑 Environment Variables Setup

Create a `.env.local` file in the root directory (based on `.env.example`) and configure your API keys and webhooks:

```env
# Make.com webhooks
MAKE_COMPARE_WEBHOOK_URL="https://hook.eu1.make.com/..."
MAKE_RESEARCH_WEBHOOK_URL="https://hook.eu1.make.com/..."

# Direct LLM SDK Keys (No credit card required for free tiers)
GEMINI_API_KEY="your-gemini-key"
GROQ_API_KEY="your-groq-key"
```

*Note: `.env.local` is listed in `.gitignore` and will never be committed to repository branches.*

---

## ⚙️ Running Locally

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```
2.  **Start development server**:
    ```bash
    pnpm run dev
    ```
3.  Open [http://localhost:3000](http://localhost:3000) (or `3001` if `3000` is occupied).

4.  **Production build test**:
    ```bash
    pnpm run build
    ```

---

## ☁️ Make.com Integration & Webhook Schemas

### 1. Webhook Payload Sent by Next.js
```json
{
  "prompt": "Write a short poem about a server error.",
  "models": ["claude-3-5-sonnet", "gpt-4o"]
}
```

### 2. Expected Webhook Response Body (JSON)
To ensure Next.js parses the Make.com response correctly, add a **Webhook Response** module in Make, configure custom headers with `Content-Type: application/json`, and use the following body:

```json
{
  "results": [
    {
      "source": "gpt-4o",
      "label": "ChatGPT 4o",
      "text": "{{escapeJSON(1.text)}}"
    },
    {
      "source": "claude-3-5-sonnet",
      "label": "Claude 3.5 Sonnet",
      "text": "{{escapeJSON(2.text)}}"
    }
  ]
}
```
*Note: Always wrap output texts in `escapeJSON(...)` in Make.com to prevent raw newlines or quotes from breaking the JSON payload.*

---

## 🛡️ Robust Failures & Fallbacks

*   **API Resilience**: Direct API calls (Gemini/Groq) and Webhook requests are fired in parallel using `Promise.allSettled`. If one provider is down or rate-limited, the others will still display successfully.
*   **Automatic Summarizer Fallback**: If Gemini 2.5 Flash hits a quota limit while generating a Synthesized Summary, the gateway intercepts the error and routes the prompt automatically to **Llama 3.3 70B (via Groq)** to build the summary, adding a small notice tag at the top.
