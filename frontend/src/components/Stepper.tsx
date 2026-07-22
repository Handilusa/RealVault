"use client";

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
}

export default function Stepper({ activeSection, onStepClick }: StepperProps) {
  const handleClick = (id: string) => {
    if (onStepClick) {
      onStepClick(id);
    } else {
      const el = document.getElementById(id);
      if (el) {
        const offset = 120; // Account for sticky headers
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

  return (
    <nav className="stepper-container" aria-label="Guided experience steps">
      <div className="max-w-7xl mx-auto flex items-center w-full justify-between gap-1">
        {STEPS.map((step, idx) => {
          const isActive = activeSection === step.id;

          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => handleClick(step.id)}
                className={`stepper-item ${isActive ? "active" : ""}`}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="stepper-number">{step.number}</span>
                <span>{step.label}</span>
              </button>

              {idx < STEPS.length - 1 && (
                <div className="flex items-center justify-center shrink-0 self-center px-1 hide-mobile" aria-hidden="true">
                  <div className="w-4 sm:w-5 h-[1px] bg-zinc-300" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
