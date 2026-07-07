import { NextResponse } from 'next/server';
import { decideMode } from '@/lib/models/router';
import { 
  callCompareWebhook, 
  callResearchWebhook, 
  callGeminiDirect, 
  callGroqDirect,
  synthesizeSummary
} from '@/lib/models/gateway';
import { summarizeRedditWithSearch } from '@/lib/models/reddit';

// Default models to run in compare mode via Make.com (e.g. Claude + ChatGPT)
const DEFAULT_MAKE_MODELS = ['claude-3-5-sonnet', 'gpt-4o'];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, isRedditMode } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 1. Reddit Search & Scraping Mode Check (Google Search Grounding)
    if (isRedditMode) {
      const startTime = Date.now();
      try {
        const summaryData = await summarizeRedditWithSearch(prompt);
        const elapsedMs = Date.now() - startTime;

        const results = [{
          source: 'reddit',
          label: 'Reddit Search & Sentiment',
          text: summaryData.text,
          citations: summaryData.citations,
          latencyMs: elapsedMs,
          inputTokens: summaryData.inputTokens,
          outputTokens: summaryData.outputTokens,
          cost: summaryData.cost
        }];

        return NextResponse.json({
          mode: 'reddit',
          topic: prompt,
          reason: 'Reddit Search Mode manually enabled (using Google Search Grounding).',
          results,
          summary: summaryData.text
        });
      } catch (err: any) {
        console.error('[API/Ask] Reddit mode error:', err);
        return NextResponse.json({ error: err.message || 'Reddit search failed' }, { status: 500 });
      }
    }

    // 2. Intelligent Routing (Default Paths)
    const decision = decideMode(prompt);
    let finalResults: any[] = [];

    // 2. Invoke appropriate APIs
    if (decision.mode === 'compare') {
      // Call Make Webhook + Direct APIs in parallel
      const promises = [
        callCompareWebhook(decision.topic, DEFAULT_MAKE_MODELS),
        callGeminiDirect(decision.topic),
        callGroqDirect(decision.topic)
      ];

      const settled = await Promise.allSettled(promises);
      
      // Extract webhook results
      const webhookRes = settled[0];
      if (webhookRes.status === 'fulfilled') {
        const val = webhookRes.value as any;
        finalResults.push(...(val.results || []));
      } else {
        console.error('Make Webhook failed in Compare mode', webhookRes.reason);
      }

      // Extract Gemini result
      const geminiRes = settled[1];
      if (geminiRes.status === 'fulfilled') {
        finalResults.push(geminiRes.value);
      }

      // Extract Groq result
      const groqRes = settled[2];
      if (groqRes.status === 'fulfilled') {
        finalResults.push(groqRes.value);
      }

    } else {
      // Research Mode (just Make Webhook)
      const webhookResponse = await callResearchWebhook(decision.topic, decision.url || undefined);
      finalResults = webhookResponse.results;
    }

    // 3. Synthesize Summary (only in Compare Mode)
    let summary = null;
    if (decision.mode === 'compare' && finalResults.length > 0) {
      summary = await synthesizeSummary(decision.topic, finalResults);
    } else if (decision.mode === 'research' && finalResults.length > 0) {
      // In research mode, the webhook response text is the research report
      summary = finalResults[0].text;
    }

    // 4. Return unified response to frontend
    return NextResponse.json({
      mode: decision.mode,
      topic: decision.topic,
      extractedUrl: decision.url,
      reason: decision.reason,
      results: finalResults,
      summary: summary, 
    });
  } catch (error: any) {
    console.error('[API/Ask] Route handler error:', error);
    
    let status = 500;
    let errorMessage = error.message || 'Request failed, please try again.';

    if (errorMessage.includes('timed out')) {
      status = 504;
      errorMessage = 'Make.com webhook request timed out. Please try again.';
    } else if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      status = 429;
      errorMessage = 'Rate limit hit (429). Please try again in a moment.';
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
