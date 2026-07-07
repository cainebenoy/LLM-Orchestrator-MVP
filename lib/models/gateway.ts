import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export interface WebhookResult {
  source: string;
  label: string;
  text: string;
  citations?: string[];
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  error?: string;
}

export interface WebhookResponse {
  results: WebhookResult[];
}

// Helper to count approximate tokens (1 token ≈ 4 characters)
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.round(text.length / 4);
}

// Calculate actual API costs based on model rates
export function calculateModelCost(source: string, inputTokens: number, outputTokens: number): number {
  const norm = source.toLowerCase();
  let inputRate = 0; // per token
  let outputRate = 0; // per token

  if (norm.includes('claude-3-5-sonnet') || norm.includes('claude')) {
    inputRate = 3.0 / 1_000_000;
    outputRate = 15.0 / 1_000_000;
  } else if (norm.includes('gpt-4o') || norm.includes('chatgpt')) {
    inputRate = 2.50 / 1_000_000;
    outputRate = 10.00 / 1_000_000;
  } else if (norm.includes('gemini-2.5-flash') || norm.includes('gemini')) {
    inputRate = 0.075 / 1_000_000;
    outputRate = 0.30 / 1_000_000;
  } else if (norm.includes('llama-3.3-70b') || norm.includes('groq') || norm.includes('llama')) {
    inputRate = 0.59 / 1_000_000;
    outputRate = 0.79 / 1_000_000;
  } else if (norm.includes('perplexity')) {
    inputRate = 5.00 / 1_000_000;
    outputRate = 15.00 / 1_000_000;
  } else {
    // Default general LLM fallback
    inputRate = 1.0 / 1_000_000;
    outputRate = 3.0 / 1_000_000;
  }

  const usdCost = (inputTokens * inputRate) + (outputTokens * outputRate);
  return usdCost * 94.0; // Convert to Indian Rupees (INR) at 1 USD = 94.0 INR
}

/**
 * Parses and cleans technical error messages into short, user-friendly notices.
 * Bypasses long stacks or terminal-like raw trace lines.
 */
export function cleanErrorMessage(error: any, modelLabel: string): string {
  if (!error) return `${modelLabel}: An unknown system error occurred.`;
  const msg = typeof error === 'string' ? error : (error.message || String(error));
  const msgLower = msg.toLowerCase();

  if (msgLower.includes('quota') || msgLower.includes('429') || msgLower.includes('rate limit') || msgLower.includes('resource_exhausted')) {
    return `${modelLabel} limit reached: API quota or rate limit exceeded. Please wait a moment.`;
  }
  if (msgLower.includes('api key') || msgLower.includes('api_key') || msgLower.includes('invalid api key') || msgLower.includes('key not active')) {
    return `${modelLabel}: Invalid or inactive API key. Check .env.local configuration.`;
  }
  if (msgLower.includes('403') || msgLower.includes('forbidden') || msgLower.includes('permission')) {
    return `${modelLabel}: Access blocked (HTTP 403). Check API credentials.`;
  }
  if (msgLower.includes('timeout') || msgLower.includes('timed out') || msgLower.includes('abort')) {
    return `${modelLabel} timeout: Request took too long to respond.`;
  }
  if (msgLower.includes('insufficient_quota') || msgLower.includes('credit') || msgLower.includes('billing')) {
    return `${modelLabel}: Billing quota finished or credit expired on this account.`;
  }
  if (msgLower.includes('not found') || msgLower.includes('404')) {
    return `${modelLabel}: Webhook or endpoint not found (HTTP 404).`;
  }
  if (msgLower.includes('unexpected token') || msgLower.includes('accepted')) {
    return `${modelLabel}: Webhook scenario not active or didn't return valid JSON.`;
  }

  // Truncate long technical stack trace / network messages
  if (msg.length > 120 || msg.includes('at ') || msg.includes('FetchError') || msg.includes('__webpack_require__')) {
    return `${modelLabel}: Service temporarily unavailable or returned a bad response.`;
  }

  return msg;
}

// Fetch with a timeout using AbortController
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Call the Make.com Comparison Webhook
 */
