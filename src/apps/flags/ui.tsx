import { StatusBadge } from "@/platform/ui/components";

export const EnvBadge = ({ env, testId }: { env: string; testId?: string }) => <span className={`env ${env}`} data-testid={testId}>{env}</span>;

export const EnabledBadge = ({ enabled, testId }: { enabled: boolean; testId?: string }) => (
  <StatusBadge status={enabled ? "ON" : "OFF"} label={enabled ? "On" : "Off"} testId={testId} />
);

export function Rollout({ percent, testId }: { percent: number; testId?: string }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span className="bar" aria-hidden><span style={{ width: `${percent}%` }} /></span>
      <span data-testid={testId}>{percent}%</span>
    </span>
  );
}

export const CHANGE_KIND_LABEL: Record<string, string> = { CREATE: "New flag", UPDATE: "Change" };
