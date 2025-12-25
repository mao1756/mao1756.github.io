import type { Plan, PlanEvent } from '../types';
import { sortEvents } from './time';

export type ValidationIssue = { id: string; message: string };

export const validatePlan = (plan: Plan, allowOverlaps = false): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (plan.totalDurationSec <= 0) {
    issues.push({ id: 'duration', message: 'Total duration must be greater than zero.' });
  }

  const sorted = sortEvents(plan.events);
  sorted.forEach((event, index) => {
    if (event.startSec < 0 || event.endSec < 0) {
      issues.push({ id: `negative-${event.id}`, message: `${event.title} has negative time values.` });
    }
    if (event.endSec <= event.startSec) {
      issues.push({ id: `range-${event.id}`, message: `${event.title} must end after it starts.` });
    }
    if (event.endSec > plan.totalDurationSec) {
      issues.push({ id: `bounds-${event.id}`, message: `${event.title} exceeds the total duration.` });
    }
    if (!allowOverlaps && index > 0) {
      const prev = sorted[index - 1];
      if (event.startSec < prev.endSec) {
        issues.push({
          id: `overlap-${event.id}`,
          message: `${event.title} overlaps ${prev.title}.`
        });
      }
    }
  });

  return issues;
};

export const normalizeEventTimes = (event: PlanEvent) => ({
  ...event,
  startSec: Math.max(0, Math.floor(event.startSec)),
  endSec: Math.max(0, Math.floor(event.endSec))
});
