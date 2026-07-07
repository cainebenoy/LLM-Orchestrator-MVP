export type RoutingMode = 'compare' | 'research';

export interface RouteDecision {
  mode: RoutingMode;
  topic: string;
  url: string | null;
  reason: string;
}

// Research signaling keywords
const RESEARCH_KEYWORDS = [
  'latest',
  'current',
  'recent',
  'news',
  'today',
  'who is',
  'what happened',
  'search',
  'look up',
];

// URL extraction regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Decides whether to use 'compare' or 'research' mode based on simple heuristics.
 */
export function decideMode(prompt: string): RouteDecision {
  const normalizedPrompt = prompt.toLowerCase();

  // 1. Check for a URL
  const urlMatch = prompt.match(URL_REGEX);
  if (urlMatch && urlMatch.length > 0) {
    const extractedUrl = urlMatch[0];
    return {
      mode: 'research',
      topic: prompt, // Keep full prompt as topic for context
      url: extractedUrl,
      reason: 'Routed to Research Mode because a URL was detected in the prompt.',
    };
  }

  // 2. Check for research-signaling keywords
  const matchedKeyword = RESEARCH_KEYWORDS.find((keyword) =>
    normalizedPrompt.includes(keyword)
  );
  
  if (matchedKeyword) {
    return {
      mode: 'research',
      topic: prompt,
      url: null,
      reason: `Routed to Research Mode because the prompt contained the time-sensitive or search keyword: "${matchedKeyword}".`,
    };
  }

  // 3. Default to compare mode
  return {
    mode: 'compare',
    topic: prompt,
    url: null,
    reason: 'Routed to Compare Mode to evaluate multiple model responses.',
  };
}
