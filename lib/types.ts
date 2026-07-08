export interface Citation {
  title?: string;
  uri: string;
}

export interface ResultNode {
  source: string;
  label: string;
  text: string;
  citations?: string[];
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  isLoading?: boolean;
}

export interface GroundingChunk {
  web?: {
    title: string;
    uri: string;
  };
}

export interface GeminiGroundingMetadata {
  groundingChunks?: GroundingChunk[];
}

export interface GeminiCandidate {
  content: { parts: { text: string }[] };
  groundingMetadata?: GeminiGroundingMetadata;
}
