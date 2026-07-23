"use client";

import { useState, useRef, useId } from "react";

// Glossary of technical terms with plain-language definitions
const GLOSSARY: Record<string, string> = {
  TEE: "Trusted Execution Environment (iExec Nox enclaves): a secure hardware enclave that processes encrypted handle computations without exposing plaintext data to host nodes.",
  ACL: "Access Control List: defines exactly who is allowed to view encrypted data on-chain.",
  "ERC-7984":
    "Ethereum token standard for confidential balances - amounts are encrypted, transfers are composable.",
  "EIP-712":
    "Structured data signing standard - your wallet signs a typed message to prove identity without sending a transaction.",
  BPS: "Basis points: 1 BPS = 0.01%. Used to express allocation ratios on-chain (e.g. 6000 BPS = 60%).",
  "O(n)":
    "Linear gas scaling: cost grows proportionally with the number of investors (N) in the fund.",
  NAV: "Net Asset Value: the total value of all assets in the fund, aggregated confidentially via enclaves.",
  "Handle Rotation":
    "Generating a fresh encrypted pointer (handle) with a clean access list, invalidating old viewers.",
};

interface TooltipProps {
  term: string;
  children?: React.ReactNode;
}

export default function Tooltip({ term, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const definition = GLOSSARY[term] || `Technical term: ${term}`;

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(true);
  };

  const hideTooltip = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(false), 150);
  };

  return (
    <span
      className="tooltip-trigger"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      tabIndex={0}
      role="button"
      aria-describedby={tooltipId}
    >
      {children || term}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block opacity-50"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
      <span
        id={tooltipId}
        className="tooltip-content"
        role="tooltip"
        style={{
          opacity: isVisible ? 1 : 0,
          visibility: isVisible ? "visible" : "hidden",
        }}
      >
        <strong style={{ color: "var(--accent-brass)" }}>{term}</strong>
        <br />
        {definition}
      </span>
    </span>
  );
}
