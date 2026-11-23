import { Crown } from "lucide-react";

export const PLANS = [
  { value: "member", label: "Member", perk: "Can't watch videos" },
  { value: "member-lite", label: "Member Lite", perk: "Watches videos, with ads" },
  { value: "member-pro", label: "Member Pro", perk: "Watches videos, no ads" },
];

export const PLAN_LABELS = Object.fromEntries(PLANS.map((plan) => [plan.value, plan.label]));

export function PlanBadge({ role }) {
  return (
    <span className={`plan-badge is-${role}`}>
      {role === "member-pro" && <Crown size={12} strokeWidth={2} />}
      {PLAN_LABELS[role] || role}
    </span>
  );
}

export const visitsPath = (publicId) => `/visits?user=${encodeURIComponent(publicId)}`;
