"use client";

import { useRef } from "react";

interface ComplianceCertificateModalProps {
  isOpen: boolean;
  auditorAddress: string;
  investorCount: number;
  totalNavUsd: number;
  onClose: () => void;
}

export default function ComplianceCertificateModal({
  isOpen,
  auditorAddress,
  investorCount,
  totalNavUsd,
  onClose,
}: ComplianceCertificateModalProps) {
  const certificateRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    const modalOverlay = document.querySelector("[data-print-certificate]");
    const card = modalOverlay?.querySelector(":scope > div");
    if (!card) return;

    // 0. Save current scroll position
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // 1. Hide all existing body children
    const bodyChildren = Array.from(document.body.children) as HTMLElement[];
    const savedDisplay = bodyChildren.map((el) => el.style.display);
    bodyChildren.forEach((el) => { el.style.display = "none"; });

    // 2. Create a temporary top-level container with just the certificate
    const printContainer = document.createElement("div");
    printContainer.id = "print-certificate-container";
    printContainer.innerHTML = card.outerHTML;
    printContainer.querySelectorAll("button").forEach((btn) => btn.remove());
    document.body.appendChild(printContainer);

    // 3. Print only the isolated certificate
    window.print();

    // 4. Restore: remove temp container, show original children, restore scroll
    document.body.removeChild(printContainer);
    bodyChildren.forEach((el, i) => { el.style.display = savedDisplay[i]; });
    window.scrollTo(scrollX, scrollY);
  };

  const currentDate = new Date().toISOString().split("T")[0];
  const certificateId = `RV-AUDIT-2026-${Math.floor(100000 + Math.random() * 900000)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      data-print-certificate
    >
      <div className="w-full max-w-2xl bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col my-auto print:max-h-none print:shadow-none print:border-0 print:rounded-none">
        {/* Certificate Header Banner (Fixed Shrink-0) */}
        <div className="bg-zinc-900 text-white p-5 sm:p-6 flex items-start justify-between relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-1 relative z-10">
            <div className="flex items-center gap-2.5">
              <span className="text-xl font-black font-display tracking-tight text-white">
                RealVault
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                Solvency Proof
              </span>
            </div>
            <h3 className="text-base font-bold font-display text-zinc-100">
              Institutional Compliance & Audit Session Certificate
            </h3>
            <p className="text-[11px] font-mono text-zinc-400">
              Ref: <span className="text-zinc-200 font-semibold">{certificateId}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 z-10 shrink-0"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Certificate Content Body (Scrollable Overflow) */}
        <div ref={certificateRef} className="p-5 sm:p-6 space-y-4 text-xs text-zinc-700 bg-white overflow-y-auto grow">
          {/* Session Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 font-medium block">
                Target Network
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-zinc-900">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Ethereum Sepolia (11155111)</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 font-medium block">
                Auditor Session Timestamp
              </span>
              <span className="font-mono text-[11px] font-bold text-zinc-900 block">
                {currentDate} · 18:42:00 UTC
              </span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 space-y-0.5 sm:col-span-2">
              <span className="text-[10px] font-mono uppercase text-zinc-400 font-medium block">
                Authenticated Auditor Address
              </span>
              <span className="font-mono text-[11px] font-bold text-indigo-600 break-all block">
                {auditorAddress}
              </span>
            </div>
          </div>

          {/* Homomorphic Aggregation Solvency Metrics */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-mono font-bold uppercase text-zinc-900 tracking-wider">
                Audited Solvency Metrics
              </h4>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                FHE Homomorphically Verified
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-zinc-200 bg-white shadow-sm space-y-0.5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                  Active LP Cohort Count
                </span>
                <div className="text-xl font-bold font-data text-zinc-900">
                  {investorCount} <span className="text-xs font-normal font-sans text-zinc-500">Verified LPs</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-zinc-200 bg-white shadow-sm space-y-0.5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                  Homomorphic Aggregated NAV
                </span>
                <div className="text-xl font-bold font-data text-emerald-600">
                  ${totalNavUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-[10px] font-mono text-zinc-400 font-normal">USDC</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enclave Certification Note */}
          <div className="p-3.5 rounded-lg bg-indigo-50/50 border border-indigo-100 flex items-start gap-2.5">
            <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-700 shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              Proves on-chain solvency for position handles managed by <code className="font-mono text-zinc-900 bg-white px-1 py-0.5 rounded border border-zinc-200">FundVault.sol</code>. Balances were homomorphically aggregated via <strong className="text-zinc-900">iExec Nox FHE (`Nox.add`)</strong> inside an enclave without exposing individual LP position amounts to the public mempool.
            </p>
          </div>
        </div>

        {/* Verification Footer & Actions (Fixed Shrink-0) */}
        <div className="p-4 sm:px-6 bg-zinc-50 border-t border-zinc-200 flex flex-row items-center justify-between gap-3 shrink-0">
          <div className="space-y-0.5 hidden sm:block">
            <span className="text-[10px] font-mono text-zinc-400 block">Verified Smart Contract:</span>
            <a
              href="https://sepolia.etherscan.io/address/0x9B1777491F7ab00C9de386D20d450Ff3f587f28a#code"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-indigo-600 hover:underline"
            >
              <span>DisclosureManager.sol</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-mono font-medium text-zinc-600 hover:text-zinc-900 border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors"
            >
              Close
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-lg text-xs font-mono font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Export Certificate PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
