"use client";

export type RoleMode = "investor" | "auditor" | "public";

interface RoleBannerProps {
  currentRole: RoleMode;
  onRoleChange: (role: RoleMode) => void;
  className?: string;
}

const ROLE_LABELS: Record<RoleMode, string> = {
  investor: "INVESTOR (SELF DECRYPTED)",
  auditor: "AUDITOR (TEMPORAL ACCESS)",
  public: "PUBLIC (SHIELDED LEDGER)",
};

const ROLE_COLORS: Record<RoleMode, string> = {
  investor: "text-emerald-700 bg-emerald-50 border-emerald-200",
  auditor: "text-indigo-700 bg-indigo-50 border-indigo-200",
  public: "text-zinc-600 bg-zinc-100 border-zinc-200",
};

export default function RoleBanner({
  currentRole,
  onRoleChange,
  className = "",
}: RoleBannerProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-zinc-200 bg-zinc-50 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-zinc-400 uppercase tracking-wider leading-none">
          Perspective:
        </span>
        <span
          className={`inline-flex items-center font-mono text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md border leading-normal ${ROLE_COLORS[currentRole]}`}
        >
          {ROLE_LABELS[currentRole]}
        </span>
      </div>

      {/* Role Switcher Controls */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg border border-zinc-200">
        {(["investor", "auditor", "public"] as RoleMode[]).map((role) => (
          <button
            key={role}
            onClick={() => onRoleChange(role)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all capitalize ${
              currentRole === role
                ? "bg-white text-zinc-900 font-semibold shadow-sm border border-zinc-200"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
  );
}