export async function callCompareWebhook(
  prompt: string,
  selectedModels: string[]
): Promise<WebhookResponse> {
  const url = process.env.MAKE_COMPARE_WEBHOOK_URL || process.env.MAKE_WEBHOOK_URL;
  if (!url) {
    throw new Error('MAKE_COMPARE_WEBHOOK_URL is not configured in environment variables');
  }

  const startTime = Date.now();
  console.log(`[Gateway] Initiating Compare Webhook call to: ${url}`);
  console.log(`[Gateway] Payload:`, { prompt, models: selectedModels });

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          models: selectedModels,
        }),
      },
      60000 // 60s timeout
    );

    const elapsedMs = Date.now() - startTime;

    if (!response.ok) {
      console.error(`[Gateway] Compare Webhook returned HTTP error status: ${response.status}`);
      if (response.status === 429) {
        throw new Error('Rate limit hit (429). Please try again in a moment.');
      }
      throw new Error(`Server returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Gateway] Compare Webhook Raw Response:`, JSON.stringify(data, null, 2));

    if (!data || !Array.isArray(data.results)) {
      throw new Error('Malformed response from webhook: expected { results: [...] } structure');
    }

    // Process and add metrics (latency, token estimates, cost)
    const processedResults = data.results.map((result: any) => {
      const inputEst = estimateTokenCount(prompt);
      const outputEst = estimateTokenCount(result.text || '');

      return {
        source: result.source || 'unknown',
        label: result.label || 'Model (via Make)',
        text: result.text || '',
        citations: Array.isArray(result.citations) ? result.citations : undefined,
        latencyMs: result.latencyMs || elapsedMs, // Use webhook total time if model specific is not given
        inputTokens: result.inputTokens || inputEst,
        outputTokens: result.outputTokens || outputEst,
        cost: calculateModelCost(result.source || 'gpt-4o', result.inputTokens || inputEst, result.outputTokens || outputEst),
      };
    });

    return { results: processedResults };
  } catch (error: any) {
    console.error(`[Gateway] Compare Webhook error:`, error);
    throw error;
  }
}

/**
 * Call the Make.com Research Webhook
 */
export async function callResearchWebhook(
  topic: string,
  urlPath?: string
): Promise<WebhookResponse> {
  const url = process.env.MAKE_RESEARCH_WEBHOOK_URL;
  if (!url) {
    throw new Error('MAKE_RESEARCH_WEBHOOK_URL is not configured in environment variables');
  }

  const startTime = Date.now();
  const requestBody = {
    topic,
    url: urlPath || null,
  };

  console.log(`[Gateway] Initiating Research Webhook call to: ${url}`);
  console.log(`[Gateway] Payload:`, requestBody);

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
      60000 // 60s timeout
    );

    const elapsedMs = Date.now() - startTime;

    if (!response.ok) {
      console.error(`[Gateway] Research Webhook returned HTTP error status: ${response.status}`);
      if (response.status === 429) {
        throw new Error('Rate limit hit (429). Please try again in a moment.');
      }
      throw new Error(`Server returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Gateway] Research Webhook Raw Response:`, JSON.stringify(data, null, 2));

    if (!data || !Array.isArray(data.results)) {
      throw new Error('Malformed response from research webhook: expected { results: [...] } structure');
    }

    const processedResults = data.results.map((result: any) => {
      const inputEst = estimateTokenCount(topic + (urlPath || ''));
      const outputEst = estimateTokenCount(result.text || '');

      return {
        source: result.source || 'unknown',
        label: result.label || 'Research (via Make)',
        text: result.text || '',
        citations: Array.isArray(result.citations) ? result.citations : undefined,
        latencyMs: result.latencyMs || elapsedMs,
        inputTokens: result.inputTokens || inputEst,
        outputTokens: result.outputTokens || outputEst,
        cost: calculateModelCost(result.source || 'perplexity', result.inputTokens || inputEst, result.outputTokens || outputEst),
      };
    });

    return { results: processedResults };
  } catch (error: any) {
    console.error(`[Gateway] Research Webhook error:`, error);
    throw error;
  }
}

/**
 * Call Gemini directly using Google Generative AI SDK
 */
