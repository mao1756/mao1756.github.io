const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const resetBtn = document.getElementById('resetBtn');
const timerDisplay = document.getElementById('timerDisplay');
const statusLabel = document.getElementById('statusLabel');
const countUpDisplay = document.getElementById('countUpDisplay');
const scheduleDisplay = document.getElementById('scheduleDisplay');
const durationInput = document.getElementById('durationInput');
const presetSelect = document.getElementById('presetSelect');
const delayInput = document.getElementById('delayInput');
const startAtInput = document.getElementById('startAtInput');
const clearStartAtBtn = document.getElementById('clearStartAtBtn');
const countUpToggle = document.getElementById('countUpToggle');
const overtimeSelect = document.getElementById('overtimeSelect');
const holdToggle = document.getElementById('holdToggle');
const lockBtn = document.getElementById('lockBtn');
const unlockBtn = document.getElementById('unlockBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const controlsToggleBtn = document.getElementById('controlsToggleBtn');
const appContainer = document.querySelector('.app');

const STORAGE_KEY = 'examTimerSettings';

const state = {
  durationSec: 75 * 60,
  remainingSec: 75 * 60,
  startTimestamp: null,
  endTimestamp: null,
  scheduledStart: null,
  mode: 'idle',
  lock: false,
  holdMode: false,
};

let tickHandle;
let unlockTimer;

const formatTime = (totalSec) => {
  const clamped = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatCountUp = (totalSec) => {
  const clamped = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getScheduledStart = () => {
  const delayMinutes = Math.max(0, Number(delayInput.value || 0));
  const startAtValue = startAtInput.value;
  if (startAtValue) {
    const [hours, minutes] = startAtValue.split(':').map(Number);
    const now = new Date();
    const scheduled = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
      0,
    );
    if (scheduled.getTime() <= now.getTime()) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    return scheduled.getTime();
  }
  if (delayMinutes > 0) {
    return Date.now() + delayMinutes * 60 * 1000;
  }
  return null;
};

const updateScheduleText = () => {
  const timestamp = state.scheduledStart ?? getScheduledStart();
  if (timestamp) {
    const scheduled = new Date(timestamp);
    scheduleDisplay.textContent = `Scheduled start: ${scheduled.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } else {
    scheduleDisplay.textContent = 'No scheduled start';
  }
};

const updateDisplays = () => {
  appContainer.classList.toggle('holding', state.mode === 'holding');

  if (state.mode === 'holding') {
    const remaining = Math.max(0, Math.ceil((state.scheduledStart - Date.now()) / 1000));
    statusLabel.textContent = 'Exam begins in';
    timerDisplay.textContent = formatTime(remaining);
    countUpDisplay.textContent = countUpToggle.checked ? '+00:00' : '';
    const canStartFromHold = state.holdMode && Date.now() >= state.scheduledStart;
    startBtn.disabled = !canStartFromHold;
    return;
  }

  if (state.mode === 'completed') {
    statusLabel.textContent = 'Time';
    timerDisplay.textContent = 'TIME';
    countUpDisplay.textContent = countUpToggle.checked ? formatCountUp(state.durationSec) : '';
    return;
  }

  if (state.mode === 'idle') {
    statusLabel.textContent = 'Ready';
    timerDisplay.textContent = formatTime(state.remainingSec);
    countUpDisplay.textContent = countUpToggle.checked ? '+00:00' : '';
    return;
  }

  const now = Date.now();
  let remaining = state.remainingSec;
  let elapsed = state.durationSec - state.remainingSec;

  if (state.mode === 'running') {
    remaining = Math.max(0, (state.endTimestamp - now) / 1000);
    elapsed = Math.max(0, (now - state.startTimestamp) / 1000);
  }

  if (state.mode === 'running' && remaining <= 0) {
    if (overtimeSelect.value === 'countup') {
      statusLabel.textContent = 'Overtime';
      timerDisplay.textContent = formatCountUp((now - state.endTimestamp) / 1000);
      countUpDisplay.textContent = countUpToggle.checked ? formatCountUp(state.durationSec) : '';
      return;
    }
    state.mode = 'completed';
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
    startBtn.disabled = true;
    timerDisplay.textContent = 'TIME';
    statusLabel.textContent = 'Time';
    countUpDisplay.textContent = countUpToggle.checked ? formatCountUp(state.durationSec) : '';
    return;
  }

  statusLabel.textContent = state.mode === 'paused' ? 'Paused' : 'Running';
  timerDisplay.textContent = formatTime(remaining);
  countUpDisplay.textContent = countUpToggle.checked ? formatCountUp(elapsed) : '';
  startBtn.disabled = state.mode !== 'idle';
};

const setMode = (mode) => {
  state.mode = mode;
  pauseBtn.disabled = mode !== 'running';
  resumeBtn.disabled = mode !== 'paused';
  startBtn.disabled = mode === 'running' || mode === 'paused' || mode === 'holding';
};

const applyDuration = (minutes) => {
  const duration = Math.max(1, Math.min(240, minutes));
  state.durationSec = duration * 60;
  state.remainingSec = state.durationSec;
  durationInput.value = duration;
  if (state.mode === 'idle' || state.mode === 'paused') {
    updateDisplays();
  }
};

const saveSettings = () => {
  const settings = {
    duration: Number(durationInput.value),
    delay: Number(delayInput.value),
    startAt: startAtInput.value,
    countUp: countUpToggle.checked,
    overtime: overtimeSelect.value,
    hold: holdToggle.checked,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const loadSettings = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return;
  }
  try {
    const settings = JSON.parse(stored);
    if (settings.duration) {
      durationInput.value = settings.duration;
    }
    delayInput.value = settings.delay ?? 0;
    startAtInput.value = settings.startAt ?? '';
    countUpToggle.checked = settings.countUp ?? true;
    overtimeSelect.value = settings.overtime ?? 'stop';
    holdToggle.checked = settings.hold ?? false;
  } catch (error) {
    console.warn('Failed to load settings', error);
  }
};

const startTimer = () => {
  const canStartFromHold = state.mode === 'holding'
    && state.holdMode
    && state.scheduledStart
    && Date.now() >= state.scheduledStart;
  if (state.mode !== 'idle' && !canStartFromHold) {
    return;
  }
  if (canStartFromHold) {
    const startAt = Date.now();
    state.startTimestamp = startAt;
    state.endTimestamp = startAt + state.remainingSec * 1000;
    state.scheduledStart = null;
    setMode('running');
    updateDisplays();
    return;
  }

  const scheduledStart = getScheduledStart();
  state.scheduledStart = scheduledStart;
  updateScheduleText();

  if (scheduledStart && scheduledStart > Date.now()) {
    state.holdMode = holdToggle.checked;
    setMode('holding');
    updateDisplays();
    return;
  }

  const startAt = Date.now();
  state.startTimestamp = startAt;
  state.endTimestamp = startAt + state.remainingSec * 1000;
  state.scheduledStart = null;
  setMode('running');
  updateDisplays();
};

const pauseTimer = () => {
  if (state.mode !== 'running') {
    return;
  }
  state.remainingSec = Math.max(0, (state.endTimestamp - Date.now()) / 1000);
  setMode('paused');
  updateDisplays();
};

const resumeTimer = () => {
  if (state.mode !== 'paused') {
    return;
  }
  state.startTimestamp = Date.now();
  state.endTimestamp = state.startTimestamp + state.remainingSec * 1000;
  setMode('running');
  updateDisplays();
};

const resetTimer = () => {
  state.remainingSec = state.durationSec;
  state.startTimestamp = null;
  state.endTimestamp = null;
  state.scheduledStart = null;
  state.holdMode = false;
  setMode('idle');
  updateDisplays();
};

const adjustTime = (delta) => {
  const nextRemaining = Math.max(0, state.remainingSec + delta);
  const deltaApplied = nextRemaining - state.remainingSec;
  state.remainingSec = nextRemaining;
  state.durationSec = Math.max(60, state.durationSec + deltaApplied);
  durationInput.value = Math.round(state.durationSec / 60);
  if (state.mode === 'running') {
    state.endTimestamp += deltaApplied * 1000;
  }
  updateDisplays();
};

const tick = () => {
  if (state.mode === 'holding') {
    if (Date.now() >= state.scheduledStart) {
      if (!state.holdMode) {
        state.startTimestamp = state.scheduledStart;
        state.endTimestamp = state.startTimestamp + state.remainingSec * 1000;
        state.scheduledStart = null;
        setMode('running');
      }
    }
  }
  if (state.mode === 'running' || state.mode === 'paused' || state.mode === 'holding' || state.mode === 'completed') {
    updateDisplays();
  }
  tickHandle = window.requestAnimationFrame(tick);
};

const setLocked = (locked) => {
  state.lock = locked;
  document.body.classList.toggle('locked', locked);
  unlockBtn.hidden = !locked;
  lockBtn.hidden = locked;
};

startBtn.addEventListener('click', () => {
  startTimer();
});

pauseBtn.addEventListener('click', pauseTimer);
resumeBtn.addEventListener('click', resumeTimer);
resetBtn.addEventListener('click', resetTimer);

presetSelect.addEventListener('change', (event) => {
  applyDuration(Number(event.target.value));
  saveSettings();
});

durationInput.addEventListener('change', (event) => {
  applyDuration(Number(event.target.value));
  saveSettings();
});

delayInput.addEventListener('change', saveSettings);
startAtInput.addEventListener('change', saveSettings);
clearStartAtBtn.addEventListener('click', () => {
  startAtInput.value = '';
  saveSettings();
  updateScheduleText();
});
countUpToggle.addEventListener('change', () => {
  saveSettings();
  updateDisplays();
});

overtimeSelect.addEventListener('change', () => {
  saveSettings();
  updateDisplays();
});

holdToggle.addEventListener('change', saveSettings);

[delayInput, startAtInput].forEach((input) => {
  input.addEventListener('change', updateScheduleText);
});

Array.from(document.querySelectorAll('[data-adjust]')).forEach((button) => {
  button.addEventListener('click', () => {
    const delta = Number(button.dataset.adjust);
    adjustTime(delta);
  });
});

lockBtn.addEventListener('click', () => setLocked(true));

const clearUnlockTimer = () => {
  if (unlockTimer) {
    clearTimeout(unlockTimer);
    unlockTimer = null;
  }
};

unlockBtn.addEventListener('pointerdown', () => {
  clearUnlockTimer();
  unlockTimer = setTimeout(() => {
    setLocked(false);
  }, 2000);
});

unlockBtn.addEventListener('pointerup', clearUnlockTimer);
unlockBtn.addEventListener('pointerleave', clearUnlockTimer);
unlockBtn.addEventListener('pointercancel', clearUnlockTimer);

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

controlsToggleBtn.addEventListener('click', () => {
  appContainer.classList.toggle('show-controls');
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    appContainer.classList.remove('show-controls');
  }
});

loadSettings();
applyDuration(Number(durationInput.value));
updateScheduleText();
resetTimer();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}

tick();
