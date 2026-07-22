"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  /** Pass an async function that calls estimateGas — modal shows spinner until resolved */
  estimateGas?: () => Promise<bigint | number>;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  estimateGas,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const [gasLoading, setGasLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch gas estimate when modal opens
  useEffect(() => {
    if (isOpen && estimateGas) {
      setGasLoading(true);
      setGasEstimate(null);
      estimateGas()
        .then((gas) => {
          setGasEstimate(Number(gas).toLocaleString("en-US"));
        })
        .catch(() => {
          setGasEstimate("Unable to estimate");
        })
        .finally(() => {
          setGasLoading(false);
        });
    }
  }, [isOpen, estimateGas]);

  // Trap focus & handle Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    document.addEventListener("keydown", handleKeyDown);
    modalRef.current?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={modalRef}
        className="modal-content"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--state-destructive-dim)",
                border: "1px solid rgba(166, 61, 47, 0.4)",
              }}
            >
              <AlertTriangle
                className="w-5 h-5"
                style={{ color: "var(--state-destructive)" }}
              />
            </div>
            <h3
              id="confirm-modal-title"
              className="text-sm font-bold"
              style={{ color: "var(--ink-primary)" }}
            >
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-md hover:bg-[var(--bg-surface-hover)] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" style={{ color: "var(--ink-secondary)" }} />
          </button>
        </div>

        {/* Description */}
        <p
          className="text-xs leading-relaxed mb-4"
          style={{ color: "var(--ink-secondary)" }}
        >
          {description}
        </p>

        {/* Gas Estimate */}
        {estimateGas && (
          <div
            className="p-3 rounded-lg mb-4 text-xs"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-hairline)",
            }}
          >
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--ink-secondary)" }}>
                Estimated Gas Cost:
              </span>
              {gasLoading ? (
                <span className="flex items-center gap-1.5" style={{ color: "var(--ink-secondary)" }}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Estimating...
                </span>
              ) : (
                <span
                  className="font-data font-bold"
                  style={{
                    color:
                      gasEstimate === "Unable to estimate"
                        ? "var(--ink-secondary)"
                        : "var(--state-destructive)",
                  }}
                >
                  {gasEstimate} {gasEstimate !== "Unable to estimate" && "gas"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary text-xs py-2 px-4">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn-destructive text-xs py-2 px-4"
            disabled={gasLoading}
          >
            Confirm Action
          </button>
        </div>
      </div>
    </div>
  );
}
