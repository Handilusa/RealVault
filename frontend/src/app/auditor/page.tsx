"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy /auditor route — redirects to Shadow Wallet compliance section.
 * Kept as a client redirect (instead of 404) to preserve any existing
 * bookmarks, demo links, or pitch deck references to this URL.
 */
export default function AuditorRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/portfolio#compliance");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] text-zinc-500 font-mono text-sm">
      Redirecting to Shadow Wallet...
    </div>
  );
}
