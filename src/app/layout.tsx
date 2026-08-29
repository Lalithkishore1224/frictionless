import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Servelless — One-Click App Marketplace",
  description:
    "Zero-friction cloud hosting for utility micro-apps. Launch, authorize, done."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <ToastProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl px-4 pb-16">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
