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

  const logoImgRef = useRef<HTMLImageElement>(null);
  const brandTextRef = useRef<HTMLSpanElement>(null);
  const floatTweenRef = useRef<gsap.core.Tween | null>(null);

  const handleBrandHoverEnter = () => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    
    if (logoImgRef.current) {
      floatTweenRef.current?.kill();

      gsap.to(logoImgRef.current, {
        scale: 1.06,
        y: -1.5,
        duration: 0.4,
        ease: "power2.out",
        onComplete: () => {
          // Ultra-chill, slow, subtle floating loop
          floatTweenRef.current = gsap.to(logoImgRef.current, {
            y: 0.5,
            duration: 1.8,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          });
        },
      });
    }

    if (brandTextRef.current) {
      gsap.to(brandTextRef.current, {
        y: -0.5,
        duration: 0.4,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
  };

  const handleBrandHoverLeave = () => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    if (logoImgRef.current) {
      floatTweenRef.current?.kill();
      floatTweenRef.current = null;

      gsap.to(logoImgRef.current, {
        scale: 1,
        y: 0,
        duration: 0.3,
        ease: "power2.out",
        overwrite: "auto",
      });
    }

    if (brandTextRef.current) {
      gsap.to(brandTextRef.current, {
        y: 0,
        duration: 0.3,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200 px-4 sm:px-6 lg:px-10">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 h-16">
        {/* Brand with GSAP Pro Micro-Animations */}
        <Link
          href="/"
          className="flex items-center gap-3 group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-xl p-1 -m-1 transition-all"
          onMouseEnter={handleBrandHoverEnter}
          onMouseLeave={handleBrandHoverLeave}
          onFocus={handleBrandHoverEnter}
          onBlur={handleBrandHoverLeave}
        >
          <div className="brand-logo-container">
            <img
              ref={logoImgRef}
              src="/logo.png"
              alt="RealVault Logo"
              className="w-8 h-8 object-contain"
            />
          </div>
          <span
            ref={brandTextRef}
            className="text-lg font-extrabold font-display tracking-tight brand-text-gradient"
          >
            RealVault
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
          <div 
            className="hidden sm:flex items-center gap-2 text-[11px] font-mono px-3 py-1.5 rounded-xl bg-white text-zinc-900 border border-zinc-200 shadow-2xs hover:border-indigo-300 hover:bg-indigo-50/30 transition-all duration-300 group cursor-default"
            title="Active Network: Ethereum Sepolia (Chain ID: 11155111)"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <svg
              className="w-3.5 h-3.5 text-indigo-600 group-hover:scale-110 transition-transform shrink-0"
              viewBox="0 0 784 1277"
              fill="currentColor"
            >
              <path d="M392.07 0L383.5 29.11V872.43L392.07 880.99L784.13 650.04L392.07 0Z" fillOpacity="0.6"/>
              <path d="M392.07 0L0 650.04L392.07 880.99V471.21V0Z"/>
              <path d="M392.07 956.52L387.24 962.41V1272.29L392.07 1276.51L784.37 725.68L392.07 956.52Z" fillOpacity="0.6"/>
              <path d="M392.07 1276.51V956.52L0 725.68L392.07 1276.51Z"/>
              <path d="M392.07 880.99L784.13 650.04L392.07 471.21V880.99Z" fillOpacity="0.2"/>
              <path d="M392.07 471.21L0 650.04L392.07 880.99V471.21Z" fillOpacity="0.6"/>
            </svg>
            <span className="font-bold text-zinc-900 tracking-tight">Ethereum</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80 font-medium">
              Sepolia
            </span>
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
