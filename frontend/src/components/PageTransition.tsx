"use client";

import { ReactNode } from "react";

/**
 * PageTransition - Clean wrapper for page route content.
 *
 * Page slide animations and zero-flash transitions between the 3 main menus
 * (Home, Shadow Wallet, Confidential Trading) are driven by:
 *   1. The native browser View Transitions API in Navbar + globals.css (for GPU-accelerated horizontal swipe)
 *   2. The GSAP-powered sliding pill indicator in Navbar.tsx
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  return <div className="flex-1 w-full">{children}</div>;
}
