"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface RedactionBarProps {
  isRevealed: boolean;
  value: string;
  encryptedText?: string;
  className?: string;
}

export default function RedactionBar({
  isRevealed,
  value,
  encryptedText = "$ • • • • . • •",
  className = "",
}: RedactionBarProps) {
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!barRef.current) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (isRevealed) {
      if (prefersReducedMotion) {
        barRef.current.classList.add("revealed");
      } else {
        gsap.to(barRef.current, {
          duration: 0.4,
          ease: "power2.out",
          onStart: () => {
            barRef.current?.classList.add("revealed");
          },
        });
      }
    } else {
      barRef.current.classList.remove("revealed");
    }
  }, [isRevealed]);

  return (
    <span className="inline-flex items-center gap-1.5" aria-live="polite">
      <span
        ref={barRef}
        className={`redaction-bar ${isRevealed ? "revealed" : ""} ${className}`}
        aria-label={isRevealed ? `Decrypted value: ${value}` : "Encrypted value"}
      >
        {isRevealed ? value : encryptedText}
      </span>
      <span className="sr-only">
        {isRevealed
          ? `Value decrypted: ${value}`
          : "Position stored as an encrypted Nox handle"}
      </span>
    </span>
  );
}
