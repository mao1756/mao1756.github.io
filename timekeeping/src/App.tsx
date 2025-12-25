import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Plan, PlanEvent, RunState } from './types';
import { loadFromStorage, saveToStorage } from './utils/storage';
import {
  clamp,
  findCurrentEvent,
  findNextEvent,
  formatDuration,
  formatMinutes,
  sortEvents
} from './utils/time';
import { normalizeEventTimes, validatePlan } from './utils/validation';

const PLAN_KEY = 'timekeeping-plan';
const RUN_KEY = 'timekeeping-run';
const SETTINGS_KEY = 'timekeeping-settings';

const defaultPlan: Plan = {
  totalDurationSec: 60 * 90,
  events: []
};

const defaultRunState = (plan: Plan): RunState => ({
  status: 'running',
  startEpochMs: Date.now(),
  pausedTotalMs: 0,
  pausedAtMs: null,
  elapsedOverrideSec: null,
  planSnapshot: plan,
  completedAtMs: null
});

type Settings = { allowOverlaps: boolean; snapMinutes: number };

const getDefaultSnapMinutes = () => {
  if (typeof window === 'undefined') return 5;
  return window.matchMedia('(max-width: 720px)').matches ? 15 : 5;
};

const loadSettings = (): Settings =>
  loadFromStorage<Settings>(SETTINGS_KEY, { allowOverlaps: false, snapMinutes: getDefaultSnapMinutes() });

const saveSettings = (settings: Settings) => saveToStorage(SETTINGS_KEY, settings);

const toTimeFields = (totalSec: number) => ({
  minutes: Math.floor(totalSec / 60),
  seconds: totalSec % 60
});

const toSeconds = (minutes: number, seconds: number) => Math.max(0, minutes * 60 + seconds);

const planToKey = (plan: Plan) => JSON.stringify({
  totalDurationSec: plan.totalDurationSec,
  events: sortEvents(plan.events).map(({ id, title, startSec, endSec, color, notes }) => ({
    id,
    title,
    startSec,
    endSec,
    color,
    notes
  }))
});

type DragMode = 'create' | 'move' | 'resize-start' | 'resize-end';

type DragState = {
  mode: DragMode;
  eventId: string;
  anchorStartSec: number;
  anchorEndSec: number;
  pointerOffsetSec: number;
  startSec: number;
  endSec: number;
  conflict: boolean;
  pointerId: number;
};

const getElapsedSec = (state: RunState | null) => {
  if (!state || state.status === 'idle') return 0;
  if (state.status === 'paused' || state.status === 'completed') {
    return state.elapsedOverrideSec ?? 0;
  }
  if (!state.startEpochMs) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - state.startEpochMs - state.pausedTotalMs) / 1000));
};

const useWakeLock = (enabled: boolean) => {
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    const requestLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        lockRef.current = await navigator.wakeLock.request('screen');
      } catch (error) {
        console.warn('Wake lock failed', error);
      }
    };

    const releaseLock = async () => {
      if (lockRef.current) {
        try {
          await lockRef.current.release();
        } catch (error) {
          console.warn('Wake lock release failed', error);
        }
        lockRef.current = null;
      }
    };

    if (enabled) {
      requestLock();
      const handleVisibility = () => {
        if (document.visibilityState === 'visible' && enabled) {
          requestLock();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        void releaseLock();
      };
    }

    void releaseLock();
    return () => undefined;
  }, [enabled]);
};

const playBeep = () => {
  if (!window.AudioContext && !(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) {
    return;
  }
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  const context = new Context();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.05;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.2);
  oscillator.onended = () => context.close();
};

const EventBadge = ({ label, color }: { label: string; color?: string }) => (
  <span className="event-badge">
    <span className="event-dot" style={{ backgroundColor: color || '#8a7dff' }} aria-hidden="true" />
    {label}
  </span>
);

