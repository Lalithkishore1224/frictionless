"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-background p-0 shadow-xl animate-slide-up">
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  title,
  description,
  onClose
}: {
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {onClose ? (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-end gap-2 border-t p-5", className)}>
      {children}
    </div>
  );
}
