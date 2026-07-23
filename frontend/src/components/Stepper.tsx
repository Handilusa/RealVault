"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface StepperStep {
  id: string;
  number: number;
  label: string;
}

const STEPS: StepperStep[] = [
  { id: "hero", number: 1, label: "Overview" },
  { id: "disclosure-model", number: 2, label: "Disclosure Model" },
  { id: "rwa-portfolio", number: 3, label: "RWA Portfolio" },
  { id: "dashboard", number: 4, label: "Live Dashboard" },
  { id: "interactive-demo", number: 5, label: "Interactive Demo" },
  { id: "compliance-controls", number: 6, label: "Compliance Controls" },
  { id: "verification", number: 7, label: "Proofs & Gas" },
];

interface StepperProps {
  activeSection: string;
  onStepClick?: (id: string) => void;
  layout?: "vertical" | "horizontal";
}

export default function Stepper({ activeSection, onStepClick, layout = "vertical" }: StepperProps) {
  const activeIndex = STEPS.findIndex((s) => s.id === activeSection);
  const activeIdx = activeIndex >= 0 ? activeIndex : 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const progressLineRef = useRef<HTMLDivElement>(null);
  const highlightPillRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const handleClick = (id: string) => {
    if (onStepClick) {
      onStepClick(id);
    } else {
      const el = document.getElementById(id);
      if (el) {
        const offset = 90;
        const bodyRect = document.body.getBoundingClientRect().top;
        const elementRect = el.getBoundingClientRect().top;
        const elementPosition = elementRect - bodyRect;
        const offsetPosition = elementPosition - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    }
  };

  // GSAP Animations for active pill & progress line
  useEffect(() => {
    if (layout !== "vertical" || !containerRef.current) return;

    const totalSteps = STEPS.length;
    const progressPct = totalSteps > 1 ? (activeIdx / (totalSteps - 1)) * 100 : 0;

    // Animate active vertical progress line fill height
    if (progressLineRef.current) {
      gsap.to(progressLineRef.current, {
        height: `${progressPct}%`,
        duration: 0.45,
        ease: "power2.out",
      });
    }

    // Animate active background highlight pill position
    const stepButtons = containerRef.current.querySelectorAll<HTMLButtonElement>(".step-btn");
    const activeBtn = stepButtons[activeIdx];

    if (activeBtn && highlightPillRef.current) {
      const btnTop = activeBtn.offsetTop;
      const btnHeight = activeBtn.offsetHeight;

      gsap.to(highlightPillRef.current, {
        top: btnTop,
        height: btnHeight,
        opacity: 1,
        duration: 0.4,
        ease: "power3.out",
      });
    }

    // Micro-scale animation on the active badge
    badgeRefs.current.forEach((badge, idx) => {
      if (!badge) return;
      if (idx === activeIdx) {
        gsap.to(badge, {
          scale: 1.1,
          duration: 0.3,
          ease: "back.out(1.7)",
        });
      } else {
        gsap.to(badge, {
          scale: 1,
          duration: 0.25,
          ease: "power2.out",
        });
      }
    });
  }, [activeIdx, layout]);

  if (layout === "horizontal") {
    return (
      <nav className="flex items-center gap-2 whitespace-nowrap overflow-x-auto no-scrollbar py-1" aria-label="Mobile document index">
        {STEPS.map((step) => {
          const isActive = activeSection === step.id;
          return (
            <button
              key={step.id}
              onClick={() => handleClick(step.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 shrink-0 ${
                isActive
                  ? "bg-indigo-600 text-white font-semibold shadow-xs"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                  isActive ? "bg-white/20 text-white font-bold" : "bg-zinc-200 text-zinc-600"
                }`}
              >
                {step.number}
              </span>
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav ref={containerRef} className="relative space-y-1 py-1" aria-label="Document section index">
      {/* Background track line: centered at 25px (px-3 = 12px + 14px badge center = 26px center) */}
      <div className="absolute left-[25px] top-[22px] bottom-[22px] w-[2px] bg-zinc-200/70 rounded-full z-0" />

      {/* GSAP Animated active progress fill line */}
      <div className="absolute left-[25px] top-[22px] bottom-[22px] w-[2px] z-0 overflow-hidden rounded-full">
        <div
          ref={progressLineRef}
          className="w-full bg-gradient-to-b from-indigo-500 to-indigo-600 rounded-full"
          style={{ height: "0%" }}
        />
      </div>

      {/* GSAP Animated Sliding Highlight Pill */}
      <div
        ref={highlightPillRef}
        className="absolute left-0 right-0 rounded-xl bg-indigo-50/80 border border-indigo-200/80 shadow-xs pointer-events-none transition-opacity z-0"
        style={{ top: 0, height: 0, opacity: 0 }}
      />

      {STEPS.map((step, idx) => {
        const isActive = activeSection === step.id;
        const isPassed = idx < activeIdx;

        return (
          <button
            key={step.id}
            onClick={() => handleClick(step.id)}
            className={`step-btn w-full group flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-xs font-mono transition-colors text-left relative z-10 ${
              isActive
                ? "text-indigo-950 font-bold"
                : isPassed
                ? "text-zinc-700 hover:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
            aria-current={isActive ? "step" : undefined}
          >
            {/* Step Number Badge — perfectly aligned over 26px line center */}
            <span
              ref={(el) => { badgeRefs.current[idx] = el; }}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono transition-colors shrink-0 z-10 ${
                isActive
                  ? "bg-indigo-600 text-white font-extrabold shadow-sm shadow-indigo-500/30 ring-4 ring-indigo-100"
                  : isPassed
                  ? "bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold"
                  : "bg-white text-zinc-500 border border-zinc-200 group-hover:border-zinc-300 group-hover:text-zinc-800"
              }`}
            >
              {step.number}
            </span>

            {/* Step Title */}
            <span className="whitespace-nowrap flex-1 tracking-tight text-[12px]">
              {step.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
