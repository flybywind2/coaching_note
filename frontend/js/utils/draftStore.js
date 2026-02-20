/**
 * 에디터/폼 임시저장(자동저장/복구) 유틸리티 모듈입니다.
 */

const DraftStore = {
  _prefix: 'ssp_draft_v1',

  buildKey(...parts) {
    const body = parts
      .filter((p) => p !== undefined && p !== null && String(p).trim() !== '')
      .map((p) => String(p).trim())
      .join(':');
    return `${this._prefix}:${body}`;
  },

  load(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  },

  save(key, payload) {
    try {
      localStorage.setItem(key, JSON.stringify({
        saved_at: new Date().toISOString(),
        payload,
      }));
    } catch (_) {
      // storage full or blocked
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      // ignore
    }
  },

  bindForm({
    form,
    key,
    collect,
    apply,
    statusEl = null,
    intervalMs = 5000,
    restoreMessage = '임시저장된 내용을 복원하시겠습니까?',
  }) {
    if (!form || !key || typeof collect !== 'function') {
      return { dispose() {}, saveNow() {}, clear() {} };
    }

    const renderStatus = (savedAt) => {
      if (!statusEl) return;
      if (!savedAt) {
        statusEl.textContent = '';
        return;
      }
      const t = new Date(savedAt);
      const text = Number.isNaN(t.getTime())
        ? '임시저장됨'
        : `임시저장됨 ${t.toLocaleTimeString('ko-KR', { hour12: false })}`;
      statusEl.textContent = text;
    };

    const existing = this.load(key);
    if (existing?.payload && typeof apply === 'function') {
      const shouldRestore = confirm(restoreMessage);
      if (shouldRestore) {
        apply(existing.payload);
      }
      renderStatus(existing.saved_at);
    }

    let disposed = false;
    let debounceTimer = null;
    let intervalTimer = null;

    const saveNow = () => {
      if (disposed || !document.body.contains(form)) {
        dispose();
        return;
      }
      const payload = collect();
      this.save(key, payload);
      renderStatus(new Date().toISOString());
    };

    const onInput = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(saveNow, 500);
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      form.removeEventListener('input', onInput, true);
      form.removeEventListener('change', onInput, true);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (intervalTimer) window.clearInterval(intervalTimer);
    };

    form.addEventListener('input', onInput, true);
    form.addEventListener('change', onInput, true);
    intervalTimer = window.setInterval(saveNow, intervalMs);

    return {
      dispose,
      saveNow,
      clear: () => this.remove(key),
    };
  },
};