const EventFormModal = ({
  isOpen,
  initial,
  totalDurationSec,
  onClose,
  onSave
}: {
  isOpen: boolean;
  initial: PlanEvent | null;
  totalDurationSec: number;
  onClose: () => void;
  onSave: (event: PlanEvent) => void;
}) => {
  const [title, setTitle] = useState('');
  const [startMinutes, setStartMinutes] = useState(0);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endMinutes, setEndMinutes] = useState(0);
  const [endSeconds, setEndSeconds] = useState(0);
  const [color, setColor] = useState('#8a7dff');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (initial) {
      const start = toTimeFields(initial.startSec);
      const end = toTimeFields(initial.endSec);
      setTitle(initial.title);
      setStartMinutes(start.minutes);
      setStartSeconds(start.seconds);
      setEndMinutes(end.minutes);
      setEndSeconds(end.seconds);
      setColor(initial.color || '#8a7dff');
      setNotes(initial.notes || '');
    } else {
      setTitle('');
      setStartMinutes(0);
      setStartSeconds(0);
      setEndMinutes(0);
      setEndSeconds(0);
      setColor('#8a7dff');
      setNotes('');
    }
  }, [initial, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const startSec = toSeconds(startMinutes, startSeconds);
    const endSec = toSeconds(endMinutes, endSeconds);
    const next: PlanEvent = normalizeEventTimes({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim() || 'Untitled',
      startSec,
      endSec,
      color,
      notes: notes.trim() || undefined
    });
    onSave(next);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <h3>{initial ? 'Edit event' : 'Add event'}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Event title"
              required
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Start (min)</span>
              <input
                type="number"
                min={0}
                value={startMinutes}
              onChange={(event) => {
                const next = Number(event.target.value);
                setStartMinutes(Number.isFinite(next) ? clamp(next, 0, 999) : 0);
              }}
              />
            </label>
            <label className="field">
              <span>Start (sec)</span>
              <input
                type="number"
                min={0}
                max={59}
                value={startSeconds}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setStartSeconds(Number.isFinite(next) ? clamp(next, 0, 59) : 0);
                }}
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>End (min)</span>
              <input
                type="number"
                min={0}
                value={endMinutes}
              onChange={(event) => {
                const next = Number(event.target.value);
                setEndMinutes(Number.isFinite(next) ? clamp(next, 0, 999) : 0);
              }}
              />
            </label>
            <label className="field">
              <span>End (sec)</span>
              <input
                type="number"
                min={0}
                max={59}
                value={endSeconds}
              onChange={(event) => {
                const next = Number(event.target.value);
                setEndSeconds(Number.isFinite(next) ? clamp(next, 0, 59) : 0);
              }}
              />
            </label>
          </div>
          <label className="field">
            <span>Color</span>
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <p className="field-hint">Total duration: {formatMinutes(totalDurationSec)}</p>
          <div className="modal-actions">
            <button type="button" className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary">
              Save event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CompletionPanel = ({
  plan,
  onRestart,
  onEdit
}: {
  plan: Plan;
  onRestart: () => void;
  onEdit: () => void;
}) => (
  <div className="completion">
    <h2>Plan complete 🎉</h2>
    <p className="muted">Nice work staying on track. Here’s the wrap-up.</p>
    <div className="summary">
      <div>
        <div className="stat-label">Total time</div>
        <div className="stat-value">{formatMinutes(plan.totalDurationSec)}</div>
      </div>
      <div>
        <div className="stat-label">Events</div>
        <div className="stat-value">{plan.events.length}</div>
      </div>
    </div>
    <div className="stack">
      <button type="button" className="button primary" onClick={onRestart}>
        Restart plan
      </button>
      <button type="button" className="button ghost" onClick={onEdit}>
        Back to edit
      </button>
    </div>
  </div>
);