export async function callGeminiDirect(prompt: string): Promise<WebhookResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini')) {
    return {
      source: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      text: '',
      error: 'GEMINI_API_KEY is missing or invalid in .env.local',
      latencyMs: 0
    };
  }

  const startTime = Date.now();
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const elapsedMs = Date.now() - startTime;
    const inputTokens = estimateTokenCount(prompt);
    const outputTokens = estimateTokenCount(text);
    
    return {
      source: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      text,
      latencyMs: elapsedMs,
      inputTokens,
      outputTokens,
      cost: calculateModelCost('gemini-2.5-flash', inputTokens, outputTokens)
    };
  } catch (error: any) {
    console.error('[Gateway] Gemini direct error:', error);
    return {
      source: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      text: '',
      error: cleanErrorMessage(error, 'Gemini 2.5 Flash'),
      latencyMs: Date.now() - startTime
    };
  }
}

/**
 * Call Groq directly using OpenAI SDK wrapper
 */
export async function callGroqDirect(prompt: string): Promise<WebhookResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('your-groq')) {
    return {
      source: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B (via Groq)',
      text: '',
      error: 'GROQ_API_KEY is missing or invalid in .env.local',
      latencyMs: 0
    };
  }

  const startTime = Date.now();
  try {
    const groq = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
    });

    const text = completion.choices[0]?.message?.content || '';
    const elapsedMs = Date.now() - startTime;

    const promptTokens = completion.usage?.prompt_tokens || estimateTokenCount(prompt);
    const completionTokens = completion.usage?.completion_tokens || estimateTokenCount(text);

    return {
      source: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B (via Groq)',
      text,
      latencyMs: elapsedMs,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cost: calculateModelCost('llama-3.3-70b-versatile', promptTokens, completionTokens)
    };
  } catch (error: any) {
    console.error('[Gateway] Groq direct error:', error);
    return {
      source: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B (via Groq)',
      text: '',
      error: cleanErrorMessage(error, 'Llama 3.3 70B'),
      latencyMs: Date.now() - startTime
    };
  }
}

/**
 * Synthesize a final summary from multiple model responses using Gemini.
 */
