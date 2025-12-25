import type { PlanEvent } from '../types';

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const formatDuration = (totalSec: number) => {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const parts = [minutes.toString().padStart(2, '0'), seconds.toString().padStart(2, '0')];
  if (hours > 0) {
    parts.unshift(hours.toString().padStart(2, '0'));
  }
  return parts.join(':');
};

export const formatMinutes = (totalSec: number) => {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

export const sortEvents = (events: PlanEvent[]) =>
  [...events].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

export const findCurrentEvent = (events: PlanEvent[], elapsedSec: number) =>
  events.find((event) => elapsedSec >= event.startSec && elapsedSec < event.endSec) || null;

export const findNextEvent = (events: PlanEvent[], elapsedSec: number) =>
  events.find((event) => event.startSec > elapsedSec) || null;
