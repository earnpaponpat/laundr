"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import {
  Sparkles, AlertCircle, AlertTriangle, RefreshCw,
  Lightbulb, Zap, TrendingUp, Loader2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface AIInsights {
  summary: string;
  warnings: Array<{ level: "critical" | "warning"; message: string }>;
  recommendations: string[];
  prediction: string;
}

interface AIInsightsPanelProps {
  onRecommendationClick?: (rec: string) => void;
}

const LAST_RESULT_KEY = 'laundr_ai_last_result';
const LAST_ANALYZED_KEY = 'laundr_ai_last_analyzed';

export function AIInsightsPanel({ onRecommendationClick }: AIInsightsPanelProps) {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AIInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(LAST_RESULT_KEY);
      const timestamp = localStorage.getItem(LAST_ANALYZED_KEY);
      if (cached) setData(JSON.parse(cached));
      if (timestamp) setLastAnalyzed(new Date(timestamp));
    } catch {}
  }, []);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) throw new Error("Failed to load AI insights");
      const json = await res.json();
      setData(json);
      const now = new Date();
      setLastAnalyzed(now);
      localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(json));
      localStorage.setItem(LAST_ANALYZED_KEY, now.toISOString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl h-full flex flex-col overflow-hidden shadow-sm shadow-slate-200/50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          {t('ai.insights')}
        </h3>
        <div className="flex items-center gap-2">
          {data && !loading && (
            <button onClick={analyze} className="p-1 text-slate-400 hover:text-slate-600 transition-colors" title={t('actions.refresh')}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('ai.analyzing')}
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full mt-2" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-xs text-red-600 font-medium text-center">{error}</p>
            <button onClick={analyze} className="text-xs text-slate-500 hover:text-slate-700 underline">
              {t('actions.retry')}
            </button>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {lastAnalyzed && (
              <p className="text-[10px] text-slate-400">
                {t('ai.lastAnalyzed')} {formatDistanceToNow(lastAnalyzed, { addSuffix: true })}
              </p>
            )}

            <p className="text-sm text-slate-700 leading-relaxed">{data.summary}</p>

            {data.warnings?.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('ai.warnings')}</h4>
                {data.warnings.map((w, i) => (
                  <div key={i} className={`flex gap-2 items-start p-2.5 rounded-lg border text-xs ${w.level === 'critical' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                    {w.level === 'critical'
                      ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            {data.recommendations?.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('ai.recommendations')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {data.recommendations.map((rec, i) => (
                    <button
                      key={i}
                      onClick={() => onRecommendationClick?.(rec)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-all text-left"
                    >
                      <Lightbulb className="w-3 h-3 text-amber-500 shrink-0" />
                      {rec}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {data.prediction && (
              <div className="bg-slate-900 p-3.5 rounded-xl text-white shadow-sm space-y-1.5 relative overflow-hidden">
                <Zap className="absolute right-[-8px] top-[-8px] w-16 h-16 text-white/5" />
                <div className="flex justify-between items-center relative z-10">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('ai.prediction')}</span>
                  <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <p className="text-xs font-semibold leading-snug relative z-10">{data.prediction}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-6 text-center">
            <Sparkles className="w-10 h-10 text-violet-300 mb-3" />
            <p className="text-xs text-slate-400 mb-4">{t('ai.clickToAnalyze')}</p>
            <button
              onClick={analyze}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-4 py-2 text-sm font-medium w-full flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {t('ai.analyzeNow')}
            </button>
          </div>
        )}
      </div>

      {/* Analyze Now — shown at bottom when results are visible */}
      {!loading && data && (
        <div className="px-4 pb-4 shrink-0">
          <button
            onClick={analyze}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium w-full flex items-center justify-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {t('ai.analyzeNow')}
          </button>
        </div>
      )}
    </div>
  );
}
