"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200 px-6 sm:px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 h-16">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <span className="text-lg font-extrabold font-display tracking-tight text-zinc-900">
            RealVault
          </span>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-500 font-medium border border-zinc-200">
            Institutional RWA
          </span>
        </Link>

        {/* Right: Network Status + Wallet */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Ethereum Sepolia</span>
          </div>

          <ConnectButton
            chainStatus="none"
            accountStatus={{
              smallScreen: "avatar",
              largeScreen: "full",
            }}
            showBalance={false}
          />
        </div>
      </div>
    </header>
  );
}
