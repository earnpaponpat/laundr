"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantChatProps {
  initialMessage?: string;
  isOpen?: boolean;
  inline?: boolean;
}

export function AIAssistantChat({ initialMessage, isOpen: propIsOpen = false, inline = false }: AIAssistantChatProps) {
  const { t, ta, language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(propIsOpen);
  const [enabled, setEnabled] = useState(!inline);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inline) {
      const stored = localStorage.getItem('ai_chat_enabled');
      setEnabled(stored !== 'false');
    }
  }, [inline]);

  useEffect(() => {
    if (initialMessage) {
      setIsOpen(true);
      sendMessage(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], orgId: 'current', language }),
      });

      if (!response.ok) throw new Error('Failed to connect to AI');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let aiContent = "";

      setMessages(prev => [...prev, { role: 'assistant', content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices[0]?.delta?.content || "";
              aiContent += delta;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1].content = aiContent;
                return next;
              });
            } catch { /* partial json */ }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = ta('ai.suggestedQuestions');

  // ── Inline mode ──────────────────────────────────────────────────
  if (inline) {
    if (!enabled) return null;

    return (
      <div className={`w-full rounded-xl bg-white overflow-hidden flex flex-col transition-all duration-300 shadow-sm shadow-slate-200/50 ${isOpen ? 'h-[300px]' : 'h-[52px]'}`}>
        <button
          className="flex items-center justify-between px-5 h-[52px] shrink-0 bg-slate-900 text-white w-full hover:bg-slate-800 transition-colors"
          onClick={() => setIsOpen(v => !v)}
        >
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold">{t('ai.assistantTitle')}</span>
            {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          </div>
          <div className="flex items-center gap-3">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </button>

        {isOpen && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white border border-indigo-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl p-3 text-sm shadow-sm ${
                    m.role === 'user'
                      ? 'bg-slate-700 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && messages.at(-1)?.role === 'user' && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none p-3 shadow-sm flex gap-1">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-3 border-t bg-white shrink-0">
              <Input
                placeholder={t('ai.chatPlaceholder')}
                className="text-sm bg-slate-50 border-slate-200"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
                disabled={loading}
              />
              <Button size="icon" className="bg-slate-900 hover:bg-slate-800 shrink-0" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Floating mode ─────────────────────────────────────────────────
  return (
    <div className={`fixed bottom-4 right-4 w-96 transition-all duration-300 shadow-2xl z-50 overflow-hidden flex flex-col rounded-xl bg-white ${isOpen ? 'h-[500px]' : 'h-[56px]'}`}>
      <button
        className="flex items-center justify-between p-4 bg-slate-900 text-white cursor-pointer select-none shrink-0 w-full hover:bg-slate-800 transition-colors"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-bold">{t('ai.assistantTitle')}</span>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </div>
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-8">
                <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-indigo-600" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700">{t('ai.greeting')}</p>
                  <p className="text-xs text-slate-500">{t('ai.greetingSubtitle')}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full pt-2">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s)} className="text-xs text-left px-3 py-2 rounded-lg border border-indigo-100 hover:bg-indigo-50 hover:text-indigo-700 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${
                  m.role === 'user'
                    ? 'bg-slate-700 text-white rounded-tr-none'
                    : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                }`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                </div>
              </div>
            ))}
            {loading && messages.at(-1)?.role === 'user' && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none p-3 shadow-sm flex gap-1">
                  {[0, 150, 300].map(d => (
                    <div key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t bg-white flex gap-2 shrink-0">
            <Input
              placeholder={t('ai.floatPlaceholder')}
              className="text-sm bg-slate-50 border-slate-200"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
              disabled={loading}
            />
            <Button size="icon" className="bg-slate-900 hover:bg-slate-800 shrink-0" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