export const App = () => {
  const [plan, setPlan] = useState<Plan>(() => loadFromStorage(PLAN_KEY, defaultPlan));
  const [runState, setRunState] = useState<RunState | null>(() =>
    loadFromStorage<RunState | null>(RUN_KEY, null)
  );
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [view, setView] = useState<'plan' | 'run'>(
    runState && runState.status !== 'idle' ? 'run' : 'plan'
  );
  const [editingEvent, setEditingEvent] = useState<PlanEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [, setTick] = useState(0);
  const lastEventRef = useRef<string | null>(null);
  const schedulerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const planKey = useMemo(() => planToKey(plan), [plan]);
  const runPlanKey = useMemo(() => (runState ? planToKey(runState.planSnapshot) : ''), [runState]);
  const planMismatch = Boolean(runState && runState.status !== 'idle' && planKey !== runPlanKey);

  useEffect(() => {
    saveToStorage(PLAN_KEY, plan);
  }, [plan]);

  useEffect(() => {
    saveToStorage(RUN_KEY, runState);
  }, [runState]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!settings.snapMinutes) {
      setSettings((prev) => ({ ...prev, snapMinutes: getDefaultSnapMinutes() }));
    }
  }, [settings.snapMinutes]);

  useEffect(() => {
    if (view === 'run') {
      document.body.classList.add('run-view');
    } else {
      document.body.classList.remove('run-view');
    }
  }, [view]);

  useEffect(() => {
    if (!runState || runState.status !== 'running') return undefined;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runState]);

  const elapsedSec = getElapsedSec(runState);
  const sortedEvents = useMemo(() => sortEvents(plan.events), [plan.events]);
  const validationIssues = useMemo(
    () => validatePlan(plan, settings.allowOverlaps),
    [plan, settings.allowOverlaps]
  );
  const snapMinutes = Math.max(1, settings.snapMinutes || getDefaultSnapMinutes());
  const totalMinutes = Math.max(1, Math.ceil(plan.totalDurationSec / 60));
  const pixelsPerMinute = 3;
  const gridHeight = totalMinutes * pixelsPerMinute;
  const minDurationSec = snapMinutes * 60;
  const timeLabels = useMemo(() => {
    const interval = totalMinutes <= 240 ? 30 : 60;
    const labels: number[] = [];
    for (let minute = 0; minute <= totalMinutes; minute += interval) {
      labels.push(minute);
    }
    if (labels[labels.length - 1] !== totalMinutes) {
      labels.push(totalMinutes);
    }
    return labels;
  }, [totalMinutes]);

  const runEvents = useMemo(() => (runState ? sortEvents(runState.planSnapshot.events) : []), [runState]);
  const currentEvent = useMemo(
    () => (runState ? findCurrentEvent(runEvents, elapsedSec) : null),
    [runEvents, elapsedSec, runState]
  );
  const nextEvent = useMemo(
    () => (runState ? findNextEvent(runEvents, elapsedSec) : null),
    [runEvents, elapsedSec, runState]
  );

  useWakeLock(Boolean(runState && runState.status === 'running'));

  useEffect(() => {
    if (!runState || runState.status !== 'running') return;
    if (elapsedSec >= runState.planSnapshot.totalDurationSec) {
      setRunState({
        ...runState,
        status: 'completed',
        elapsedOverrideSec: runState.planSnapshot.totalDurationSec,
        completedAtMs: Date.now()
      });
    }
  }, [elapsedSec, runState]);

  useEffect(() => {
    if (!runState || runState.status !== 'running') return;
    const currentId = currentEvent?.id ?? 'none';
    if (lastEventRef.current && lastEventRef.current !== currentId) {
      if (navigator.vibrate) {
        navigator.vibrate(80);
      }
      playBeep();
    }
    lastEventRef.current = currentId;
  }, [currentEvent, runState]);

  const getPointerSec = (clientY: number) => {
    const container = schedulerRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const offsetY = clamp(clientY - rect.top + container.scrollTop, 0, gridHeight);
    return (offsetY / gridHeight) * plan.totalDurationSec;
  };

  const snapSeconds = (sec: number) => {
    const snap = snapMinutes * 60;
    return clamp(Math.round(sec / snap) * snap, 0, plan.totalDurationSec);
  };

  const hasOverlap = (startSec: number, endSec: number, ignoreId?: string) => {
    if (settings.allowOverlaps) return false;
    return plan.events.some(
      (event) =>
        event.id !== ignoreId &&
        startSec < event.endSec &&
        endSec > event.startSec
    );
  };

  const getEventPosition = (startSec: number, endSec: number) => {
    const top = (startSec / plan.totalDurationSec) * gridHeight;
    const height = ((endSec - startSec) / plan.totalDurationSec) * gridHeight;
    return { top, height };
  };

  const formatTimeLabel = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const handleDragMove = (event: React.PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const pointerSec = getPointerSec(event.clientY);
    let startSec = dragState.startSec;
    let endSec = dragState.endSec;

    if (dragState.mode === 'move') {
      const duration = dragState.anchorEndSec - dragState.anchorStartSec;
      const snappedStart = snapSeconds(pointerSec - dragState.pointerOffsetSec);
      startSec = clamp(snappedStart, 0, plan.totalDurationSec - duration);
      endSec = startSec + duration;
    }

    if (dragState.mode === 'resize-start') {
      const snappedStart = snapSeconds(pointerSec);
      startSec = clamp(snappedStart, 0, dragState.anchorEndSec - minDurationSec);
      endSec = dragState.anchorEndSec;
    }

    if (dragState.mode === 'resize-end') {
      const snappedEnd = snapSeconds(pointerSec);
      startSec = dragState.anchorStartSec;
      endSec = clamp(snappedEnd, dragState.anchorStartSec + minDurationSec, plan.totalDurationSec);
    }

    if (dragState.mode === 'create') {
      const snapped = snapSeconds(pointerSec);
      startSec = Math.min(snapped, dragState.anchorStartSec);
      endSec = Math.max(snapped, dragState.anchorStartSec);
      if (endSec - startSec < minDurationSec) {
        if (snapped >= dragState.anchorStartSec) {
          endSec = Math.min(startSec + minDurationSec, plan.totalDurationSec);
        } else {
          startSec = Math.max(endSec - minDurationSec, 0);
        }
      }
    }

    const conflict = hasOverlap(startSec, endSec, dragState.mode === 'create' ? undefined : dragState.eventId);
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            startSec,
            endSec,
            conflict
          }
        : prev
    );
  };

  const handleDragEnd = () => {
    if (!dragState) return;
    const { startSec, endSec, eventId, mode, conflict } = dragState;
    if (!conflict) {
      if (mode === 'create') {
        const newEvent: PlanEvent = normalizeEventTimes({
          id: eventId,
          title: 'New event',
          startSec,
          endSec,
          color: '#8a7dff'
        });
        setPlan((prev) => ({ ...prev, events: [...prev.events, newEvent] }));
      } else {
        setPlan((prev) => ({
          ...prev,
          events: prev.events.map((event) =>
            event.id === eventId
              ? normalizeEventTimes({ ...event, startSec, endSec })
              : event
          )
        }));
      }
    }
    setDragState(null);
  };

  const handleGridPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const pointerSec = getPointerSec(event.clientY);
    const snapped = snapSeconds(pointerSec);
    const startSec = clamp(snapped, 0, plan.totalDurationSec - minDurationSec);
    const endSec = startSec + minDurationSec;
    setDragState({
      mode: 'create',
      eventId: crypto.randomUUID(),
      anchorStartSec: startSec,
      anchorEndSec: endSec,
      pointerOffsetSec: 0,
      startSec,
      endSec,
      conflict: hasOverlap(startSec, endSec),
      pointerId: event.pointerId
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleEventPointerDown = (event: React.PointerEvent, planEvent: PlanEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const pointerSec = getPointerSec(event.clientY);
    setDragState({
      mode: 'move',
      eventId: planEvent.id,
      anchorStartSec: planEvent.startSec,
      anchorEndSec: planEvent.endSec,
      pointerOffsetSec: pointerSec - planEvent.startSec,
      startSec: planEvent.startSec,
      endSec: planEvent.endSec,
      conflict: false,
      pointerId: event.pointerId
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerDown = (
    event: React.PointerEvent,
    planEvent: PlanEvent,
    mode: 'resize-start' | 'resize-end'
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setDragState({
      mode,
      eventId: planEvent.id,
      anchorStartSec: planEvent.startSec,
      anchorEndSec: planEvent.endSec,
      pointerOffsetSec: 0,
      startSec: planEvent.startSec,
      endSec: planEvent.endSec,
      conflict: false,
      pointerId: event.pointerId
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSaveEvent = (event: PlanEvent) => {
    setPlan((prev) => {
      const exists = prev.events.some((item) => item.id === event.id);
      const events = exists
        ? prev.events.map((item) => (item.id === event.id ? event : item))
        : [...prev.events, event];
      return { ...prev, events: sortEvents(events) };
    });
    setModalOpen(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = (id: string) => {
    setPlan((prev) => ({ ...prev, events: prev.events.filter((event) => event.id !== id) }));
  };

  const handleDuplicate = (event: PlanEvent) => {
    const copy: PlanEvent = {
      ...event,
      id: crypto.randomUUID(),
      title: `${event.title} (copy)`
    };
    setPlan((prev) => ({ ...prev, events: sortEvents([...prev.events, copy]) }));
  };

  const handleStart = () => {
    if (validationIssues.length > 0) return;
    setRunState(defaultRunState(plan));
    setView('run');
  };

  const handleResumeExisting = () => {
    setView('run');
  };

  const handleRestartWithPlan = () => {
    setRunState(defaultRunState(plan));
    setView('run');
  };

  const handlePause = () => {
    if (!runState || runState.status !== 'running') return;
    const elapsed = getElapsedSec(runState);
    setRunState({
      ...runState,
      status: 'paused',
      pausedAtMs: Date.now(),
      elapsedOverrideSec: elapsed
    });
  };

  const handleResume = () => {
    if (!runState || runState.status !== 'paused') return;
    const now = Date.now();
    const pausedDelta = runState.pausedAtMs ? now - runState.pausedAtMs : 0;
    setRunState({
      ...runState,
      status: 'running',
      pausedTotalMs: runState.pausedTotalMs + pausedDelta,
      pausedAtMs: null,
      elapsedOverrideSec: null
    });
  };

  const handleStop = () => {
    setRunState(null);
    setView('plan');
  };

  const handleBackToEdit = () => {
    if (runState && runState.status === 'running') {
      handlePause();
    }
    setView('plan');
  };

  const handleRestart = () => {
    if (!runState) return;
    setRunState(defaultRunState(runState.planSnapshot));
  };

  const totalTimeFields = toTimeFields(plan.totalDurationSec);
  const remainingTotal = Math.max(0, (runState?.planSnapshot.totalDurationSec ?? 0) - elapsedSec);
  const remainingEvent = currentEvent ? Math.max(0, currentEvent.endSec - elapsedSec) : null;
  const nextStartsIn = nextEvent ? Math.max(0, nextEvent.startSec - elapsedSec) : null;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Timekeeping</p>
          <h1>Plan your run mode with confidence.</h1>
          <p className="muted">
            Design a session, then run a distraction-free timer that stays accurate even in the
            background.
          </p>
        </div>
        <div className="header-actions">
          <span className="chip">Offline-ready</span>
          <span className="chip">iPhone Safari friendly</span>
        </div>
      </header>

      {view === 'plan' && (
        <section className="planner">
          <div className="panel">
            <div className="panel-header">
              <h2>Planning mode</h2>
              <p className="muted">Set the total duration and schedule events.</p>
            </div>
            <div className="duration-grid">
              <label className="field">
                <span>Total minutes</span>
                <input
                  type="number"
                  min={0}
                  value={totalTimeFields.minutes}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setPlan((prev) => ({
                      ...prev,
                      totalDurationSec: toSeconds(
                        Number.isFinite(next) ? clamp(next, 0, 999) : 0,
                        totalTimeFields.seconds
                      )
                    }));
                  }}
                />
              </label>
              <label className="field">
                <span>Total seconds</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={totalTimeFields.seconds}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setPlan((prev) => ({
                      ...prev,
                      totalDurationSec: toSeconds(
                        totalTimeFields.minutes,
                        Number.isFinite(next) ? clamp(next, 0, 59) : 0
                      )
                    }));
                  }}
                />
              </label>
              <div className="field">
                <span>Total duration</span>
                <div className="value-pill">{formatDuration(plan.totalDurationSec)}</div>
              </div>
              <label className="field">
                <span>Snap increment (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.snapMinutes}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      snapMinutes: Math.max(1, Number(event.target.value) || 1)
                    }))
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.allowOverlaps}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, allowOverlaps: event.target.checked }))
                  }
                />
                <span>Allow overlaps</span>
              </label>
            </div>
            {validationIssues.length > 0 && (
              <div className="alert" role="alert">
                <strong>Resolve before running:</strong>
                <ul>
                  {validationIssues.map((issue) => (
                    <li key={issue.id}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {planMismatch && (
              <div className="alert warning">
                <strong>Plan changed while timer was running.</strong>
                <p>Continue the previous run or restart with the updated plan.</p>
                <div className="inline-actions">
                  <button type="button" className="button ghost" onClick={handleResumeExisting}>
                    Continue existing run
                  </button>
                  <button type="button" className="button primary" onClick={handleRestartWithPlan}>
                    Restart with new plan
                  </button>
                </div>
              </div>
            )}
            <div className="event-toolbar">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setEditingEvent(null);
                  setModalOpen(true);
                }}
              >
                + Add event
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={handleStart}
                disabled={validationIssues.length > 0}
              >
                Start run mode
              </button>
            </div>
          </div>

          <div className="panel scheduler-panel">
            <div className="panel-header">
              <h2>Day Timeline Scheduler</h2>
              <p className="muted">
                Drag on the grid to create an event. Move or resize blocks to refine timing.
              </p>
            </div>
            {sortedEvents.length === 0 && (
              <p className="muted">No events yet. Drag on the grid to create one.</p>
            )}
            <div className="scheduler">
              <div
                className="scheduler-scroll"
                ref={schedulerRef}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
              >
                <div className="scheduler-row">
                  <div className="scheduler-times" style={{ height: gridHeight }}>
                    {timeLabels.map((minute) => (
                      <div
                        key={minute}
                        className="time-label"
                        style={{ top: (minute / totalMinutes) * gridHeight }}
                      >
                        {formatTimeLabel(minute)}
                      </div>
                    ))}
                  </div>
                  <div
                    className="scheduler-grid"
                    style={
                      {
                        height: gridHeight,
                        '--grid-minor': `${pixelsPerMinute * snapMinutes}px`,
                        '--grid-major': `${pixelsPerMinute * 30}px`
                      } as CSSProperties
                    }
                    onPointerDown={handleGridPointerDown}
                  >
                    {sortedEvents.map((event) => {
                      const position = getEventPosition(event.startSec, event.endSec);
                      return (
                        <div
                          key={event.id}
                          className="scheduler-event"
                          style={{
                            top: position.top,
                            height: position.height,
                            backgroundColor: event.color || '#8a7dff'
                          }}
                          onPointerDown={(pointerEvent) => handleEventPointerDown(pointerEvent, event)}
                          onDoubleClick={() => {
                            setEditingEvent(event);
                            setModalOpen(true);
                          }}
                        >
                          <div className="event-content">
                            <strong>{event.title}</strong>
                            <span className="event-time">
                              {formatDuration(event.startSec)} → {formatDuration(event.endSec)}
                            </span>
                          </div>
                          <div
                            className="resize-handle top"
                            onPointerDown={(pointerEvent) =>
                              handleResizePointerDown(pointerEvent, event, 'resize-start')
                            }
                          />
                          <div
                            className="resize-handle bottom"
                            onPointerDown={(pointerEvent) =>
                              handleResizePointerDown(pointerEvent, event, 'resize-end')
                            }
                          />
                        </div>
                      );
                    })}
                    {dragState && (
                      <div
                        className={`scheduler-event ghost${dragState.conflict ? ' conflict' : ''}`}
                        style={{
                          top: getEventPosition(dragState.startSec, dragState.endSec).top,
                          height: getEventPosition(dragState.startSec, dragState.endSec).height
                        }}
                      >
                        <div className="event-tooltip">
                          <div className="tooltip-time">
                            {formatDuration(dragState.startSec)} → {formatDuration(dragState.endSec)}
                          </div>
                          <div className="tooltip-duration">
                            {formatMinutes(dragState.endSec - dragState.startSec)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="scheduler-actions">
                {sortedEvents.map((event) => (
                  <div key={event.id} className="scheduler-card">
                    <div>
                      <EventBadge label={event.title} color={event.color} />
                      <div className="muted small">
                        {formatDuration(event.startSec)} → {formatDuration(event.endSec)}
                      </div>
                    </div>
                    <div className="scheduler-buttons">
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => {
                          setEditingEvent(event);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => handleDuplicate(event)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => handleDeleteEvent(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {view === 'run' && runState && (
        <section className="run-mode">
          <div className="run-screen">
            {runState.status === 'completed' ? (
              <CompletionPanel
                plan={runState.planSnapshot}
                onRestart={handleRestart}
                onEdit={handleBackToEdit}
              />
            ) : (
              <>
                <div className="run-header">
                  <EventBadge
                    label={currentEvent ? currentEvent.title : 'No event'}
                    color={currentEvent?.color}
                  />
                  <p className="muted">Elapsed {formatDuration(elapsedSec)}</p>
                </div>
                <div className="run-timer">
                  <div className="timer-label">Remaining in current</div>
                  <div className="timer-value">
                    {currentEvent ? formatDuration(remainingEvent ?? 0) : '—'}
                  </div>
                  {!currentEvent && nextEvent && (
                    <div className="timer-sub">Next starts in {formatDuration(nextStartsIn ?? 0)}</div>
                  )}
                </div>
                <div className="run-stats">
                  <div>
                    <div className="stat-label">Total remaining</div>
                    <div className="stat-value">{formatDuration(remainingTotal)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Next event</div>
                    <div className="stat-value">
                      {nextEvent ? nextEvent.title : 'No upcoming events'}
                    </div>
                  </div>
                </div>
                <div className="run-controls">
                  {runState.status === 'running' ? (
                    <button type="button" className="button primary" onClick={handlePause}>
                      Pause
                    </button>
                  ) : (
                    <button type="button" className="button primary" onClick={handleResume}>
                      Resume
                    </button>
                  )}
                  <button type="button" className="button ghost" onClick={handleRestart}>
                    Restart
                  </button>
                  <button type="button" className="button ghost" onClick={handleBackToEdit}>
                    Back to edit
                  </button>
                  <button type="button" className="button danger" onClick={handleStop}>
                    Stop
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <EventFormModal
        isOpen={modalOpen}
        initial={editingEvent}
        totalDurationSec={plan.totalDurationSec}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        onSave={handleSaveEvent}
      />
    </div>
  );
};
