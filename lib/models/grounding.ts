import { GoogleGenerativeAI } from '@google/generative-ai';
import { callResearchWebhook, cleanErrorMessage, calculateModelCost, estimateTokenCount } from './gateway';
import { GeminiCandidate, GroundingChunk } from '../types';

export type FocusMode = 'default' | 'reddit' | 'github' | 'youtube';

// Generate specific search instructions for Google Search Grounding
function getInstructionForFocus(prompt: string, mode: FocusMode): string {
  switch (mode) {
    case 'reddit':
      return `Perform a live search on Google specifically targeting reddit.com discussions and threads.
Search widely for threads, comment sections, and community opinions related to the topic: "${prompt}".
Summarize the general consensus, differing opinions, sentiment (positive/negative/neutral), and key discussions. Reference specific subreddits (e.g. r/nextjs) or threads when summarizing. Format your response in markdown.`;

    case 'github':
      return `Perform a live search on Google specifically targeting github.com repositories, code files, issues, or READMEs.
Search for libraries, repos, code examples, or implementations related to the topic: "${prompt}".
Summarize repository suggestions, features, active issues, or implementation approaches. Provide clean, copyable code snippets if relevant. Format your response in markdown.`;

    case 'youtube':
      return `Perform a live search on Google specifically targeting youtube.com videos, reviews, and transcripts.
Search widely for video tutorials, critiques, reviews, and breakdowns related to the topic: "${prompt}".
Summarize the key takeaways, tutorials, expert opinions, and reference video titles or transcripts. Format your response in markdown.`;

    default:
      return `Perform a live search on Google related to: "${prompt}".
Summarize the top search results, latest data, facts, and details from the web. Format your response in markdown.`;
  }
}

/**
 * Stream Google Search Grounding queries across different target websites token-by-token.
 */
export async function streamGroundingSearch(
  prompt: string,
  mode: FocusMode,
  onToken: (text: string) => void,
  onComplete: (summaryData: { text: string; citations: string[]; inputTokens: number; outputTokens: number; cost: number }) => void,
  onError: (errorMsg: string) => Promise<void> | void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini')) {
    await onError('GEMINI_API_KEY is missing or invalid in .env.local');
    return;
  }

  const sysPrompt = getInstructionForFocus(prompt, mode);
  let result;
  let modelName = 'gemini-2.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      tools: [{ googleSearch: {} }] as unknown as never
    });
    result = await model.generateContentStream(sysPrompt);
  } catch (error: unknown) {
    console.warn(`[Grounding Stream] Gemini 2.5 Flash failed, trying Gemini 1.5 Flash:`, error);
    modelName = 'gemini-1.5-flash';
    
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        tools: [{ googleSearch: {} }] as unknown as never
      });
      result = await model.generateContentStream(sysPrompt);
    } catch (fallbackError: unknown) {
      console.error('[Grounding Stream] Both Gemini 2.5 and 1.5 models failed:', fallbackError);
      await onError(`Search limits reached: Gemini rate limit hit. (${(fallbackError instanceof Error ? fallbackError.message : String(fallbackError)) || fallbackError})`);
      return;
    }
  }

  try {
    let fullText = '';
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onToken(chunkText);
    }

    const citations: string[] = [];
    const responseData = await result.response as unknown as { candidates?: GeminiCandidate[] };
    const metadata = responseData.candidates?.[0]?.groundingMetadata;
    if (metadata?.groundingChunks) {
      metadata.groundingChunks.forEach((chunk: GroundingChunk) => {
        if (chunk.web?.uri) {
          citations.push(chunk.web.uri);
        }
      });
    }

    const inputTokens = estimateTokenCount(sysPrompt);
    const outputTokens = estimateTokenCount(fullText);
    const cost = calculateModelCost(modelName, inputTokens, outputTokens);

    onComplete({
      text: fullText,
      citations: Array.from(new Set(citations)),
      inputTokens,
      outputTokens,
      cost
    });
  } catch (error: unknown) {
    console.error('[Grounding Stream] Content collection failed:', error);
    await onError((error instanceof Error ? error.message : String(error)) || 'Failed to stream search grounding content.');
  }
}
