'use client';

import React from 'react';
import { Send, AlertCircle } from 'lucide-react';

interface PromptInputProps {
  prompt: string;
  onChange: (val: string) => void;
  onRun: () => void;
  disabled: boolean;
  isLoading: boolean;
}

export default function PromptInput({
  prompt,
  onChange,
  onRun,
  disabled,
  isLoading,
}: PromptInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !isLoading) {
      onRun();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!disabled && !isLoading) {
        onRun();
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/40 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all duration-200">
        <textarea
          rows={6}
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What would you like to ask the models? (Ctrl + Enter to run)"
          className="w-full resize-none border-0 bg-transparent p-4 text-zinc-100 placeholder-zinc-500 focus:ring-0 focus:outline-none sm:text-sm"
        />

        <div className="absolute bottom-3 right-3 flex items-center space-x-2">
          {prompt.trim().length > 0 && (
            <span className="text-xs text-zinc-500 mr-2 select-none">
              {prompt.length} chars
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-zinc-500 text-xs">
          {disabled && prompt.trim().length === 0 && (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-500/80" />
              <span>Prompt cannot be empty</span>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled || isLoading}
          className={`flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 ${
            disabled || isLoading
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer active:scale-95'
          }`}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-indigo-200 border-t-transparent rounded-full animate-spin" />
              <span>Orchestrating...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Run Comparison</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
