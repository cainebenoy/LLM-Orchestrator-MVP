import { GoogleGenerativeAI } from '@google/generative-ai';
import { estimateTokenCount, calculateModelCost } from './gateway';

async function fetchRedditJSON(query: string): Promise<{ text: string, citations: string[] }> {
  // Use a custom User-Agent to comply with Reddit's unauthenticated API guidelines
  const headers = {
    'User-Agent': 'LLM-Orchestrator-MVP/1.0.0 (Local Testing) /u/developer'
  };
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;
  
  const response = await fetch(url, { headers, next: { revalidate: 60 } }); // small cache
  if (!response.ok) {
    if (response.status === 429) throw new Error('Reddit API Rate Limited (HTTP 429). Please try again later.');
    if (response.status === 403) throw new Error('Reddit API Blocked (HTTP 403). Server IP is blocked from unauthenticated access.');
    throw new Error(`Reddit API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const children = data?.data?.children || [];
  
  let combinedText = `--- REDDIT SEARCH RESULTS FOR: "${query}" ---\n\n`;
  const citations: string[] = [];
  
  for (const child of children) {
    const post = child.data;
    if (!post) continue;
    combinedText += `Title: ${post.title}\n`;
    combinedText += `Subreddit: r/${post.subreddit}\n`;
    combinedText += `Upvotes: ${post.ups} | Comments: ${post.num_comments}\n`;
    if (post.selftext) {
      combinedText += `Content: ${post.selftext.substring(0, 500)}...\n`;
    }
    combinedText += `URL: https://reddit.com${post.permalink}\n\n`;
    citations.push(`https://reddit.com${post.permalink}`);
  }
  
  return { text: combinedText, citations: Array.from(new Set(citations)) };
}

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

  // 1. Fetch from Reddit natively
  const { text: redditContext, citations } = await fetchRedditJSON(prompt);
  
  // 2. Synthesize using standard LLM
  const sysPrompt = `You are a Reddit research assistant. I will provide you with raw JSON-extracted post data from a Reddit search query for "${prompt}". 
Please do a deep review of the results, summarize the general consensus, differing opinions, sentiment (positive/negative/neutral), and key talking points found in those Reddit threads. 
Reference specific subreddits (e.g., r/nextjs) or threads when summarizing. Format your response in markdown.

RAW REDDIT DATA:
${redditContext}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = 'gemini-2.5-flash'; // no grounding needed
  
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(sysPrompt);
    const responseText = result.response.text();
    
    const inputTokens = estimateTokenCount(sysPrompt);
    const outputTokens = estimateTokenCount(responseText);
    const cost = calculateModelCost(modelName, inputTokens, outputTokens);
    
    return {
      text: responseText,
      citations,
      inputTokens,
      outputTokens,
      cost
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`LLM Synthesis Failed: ${msg}`);
  }
}
