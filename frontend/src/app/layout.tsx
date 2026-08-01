import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/components/Web3Provider";
import PageTransition from "@/components/PageTransition";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://real-vault.vercel.app"),
  title: "RealVault - Confidential RWA Fund with Programmable Disclosure",
  description:
    "Tokenized Real World Asset Fund (60% T-Bills, 40% Real Estate) with encrypted investor positions via iExec Nox TEE and programmable regulator disclosure on Ethereum Sepolia.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "RealVault - Confidential RWA Fund Router",
    description:
      "Tokenized Real World Asset Fund with encrypted investor positions via iExec Nox TEE and programmable regulator disclosure on Ethereum Sepolia.",
    url: "https://real-vault.vercel.app",
    siteName: "RealVault",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Web3Provider>
          <PageTransition>{children}</PageTransition>
        </Web3Provider>
      </body>
    </html>
  );
}
