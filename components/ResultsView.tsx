'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronDown, ChevronUp, Copy, Check, TrendingUp, Clock, Loader2 } from 'lucide-react';

interface ResultCardProps {
  source: string;
  label: string;
  text: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  error?: string;
  citations?: string[];
  isLoading?: boolean;
}

interface ResultsViewProps {
  mode: string;
  summary: string | null;
  reason?: string | null;
  results: ResultCardProps[];
  isLoading?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" title="Copy to clipboard">
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

const RATIONALE_NOTES: Record<string, string> = {
  'gemini-2.5-flash': 'Included for high-speed reasoning and deep context window.',
  'llama-3.3-70b-versatile': 'Included for highly capable general-purpose instruction following.',
  'llama-3.1-8b-instant': 'Included as a fast, lightweight baseline comparison point.',
  'perplexity': 'Included for live web search with cited sources.',
  'gpt': 'Included for general reasoning and writing.',
  'claude': 'Included for nuanced analysis and synthesis.'
};

function getRationale(modelName: string): string {
  const normalized = modelName.toLowerCase();
  for (const [key, note] of Object.entries(RATIONALE_NOTES)) {
    if (normalized.includes(key)) {
      return note;
    }
  }
  return 'Included for general inference capability.';
}

export default function ResultsView({ mode, summary, reason, results, isLoading }: ResultsViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate aggregates
  const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
  const maxLatency = results.reduce((max, r) => Math.max(max, (r.latencyMs || 0)), 0) / 1000;

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 flex flex-col gap-6 animate-fade-in">
      
      {/* Aggregator Pill */}
      <div className="flex justify-center mb-2 px-4 text-center">
        <div className="inline-flex flex-wrap justify-center items-center gap-2 sm:gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:rounded-full px-4 sm:px-5 py-2.5 sm:py-2 shadow-sm text-xs font-medium text-zinc-600 dark:text-zinc-300">
          <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-green-500" /> Total Cost: ₹{totalCost.toFixed(4)}</span>
          <span className="hidden sm:inline w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-500" /> Max Latency: {maxLatency.toFixed(2)}s</span>
        </div>
      </div>

      {/* Primary Summary View */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg overflow-hidden transition-all duration-300">
        <div className="bg-zinc-50 dark:bg-zinc-950 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {mode === 'reddit' 
              ? '🔥 Reddit Sentiment Report' 
              : mode === 'github'
              ? '💻 GitHub Repository Report'
              : mode === 'youtube'
              ? '📺 YouTube Video Analysis'
              : mode === 'research' 
              ? '🔍 Live Research Report' 
              : '✨ Synthesized Summary'}
            <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full border ${
              mode === 'reddit'
                ? 'bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400'
                : mode === 'github'
                ? 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400'
                : mode === 'youtube'
                ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                : mode === 'research'
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
                : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-250 dark:border-zinc-700 text-zinc-650 dark:text-zinc-400'
            }`}>
              {mode === 'reddit' 
                ? 'Reddit Mode' 
                : mode === 'github' 
                ? 'GitHub Mode' 
                : mode === 'youtube' 
                ? 'YouTube Mode' 
                : mode === 'research' 
                ? 'Research Mode' 
                : 'Compare Mode'}
            </span>
          </h2>
          {summary && <CopyButton text={summary} />}
        </div>
        <div className="p-6 prose prose-zinc dark:prose-invert max-w-none">
          {summary ? (
            <ReactMarkdown>{summary}</ReactMarkdown>
          ) : isLoading ? (
            <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400 py-4 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span className="italic text-sm">
                Waiting for active models to finish before generating synthesized comparison...
              </span>
            </div>
          ) : (
            <div className="text-zinc-500 dark:text-zinc-400 italic">
              Summary generation is currently disabled or failed. Please view individual responses below.
            </div>
          )}
        </div>
        
        {/* Routing Reason */}
        {reason && (
          <div className="px-6 pb-4 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800">
            <span className="font-semibold text-zinc-600 dark:text-zinc-300">Router Logic:</span>
            {reason}
          </div>
        )}
        
        {/* Citations (Research or Reddit Mode) */}
        {(mode === 'research' || mode === 'reddit') && results[0]?.citations && results[0].citations.length > 0 && (
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
            <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
              {mode === 'reddit' ? '🔥 Scraped Reddit Threads' : '🔗 Cited Sources'}
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {results[0].citations.map((cite, i) => (
                <li key={i}>
                  <a href={cite} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block">
                    {cite}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Expand Toggle */}
        {mode === 'compare' && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-center gap-2 py-4 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-600 dark:text-zinc-400 transition-colors"
          >
            {isExpanded ? (
              <><ChevronUp className="w-4 h-4" /> Hide individual responses</>
            ) : (
              <><ChevronDown className="w-4 h-4" /> See individual responses ({results.length})</>
            )}
          </button>
        )}
      </div>

      {/* Expanded Individual Results */}
      {mode === 'compare' && isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-down">
          {results.map((result, idx) => (
            <div key={idx} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-md flex flex-col h-full transition-all duration-300 hover:shadow-xl min-w-0">
              <div className="mb-4 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                    {result.label}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 italic">
                    {getRationale(result.source)}
                  </p>
                </div>
                {result.text && <CopyButton text={result.text} />}
              </div>

              {result.isLoading ? (
                 <div className="flex flex-col gap-2 flex-grow justify-center items-center py-10 text-zinc-400 dark:text-zinc-500 text-sm">
                   <Loader2 className="w-6 h-6 animate-spin text-zinc-400 dark:text-zinc-500" />
                   <span>Streaming response...</span>
                 </div>
               ) : result.error ? (
                 <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-900/50 flex-grow">
                   {result.error}
                 </div>
               ) : (
                 <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none flex-grow overflow-x-auto">
                   <ReactMarkdown>{result.text || ''}</ReactMarkdown>
                 </div>
               )}

              {/* Citations */}
              {result.citations && result.citations.length > 0 && (
                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Sources</h4>
                  <ul className="space-y-1">
                    {result.citations.map((cite, i) => (
                      <li key={i}>
                        <a href={cite} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block">
                          {cite}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metadata */}
              <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-3 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <div>
                  <span className="block font-medium">Latency</span>
                  {result.latencyMs ? `${(result.latencyMs / 1000).toFixed(2)}s` : '--'}
                </div>
                <div>
                  <span className="block font-medium">Cost</span>
                  {result.cost !== undefined ? `₹${result.cost.toFixed(4)}` : '--'}
                </div>
                <div>
                  <span className="block font-medium">Tokens</span>
                  {result.outputTokens ? `${result.outputTokens} out` : '--'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
