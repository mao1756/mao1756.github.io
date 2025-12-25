export type PlanEvent = {
  id: string;
  title: string;
  startSec: number;
  endSec: number;
  color?: string;
  notes?: string;
};

export type Plan = {
  totalDurationSec: number;
  events: PlanEvent[];
};

export type RunStatus = 'idle' | 'running' | 'paused' | 'completed';

export type RunState = {
  status: RunStatus;
  startEpochMs: number | null;
  pausedTotalMs: number;
  pausedAtMs: number | null;
  elapsedOverrideSec: number | null;
  planSnapshot: Plan;
  completedAtMs: number | null;
};
