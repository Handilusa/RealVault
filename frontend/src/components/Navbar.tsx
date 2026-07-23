"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Shadow Wallet", href: "/portfolio" },
    { label: "Investor Portal", href: "/investor" },
    { label: "Auditor Registry", href: "/auditor" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200 px-4 sm:px-6 lg:px-10">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 h-16">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <span className="text-lg font-extrabold font-display tracking-tight text-zinc-900 group-hover:text-indigo-600 transition-colors">
            RealVault
          </span>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-500 font-medium border border-zinc-200">
            Institutional RWA
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1.5 sm:gap-2 text-xs font-mono">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-zinc-900 text-white font-semibold shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Network Status + Wallet */}
        <div className="flex items-center gap-3">
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
