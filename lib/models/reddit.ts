import { GoogleGenerativeAI } from '@google/generative-ai';
import { estimateTokenCount, calculateModelCost } from './gateway';

/**
 * Searches and summarizes Reddit discussions using Gemini 2.5 Flash's Google Search grounding tool.
 * This completely bypasses Reddit's strict WAF blocks and 403 errors by leveraging Google's index.
 */
export async function summarizeRedditWithSearch(prompt: string): Promise<{
  text: string;
  citations: string[];
  inputTokens: number;
  outputTokens: number;
  cost: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('your-gemini')) {
    throw new Error('GEMINI_API_KEY is missing or invalid in .env.local');
  }

  // Instruct Gemini to target reddit.com search queries
  const sysPrompt = `Perform a live search on Google specifically targeting reddit.com threads and discussions.
Search widely for discussions, opinions, and threads related to the topic: "${prompt}". 
You must do a deep review of the results, examining at least 10-15 different threads, subreddits, and comment sections to capture a comprehensive view.
Summarize the general consensus, differing opinions, sentiment (positive/negative/neutral), and key talking points found in those Reddit threads. 
Reference specific subreddits (e.g., r/nextjs) or threads when summarizing. Focus strictly on Reddit discussions. Format your response in markdown.`;

  let result;
  let modelName = 'gemini-2.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      // Enable Google Search grounding tool (cast to any for TS compiler compliance)
      tools: [{ googleSearch: {} }] as any
    });

    result = await model.generateContent(sysPrompt);
  } catch (error: any) {
    console.warn(`[Reddit] Gemini 2.5 Flash failed, attempting fallback to Gemini 1.5 Flash:`, error);
    modelName = 'gemini-1.5-flash';
    
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        tools: [{ googleSearch: {} }] as any
      });
      
      result = await model.generateContent(sysPrompt);
    } catch (fallbackError: any) {
      console.error('[Reddit] Both Gemini 2.5 and 1.5 models failed:', fallbackError);
      throw new Error(`Reddit search failed: ${error.message || 'API Limit reached'}. Fallback model error: ${fallbackError.message}`);
    }
  }

  try {
    const text = result.response.text();
    
    // Extract live web citations returned by Google Search Grounding
    const citations: string[] = [];
    const metadata = (result.response as any).candidates?.[0]?.groundingMetadata;
    if (metadata?.groundingChunks) {
      metadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri) {
          citations.push(chunk.web.uri);
        }
      });
    }

    const inputTokens = estimateTokenCount(sysPrompt);
    const outputTokens = estimateTokenCount(text);
    const cost = calculateModelCost('gemini-2.5-flash', inputTokens, outputTokens);

    return { 
      text, 
      citations: Array.from(new Set(citations)), // Deduplicate links
      inputTokens, 
      outputTokens, 
      cost 
    };
  } catch (error: any) {
    console.error('[Reddit] Search Grounding failed:', error);
    throw error;
  }
}
