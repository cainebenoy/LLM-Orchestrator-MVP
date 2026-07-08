'use client';

import { useState, useEffect } from 'react';
import { useHistory } from '@/lib/hooks/useHistory';
import { useTheme } from 'next-themes';
import ResultsView from '@/components/ResultsView';
import { ResultNode } from '@/lib/types';
import { OrchestrationRun } from '@/lib/hooks/useHistory';

export default function Home() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  
  // Results state
  const [results, setResults] = useState<ResultNode[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [mode, setMode] = useState<string>('');
  const [reason, setReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<string>('default');
  
  // History and Sidebar state
  const { history, saveRun, deleteRun, clearHistory } = useHistory();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Micro-interactions and side effects
  useEffect(() => {
    // Add micro-interaction to buttons dynamically (similar to mockup script)
    const handleBtnClick = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      target.classList.add('scale-[0.98]');
      setTimeout(() => target.classList.remove('scale-[0.98]'), 100);
    };
    
    document.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', handleBtnClick as EventListener);
    });

    return () => {
      document.querySelectorAll('button').forEach(btn => {
        btn.removeEventListener('click', handleBtnClick as EventListener);
      });
    };
  }, [results, isLoading, history]);

  const loadPastRun = (run: OrchestrationRun) => {
    setPrompt(run.prompt);
    setMode(run.mode);
    setResults(run.results);
    setSummary(run.summary);
    setReason(run.reason);
    setFocusMode(run.mode || 'default');
    setMessages([
      { role: 'user', content: run.prompt },
      { role: 'assistant', content: run.summary || 'Completed' }
    ]);
    if (window.innerWidth < 768) {
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
    setFocusMode('default');
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

    let currentResults: ResultNode[] = [];
    let currentSummary = '';
    let currentMode = '';
    let currentReason: string | null = null;
    
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, focusMode }),
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
            const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;

            switch (parsed.type) {
              case 'info':
                setMode(typeof parsed.mode === 'string' ? parsed.mode : 'compare');
                setReason(typeof parsed.reason === 'string' ? parsed.reason : null);
                currentMode = typeof parsed.mode === 'string' ? parsed.mode : 'compare';
                currentReason = typeof parsed.reason === 'string' ? parsed.reason : null;

                // Pre-populate card placeholders with loaders so layout is instant
                if (currentMode === 'compare') {
                  const placeholders: ResultNode[] = [
                    { source: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', text: '', isLoading: true },
                    { source: 'gpt-4o', label: 'ChatGPT 4o', text: '', isLoading: true },
                    { source: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', text: '', isLoading: true },
                    { source: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (via Groq)', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                } else if (currentMode === 'reddit') {
                  const placeholders: ResultNode[] = [
                    { source: 'reddit', label: 'Reddit Search & Sentiment', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                } else if (currentMode === 'github') {
                  const placeholders: ResultNode[] = [
                    { source: 'github', label: 'GitHub Search & Code Analysis', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                } else if (currentMode === 'youtube') {
                  const placeholders: ResultNode[] = [
                    { source: 'youtube', label: 'YouTube Search & Video Review', text: '', isLoading: true }
                  ];
                  setResults(placeholders);
                  currentResults = placeholders;
                } else if (currentMode === 'research') {
                  const placeholders: ResultNode[] = [
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
                      return { ...r, ...(parsed.result as Partial<ResultNode>), isLoading: false };
                    }
                    return r;
                  });
                } else {
                  currentResults.push({ ...(parsed.result as ResultNode), isLoading: false });
                }
                setResults(currentResults);
                break;

              case 'error':
                if (parsed.model === 'summary') {
                  currentSummary = `Summary generation failed: ${parsed.error}`;
                  setSummary(currentSummary);
                } else if (['reddit', 'github', 'youtube', 'reddit-fallback', 'github-fallback', 'youtube-fallback'].includes(parsed.model as string)) {
                  currentSummary = `Search grounding failed: ${parsed.error}`;
                  setSummary(currentSummary);
                  setError(parsed.error ? String(parsed.error) : null);
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
                currentSummary = typeof parsed.summary === 'string' ? parsed.summary : '';
                setSummary(typeof parsed.summary === 'string' ? parsed.summary : '');
                break;

              case 'status':
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
        results: currentResults.map(({ isLoading: _isLoading, ...rest }) => rest), // Clean loading flags
        summary: currentSummary || null,
        reason: currentReason || null,
      });

      // Append assistant's comparison answer to history for next turns
      const assistantMessage = { 
        role: 'assistant' as const, 
        content: currentSummary || 'Orchestration complete.' 
      };
      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (err: unknown) {
      console.error('Request failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* SideNavBar (Drawer on mobile, fixed on desktop) */}
      <aside className={`fixed top-0 h-screen w-64 bg-surface flex flex-col border-r border-outline z-50 transition-all duration-300 ${isSidebarOpen ? 'left-0' : '-left-64'}`}>
        <div className="p-6 flex justify-between items-center md:block border-b border-outline md:border-none">
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tighter">ORCHESTRATOR_V1</h1>
            <p className="font-label-sm text-label-sm text-outline mt-1 uppercase">Session: 0x8F2</p>
          </div>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        </div>
        
        <button onClick={resetChat} className="mx-4 mt-4 mb-6 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-on-primary font-bold block-shadow active-press transition-all">
          <span className="material-symbols-outlined text-[20px]">add_circle</span>
          <span className="font-label-sm text-label-sm uppercase">New Notebook Page</span>
        </button>

        <nav className="flex-1 overflow-y-auto px-4 space-y-2 pb-24 md:pb-0">
          <p className="font-label-sm text-label-sm text-outline px-2 py-4 border-b border-outline-variant mb-2">HISTORY</p>
          
          <div className="space-y-4 pt-6">
            {history.length === 0 ? (
              <p className="px-2 font-label-sm text-label-sm text-outline">No history entries.</p>
            ) : (
              history.map((run) => (
                <div key={run.id} onClick={() => loadPastRun(run)} className="flex items-center justify-between group cursor-pointer px-2">
                  <span className="font-body-md text-on-surface-variant group-hover:text-primary transition-colors truncate max-w-[120px]">{run.prompt.substring(0, 20)}...</span>
                  <div className="dotted-leader hidden sm:block"></div>
                  <span className="font-label-sm text-label-sm text-outline">
                    {new Date(run.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-error opacity-0 group-hover:opacity-100 ml-2" onClick={(e) => { e.stopPropagation(); deleteRun(run.id); }}>delete</span>
                </div>
              ))
            )}
          </div>
          
          {history.length > 0 && (
            <div className="pt-4">
              <button onClick={clearHistory} className="px-2 font-label-sm text-label-sm text-error hover:underline uppercase">Clear History</button>
            </div>
          )}

        </nav>
      </aside>

      {/* TopAppBar */}
      <header className={`fixed top-0 right-0 h-16 bg-surface border-b-2 border-outline z-40 flex justify-between items-center px-4 md:px-8 shadow-[0px_4px_0px_0px_var(--shadow-color)] md:shadow-none md:border-b-2 md:border-border-bold transition-all duration-300 ${isSidebarOpen ? 'left-0 md:left-64' : 'left-0'}`}>
        <div className="flex items-center gap-3 md:gap-6">
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsSidebarOpen(prev => !prev);
            }}
            className="material-symbols-outlined text-primary text-[28px] cursor-pointer flex items-center justify-center p-1 hover:bg-surface-container-low transition-colors rounded relative z-50 pointer-events-auto"
            aria-label="Toggle Navigation Drawer"
          >
            menu
          </button>
          <span className="font-headline-md text-headline-md font-bold uppercase text-primary tracking-tight">ORCHESTRATOR</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="font-label-sm text-[10px] sm:text-xs text-outline uppercase tracking-widest font-bold">
            Built By Caine
          </div>
          <button 
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 rounded-full border border-outline bg-surface-container-low text-on-surface flex items-center justify-center cursor-pointer hover:bg-surface-container-high transition-colors active:scale-95"
            aria-label="Toggle Theme"
          >
            <span className="material-symbols-outlined text-[18px]">
              {mounted && resolvedTheme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className={`mt-16 pt-6 md:pt-12 pb-64 md:pb-48 px-2 md:px-12 min-h-screen relative overflow-x-hidden transition-all duration-300 ${isSidebarOpen ? 'md:ml-64' : 'ml-0'}`}>
        
        {/* Red Margin Line */}
        <div className="absolute top-0 bottom-0 left-[32px] md:left-[48px] w-[2px] bg-error/50 z-[-1] pointer-events-none"></div>

        <div className="max-w-4xl mx-auto space-y-6 md:space-y-12 pl-[56px] pr-4 md:pl-12 md:pr-0">
          
          {/* Welcome State */}
          {results.length === 0 && !isLoading && !error && (
            <div className="text-center mt-10 md:mt-20 mb-12">
              <h2 className="font-headline-lg text-[24px] md:text-headline-lg font-extrabold tracking-tight mb-4 text-on-background uppercase pr-4">
                Intelligence at Scale
              </h2>
              <p className="font-body-md text-body-md text-outline max-w-2xl mx-auto pr-4">
                Ask a complex question to compare models instantly, or use the grounding focus modes below to trigger live web research.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-error-container text-on-error-container border border-error block-shadow p-6 mb-8 flex flex-col items-center text-center mr-2">
              <span className="material-symbols-outlined text-4xl mb-2">warning</span>
              <span className="font-headline-md font-bold block mb-1">System Exception</span>
              <span className="font-code-md text-[12px] md:text-sm">{error}</span>
            </div>
          )}

          {/* Loading State */}
          {isLoading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-outline mr-4">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">autorenew</span>
              <p className="font-label-sm font-bold uppercase tracking-widest text-center">Orchestrating AI models...</p>
            </div>
          )}

          {/* Results View */}
          {results.length > 0 && (
            <div className="pr-2 md:pr-0">
              <ResultsView 
                mode={mode} 
                summary={summary}
                reason={reason}
                results={results} 
                isLoading={isLoading}
              />
            </div>
          )}
          
        </div>
      </main>

      {/* Mobile Drawer Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)} 
          className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Input Area (Bottom Fixed) */}
      <div className={`fixed bottom-20 md:bottom-0 right-0 p-3 md:p-8 flex justify-center pointer-events-none z-40 transition-all duration-300 ${isSidebarOpen ? 'left-0 md:left-64' : 'left-0'}`}>
        <div className="w-full max-w-4xl pointer-events-auto pl-[56px] pr-4 md:px-0">
          <div className={`bg-surface border-2 transition-all duration-300 p-1 ${
            focusMode === 'reddit' 
              ? 'border-[#ff5700] shadow-[4px_4px_0px_0px_#ff5700]' 
              : focusMode === 'github'
              ? 'border-[#24292e] dark:border-[#f0f6fc] shadow-[4px_4px_0px_0px_#24292e] dark:shadow-[4px_4px_0px_0px_#f0f6fc]'
              : focusMode === 'youtube'
              ? 'border-[#ff0000] shadow-[4px_4px_0px_0px_#ff0000]'
              : 'border-border-bold shadow-[4px_4px_0px_0px_var(--shadow-color)]'
          }`}>
            {/* Ruled Paper Texture */}
            <div className="ruled-paper bg-surface p-3 md:p-6 min-h-[100px] md:min-h-[120px] relative">
              <div className="absolute top-2 right-4 hidden md:block">
                <span className="font-label-sm text-label-sm text-outline-variant uppercase">ENTRY_FIELD</span>
              </div>
              <textarea 
                className="w-full bg-transparent border-none focus:ring-0 outline-none font-body-md text-sm md:text-body-md placeholder:text-outline-variant resize-none disabled:opacity-50" 
                placeholder="Enter semantic prompt..." 
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleRun();
                  }
                }}
              ></textarea>
              
              <div className="flex flex-col md:flex-row items-center justify-between mt-2 md:mt-4 gap-3">
                <div className="flex flex-nowrap md:flex-wrap overflow-x-auto w-full md:w-auto gap-2 pb-1 md:pb-0 scrollbar-hide">
                  {[
                    { id: 'default', label: 'Web', activeClass: 'bg-primary text-on-primary border-primary' },
                    { id: 'reddit', label: 'Reddit', activeClass: 'bg-[#ff5700] text-white border-[#ff5700]' },
                    { id: 'github', label: 'GitHub', activeClass: 'bg-[#24292e] text-white border-[#24292e] dark:bg-[#f0f6fc] dark:text-black dark:border-[#f0f6fc]' },
                    { id: 'youtube', label: 'YouTube', activeClass: 'bg-[#ff0000] text-white border-[#ff0000]' }
                  ].map((opt) => (
                    <button 
                      type="button"
                      key={opt.id}
                      onClick={() => setFocusMode(opt.id)}
                      className={`px-3 py-1 border font-label-sm text-[10px] md:text-label-sm whitespace-nowrap transition-colors flex items-center gap-1 ${
                        focusMode === opt.id 
                          ? `${opt.activeClass} block-shadow-sm` 
                          : 'bg-surface-container-low border-outline hover:bg-surface-container-high text-on-surface'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <button 
                    type="button"
                    onClick={handleRun}
                    disabled={isLoading || !prompt.trim()}
                    className="bg-primary text-on-primary w-full md:w-auto px-6 py-2.5 md:py-2 font-headline-md md:font-bold block-shadow active-press uppercase tracking-widest text-sm flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    Run Logic <span className="material-symbols-outlined text-sm hidden md:inline">{isLoading ? 'hourglass_empty' : 'bolt'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BottomNavBar (Mobile Only) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex md:hidden justify-center items-center px-4 h-20 bg-surface border-t-2 border-border-bold shadow-[0px_-4px_0px_0px_var(--shadow-color)] gap-8">
        {/* History (Toggles Drawer) */}
        <a className={`flex flex-col items-center justify-center border border-border-bold p-2 transition-all min-w-[80px] ${isSidebarOpen ? 'bg-primary-container text-on-primary-container shadow-[2px_2px_0px_0px_var(--shadow-color)]' : 'text-on-surface-variant opacity-70'}`} href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsSidebarOpen(prev => !prev); }}>
          <span className="material-symbols-outlined">history</span>
          <span className="font-label-sm text-[10px] uppercase tracking-widest mt-1">History</span>
        </a>
        
        {/* New (Active Action) */}
        <a className="flex flex-col items-center justify-center text-primary active:translate-x-[1px] active:translate-y-[1px] transition-all min-w-[80px]" href="#" onClick={(e) => { e.preventDefault(); resetChat(); }}>
          <span className="material-symbols-outlined">add_box</span>
          <span className="font-label-sm text-[10px] uppercase tracking-widest mt-1 font-bold">New</span>
        </a>
      </nav>
    </>
  );
}

