'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
    <button onClick={handleCopy} className="p-1.5 hover:bg-surface-container-high transition-colors text-outline hover:text-on-surface flex items-center justify-center" title="Copy to clipboard">
      {copied ? <span className="material-symbols-outlined text-[18px] text-[#22c55e]">check</span> : <span className="material-symbols-outlined text-[18px]">content_copy</span>}
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
    <div className="w-full mx-auto flex flex-col gap-8 animate-fade-in pb-12">
      
      {/* Aggregator Pill */}
      <div className="flex justify-center mb-4 px-4 text-center">
        <div className="inline-flex flex-wrap justify-center items-center gap-2 sm:gap-4 bg-surface border border-outline px-4 sm:px-5 py-2.5 sm:py-2 block-shadow-sm font-label-sm text-label-sm font-bold text-on-surface">
          <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-green-600 dark:text-green-400">trending_up</span> TOTAL COST: ₹{totalCost.toFixed(4)}</span>
          <span className="hidden sm:inline w-1 h-1 bg-outline rounded-full" />
          <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-blue-600 dark:text-blue-400">schedule</span> MAX LATENCY: {maxLatency.toFixed(2)}s</span>
        </div>
      </div>

      {/* Primary Summary View */}
      <section className="bg-surface border border-outline block-shadow p-0 overflow-hidden transition-all duration-300">
        <header className="border-b-4 border-double border-outline p-4 flex justify-between items-center bg-surface-container-lowest">
          <h2 className="font-headline-md text-headline-md uppercase tracking-tight flex items-center gap-2 text-on-surface">
            {mode === 'reddit' 
              ? 'Reddit Sentiment Report' 
              : mode === 'github'
              ? 'GitHub Repository Report'
              : mode === 'youtube'
              ? 'YouTube Video Analysis'
              : mode === 'research' 
              ? 'Live Research Report' 
              : 'Synthesized Core Logic'}
          </h2>
          <div className="flex items-center gap-4">
            <span className="font-label-sm text-label-sm text-outline hidden sm:inline-block">
              LOG_REF: #{mode.toUpperCase().substring(0,3)}-{((summary?.length || mode.length) * 17) % 900 + 100}
            </span>
            {summary && <CopyButton text={summary} />}
          </div>
        </header>

        <div className="p-8 space-y-6">
          {summary ? (
            <div className="font-body-md text-body-md leading-relaxed max-w-none prose prose-zinc dark:prose-invert">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          ) : isLoading ? (
            <div className="flex items-center gap-3 text-outline py-4 animate-pulse">
              <span className="material-symbols-outlined animate-spin">autorenew</span>
              <span className="font-label-sm text-label-sm italic uppercase">
                Awaiting active model resolution...
              </span>
            </div>
          ) : (
            <div className="font-label-sm text-label-sm text-outline italic">
              Summary generation disabled or failed. Review individual traces below.
            </div>
          )}
        </div>
        
        {/* Routing Reason */}
        {reason && (
          <div className="px-8 pb-6 font-code-md text-[14px] text-on-surface-variant flex items-center gap-2">
            <span className="font-bold text-on-surface">Router Logic:</span>
            {reason}
          </div>
        )}
        
        {/* Citations (Research or Reddit Mode) */}
        {(mode === 'research' || mode === 'reddit') && results[0]?.citations && results[0].citations.length > 0 && (
          <div className="px-8 py-6 border-t border-outline-variant bg-surface-container-low">
            <h4 className="font-label-sm text-label-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">library_books</span>
              {mode === 'reddit' ? 'SCRAPED REDDIT THREADS' : 'CITED SOURCES'}
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results[0].citations.map((cite, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="font-label-sm text-label-sm text-outline">[{i+1}]</span>
                  <a href={cite} target="_blank" rel="noopener noreferrer" className="font-body-md text-[14px] text-primary hover:underline truncate block">
                    {cite}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <footer className="bg-surface-container-low border-t border-outline-variant p-2 px-4 flex justify-between items-center">
          {/* Expand Toggle */}
          {mode === 'compare' ? (
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 font-label-sm text-label-sm uppercase font-bold text-on-surface-variant hover:text-primary transition-colors"
            >
              {isExpanded ? (
                <><span className="material-symbols-outlined text-[18px]">expand_less</span> HIDE TRACES</>
              ) : (
                <><span className="material-symbols-outlined text-[18px]">expand_more</span> INSPECT TRACES ({results.length})</>
              )}
            </button>
          ) : <div></div>}
          <span className="font-label-sm text-label-sm italic text-outline hidden sm:block">Sheet No. 042-B</span>
        </footer>
      </section>

      {/* Expanded Individual Results */}
      {mode === 'compare' && isExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-slide-down">
          {results.map((result, idx) => {
            // Assign colors dynamically based on index to match design mockup
            const colors = ['text-primary', 'text-secondary', 'text-tertiary', 'text-on-primary-fixed-variant'];
            const accentColorClass = colors[idx % colors.length];

            return (
            <article key={idx} className="bg-surface border border-outline block-shadow p-6 flex flex-col gap-4">
              <div className="flex justify-between items-start border-b border-outline-variant pb-4">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className={`font-headline-md text-headline-md ${accentColorClass} truncate`}>
                    {result.label}
                  </h3>
                  <p className="font-label-sm text-label-sm text-outline mt-1 truncate">
                    ENGINE: {result.source.toUpperCase()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-label-sm text-label-sm text-primary font-bold">
                    LAT: {result.latencyMs ? `${(result.latencyMs / 1000).toFixed(2)}s` : '--'}
                  </p>
                  <p className="font-label-sm text-label-sm text-secondary font-bold">
                    TOK: {result.outputTokens ? result.outputTokens : '--'}
                  </p>
                  <p className="font-label-sm text-label-sm text-tertiary font-bold">
                    CST: {result.cost !== undefined ? `₹${result.cost.toFixed(4)}` : '--'}
                  </p>
                </div>
              </div>

              {result.isLoading ? (
                  <div className="flex flex-col gap-3 flex-grow justify-center items-center py-10 text-outline">
                    <span className="material-symbols-outlined animate-spin text-[32px]">autorenew</span>
                    <span className="font-label-sm text-label-sm uppercase">Streaming Trace...</span>
                  </div>
                ) : result.error ? (
                  <div className="bg-error-container text-on-error-container p-4 border border-error flex-grow font-code-md text-[14px]">
                    {result.error}
                  </div>
                ) : (
                  <div className="bg-surface-container-lowest p-4 border border-outline-variant text-on-surface-variant font-body-md prose prose-zinc dark:prose-invert max-w-none flex-grow overflow-x-auto">
                    <ReactMarkdown>{result.text || ''}</ReactMarkdown>
                  </div>
                )}

              {/* Citations */}
              {result.citations && result.citations.length > 0 && (
                <div className="mt-2 pt-4 border-t border-outline-variant">
                  <h4 className="font-label-sm text-label-sm font-bold text-on-surface mb-2">SOURCES</h4>
                  <ul className="space-y-1">
                    {result.citations.map((cite, i) => (
                      <li key={i}>
                        <a href={cite} target="_blank" rel="noopener noreferrer" className="font-body-md text-[14px] text-primary hover:underline truncate block">
                          {cite}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-auto pt-4 flex justify-between items-center border-t border-dotted border-outline-variant">
                <span className="font-label-sm text-label-sm text-outline">
                  {getRationale(result.source)}
                </span>
                {result.text && <CopyButton text={result.text} />}
              </div>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
