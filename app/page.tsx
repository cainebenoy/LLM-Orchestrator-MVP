'use client';

import { useState, useEffect } from 'react';
import { Send, Moon, Sun, Loader2, Menu, X, Clock, Trash2, RefreshCcw, Layers, CheckCircle2, MessageSquare, Flame } from 'lucide-react';
import { useHistory, OrchestrationRun } from '@/lib/hooks/useHistory';
import ResultsView from '@/components/ResultsView';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  
  // Results state
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [mode, setMode] = useState<string>('');
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRedditMode, setIsRedditMode] = useState(false);
  
  // History and Sidebar state
  const { history, saveRun, deleteRun, clearHistory } = useHistory();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check system preference on mount
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const loadPastRun = (run: any) => {
    setPrompt(run.prompt);
    setMode(run.mode);
    setResults(run.results);
    setSummary(run.summary);
    setReason(run.reason);
    setIsRedditMode(run.mode === 'reddit');
    setMessages([
      { role: 'user', content: run.prompt },
      { role: 'assistant', content: run.summary || 'Completed' }
    ]);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false); // Close sidebar on mobile after selection
    }
  };

  const resetChat = () => {
    setPrompt('');
    setResults([]);
    setSummary(null);
    setMode('');
    setReason(null);
    setMessages([]);
    setError(null);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleRun = async () => {
    if (!prompt.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResults([]);
    setSummary(null);
    setMode('');
    setReason(null);

    const userMessage = { role: 'user' as const, content: prompt.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    // Clear input box immediately for next chat turn
    setPrompt('');

    let currentResults: any[] = [];
    let currentSummary = '';
    let currentMode = '';
    let currentReason = '';
    
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, isRedditMode }),
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch results from the Orchestrator.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('Stream reader failed to initialize.');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        
        // Save the last element (incomplete line) back into buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line || !line.startsWith('data: ')) continue;

          try {
            const parsed = JSON.parse(line.slice(6));

            switch (parsed.type) {
              case 'info':
                setMode(parsed.mode || 'compare');
                setReason(parsed.reason || null);
                currentMode = parsed.mode || 'compare';
                currentReason = parsed.reason || null;

                // Pre-populate card placeholders with loaders so layout is instant
                if (currentMode === 'compare') {
                  const placeholders = [
                    { source: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', text: '', isLoading: true },
                    { source: 'gpt-4o', label: 'ChatGPT 4o', text: '', isLoading: true },
                    { source: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', text: '', isLoading: true },
                    { source: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (via Groq)', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                } else if (currentMode === 'reddit') {
                  const placeholders = [
                    { source: 'reddit', label: 'Reddit Search & Sentiment', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                } else if (currentMode === 'research') {
                  const placeholders = [
                    { source: 'research', label: 'Live Research Report', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                }
                break;

              case 'token':
                if (parsed.model === 'summary') {
                  currentSummary += parsed.text;
                  setSummary(currentSummary);
                } else {
                  currentResults = currentResults.map(r => {
                    if (r.source === parsed.model) {
                      return { ...r, text: r.text + parsed.text, isLoading: false };
                    }
                    return r;
                  });
                  setResults(currentResults);
                }
                break;

              case 'completed':
                // Check if result is already in the list
                const exists = currentResults.some(r => r.source === parsed.model);
                if (exists) {
                  currentResults = currentResults.map(r => {
                    if (r.source === parsed.model) {
                      return { ...r, ...parsed.result, isLoading: false };
                    }
                    return r;
                  });
                } else {
                  currentResults.push({ ...parsed.result, isLoading: false });
                }
                setResults(currentResults);
                break;

              case 'error':
                if (parsed.model === 'summary') {
                  currentSummary = `Summary generation failed: ${parsed.error}`;
                  setSummary(currentSummary);
                } else {
                  currentResults = currentResults.map(r => {
                    if (r.source === parsed.model) {
                      return { ...r, error: parsed.error, isLoading: false };
                    }
                    return r;
                  });
                  setResults(currentResults);
                }
                break;

              case 'summary_completed':
                currentSummary = parsed.summary;
                setSummary(parsed.summary);
                break;

              case 'status':
                // Handle intermediate status flags (optional, log for now)
                console.log(`[Stream Status]: ${parsed.status}`);
                break;
            }
          } catch (err) {
            console.error('Failed to parse SSE payload:', err, line);
          }
        }
      }

      // Save complete run to history using active prompt text
      saveRun({
        prompt: userMessage.content,
        mode: currentMode || 'compare',
        results: currentResults.map(({ isLoading, ...rest }) => rest), // Clean loading flags
        summary: currentSummary || null,
        reason: currentReason || null,
      });

      // Append assistant's comparison answer to history for next turns
      const assistantMessage = { 
        role: 'assistant' as const, 
        content: currentSummary || 'Orchestration complete.' 
      };
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors duration-300 font-sans relative overflow-hidden">
      
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-blue-500/10 to-transparent dark:from-blue-500/5 blur-3xl -z-10 pointer-events-none" />
      
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-sm transition-colors duration-300 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-600 dark:text-zinc-400"
              title="History"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-600 dark:text-blue-500" />
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">
                Orchestrator MVP
              </h1>
            </div>
          </div>
          <button 
            onClick={toggleDarkMode}
            className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-zinc-400" /> : <Moon className="w-5 h-5 text-zinc-500" />}
          </button>
        </div>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsSidebarOpen(false)} 
          />
          <div className="relative w-80 max-w-[80vw] bg-white dark:bg-zinc-900 h-full shadow-2xl border-r border-zinc-200 dark:border-zinc-800 flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Recent Runs
              </h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {history.length === 0 ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
                  No history yet. Run a prompt to save it here.
                </div>
              ) : (
                history.map((run) => (
                  <div key={run.id} className="group relative bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer" onClick={() => loadPastRun(run)}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">{run.mode}</span>
                      <span className="text-[10px] text-zinc-400">{new Date(run.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">{run.prompt}</p>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteRun(run.id); }}
                      className="absolute bottom-2 right-2 p-1.5 bg-white dark:bg-zinc-700 rounded-lg shadow-sm text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            {history.length > 0 && (
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                <button onClick={clearHistory} className="w-full py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                  Clear History
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-grow w-full max-w-5xl mx-auto p-6 pt-12 flex flex-col items-center">
        
        {/* Welcome Text (if no results yet) */}
        {results.length === 0 && !isLoading && !error && (
          <div className="text-center mb-12 max-w-2xl animate-fade-in">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-zinc-800 dark:text-zinc-100">
              Intelligence at Scale
            </h2>
            <p className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400">
              Ask a complex question to compare models instantly, or use keywords like "latest" or a URL to trigger live web research.
            </p>
          </div>
        )}

        {/* Unified Chatbox */}
        <div className={`w-full max-w-3xl transition-all duration-700 ease-out ${results.length > 0 || error ? 'mb-8' : 'scale-105 transform-gpu mt-12'}`}>
          <div className="relative bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-blue-900/5 dark:shadow-black/50 border border-zinc-200/80 dark:border-zinc-800/80 p-2 group focus-within:ring-4 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 transition-all">
            <textarea
              className="w-full bg-transparent resize-none outline-none p-4 min-h-[120px] text-lg placeholder:text-zinc-400 dark:placeholder:text-zinc-500 disabled:opacity-50"
              placeholder="Enter your prompt, a topic to research, or a URL to analyze..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              rows={4}
            />
            {/* Action Row */}
            <div className="flex justify-between items-center mt-3 p-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsRedditMode(!isRedditMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-305 ${
                    isRedditMode
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-sm shadow-orange-500/5'
                      : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                  title="Search Reddit discussions specifically"
                >
                  <Flame className={`w-3.5 h-3.5 ${isRedditMode ? 'text-orange-500 animate-pulse' : ''}`} />
                  Reddit Search
                </button>
                
                {/* New Chat / Reset conversation */}
                {(messages.length > 0 || results.length > 0) && (
                  <button
                    onClick={resetChat}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-zinc-100 dark:bg-zinc-805 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-all"
                    title="Start a new chat topic"
                  >
                    <RefreshCcw className="w-3 h-3 text-zinc-400" />
                    New Chat
                  </button>
                )}

                <div className="hidden sm:flex text-xs text-zinc-400 font-medium gap-4 border-l border-zinc-200 dark:border-zinc-800 pl-4">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Parallel</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Multi-LLM</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {results.length > 0 && (
                  <button
                    onClick={handleRun}
                    disabled={isLoading || !prompt.trim()}
                    className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    title="Regenerate"
                  >
                    <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <button
                  onClick={handleRun}
                  disabled={isLoading || !prompt.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95 shadow-md shadow-blue-600/20"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && !isLoading && (
          <div className="w-full max-w-3xl p-4 mb-8 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-2xl animate-fade-in flex flex-col items-center text-center">
            <span className="font-semibold block mb-1">System Notice</span>
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-zinc-500 dark:text-zinc-400 animate-pulse">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="font-medium text-lg">Orchestrating AI models...</p>
          </div>
        )}

        {/* Results View */}
        {results.length > 0 && (
          <ResultsView 
            mode={mode} 
            summary={summary}
            reason={reason}
            results={results} 
          />
        )}
        
      </main>

      {/* Footer */}
      <footer className="w-full py-8 border-t border-zinc-200 dark:border-zinc-850 bg-white/20 dark:bg-zinc-900/10 text-center mt-12 transition-all">
        <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 tracking-wide uppercase">
          Orchestrator MVP • Built by <span className="font-semibold text-zinc-600 dark:text-zinc-300">Caine</span>
        </p>
      </footer>
    </div>
  );
}
