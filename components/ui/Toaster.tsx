"use client";

import React from "react";
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
}

interface ToasterProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

export function Toaster({ toasts, removeToast }: ToasterProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[10000] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 min-w-[320px] max-w-md p-4 rounded-xl shadow-2xl border animate-in slide-in-from-right-10 fade-in duration-300",
            toast.type === "success" && "bg-white border-emerald-100 text-emerald-900 shadow-emerald-100/50",
            toast.type === "error" && "bg-white border-red-100 text-red-900 shadow-red-100/50",
            toast.type === "info" && "bg-white border-blue-100 text-blue-900 shadow-blue-100/50",
            toast.type === "warning" && "bg-white border-amber-100 text-amber-900 shadow-amber-100/50"
          )}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            {toast.type === "error" && <AlertCircle className="w-5 h-5 text-red-500" />}
            {toast.type === "info" && <Info className="w-5 h-5 text-blue-500" />}
            {toast.type === "warning" && <AlertTriangle className="w-5 h-5 text-amber-500" />}
          </div>

          <div className="flex-1 text-sm font-medium leading-relaxed">
            {toast.message}
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ))}
    </div>
  );
}