export async function synthesizeSummary(prompt: string, results: WebhookResult[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini')) {
    return 'Summary generation failed: GEMINI_API_KEY is missing or invalid in .env.local';
  }
  
  if (!results || results.length === 0) return 'No results to summarize.';

  let context = `Original Prompt: "${prompt}"\n\n`;
  results.forEach(r => {
    // Only include successful responses in the summary
    if (!r.error && r.text) {
      context += `--- Model: ${r.label} ---\n${r.text}\n\n`;
    }
  });

  const sysPrompt = `You are an expert AI orchestrator. You are given an original user prompt and the independent responses from multiple different AI models.
Your task is to synthesize a comparison. Note where the models agree, where they meaningfully differ, and explicitly state which response seems strongest and why. Keep your summary concise, objective, and format it in markdown.

Here are the responses:
${context}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(sysPrompt);
    return result.response.text();
  } catch (error: any) {
    console.error('[Gateway] Gemini synthesis failed, attempting fallback to Groq/Llama:', error);
    
    // Check if Groq key exists for fallback
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey || groqKey.includes('your-groq')) {
      return `Summary generation failed (Gemini limits reached: ${error.message || 'Quota/API Error'}). Fallback to Groq failed because GROQ_API_KEY is not configured in .env.local.`;
    }

    try {
      const groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: sysPrompt }],
        model: 'llama-3.3-70b-versatile',
      });

      const fallbackText = completion.choices[0]?.message?.content || '';
      return `*(Note: Summarized via Llama 3.3 70B due to Gemini API limit)*\n\n${fallbackText}`;
    } catch (groqError: any) {
      console.error('[Gateway] Fallback to Groq also failed:', groqError);
      return `Summary generation failed. Gemini limit reached and Groq fallback errored: ${groqError.message || groqError}`;
    }
  }
}

/**
 * Stream Gemini directly, emitting tokens as they arrive, and calculating pricing.
 */
export async function streamGeminiDirect(
  prompt: string,
  onToken: (text: string) => void,
  onComplete: (result: WebhookResult) => void,
  onError: (errorMsg: string) => void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini')) {
    onError('GEMINI_API_KEY is missing or invalid in .env.local');
    return;
  }

  const startTime = Date.now();
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContentStream(prompt);
    
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onToken(chunkText);
    }
    
    const elapsedMs = Date.now() - startTime;
    const inputTokens = estimateTokenCount(prompt);
    const outputTokens = estimateTokenCount(fullText);
    const cost = calculateModelCost('gemini-2.5-flash', inputTokens, outputTokens);

    onComplete({
      source: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      text: fullText,
      latencyMs: elapsedMs,
      inputTokens,
      outputTokens,
      cost
    });
  } catch (error: any) {
    console.error('[Gateway Stream] Gemini direct error:', error);
    onError(cleanErrorMessage(error, 'Gemini 2.5 Flash'));
  }
}

/**
 * Stream Groq directly, emitting tokens as they arrive, and calculating pricing.
 */
export async function streamGroqDirect(
  prompt: string,
  onToken: (text: string) => void,
  onComplete: (result: WebhookResult) => void,
  onError: (errorMsg: string) => void
): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes('your-groq')) {
    onError('GROQ_API_KEY is missing or invalid in .env.local');
    return;
  }

  const startTime = Date.now();
  try {
    const groq = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    const stream = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const chunkText = chunk.choices[0]?.delta?.content || '';
      if (chunkText) {
        fullText += chunkText;
        onToken(chunkText);
      }
    }

    const elapsedMs = Date.now() - startTime;
    const inputTokens = estimateTokenCount(prompt);
    const outputTokens = estimateTokenCount(fullText);
    const cost = calculateModelCost('llama-3.3-70b-versatile', inputTokens, outputTokens);

    onComplete({
      source: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B (via Groq)',
      text: fullText,
      latencyMs: elapsedMs,
      inputTokens,
      outputTokens,
      cost
    });
  } catch (error: any) {
    console.error('[Gateway Stream] Groq direct error:', error);
    onError(cleanErrorMessage(error, 'Llama 3.3 70B'));
  }
}

/**
 * Stream the Synthesized Summary from multiple model responses.
 */
export async function streamSynthesizeSummary(
  prompt: string,
  results: WebhookResult[],
  onToken: (text: string) => void,
  onComplete: (summaryText: string) => void,
  onError: (errorMsg: string) => void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini')) {
    onError('Summary generation failed: GEMINI_API_KEY is missing.');
    return;
  }

  if (!results || results.length === 0) {
    onComplete('No results to summarize.');
    return;
  }

  let context = `Original Prompt: "${prompt}"\n\n`;
  results.forEach(r => {
    if (!r.error && r.text) {
      context += `--- Model: ${r.label} ---\n${r.text}\n\n`;
    }
  });

  const sysPrompt = `You are an expert AI orchestrator. You are given an original user prompt and the independent responses from multiple different AI models.
Your task is to synthesize a comparison. Note where the models agree, where they meaningfully differ, and explicitly state which response seems strongest and why. Keep your summary concise, objective, and format it in markdown.

Here are the responses:
${context}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContentStream(sysPrompt);
    
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onToken(chunkText);
    }
    onComplete(fullText);
  } catch (error: any) {
    console.error('[Gateway Stream] Gemini synthesis failed, trying Groq fallback:', error);
    
    // Check if Groq key exists for fallback
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey || groqKey.includes('your-groq')) {
      onError(`Summary limits reached. Fallback to Groq failed because GROQ_API_KEY is not configured.`);
      return;
    }

    try {
      const groq = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const stream = await groq.chat.completions.create({
        messages: [{ role: 'user', content: sysPrompt }],
        model: 'llama-3.3-70b-versatile',
        stream: true,
      });

      onToken('*(Note: Summarized via Llama 3.3 70B due to Gemini API limit)*\n\n');
      let fullText = '*(Note: Summarized via Llama 3.3 70B due to Gemini API limit)*\n\n';

      for await (const chunk of stream) {
        const chunkText = chunk.choices[0]?.delta?.content || '';
        if (chunkText) {
          fullText += chunkText;
          onToken(chunkText);
        }
      }
      onComplete(fullText);
    } catch (groqError: any) {
      console.error('[Gateway Stream] Fallback to Groq also failed:', groqError);
      onError(`Summary failed. Gemini limits reached and Groq fallback errored: ${groqError.message || groqError}`);
    }
  }
}
