"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy /agent route — redirects to Shadow Wallet yield strategy section.
 * Kept as a client redirect (instead of 404) to preserve any existing bookmarks.
 */
export default function AgentRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/portfolio#yield-strategy");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-zinc-500 font-mono text-sm">
      Redirecting to Shadow Wallet Yield Strategy...
    </div>
  );
}
