/*
  Timekeeping "handoff" helper.

  Goal:
  - Let a user configure (and optionally start) a timer on one device (PC), then
    continue on another device (phone) by opening a handoff link.

  How it works (no backend required):
  - We serialize the current plan and/or active run state from localStorage.
  - We encode it into a URL-safe base64 payload in the `handoff=` query param.
  - On load, if a `handoff` payload is present, we import it into localStorage
    before the React app boots.

  Notes:
  - This deliberately avoids external services and extra npm dependencies.
  - Payloads can be long; "Copy link" + send it to yourself (messages/email) is
    usually easiest.
*/

(function () {
  const PLAN_KEY = 'timekeeping-plan';
  const RUN_KEY = 'timekeeping-run';
  const HANDOFF_PARAM = 'handoff';
  const HANDOFF_VERSION = 1;

  const safeJsonParse = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const readStorage = (key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return safeJsonParse(raw);
    } catch {
      return null;
    }
  };

  const writeStorage = (key, value) => {
    try {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // ignore
    }
  };

  // --- Base64url encoding helpers (UTF-8 safe) ---
  const encodeUtf8 = (str) => {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    // Fallback for older browsers.
    const encoded = unescape(encodeURIComponent(str));
    const bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i += 1) bytes[i] = encoded.charCodeAt(i);
    return bytes;
  };

  const decodeUtf8 = (bytes) => {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }
    // Fallback for older browsers.
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(binary));
  };

  const base64UrlEncode = (obj) => {
    const json = JSON.stringify(obj);
    const bytes = encodeUtf8(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  };

  const base64UrlDecode = (value) => {
    let base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const json = decodeUtf8(bytes);
    return JSON.parse(json);
  };

  // --- Minimal validation/sanitization ---
  const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const isString = (value) => typeof value === 'string';
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

  const sanitizePlan = (plan) => {
    if (!isObject(plan)) return null;
    if (!isNumber(plan.totalDurationSec) || plan.totalDurationSec <= 0) return null;
    if (!Array.isArray(plan.events)) return null;

    const events = plan.events
      .filter((event) => isObject(event))
      .map((event) => ({
        id: isString(event.id) ? event.id : String(event.id || ''),
        title: isString(event.title) ? event.title : 'Untitled',
        startSec: isNumber(event.startSec) ? event.startSec : 0,
        endSec: isNumber(event.endSec) ? event.endSec : 0,
        color: isString(event.color) ? event.color : undefined,
        notes: isString(event.notes) ? event.notes : undefined
      }))
      .filter((event) => event.id);

    return {
      totalDurationSec: plan.totalDurationSec,
      events
    };
  };

  const sanitizeRun = (run) => {
    if (!isObject(run)) return null;
    const status = run.status;
    if (status !== 'running' && status !== 'paused') return null;

    const planSnapshot = sanitizePlan(run.planSnapshot);
    if (!planSnapshot) return null;

    return {
      status,
      startEpochMs: isNumber(run.startEpochMs) ? run.startEpochMs : Date.now(),
      pausedTotalMs: isNumber(run.pausedTotalMs) ? run.pausedTotalMs : 0,
      pausedAtMs: isNumber(run.pausedAtMs) ? run.pausedAtMs : null,
      elapsedOverrideSec: isNumber(run.elapsedOverrideSec) ? run.elapsedOverrideSec : null,
      planSnapshot,
      completedAtMs: null
    };
  };

  // --- Import from URL ---
  const importFromUrlIfPresent = () => {
    let url;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }

    const payload = url.searchParams.get(HANDOFF_PARAM);
    if (!payload) return;

    try {
      const decoded = base64UrlDecode(payload);
      if (!isObject(decoded) || decoded.v !== HANDOFF_VERSION) {
        throw new Error('Unsupported handoff payload');
      }

      const plan = sanitizePlan(decoded.plan);
      const run = sanitizeRun(decoded.run);

      if (plan) {
        writeStorage(PLAN_KEY, plan);
      }
      if (run) {
        // Keep plan consistent with the active run snapshot to avoid "plan changed" warnings.
        writeStorage(PLAN_KEY, run.planSnapshot);
        writeStorage(RUN_KEY, run);
      } else {
        writeStorage(RUN_KEY, null);
      }

      // Clean the URL so refreshes don't re-import.
      url.searchParams.delete(HANDOFF_PARAM);
      window.history.replaceState({}, '', url.toString());

      try {
        window.sessionStorage.setItem('timekeeping-handoff-imported', '1');
      } catch {
        // ignore
      }
    } catch (error) {
      console.warn('Failed to import handoff payload', error);
    }
  };

  // --- Share UI (floating button + modal) ---
  const buildSharePayload = () => {
    const run = readStorage(RUN_KEY);
    if (run && isObject(run) && (run.status === 'running' || run.status === 'paused')) {
      const sanitizedRun = sanitizeRun(run);
      if (sanitizedRun) {
        return {
          v: HANDOFF_VERSION,
          createdAtMs: Date.now(),
          kind: 'run',
          plan: sanitizedRun.planSnapshot,
          run: sanitizedRun
        };
      }
    }

    const plan = sanitizePlan(readStorage(PLAN_KEY));
    return {
      v: HANDOFF_VERSION,
      createdAtMs: Date.now(),
      kind: 'plan',
      plan: plan,
      run: null
    };
  };

  const buildHandoffUrl = () => {
    const payload = base64UrlEncode(buildSharePayload());
    const url = new URL(window.location.href);
    url.searchParams.set(HANDOFF_PARAM, payload);
    return url.toString();
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ignore
    }
    // Fallback
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const toast = (message) => {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.bottom = '20px';
    el.style.transform = 'translateX(-50%)';
    el.style.padding = '10px 14px';
    el.style.borderRadius = '999px';
    el.style.background = 'rgba(20, 24, 36, 0.95)';
    el.style.border = '1px solid rgba(255,255,255,0.12)';
    el.style.color = 'white';
    el.style.font = '600 14px system-ui, -apple-system, Segoe UI, sans-serif';
    el.style.zIndex = '60';
    el.style.boxShadow = '0 18px 50px rgba(0,0,0,0.4)';
    document.body.appendChild(el);
    window.setTimeout(() => {
      el.style.transition = 'opacity 200ms ease';
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 240);
    }, 1600);
  };

  const openModal = (handoffUrl) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.style.zIndex = '55';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const title = document.createElement('h3');
    title.textContent = 'Send to phone';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';

    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent =
      'Open this link on your phone to continue. If a timer is running, it will pick up based on the saved start time.';

    const field = document.createElement('label');
    field.className = 'field';

    const fieldLabel = document.createElement('span');
    fieldLabel.textContent = 'Handoff link';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = handoffUrl;
    input.readOnly = true;

    field.appendChild(fieldLabel);
    field.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'button ghost';
    copyBtn.textContent = 'Copy link';

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'button primary';
    shareBtn.textContent = 'Share…';

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (!canShare) {
      shareBtn.style.display = 'none';
    }

    actions.appendChild(copyBtn);
    actions.appendChild(shareBtn);

    body.appendChild(info);
    body.appendChild(field);
    body.appendChild(actions);

    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const closeModal = () => backdrop.remove();

    close.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeModal();
    });

    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(handoffUrl);
      toast(ok ? 'Copied!' : 'Copy failed');
      input.focus();
      input.select();
    });

    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'Timekeeping', text: 'Continue this timer on your phone', url: handoffUrl });
      } catch {
        // user canceled
      }
    });

    // convenience
    input.addEventListener('focus', () => input.select());
    window.setTimeout(() => input.select(), 0);
  };

  const installFab = () => {
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.textContent = 'Send to phone';
    fab.setAttribute('aria-label', 'Send to phone');

    // Style inline to avoid bundling changes.
    fab.style.position = 'fixed';
    fab.style.right = '16px';
    fab.style.bottom = '16px';
    fab.style.zIndex = '54';
    fab.style.borderRadius = '999px';
    fab.style.border = '1px solid rgba(255,255,255,0.14)';
    fab.style.padding = '12px 14px';
    fab.style.minHeight = '44px';
    fab.style.cursor = 'pointer';
    fab.style.font = '600 14px system-ui, -apple-system, Segoe UI, sans-serif';
    fab.style.color = '#07080f';
    fab.style.background = 'linear-gradient(120deg, rgba(122, 208, 255, 1), rgba(199, 183, 255, 1))';
    fab.style.boxShadow = '0 18px 50px rgba(0,0,0,0.4)';

    fab.addEventListener('click', () => {
      const url = buildHandoffUrl();
      openModal(url);
    });

    document.body.appendChild(fab);
  };

  // 1) Import ASAP (this file is intentionally loaded as a classic script before the React bundle runs).
  importFromUrlIfPresent();

  // 2) Once the DOM is available, install the share UI.
  document.addEventListener('DOMContentLoaded', () => {
    installFab();
    try {
      if (window.sessionStorage.getItem('timekeeping-handoff-imported') === '1') {
        window.sessionStorage.removeItem('timekeeping-handoff-imported');
        toast('Imported timer from link');
      }
    } catch {
      // ignore
    }
  });
})();
