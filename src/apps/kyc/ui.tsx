import { StatusBadge } from "@/platform/ui/components";

export const riskLevel = (score: number) => (score >= 70 ? "High" : score >= 40 ? "Medium" : "Low");

export function RiskBadge({ score }: { score: number }) {
  const level = riskLevel(score);
  return <StatusBadge status={level} label={`${score} · ${level}`} tone={level === "High" ? "red" : level === "Medium" ? "amber" : "green"} />;
}
