import { useState, useEffect } from 'react';
import { ResultNode } from '../types';

export interface OrchestrationRun {
  id: string;
  timestamp: number;
  prompt: string;
  mode: string;
  reason: string | null;
  summary: string | null;
  results: ResultNode[];
}

export function useHistory() {
  const [history, setHistory] = useState<OrchestrationRun[]>([]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orchestrator_history');
      if (saved) {
        try { 
          const data = JSON.parse(saved);
          setTimeout(() => setHistory(data), 0);
        } catch (e) { console.error('Failed to parse history:', e); }
      }
    }
  }, []);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const saveRun = (run: Omit<OrchestrationRun, 'id' | 'timestamp'>) => {
    const newRun: OrchestrationRun = {
      ...run,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    
    setHistory(prev => {
      // Keep only the last 15 runs to prevent localStorage bloat
      const updated = [newRun, ...prev].slice(0, 15);
      localStorage.setItem('orchestrator_history', JSON.stringify(updated));
      return updated;
    });
    return newRun.id;
  };

  const deleteRun = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(r => r.id !== id);
      localStorage.setItem('orchestrator_history', JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('orchestrator_history');
  };

  return { history, isLoaded, saveRun, deleteRun, clearHistory };
}
