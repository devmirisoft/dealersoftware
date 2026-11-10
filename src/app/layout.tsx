import type { Metadata } from "next";
import "./globals.css";

import ReactQueryProvider from "@/app/providers/ReactQueryproviders";
import DealerTermsGate from "@/components/terms/DealerTermsGate";
import DealerPasswordGate from "@/components/password/DealerPasswordGate";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toast";
import AgentWidget from "@/components/agent/AgentWidget";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Omsons",
  description: "Omsons Germany",
  icons: {
    icon: "/Mountain%20Code%20App%20Emblem.png",
    shortcut: "/Mountain%20Code%20App%20Emblem.png",
    apple: "/Mountain%20Code%20App%20Emblem.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" className={cn("font-sans", geist.variable)}>
      {/* Extensions such as ColorZilla stamp attributes on <body> before hydration. */}
      <body className="antialiased" suppressHydrationWarning>
        <ReactQueryProvider>
          <Toaster limit={5}>
            <DealerTermsGate />
            <DealerPasswordGate />
            {children}
            <AgentWidget />
          </Toaster>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
