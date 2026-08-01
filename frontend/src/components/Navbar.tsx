"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useEffect, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import gsap from "gsap";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Shadow Wallet", href: "/portfolio" },
  { label: "Confidential Trading", href: "/investor" },
  { label: "Auditor Registry", href: "/auditor" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const prevIndexRef = useRef<number>(-1);

  // Handle nav clicks using native View Transitions API (zero white flash)
  const handleNavClick = (href: string, e: React.MouseEvent) => {
    if (pathname === href) return;

    const oldIndex = navItems.findIndex((item) => item.href === pathname);
    const newIndex = navItems.findIndex((item) => item.href === href);
    const goingForward = newIndex >= oldIndex;

    if (typeof document !== "undefined") {
      document.documentElement.dataset.navDirection = goingForward ? "forward" : "back";
    }

    if (typeof document !== "undefined" && "startViewTransition" in document) {
      e.preventDefault();
      (document as any).startViewTransition(() => {
        router.push(href);
      });
    }
  };

  // Animate the GSAP sliding indicator pill to the active nav item
  const animateIndicator = useCallback(() => {
    const activeIndex = navItems.findIndex((item) => item.href === pathname);
    if (activeIndex === -1) return;

    const activeEl = itemRefs.current[activeIndex];
    const indicator = indicatorRef.current;
    const nav = navRef.current;
    if (!activeEl || !indicator || !nav) return;

    const navRect = nav.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    const targetX = activeRect.left - navRect.left;
    const targetWidth = activeRect.width;

    const isFirst = prevIndexRef.current === -1;
    const prevIndex = prevIndexRef.current;
    prevIndexRef.current = activeIndex;

    if (isFirst) {
      gsap.set(indicator, {
        x: targetX,
        width: targetWidth,
        autoAlpha: 1,
      });
      return;
    }

    const goingRight = activeIndex > prevIndex;

    const mm = gsap.matchMedia();
    mm.add(
      {
        full: "(prefers-reduced-motion: no-preference)",
        reduced: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { reduced } = context.conditions!;

        if (reduced) {
          gsap.set(indicator, { x: targetX, width: targetWidth });
          return;
        }

        const tl = gsap.timeline({
          defaults: { ease: "power3.inOut" },
        });

        tl.to(indicator, {
          width: targetWidth * 1.3,
          x: goingRight ? targetX - targetWidth * 0.1 : targetX - targetWidth * 0.2,
          duration: 0.15,
          ease: "power2.in",
        }).to(indicator, {
          x: targetX,
          width: targetWidth,
          duration: 0.3,
          ease: "back.out(1.7)",
        });
      }
    );
  }, [pathname]);

  useEffect(() => {
    animateIndicator();
  }, [animateIndicator]);

  useEffect(() => {
    const handleResize = () => {
      prevIndexRef.current = navItems.findIndex((item) => item.href === pathname);
      animateIndicator();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [animateIndicator, pathname]);

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

        {/* Nav Links with sliding indicator */}
        <nav ref={navRef} className="relative flex items-center gap-1.5 sm:gap-2 text-xs font-mono">
          {/* Sliding indicator pill */}
          <div
            ref={indicatorRef}
            className="absolute top-1/2 left-0 h-[32px] -translate-y-1/2 rounded-lg bg-zinc-900 shadow-xs pointer-events-none"
            style={{
              willChange: "transform, width",
              visibility: "hidden",
              opacity: 0,
            }}
          />

          {navItems.map((item, i) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(item.href, e)}
                ref={(el) => { itemRefs.current[i] = el; }}
                className={`relative z-10 px-3 py-1.5 rounded-lg transition-colors duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? "text-white font-semibold"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60"
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
