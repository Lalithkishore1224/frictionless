"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg animate-slide-up",
              t.kind === "error" ? "border-destructive/40" : "border-border"
            )}
          >
            {t.kind === "success" && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            )}
            {t.kind === "error" && (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            {t.kind === "info" && (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            )}
            <p className="text-sm">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
