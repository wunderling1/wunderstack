import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LtiSessionKeeper } from "@/components/lti-session-keeper";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rollenspel",
  description: "Oefen een gesprek met een AI-gesprekspartner.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body className="antialiased bg-page text-text">
        <LtiSessionKeeper />
        {children}
      </body>
    </html>
  );
}
