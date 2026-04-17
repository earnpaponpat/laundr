"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Brain, TrendingUp, AlertTriangle, Lightbulb,
  ShieldAlert, Loader2, Sparkles, Send, User, Bot,
  RefreshCw, ChevronRight
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InsightResult {
  summary: string;
  warnings: { level: "critical" | "warning"; message: string }[];
  recommendations: string[];
  prediction: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIInsightsPage() {
  const { t, language } = useLanguage();

  // Insights state
  const [insight, setInsight] = useState<InsightResult | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Run Analysis ────────────────────────────────────────────────────────────

  async function runAnalysis() {
    setAnalysing(true);
    setInsightError(null);
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setInsight(data);
    } catch (e: any) {
      setInsightError(e.message);
    } finally {
      setAnalysing(false);
    }
  }

  // ── Chat (streaming SSE) ─────────────────────────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);

    // Placeholder assistant message that we'll fill in
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          language,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const chunk = line.slice(6).trim();
          if (chunk === "[DONE]") break;
          try {
            const parsed = JSON.parse(chunk);
            const delta = parsed.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: updated[updated.length - 1].content + delta,
                };
                return updated;
              });
            }
          } catch {
            // non-JSON SSE line, skip
          }
        }
      }
    } catch (e: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: language === "th" ? `เกิดข้อผิดพลาด: ${e.message}` : `Error: ${e.message}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  // ── Suggested prompts ────────────────────────────────────────────────────────

  const suggestedPrompts = language === "th"
    ? [
        "ลูกค้าคนไหนทำผ้าหายมากที่สุด?",
        "รายการไหนใกล้หมดอายุการใช้งานบ้าง?",
        "วิเคราะห์สาเหตุที่ต้องซักซ้ำบ่อยที่สุด",
      ]
    : [
        "Which client has the highest loss rate?",
        "What items are close to end-of-life?",
        "Analyse the most common rewash reasons",
      ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">THE LAUNDERING AI</h1>
            <p className="text-xs text-slate-400 font-medium">Powered by Gemini 2.5 Flash via OpenRouter</p>
          </div>
        </div>
        <Button
          onClick={runAnalysis}
          disabled={analysing}
          className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-bold"
        >
          {analysing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {language === "th" ? "กำลังวิเคราะห์..." : "Analysing..."}</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> {language === "th" ? "วิเคราะห์ตอนนี้" : "Run Analysis"}</>
          )}
        </Button>
      </div>

      {/* ── Empty / Error / Results ── */}
      {insightError && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-600 font-medium">
          {insightError}
        </div>
      )}

      {!insight && !analysing && !insightError && (
        <Card className="p-12 border-dashed border-2 border-slate-200 bg-slate-50/50 flex flex-col items-center gap-4 text-center shadow-none">
          <Brain className="w-12 h-12 text-slate-200" />
          <div>
            <p className="font-bold text-slate-500">
              {language === "th" ? "กดปุ่ม \"วิเคราะห์ตอนนี้\" เพื่อดูข้อมูลเชิงลึก" : "Press \"Run Analysis\" to generate operational insights"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {language === "th" ? "AI จะดึงข้อมูลจริงจากระบบและวิเคราะห์ให้" : "AI will pull live data from your system and analyse it"}
            </p>
          </div>
        </Card>
      )}

      {analysing && (
        <Card className="p-12 flex flex-col items-center gap-4 text-center shadow-sm border-indigo-100 bg-indigo-50/30">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
          <p className="font-bold text-indigo-600">
            {language === "th" ? "กำลังดึงข้อมูลและวิเคราะห์..." : "Pulling live data and analysing..."}
          </p>
        </Card>
      )}

      {insight && !analysing && (
        <div className="space-y-6">

          {/* Summary + Re-run */}
          <Card className="p-6 bg-indigo-50/40 border-indigo-100 shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <Brain className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-slate-700 leading-relaxed">{insight.summary}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0 text-slate-400 hover:text-indigo-600" onClick={runAnalysis}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </Card>

          {/* Warnings */}
          {insight.warnings.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {insight.warnings.map((w, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${
                    w.level === "critical"
                      ? "bg-red-50 border-red-100 text-red-700"
                      : "bg-amber-50 border-amber-100 text-amber-700"
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium">{w.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations + Prediction */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 shadow-sm border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                  {language === "th" ? "คำแนะนำ" : "Recommendations"}
                </h3>
              </div>
              <ul className="space-y-2">
                {insight.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <ChevronRight className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-6 shadow-sm border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                  {language === "th" ? "คาดการณ์" : "Prediction"}
                </h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{insight.prediction}</p>
            </Card>
          </div>
        </div>
      )}

      {/* ── Chat ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
          <Bot className="w-4 h-4 text-indigo-500" />
          <h3 className="font-bold text-slate-800 text-sm">
            {language === "th" ? "ถามข้อมูลเพิ่มเติม" : "Ask a Question"}
          </h3>
        </div>

        {/* Messages */}
        <div className="h-[320px] overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                {language === "th" ? "คำถามที่แนะนำ" : "Suggested prompts"}
              </p>
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt); }}
                  className="w-full text-left text-sm text-slate-600 px-4 py-2.5 rounded-lg border border-slate-100 hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-700 transition-colors italic"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-600" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-slate-100 text-slate-700 rounded-tl-sm"
                }`}
              >
                {msg.content || (
                  <span className="flex gap-1 items-center text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {language === "th" ? "กำลังคิด..." : "Thinking..."}
                  </span>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                </div>
              )}
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={language === "th" ? "ถามเกี่ยวกับข้อมูลในระบบ..." : "Ask about your operations..."}
            className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
            disabled={streaming}
          />
          <Button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
