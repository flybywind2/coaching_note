const STORAGE_KEYS = {
  token: 'ssp_token',
  user: 'ssp_user',
  theme: 'new_ui_theme',
  batchId: 'new_ui_batch_id',
};

const THEMES = [
  { id: 'ocean', label: 'Ocean' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'amber', label: 'Amber' },
  { id: 'slate', label: 'Slate' },
];

const KST_TIMEZONE = 'Asia/Seoul';

const USER_ROLE_OPTIONS = [
  { value: 'admin', label: '관리자' },
  { value: 'internal_coach', label: '사내코치' },
  { value: 'external_coach', label: '외부코치' },
  { value: 'participant', label: '참여자' },
  { value: 'observer', label: '참관자' },
];

const ROLE_LABELS = {
  admin: '관리자',
  internal_coach: '사내코치',
  external_coach: '외부코치',
  participant: '참여자',
  observer: '참관자',
};

function normalizeRole(role) {
  const raw = String(role || '').trim();
  if (raw === 'coach') return 'internal_coach';
  return raw;
}

const ROLE = {
  canDashboard(role) {
    const normalized = normalizeRole(role);
    return ['admin', 'internal_coach'].includes(normalized);
  },
  canCalendar(role) {
    const normalized = normalizeRole(role);
    return ['admin', 'internal_coach', 'participant', 'observer'].includes(normalized);
  },
  canAdmin(role) {
    return normalizeRole(role) === 'admin';
  },
  canCoachingPlan(role) {
    return this.canDashboard(role);
  },
  canAbout(role) {
    const normalized = normalizeRole(role);
    return ['admin', 'internal_coach', 'external_coach', 'participant', 'observer'].includes(normalized);
  },
  homePath(role) {
    if (this.canDashboard(role)) return '/dashboard';
    return '/projects';
  },
};

const appEl = document.getElementById('app');

const state = {
  token: localStorage.getItem(STORAGE_KEYS.token) || '',
  user: loadUser(),
  theme: resolveInitialTheme(),
  batches: [],
  batchId: Number(localStorage.getItem(STORAGE_KEYS.batchId) || 0) || null,
  boardPage: { boardId: null, skip: 0, limit: 20 },
};

applyTheme(state.theme);
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', render);

function loadUser() {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveInitialTheme() {
  const fromQuery = new URLSearchParams(location.search).get('theme');
  if (THEMES.some((t) => t.id === fromQuery)) {
    localStorage.setItem(STORAGE_KEYS.theme, fromQuery);
    return fromQuery;
  }
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  if (THEMES.some((t) => t.id === saved)) return saved;
  return 'ocean';
}

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  state.theme = themeId;
  localStorage.setItem(STORAGE_KEYS.theme, themeId);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '-';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatDateTime(value) {
  const dt = parseDate(value);
  if (!dt) return '-';
  return dt.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: KST_TIMEZONE,
  });
}

function formatDate(value) {
  const dt = parseDate(value);
  if (!dt) return '-';
  return dt.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    timeZone: KST_TIMEZONE,
  });
}

function formatTime(value) {
  const dt = parseDate(value);
  if (!dt) return '-';
  return dt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: KST_TIMEZONE,
  });
}

function roleLabel(role) {
  const normalized = normalizeRole(role);
  return ROLE_LABELS[normalized] || normalized || '-';
}

function getDefaultAuthedPath() {
  return ROLE.homePath(state.user?.role || '');
}

function hashPath() {
  return location.hash.replace(/^#/, '') || (state.token ? getDefaultAuthedPath() : '/login');
}

function navigate(path) {
  location.hash = `#${path}`;
}

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

function clearSession() {
  state.token = '';
  state.user = null;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    navigate('/login');
    throw new Error('인증이 만료되었습니다. 다시 로그인하세요.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '요청 처리 중 오류가 발생했습니다.');
  }
  if (res.status === 204) return null;
  return res.json();
}

function canWriteCoachingNote(role) {
  const normalized = normalizeRole(role);
  return ['admin', 'internal_coach', 'external_coach'].includes(normalized);
}

function canWriteBoard(role) {
  return normalizeRole(role) !== 'observer';
}

function canEditProjectBasicInfo(role, project) {
  const normalized = normalizeRole(role);
  if (normalized === 'admin') return true;
  if (normalized === 'participant' && project && project.is_my_project) return true;
  return false;
}

function roleAllowsBatchScope(role) {
  const normalized = normalizeRole(role);
  return ['internal_coach', 'external_coach', 'participant'].includes(normalized);
}

function roleAllowsProjectScope(role) {
  const normalized = normalizeRole(role);
  return ['external_coach', 'participant'].includes(normalized);
}

function renderRichContent(value, fallback = '-') {
  if (typeof Fmt !== 'undefined' && typeof Fmt.rich === 'function') {
    return Fmt.rich(value, fallback);
  }
  if (!value) return fallback;
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function sanitizeRichContent(value) {
  if (typeof Fmt !== 'undefined' && typeof Fmt.sanitizeHtml === 'function') {
    return Fmt.sanitizeHtml(value || '');
  }
  return value || '';
}

function toDateInputValue(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const dt = parseDate(value);
  if (!dt) return '';
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function uploadEditorImage(file, options = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('scope', options.scope || 'general');
  if (options.projectId) fd.append('project_id', String(options.projectId));
  if (options.boardId) fd.append('board_id', String(options.boardId));
  return api('/api/uploads/images', { method: 'POST', body: fd });
}

async function uploadEditorFile(file, options = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('scope', options.scope || 'general');
  if (options.projectId) fd.append('project_id', String(options.projectId));
  if (options.boardId) fd.append('board_id', String(options.boardId));
  return api('/api/uploads/files', { method: 'POST', body: fd });
}

function createRichField(container, { initialHTML = '', placeholder = '', uploadOptions = {} } = {}) {
  const target = typeof container === 'string' ? document.getElementById(container) : container;
  if (!target) {
    return {
      getHTML: () => '',
      setHTML: () => {},
      isEmpty: () => true,
    };
  }

  if (typeof RichEditor !== 'undefined' && RichEditor && typeof RichEditor.create === 'function') {
    const editor = RichEditor.create(target, {
      initialHTML,
      placeholder,
      compact: false,
      onImageUpload: (file) => uploadEditorImage(file, uploadOptions),
      onFileUpload: (file) => uploadEditorFile(file, uploadOptions),
    });
    return {
      getHTML: () => editor.getSanitizedHTML(),
      setHTML: (html) => editor.setHTML(html || ''),
      isEmpty: () => editor.isEmpty(),
    };
  }

  target.innerHTML = `<textarea class="w-full rounded-lg border nu-border px-3 py-2 nu-surface min-h-[140px]" placeholder="${escapeHtml(placeholder)}"></textarea>`;
  const textarea = target.querySelector('textarea');
  if (textarea) textarea.value = initialHTML || '';
  return {
    getHTML: () => sanitizeRichContent((textarea?.value || '').replaceAll('\n', '<br>')),
    setHTML: (html) => {
      if (!textarea) return;
      textarea.value = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    },
    isEmpty: () => !(textarea?.value || '').trim(),
  };
}

async function ensureBatches() {
  state.batches = await api('/api/batches').catch(() => []);
  if (!state.batches.length) {
    state.batchId = null;
    return;
  }

  const isValid = state.batches.some((b) => Number(b.batch_id) === Number(state.batchId));
  if (!isValid) {
    state.batchId = Number(state.batches[0].batch_id);
    localStorage.setItem(STORAGE_KEYS.batchId, String(state.batchId));
  }
}

async function render() {
  const path = hashPath();
  const needsAuth = path !== '/login';

  if (needsAuth && !state.token) {
    navigate('/login');
    return;
  }
  if (!needsAuth && state.token) {
    navigate(getDefaultAuthedPath());
    return;
  }

  if (needsAuth) await ensureBatches();
  renderShell(path);
  const view = document.getElementById('nu-view');

  try {
    if (path === '/login') {
      renderLogin(view);
      return;
    }
    if (path === '/dashboard') {
      if (!ROLE.canDashboard(state.user?.role || '')) return renderForbidden(view, '대시보드');
      await renderDashboard(view);
      return;
    }
    if (path === '/projects') {
      await renderProjects(view);
      return;
    }
    if (path.match(/^\/projects\/\d+$/)) {
      const projectId = Number(path.split('/')[2]);
      await renderProjectDetail(view, projectId);
      return;
    }
    if (path === '/calendar') {
      if (!ROLE.canCalendar(state.user?.role || '')) return renderForbidden(view, '캘린더');
      await renderCalendar(view);
      return;
    }
    if (path === '/board') {
      await renderBoard(view);
      return;
    }
    if (path === '/about') {
      if (!ROLE.canAbout(state.user?.role || '')) return renderForbidden(view, 'SSP+ 소개');
      await renderAbout(view);
      return;
    }
    if (path === '/coaching-plan') {
      if (!ROLE.canCoachingPlan(state.user?.role || '')) return renderForbidden(view, '코칭 계획/실적');
      await renderCoachingPlan(view);
      return;
    }
    if (path === '/admin') {
      if (!ROLE.canAdmin(state.user?.role || '')) return renderForbidden(view, '관리자');
      await renderAdmin(view);
      return;
    }
    renderNotFound(view);
  } catch (error) {
    console.error(error);
    view.innerHTML = `
      <div class="rounded-2xl border nu-border nu-surface p-5">
        <h2 class="text-lg font-semibold text-red-600">오류가 발생했습니다</h2>
        <p class="mt-2 nu-text-muted">${escapeHtml(error.message || '알 수 없는 오류')}</p>
      </div>
    `;
  }
}

function renderShell(path) {
  if (path === '/login') {
    appEl.innerHTML = '<main class="min-h-screen flex items-center justify-center p-4" id="nu-view"></main>';
    return;
  }

  const role = state.user?.role || '';
  const navItems = [
    { path: '/dashboard', label: '대시보드', visible: ROLE.canDashboard(role) },
    { path: '/projects', label: '과제', visible: true },
    { path: '/calendar', label: '캘린더', visible: ROLE.canCalendar(role) },
    { path: '/coaching-plan', label: '코칭 계획/실적', visible: ROLE.canCoachingPlan(role) },
    { path: '/about', label: 'SSP+ 소개', visible: ROLE.canAbout(role) },
    { path: '/board', label: '게시판', visible: true },
    { path: '/admin', label: '관리', visible: ROLE.canAdmin(role) },
  ].filter((item) => item.visible);

  appEl.innerHTML = `
    <div class="min-h-screen">
      <header class="sticky top-0 z-20 border-b nu-border bg-white/90 backdrop-blur">
        <div class="max-w-7xl mx-auto px-4 py-3">
          <div class="flex flex-wrap items-center gap-3 justify-between">
            <div class="flex items-center gap-3">
              <span class="text-xl font-bold nu-primary">SSP+ New UI</span>
              <span class="text-xs px-2 py-1 rounded-full nu-primary-soft">Tailwind</span>
            </div>
            <nav class="flex flex-wrap items-center gap-2">
              ${navItems
                .map(
                  (item) => `
                <a href="#${item.path}" class="px-3 py-2 rounded-lg text-sm border nu-border ${
                    path === item.path ? 'nu-primary-bg' : 'nu-surface hover:nu-soft'
                  }">
                  ${item.label}
                </a>
              `
                )
                .join('')}
            </nav>
            <div class="flex flex-wrap items-center gap-2">
              <select id="nu-theme" class="text-sm border nu-border rounded-lg px-2 py-2 nu-surface">
                ${THEMES.map((theme) => `<option value="${theme.id}" ${theme.id === state.theme ? 'selected' : ''}>${theme.label}</option>`).join('')}
              </select>
              <select id="nu-batch" class="text-sm border nu-border rounded-lg px-2 py-2 nu-surface min-w-[180px]">
                ${
                  state.batches.length
                    ? state.batches
                        .map(
                          (b) =>
                            `<option value="${b.batch_id}" ${Number(b.batch_id) === Number(state.batchId) ? 'selected' : ''}>${escapeHtml(
                              b.batch_name
                            )}</option>`
                        )
                        .join('')
                    : `<option value="">차수 없음</option>`
                }
              </select>
              <button id="nu-logout" class="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100">로그아웃</button>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div class="text-sm nu-text-muted">
              사용자: <b>${escapeHtml(state.user?.name || '-')}</b> (${escapeHtml(roleLabel(state.user?.role || '-'))})
            </div>
            <div id="nu-attendance-quick" class="text-xs"></div>
          </div>
        </div>
      </header>
      <main id="nu-view" class="max-w-7xl mx-auto p-4"></main>
    </div>
  `;

  document.getElementById('nu-theme')?.addEventListener('change', (e) => applyTheme(e.target.value));
  document.getElementById('nu-batch')?.addEventListener('change', (e) => {
    state.batchId = Number(e.target.value) || null;
    localStorage.setItem(STORAGE_KEYS.batchId, String(state.batchId || ''));
    render();
  });
  document.getElementById('nu-logout')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (_) {
      // ignore
    }
    clearSession();
    navigate('/login');
  });
  renderAttendanceQuick();
}

async function renderAttendanceQuick() {
  const target = document.getElementById('nu-attendance-quick');
  if (!target || !state.token) return;

  target.innerHTML = `
    <div class="rounded-lg border nu-border nu-surface px-3 py-2 nu-text-muted">
      출석 상태를 확인하는 중...
    </div>
  `;

  try {
    const status = await api('/api/attendance/my-status');
    const log = status?.attendance_log || null;
    const workDateText = formatDate(status?.work_date || new Date());
    const checkInText = log?.check_in_time ? formatTime(log.check_in_time) : '-';
    const checkOutText = log?.check_out_time ? formatTime(log.check_out_time) : '-';
    const canCheckIn = !!status?.can_checkin;
    const canCheckOut = !!status?.can_checkout;
    const canCancelCheckout = !!(log?.check_out_time && status?.ip_allowed);

    target.innerHTML = `
      <div class="rounded-lg border nu-border nu-surface px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-semibold">오늘 출석</div>
            <div class="nu-text-muted">${escapeHtml(workDateText)}</div>
          </div>
          <div class="flex items-center gap-2">
            <button id="nu-att-checkin" class="rounded-lg px-2.5 py-1.5 text-xs ${
              canCheckIn ? 'nu-primary-bg' : 'border nu-border nu-surface nu-text-muted'
            }" ${canCheckIn ? '' : 'disabled'}>입실</button>
            <button id="nu-att-checkout" class="rounded-lg px-2.5 py-1.5 text-xs ${
              canCheckOut ? 'nu-primary-bg' : 'border nu-border nu-surface nu-text-muted'
            }" ${canCheckOut ? '' : 'disabled'}>퇴실</button>
            <button id="nu-att-cancel" class="rounded-lg px-2.5 py-1.5 text-xs ${
              canCancelCheckout ? 'border border-amber-300 bg-amber-50 text-amber-700' : 'border nu-border nu-surface nu-text-muted'
            }" ${canCancelCheckout ? '' : 'disabled'}>퇴실취소</button>
          </div>
        </div>
        <div class="mt-1 nu-text-muted">
          입실 ${escapeHtml(checkInText)} / 퇴실 ${escapeHtml(checkOutText)}
          ${status?.ip_allowed ? '' : '<span class="text-red-600 ml-1">(허용 IP 아님)</span>'}
        </div>
      </div>
    `;

    const submitAction = async (path) => {
      try {
        await api(path, { method: 'POST' });
        await renderAttendanceQuick();
      } catch (error) {
        alert(error.message || '출석 처리 실패');
      }
    };
    document.getElementById('nu-att-checkin')?.addEventListener('click', () => submitAction('/api/attendance/checkin'));
    document.getElementById('nu-att-checkout')?.addEventListener('click', () => submitAction('/api/attendance/checkout'));
    document.getElementById('nu-att-cancel')?.addEventListener('click', () => submitAction('/api/attendance/checkout-cancel'));
  } catch (error) {
    target.innerHTML = `
      <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600">
        출석 상태 조회 실패: ${escapeHtml(error.message || '알 수 없는 오류')}
      </div>
    `;
  }
}

function renderLogin(view) {
  view.innerHTML = `
    <div class="w-full max-w-md rounded-2xl border nu-border nu-surface p-6 shadow-sm">
      <h1 class="text-2xl font-bold">SSP+ New UI 로그인</h1>
      <p class="mt-2 nu-text-muted">사번(emp_id)으로 로그인하세요.</p>
      <form id="nu-login-form" class="mt-6 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">사번 (emp_id)</label>
          <input id="nu-emp-id" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" placeholder="예: admin001" required />
        </div>
        <button class="w-full rounded-lg px-3 py-2 nu-primary-bg font-semibold" type="submit">로그인</button>
      </form>
      <p id="nu-login-error" class="text-sm text-red-600 mt-3 hidden"></p>
      <div class="mt-6 text-xs nu-text-muted">
        테스트 계정 예시: admin001 / coach001 / user001 / obs001
      </div>
    </div>
  `;

  document.getElementById('nu-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('nu-login-error');
    errorEl.classList.add('hidden');
    const empId = document.getElementById('nu-emp-id').value.trim();
    try {
      const loginData = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ emp_id: empId }),
      });
      let user = loginData.user || null;
      if (!user) {
        user = await api('/api/auth/me');
      }
      setSession(loginData.access_token, user);
      navigate(getDefaultAuthedPath());
    } catch (error) {
      errorEl.textContent = error.message || '로그인 실패';
      errorEl.classList.remove('hidden');
    }
  });
}
async function renderDashboard(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const data = await api(`/api/dashboard?batch_id=${state.batchId}`);
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const coachingDates = Array.isArray(data.coaching_schedule_dates) ? data.coaching_schedule_dates : [];
  const attendanceRows = Array.isArray(data.attendance_rows) ? data.attendance_rows : [];
  const noteRows = Array.isArray(data.note_rows) ? data.note_rows : [];

  const avgProgress = projects.length
    ? projects.reduce((sum, p) => sum + Number(p.progress_rate || 0), 0) / projects.length
    : 0;
  const totalAttendance = attendanceRows.reduce(
    (sum, row) => sum + (Array.isArray(row.cells) ? row.cells.reduce((acc, c) => acc + Number(c.attendance_count || 0), 0) : 0),
    0
  );
  const totalNotes = noteRows.reduce(
    (sum, row) => sum + (Array.isArray(row.cells) ? row.cells.reduce((acc, c) => acc + Number(c.note_count || 0), 0) : 0),
    0
  );

  const topProjects = [...projects]
    .sort((a, b) => Number(b.progress_rate || 0) - Number(a.progress_rate || 0))
    .slice(0, 8);

  view.innerHTML = `
    <section class="mb-5">
      <h1 class="text-2xl font-bold">대시보드</h1>
      <p class="nu-text-muted mt-1">현재 차수의 진행 현황을 한 눈에 확인합니다.</p>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
      ${kpiCard('총 과제 수', `${projects.length}개`)}
      ${kpiCard('코칭 일정일', `${coachingDates.length}일`)}
      ${kpiCard('평균 진행률', `${avgProgress.toFixed(1)}%`)}
      ${kpiCard('출석/노트', `${totalAttendance} / ${totalNotes}`)}
    </section>

    <section class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="rounded-2xl border nu-border nu-surface p-4">
        <h2 class="font-semibold text-lg">과제 진행 상위</h2>
        <div class="mt-3 space-y-3">
          ${
            topProjects.length
              ? topProjects
                  .map((p) => {
                    const progress = Math.max(0, Math.min(100, Number(p.progress_rate || 0)));
                    return `
                      <button data-project-id="${p.project_id}" class="nu-project-link w-full text-left p-3 rounded-xl border nu-border hover:nu-soft">
                        <div class="flex justify-between items-center gap-2">
                          <div class="font-medium">${escapeHtml(p.project_name || '-')}</div>
                          <div class="text-sm nu-text-muted">${progress.toFixed(0)}%</div>
                        </div>
                        <div class="w-full h-2 rounded-full bg-slate-200 mt-2 overflow-hidden">
                          <div class="h-full nu-primary-bg" style="width:${progress}%"></div>
                        </div>
                      </button>
                    `;
                  })
                  .join('')
              : '<p class="nu-text-muted text-sm">표시할 과제가 없습니다.</p>'
          }
        </div>
      </div>
      <div class="rounded-2xl border nu-border nu-surface p-4">
        <h2 class="font-semibold text-lg">최근 코칭 일정일</h2>
        <div class="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          ${
            coachingDates.length
              ? coachingDates
                  .slice(-12)
                  .reverse()
                  .map((d) => `<div class="rounded-lg nu-soft px-3 py-2 text-sm">${escapeHtml(d)}</div>`)
                  .join('')
              : '<p class="nu-text-muted text-sm">코칭 일정 데이터가 없습니다.</p>'
          }
        </div>
      </div>
    </section>
  `;

  view.querySelectorAll('.nu-project-link').forEach((btn) =>
    btn.addEventListener('click', () => navigate(`/projects/${btn.dataset.projectId}`))
  );
}

async function renderProjects(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const projects = await api(`/api/batches/${state.batchId}/projects`).catch(() => []);
  const rows = Array.isArray(projects) ? projects : [];
  let keyword = '';
  let type = 'all';
  let page = 1;
  const pageSize = 12;

  function draw() {
    const filtered = rows.filter((p) => {
      const matchType = type === 'all' || String(p.project_type || 'primary') === type;
      const text = `${p.project_name || ''} ${p.organization || ''} ${p.representative || ''}`.toLowerCase();
      return matchType && text.includes(keyword.toLowerCase());
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    tableWrap.innerHTML = `
      <div class="overflow-auto rounded-2xl border nu-border nu-surface">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left border-b nu-border">
              <th class="px-3 py-2">과제명</th>
              <th class="px-3 py-2">구분</th>
              <th class="px-3 py-2">부서</th>
              <th class="px-3 py-2">대표자</th>
              <th class="px-3 py-2">진행률</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            ${
              pageRows.length
                ? pageRows
                    .map(
                      (p) => `
                  <tr class="border-b nu-border hover:nu-soft">
                    <td class="px-3 py-2 font-medium">${escapeHtml(p.project_name || '-')}</td>
                    <td class="px-3 py-2">${escapeHtml(String(p.project_type || 'primary') === 'associate' ? '준참여과제' : '정식과제')}</td>
                    <td class="px-3 py-2">${escapeHtml(p.organization || '-')}</td>
                    <td class="px-3 py-2">${escapeHtml(p.representative || '-')}</td>
                    <td class="px-3 py-2">${Number(p.progress_rate || 0).toFixed(0)}%</td>
                    <td class="px-3 py-2 text-right"><button data-project-id="${p.project_id}" class="nu-project-open rounded-lg px-3 py-1.5 text-xs nu-primary-bg">열기</button></td>
                  </tr>
                `
                    )
                    .join('')
                : '<tr><td colspan="6" class="px-3 py-6 text-center nu-text-muted">조회 결과가 없습니다.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between mt-3 text-sm nu-text-muted">
        <div>총 ${total}개</div>
        <div class="flex items-center gap-2">
          <button id="nu-project-prev" class="rounded-lg border nu-border px-3 py-1.5 nu-surface">이전</button>
          <span>${page} / ${totalPages}</span>
          <button id="nu-project-next" class="rounded-lg border nu-border px-3 py-1.5 nu-surface">다음</button>
        </div>
      </div>
    `;

    tableWrap.querySelectorAll('.nu-project-open').forEach((btn) =>
      btn.addEventListener('click', () => navigate(`/projects/${btn.dataset.projectId}`))
    );
    document.getElementById('nu-project-prev')?.addEventListener('click', () => {
      page = Math.max(1, page - 1);
      draw();
    });
    document.getElementById('nu-project-next')?.addEventListener('click', () => {
      page = Math.min(totalPages, page + 1);
      draw();
    });
  }

  view.innerHTML = `
    <section class="mb-5">
      <h1 class="text-2xl font-bold">과제</h1>
      <p class="nu-text-muted mt-1">차수당 30~40개 과제를 빠르게 관리할 수 있도록 검색/필터/페이지네이션을 제공합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input id="nu-project-search" class="rounded-lg border nu-border px-3 py-2 nu-surface" placeholder="과제명/부서/대표자 검색" />
        <select id="nu-project-type" class="rounded-lg border nu-border px-3 py-2 nu-surface">
          <option value="all">전체 과제</option>
          <option value="primary">정식과제</option>
          <option value="associate">준참여과제</option>
        </select>
        <div class="text-sm nu-text-muted flex items-center">총 ${rows.length}개 과제</div>
      </div>
    </section>
    <section id="nu-project-list"></section>
  `;

  const searchEl = document.getElementById('nu-project-search');
  const typeEl = document.getElementById('nu-project-type');
  const tableWrap = document.getElementById('nu-project-list');

  searchEl.addEventListener('input', () => {
    keyword = searchEl.value.trim();
    page = 1;
    draw();
  });
  typeEl.addEventListener('change', () => {
    type = typeEl.value;
    page = 1;
    draw();
  });

  draw();
}

async function renderProjectDetail(view, projectId) {
  const role = state.user?.role || '';
  const [project, members, notes, tasks] = await Promise.all([
    api(`/api/projects/${projectId}`),
    api(`/api/projects/${projectId}/members`).catch(() => []),
    api(`/api/projects/${projectId}/notes`).catch(() => []),
    api(`/api/projects/${projectId}/tasks`).catch(() => []),
  ]);

  const memberRows = Array.isArray(members) ? members : [];
  const noteRows = (Array.isArray(notes) ? notes : []).sort((a, b) => {
    const aDate = new Date(a.coaching_date || a.created_at || 0).getTime();
    const bDate = new Date(b.coaching_date || b.created_at || 0).getTime();
    return bDate - aDate;
  });
  const taskRows = Array.isArray(tasks) ? tasks : [];

  const canEditProject = canEditProjectBasicInfo(role, project);
  const canEditNotes = canWriteCoachingNote(role);

  view.innerHTML = `
    <section class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">${escapeHtml(project.project_name || '과제 상세')}</h1>
        <p class="nu-text-muted mt-1">${escapeHtml(project.organization || '-')} · 대표자 ${escapeHtml(project.representative || '-')}</p>
      </div>
      <button id="nu-back-projects" class="rounded-lg border nu-border px-3 py-2 nu-surface hover:nu-soft">과제 목록</button>
    </section>

    <section class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="rounded-2xl border nu-border nu-surface p-4 xl:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-semibold">과제 기본정보</h2>
          ${canEditProject ? '<span class="text-xs nu-text-muted">저장 시 즉시 반영됩니다.</span>' : '<span class="text-xs nu-text-muted">읽기 전용</span>'}
        </div>
        <form id="nu-project-info-form" class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label class="text-sm">과제명
            <input name="project_name" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(project.project_name || '')}" ${canEditProject ? '' : 'disabled'} />
          </label>
          <label class="text-sm">부서
            <input name="organization" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(project.organization || '')}" ${canEditProject ? '' : 'disabled'} />
          </label>
          <label class="text-sm">대표자
            <input name="representative" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(project.representative || '')}" ${canEditProject ? '' : 'disabled'} />
          </label>
          <label class="text-sm">진행률 (%)
            <input type="number" min="0" max="100" name="progress_rate" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${Number(project.progress_rate || 0)}" ${canEditProject ? '' : 'disabled'} />
          </label>
          <label class="text-sm">AI 기술 분류
            <input name="ai_tech_category" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(project.ai_tech_category || project.category || '')}" ${canEditProject ? '' : 'disabled'} />
          </label>
          <label class="text-sm">사용 AI 기술
            <input name="ai_tech_used" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(project.ai_tech_used || '')}" ${canEditProject ? '' : 'disabled'} />
          </label>
          <label class="text-sm md:col-span-2">과제 요약
            <textarea name="project_summary" rows="3" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" ${canEditProject ? '' : 'disabled'}>${escapeHtml(project.project_summary || '')}</textarea>
          </label>
          <label class="text-sm md:col-span-2">Github Repos (줄바꿈 구분)
            <textarea name="github_repos" rows="3" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" ${canEditProject ? '' : 'disabled'}>${escapeHtml((project.github_repos || []).join('\n'))}</textarea>
          </label>
          ${canEditProject ? `
            <div class="md:col-span-2 flex items-center gap-2">
              <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">기본정보 저장</button>
              <span id="nu-project-info-msg" class="text-sm nu-text-muted"></span>
            </div>
          ` : ''}
        </form>
      </div>

      <div class="rounded-2xl border nu-border nu-surface p-4">
        <h2 class="font-semibold">팀/과제 요약</h2>
        <div class="mt-3 space-y-3 text-sm">
          <div>
            <div class="nu-text-muted">참여자 (${memberRows.length})</div>
            <ul class="mt-1 space-y-1">
              ${
                memberRows.length
                  ? memberRows.map((m) => `<li>${escapeHtml(m.user_name || m.name || '-')} <span class="nu-text-muted">(${escapeHtml(m.role || '-')})</span></li>`).join('')
                  : '<li class="nu-text-muted">참여자 없음</li>'
              }
            </ul>
          </div>
          <div>
            <div class="nu-text-muted">과제 목록 (${taskRows.length})</div>
            <ul class="mt-1 space-y-1">
              ${
                taskRows.length
                  ? taskRows.slice(0, 8).map((t) => `<li>${escapeHtml(t.title || t.task_name || '-')} <span class="nu-text-muted">(${escapeHtml(t.status || '-')})</span></li>`).join('')
                  : '<li class="nu-text-muted">등록된 과제 없음</li>'
              }
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-2xl border nu-border nu-surface p-4 mt-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">코칭노트 (${noteRows.length})</h2>
        ${canEditNotes ? '<button id="nu-note-create-btn" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">새 코칭노트</button>' : '<span class="text-xs nu-text-muted">코칭노트 작성 권한 없음</span>'}
      </div>
      <div id="nu-note-editor-zone" class="mt-3"></div>
      <div id="nu-note-list" class="mt-4 space-y-3"></div>
    </section>
  `;

  document.getElementById('nu-back-projects')?.addEventListener('click', () => navigate('/projects'));

  if (canEditProject) {
    const infoForm = document.getElementById('nu-project-info-form');
    infoForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(infoForm);
      const progress = Number.parseInt(String(fd.get('progress_rate') || ''), 10);
      const reposRaw = String(fd.get('github_repos') || '');
      const payload = {
        project_name: String(fd.get('project_name') || '').trim(),
        organization: String(fd.get('organization') || '').trim(),
        representative: String(fd.get('representative') || '').trim() || null,
        progress_rate: Number.isNaN(progress) ? null : Math.max(0, Math.min(100, progress)),
        ai_tech_category: String(fd.get('ai_tech_category') || '').trim() || null,
        ai_tech_used: String(fd.get('ai_tech_used') || '').trim() || null,
        project_summary: String(fd.get('project_summary') || '').trim() || null,
        github_repos: reposRaw.split('\n').map((v) => v.trim()).filter(Boolean),
      };
      const msgEl = document.getElementById('nu-project-info-msg');
      try {
        await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) });
        if (msgEl) msgEl.textContent = '저장되었습니다.';
        await renderProjectDetail(view, projectId);
      } catch (err) {
        if (msgEl) msgEl.textContent = err.message || '저장 실패';
      }
    });
  }

  const noteListEl = document.getElementById('nu-note-list');
  const noteEditorZoneEl = document.getElementById('nu-note-editor-zone');

  const renderNoteList = () => {
    noteListEl.innerHTML = noteRows.length
      ? noteRows.map((note) => `
          <article class="rounded-xl border nu-border p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="font-semibold">${escapeHtml(note.coaching_date || '-')} ${note.week_number ? `· ${note.week_number}주차` : ''}</div>
                <div class="text-xs nu-text-muted">${escapeHtml(note.author_name || '-')} · ${formatDateTime(note.created_at)}</div>
              </div>
              ${canEditNotes ? `
                <div class="flex items-center gap-2">
                  <button class="nu-note-edit-btn rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-note-id="${note.note_id}">편집</button>
                  <button class="nu-note-del-btn rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 bg-red-50" data-note-id="${note.note_id}">삭제</button>
                </div>
              ` : ''}
            </div>
            <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div class="nu-text-muted mb-1">현재 상태</div>
                <div class="rich-content">${renderRichContent(note.current_status, '-')}</div>
              </div>
              <div>
                <div class="nu-text-muted mb-1">주요 이슈</div>
                <div class="rich-content">${renderRichContent(note.main_issue, '-')}</div>
              </div>
              <div>
                <div class="nu-text-muted mb-1">다음 액션</div>
                <div class="rich-content">${renderRichContent(note.next_action, '-')}</div>
              </div>
            </div>
          </article>
        `).join('')
      : '<p class="nu-text-muted text-sm">코칭노트가 없습니다.</p>';

    if (!canEditNotes) return;
    noteListEl.querySelectorAll('.nu-note-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const noteId = Number.parseInt(btn.dataset.noteId, 10);
        const target = noteRows.find((n) => Number(n.note_id) === noteId);
        if (!target) return;
        openNoteEditor(target);
      });
    });
    noteListEl.querySelectorAll('.nu-note-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const noteId = Number.parseInt(btn.dataset.noteId, 10);
        if (Number.isNaN(noteId)) return;
        if (!confirm('코칭노트를 삭제하시겠습니까?')) return;
        try {
          await api(`/api/notes/${noteId}`, { method: 'DELETE' });
          await renderProjectDetail(view, projectId);
        } catch (err) {
          alert(err.message || '코칭노트 삭제 실패');
        }
      });
    });
  };

  const openNoteEditor = (note = null) => {
    if (!canEditNotes) return;
    const isEdit = !!note;
    const today = toDateInputValue(new Date()) || '';
    const dateValue = toDateInputValue(note?.coaching_date) || today;
    noteEditorZoneEl.innerHTML = `
      <form id="nu-note-form" class="rounded-xl border nu-border p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold text-sm">${isEdit ? '코칭노트 편집' : '코칭노트 작성'}</h3>
          <div class="flex items-center gap-2">
            <button type="button" id="nu-note-cancel-btn" class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface">닫기</button>
            <button type="submit" class="rounded-lg px-3 py-1.5 text-xs nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <label>코칭일자
            <input type="date" name="coaching_date" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${dateValue}" required />
          </label>
          <label>주차
            <input type="number" min="1" name="week_number" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${note?.week_number || ''}" />
          </label>
          <label>진행률 (%)
            <input type="number" min="0" max="100" name="progress_rate" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${note?.progress_rate ?? project.progress_rate ?? ''}" />
          </label>
        </div>
        <div class="mt-3 grid grid-cols-1 gap-3">
          <div>
            <div class="text-sm nu-text-muted mb-1">현재 상태</div>
            <div id="nu-note-current-editor"></div>
          </div>
          <div>
            <div class="text-sm nu-text-muted mb-1">주요 이슈</div>
            <div id="nu-note-issue-editor"></div>
          </div>
          <div>
            <div class="text-sm nu-text-muted mb-1">다음 액션</div>
            <div id="nu-note-action-editor"></div>
          </div>
        </div>
        <p id="nu-note-form-msg" class="mt-2 text-sm text-red-600"></p>
      </form>
    `;

    const currentEditor = createRichField('nu-note-current-editor', {
      initialHTML: note?.current_status || '',
      placeholder: '현재 상태를 입력하세요.',
      uploadOptions: { scope: 'note', projectId },
    });
    const issueEditor = createRichField('nu-note-issue-editor', {
      initialHTML: note?.main_issue || '',
      placeholder: '주요 이슈를 입력하세요.',
      uploadOptions: { scope: 'note', projectId },
    });
    const actionEditor = createRichField('nu-note-action-editor', {
      initialHTML: note?.next_action || '',
      placeholder: '다음 액션을 입력하세요.',
      uploadOptions: { scope: 'note', projectId },
    });

    document.getElementById('nu-note-cancel-btn')?.addEventListener('click', () => {
      noteEditorZoneEl.innerHTML = '';
    });

    const noteForm = document.getElementById('nu-note-form');
    noteForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('nu-note-form-msg');
      const fd = new FormData(noteForm);
      const week = Number.parseInt(String(fd.get('week_number') || ''), 10);
      const progress = Number.parseInt(String(fd.get('progress_rate') || ''), 10);
      const payload = {
        coaching_date: String(fd.get('coaching_date') || '').trim(),
        week_number: Number.isNaN(week) ? null : week,
        progress_rate: Number.isNaN(progress) ? null : Math.max(0, Math.min(100, progress)),
        current_status: currentEditor.getHTML() || null,
        main_issue: issueEditor.getHTML() || null,
        next_action: actionEditor.getHTML() || null,
      };
      if (!payload.coaching_date) {
        if (msgEl) msgEl.textContent = '코칭일자를 입력하세요.';
        return;
      }
      try {
        if (isEdit) {
          await api(`/api/notes/${note.note_id}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api(`/api/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify(payload) });
        }
        await renderProjectDetail(view, projectId);
      } catch (err) {
        if (msgEl) msgEl.textContent = err.message || '코칭노트 저장 실패';
      }
    });
  };

  document.getElementById('nu-note-create-btn')?.addEventListener('click', () => openNoteEditor());
  renderNoteList();
}
async function renderCalendar(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const CALENDAR_VIEW_KEY = 'new_ui_calendar_view';
  const now = new Date();
  let monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const savedViewMode = localStorage.getItem(CALENDAR_VIEW_KEY);
  let viewMode = savedViewMode === 'list' ? 'list' : 'calendar';
  let events = [];
  const canManageSchedule = (state.user?.role || '') === 'admin';

  const pad2 = (value) => String(value).padStart(2, '0');
  const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const toMonthValue = (year, month) => `${year}-${pad2(month)}`;
  const parseMonthValue = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) return null;
    return { year, month };
  };
  const shiftMonthValue = (value, diff) => {
    const parsed = parseMonthValue(value) || parseMonthValue(monthValue) || { year: now.getFullYear(), month: now.getMonth() + 1 };
    const nextDate = new Date(parsed.year, parsed.month - 1 + diff, 1);
    return toMonthValue(nextDate.getFullYear(), nextDate.getMonth() + 1);
  };
  const toDateInputValue = (value) => {
    const dt = parseDate(value);
    if (!dt) return '';
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  };
  const toTimeInputValue = (value) => {
    const dt = parseDate(value);
    if (!dt) return '';
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  };
  const toDateTimeString = (dateStr, timeStr) => `${dateStr}T${String(timeStr || '00:00').slice(0, 5)}:00`;
  const normalizeScheduleScope = (scope, scheduleType) => {
    const raw = String(scope || '').trim().toLowerCase();
    if (raw === 'coaching') return 'coaching';
    if (raw === 'global') return 'global';
    return String(scheduleType || '').toLowerCase() === 'coaching' ? 'coaching' : 'global';
  };
  const scopeDisplayText = (scope) => {
    const normalized = normalizeScheduleScope(scope, null);
    if (normalized === 'coaching') return '코칭';
    if (normalized === 'global') return '공통';
    return String(scope || '-');
  };
  const canEditCalendarEvent = (event) => canManageSchedule && String(event?.manage_type || '') === 'schedule';
  const findCalendarEvent = (eventId, manageType) =>
    events.find((ev) => Number(ev.id) === Number(eventId) && String(ev.manage_type || '') === String(manageType || ''));
  const closeScheduleModal = () => {
    document.getElementById('nu-calendar-modal')?.remove();
    document.body.classList.remove('overflow-hidden');
  };
  const openScheduleModal = ({ mode = 'create', presetDate = '', event = null } = {}) => {
    if (!canManageSchedule) return;
    const isEdit = mode === 'edit' && !!event;
    const startDate = toDateInputValue(event?.start) || presetDate || `${monthValue}-01`;
    const startTime = toTimeInputValue(event?.start) || '10:00';
    const endTime = toTimeInputValue(event?.end) || startTime || '11:00';
    const isAllDay = !!event?.is_all_day;
    const initialScope = normalizeScheduleScope(event?.scope, event?.schedule_type);
    const initialTitle = String(event?.title || '');
    const initialDescription = String(event?.description || '');
    const initialLocation = String(event?.location || '');

    closeScheduleModal();
    const overlay = document.createElement('div');
    overlay.id = 'nu-calendar-modal';
    overlay.className = 'fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center';
    overlay.innerHTML = `
      <div class="w-full max-w-xl rounded-2xl border nu-border nu-surface shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b nu-border">
          <h3 class="text-lg font-semibold">${isEdit ? '일정 편집' : '일정 추가'}</h3>
          <button type="button" id="nu-calendar-modal-close" class="rounded-lg border nu-border px-2 py-1 text-sm nu-surface">닫기</button>
        </div>
        <form id="nu-calendar-form" class="p-4 space-y-3">
          <div>
            <label class="text-sm font-medium">공개 범위</label>
            <select name="visibility_scope" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
              <option value="global" ${initialScope === 'global' ? 'selected' : ''}>공통 일정</option>
              <option value="coaching" ${initialScope === 'coaching' ? 'selected' : ''}>코칭 일정</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-medium">제목 *</label>
            <input name="title" value="${escapeHtml(initialTitle)}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" required />
          </div>
          <div>
            <label class="text-sm font-medium">설명</label>
            <textarea name="description" rows="3" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">${escapeHtml(initialDescription)}</textarea>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="text-sm font-medium">날짜 *</label>
              <input type="date" name="event_date" value="${escapeHtml(startDate)}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" required />
            </div>
            <div>
              <label class="text-sm font-medium">시작 시간 *</label>
              <input type="time" name="start_time" value="${escapeHtml(startTime)}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" required />
            </div>
            <div>
              <label class="text-sm font-medium">종료 시간 *</label>
              <input type="time" name="end_time" value="${escapeHtml(endTime)}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" required />
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_all_day" ${isAllDay ? 'checked' : ''} />
            종일 일정
          </label>
          <div>
            <label class="text-sm font-medium">장소</label>
            <input name="location" value="${escapeHtml(initialLocation)}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
          </div>
          <p id="nu-calendar-form-error" class="text-sm text-red-600 hidden"></p>
          <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
            ${isEdit ? '<button type="button" id="nu-calendar-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm mr-auto">삭제</button>' : ''}
            <button type="button" id="nu-calendar-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '추가'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('overflow-hidden');

    const formEl = document.getElementById('nu-calendar-form');
    const errorEl = document.getElementById('nu-calendar-form-error');
    const allDayEl = formEl?.querySelector('input[name="is_all_day"]');
    const startTimeEl = formEl?.querySelector('input[name="start_time"]');
    const endTimeEl = formEl?.querySelector('input[name="end_time"]');
    const syncAllDay = () => {
      const checked = !!allDayEl?.checked;
      if (!startTimeEl || !endTimeEl) return;
      startTimeEl.disabled = checked;
      endTimeEl.disabled = checked;
      if (checked) {
        startTimeEl.value = '00:00';
        endTimeEl.value = '23:59';
      } else if (!startTimeEl.value || !endTimeEl.value) {
        startTimeEl.value = startTime || '10:00';
        endTimeEl.value = endTime || '11:00';
      }
    };
    const showError = (message) => {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    };

    document.getElementById('nu-calendar-modal-close')?.addEventListener('click', closeScheduleModal);
    document.getElementById('nu-calendar-cancel')?.addEventListener('click', closeScheduleModal);
    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) closeScheduleModal();
    });
    allDayEl?.addEventListener('change', syncAllDay);
    syncAllDay();

    document.getElementById('nu-calendar-delete')?.addEventListener('click', async () => {
      if (!event || !canEditCalendarEvent(event)) return;
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/schedules/${event.id}`, { method: 'DELETE' });
        closeScheduleModal();
        await draw();
      } catch (err) {
        showError(err.message || '일정 삭제 실패');
      }
    });

    formEl?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      if (!formEl) return;
      const fd = new FormData(formEl);
      const title = String(fd.get('title') || '').trim();
      const eventDate = String(fd.get('event_date') || '').trim();
      const startTimeValue = String(fd.get('start_time') || '').trim() || '00:00';
      const endTimeValue = String(fd.get('end_time') || '').trim() || startTimeValue;
      const isAllDayValue = fd.has('is_all_day');
      const scope = normalizeScheduleScope(fd.get('visibility_scope'), null);
      const description = String(fd.get('description') || '').trim() || null;
      const location = String(fd.get('location') || '').trim() || null;

      if (errorEl) errorEl.classList.add('hidden');
      if (!title || !eventDate) {
        showError('제목과 날짜를 입력하세요.');
        return;
      }
      if (!isAllDayValue && endTimeValue < startTimeValue) {
        showError('종료 시간은 시작 시간보다 빠를 수 없습니다.');
        return;
      }

      const payload = {
        title,
        description,
        schedule_type: scope === 'coaching' ? 'coaching' : 'other',
        visibility_scope: scope,
        start_datetime: toDateTimeString(eventDate, isAllDayValue ? '00:00' : startTimeValue),
        end_datetime: toDateTimeString(eventDate, isAllDayValue ? '23:59' : endTimeValue),
        location,
        is_all_day: isAllDayValue,
      };

      try {
        if (isEdit && event && canEditCalendarEvent(event)) {
          await api(`/api/schedules/${event.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          await api('/api/schedules', {
            method: 'POST',
            body: JSON.stringify({
              ...payload,
              batch_id: state.batchId,
            }),
          });
        }
        closeScheduleModal();
        await draw();
      } catch (err) {
        showError(err.message || '일정 저장 실패');
      }
    });
  };

  const resolveEventDate = (event) => {
    const raw = event.start_time || event.start || event.date || null;
    const parsed = parseDate(raw);
    return parsed;
  };

  const formatEventTime = (event) => {
    const dt = resolveEventDate(event);
    if (!dt) return '';
    return dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const scheduleTypeClass = (type) => {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('coaching')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (normalized.includes('global') || normalized.includes('common')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (normalized.includes('task') || normalized.includes('milestone')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const buildEventMap = () => {
    const grouped = new Map();
    events.forEach((event) => {
      const dt = resolveEventDate(event);
      if (!dt) return;
      const key = toDateKey(dt);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    });
    grouped.forEach((rows) => {
      rows.sort((a, b) => {
        const aDate = resolveEventDate(a)?.getTime() || 0;
        const bDate = resolveEventDate(b)?.getTime() || 0;
        return aDate - bDate;
      });
    });
    return grouped;
  };

  const drawList = () => {
    const tableHeaders = `
      <th class="py-2 pr-3">일시</th>
      <th class="py-2 pr-3">일정</th>
      <th class="py-2 pr-3">유형</th>
      <th class="py-2 pr-3">공개범위</th>
      <th class="py-2 pr-3">과제</th>
      ${canManageSchedule ? '<th class="py-2 pr-3">관리</th>' : ''}
    `;
    listEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b nu-border">
            ${tableHeaders}
          </tr>
        </thead>
        <tbody>
          ${
            events.length
              ? events
                  .map(
                    (ev) => `
                <tr class="border-b nu-border">
                  <td class="py-2 pr-3">${formatDateTime(ev.start_time || ev.start || ev.date)}</td>
                  <td class="py-2 pr-3">${escapeHtml(ev.title || ev.name || '-')}</td>
                  <td class="py-2 pr-3">${escapeHtml(ev.schedule_type || ev.type || '-')}</td>
                  <td class="py-2 pr-3">${escapeHtml(scopeDisplayText(ev.scope || ev.visibility_scope || '-'))}</td>
                  <td class="py-2 pr-3">${escapeHtml(ev.project_name || '-')}</td>
                  ${
                    canManageSchedule
                      ? `
                        <td class="py-2 pr-3">
                          ${
                            canEditCalendarEvent(ev)
                              ? `<button class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-calendar-edit-btn" data-event-id="${Number(
                                  ev.id
                                )}" data-manage-type="${escapeHtml(ev.manage_type || '')}">편집</button>`
                              : '<span class="nu-text-muted text-xs">-</span>'
                          }
                        </td>
                      `
                      : ''
                  }
                </tr>
              `
                  )
                  .join('')
              : `<tr><td colspan="${canManageSchedule ? 6 : 5}" class="py-3 nu-text-muted">선택한 월의 일정이 없습니다.</td></tr>`
          }
        </tbody>
      </table>
    `;
  };

  const drawCalendarGrid = (year, month) => {
    const eventMap = buildEventMap();
    const firstDay = new Date(year, month - 1, 1);
    const firstWeekday = firstDay.getDay(); // 0: Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const dayNumber = index - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        cells.push('<div class="min-h-[120px] border nu-border rounded-lg bg-slate-50/50"></div>');
        continue;
      }

      const currentDate = new Date(year, month - 1, dayNumber);
      const dateKey = toDateKey(currentDate);
      const dayEvents = eventMap.get(dateKey) || [];
      const visibleEvents = dayEvents.slice(0, 3);
      const remainCount = Math.max(0, dayEvents.length - visibleEvents.length);

      cells.push(`
        <div class="min-h-[120px] border nu-border rounded-lg p-2 nu-surface flex flex-col gap-1 ${canManageSchedule ? 'cursor-pointer hover:ring-1 hover:ring-slate-300' : ''}" data-role="nu-calendar-day" data-date="${dateKey}">
          <div class="text-xs font-semibold ${index % 7 === 0 ? 'text-rose-600' : index % 7 === 6 ? 'text-blue-600' : 'nu-text-muted'}">
            ${dayNumber}
          </div>
          <div class="flex flex-col gap-1">
            ${visibleEvents
              .map((event) => `
                <button type="button" class="text-left text-[11px] leading-4 px-1.5 py-1 rounded border ${scheduleTypeClass(
                  event.schedule_type || event.type
                )}" title="${escapeHtml(event.title || event.name || '-')}" data-role="nu-calendar-event-btn" data-event-id="${Number(
                  event.id
                )}" data-manage-type="${escapeHtml(event.manage_type || '')}">
                  ${formatEventTime(event) ? `<span class="font-semibold">${formatEventTime(event)}</span> ` : ''}
                  <span>${escapeHtml(event.title || event.name || '-')}</span>
                </button>
              `)
              .join('')}
            ${remainCount > 0 ? `<div class="text-[11px] nu-text-muted px-1">+${remainCount}개 더보기</div>` : ''}
          </div>
        </div>
      `);
    }

    gridEl.innerHTML = `
      <div class="grid grid-cols-7 gap-2 mb-2">
        ${weekdayLabels
          .map((label, index) => `
            <div class="text-xs font-semibold text-center ${index === 0 ? 'text-rose-600' : index === 6 ? 'text-blue-600' : 'nu-text-muted'}">
              ${label}
            </div>
          `)
          .join('')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-7 gap-2">
        ${cells.join('')}
      </div>
    `;
  };

  const renderViewMode = () => {
    const [year, month] = monthValue.split('-').map((v) => Number(v));
    drawList();
    drawCalendarGrid(year, month);
    const isCalendar = viewMode === 'calendar';
    listEl.style.display = isCalendar ? 'none' : '';
    gridEl.style.display = isCalendar ? '' : 'none';
    modeListBtn.classList.toggle('nu-primary-bg', !isCalendar);
    modeListBtn.classList.toggle('nu-surface', isCalendar);
    modeCalendarBtn.classList.toggle('nu-primary-bg', isCalendar);
    modeCalendarBtn.classList.toggle('nu-surface', !isCalendar);
  };

  async function draw() {
    const [year, month] = monthValue.split('-').map((v) => Number(v));
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    const payload = await api(`/api/calendar?batch_id=${state.batchId}&start=${start}&end=${end}`).catch(() => []);
    events = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [];
    renderViewMode();
  }

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">캘린더</h1>
      <p class="nu-text-muted mt-1">월 단위로 전체 코칭/공통 일정을 확인합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button id="nu-calendar-prev-month" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">이전</button>
        <input id="nu-calendar-month" type="month" class="rounded-lg border nu-border px-3 py-2 nu-surface" value="${monthValue}" />
        <button id="nu-calendar-next-month" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">다음</button>
        <button id="nu-calendar-current-month" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">현재월</button>
        <button id="nu-calendar-load" class="rounded-lg px-3 py-2 nu-primary-bg text-sm">조회</button>
        ${canManageSchedule ? '<button id="nu-calendar-create" class="rounded-lg px-3 py-2 text-sm bg-emerald-600 text-white">일정 추가</button>' : ''}
        <button id="nu-calendar-mode-calendar" class="rounded-lg border nu-border px-3 py-2 text-sm sm:ml-auto">달력형</button>
        <button id="nu-calendar-mode-list" class="rounded-lg border nu-border px-3 py-2 text-sm">리스트형</button>
      </div>
      <div id="nu-calendar-list" class="overflow-auto"></div>
      <div id="nu-calendar-grid" class="overflow-auto"></div>
    </section>
  `;

  const monthEl = document.getElementById('nu-calendar-month');
  const listEl = document.getElementById('nu-calendar-list');
  const gridEl = document.getElementById('nu-calendar-grid');
  const modeListBtn = document.getElementById('nu-calendar-mode-list');
  const modeCalendarBtn = document.getElementById('nu-calendar-mode-calendar');
  const syncMonthInput = () => {
    if (monthEl) monthEl.value = monthValue;
  };
  const moveMonth = (diff) => {
    monthValue = shiftMonthValue(monthEl?.value || monthValue, diff);
    syncMonthInput();
    draw();
  };
  const moveCurrentMonth = () => {
    monthValue = toMonthValue(now.getFullYear(), now.getMonth() + 1);
    syncMonthInput();
    draw();
  };
  const defaultCreateDate = () => {
    const parsed = parseMonthValue(monthEl?.value || monthValue);
    if (!parsed) return toDateKey(now);
    if (parsed.year === now.getFullYear() && parsed.month === now.getMonth() + 1) return toDateKey(now);
    return `${parsed.year}-${pad2(parsed.month)}-01`;
  };

  document.getElementById('nu-calendar-load').addEventListener('click', () => {
    monthValue = parseMonthValue(monthEl.value) ? monthEl.value : monthValue;
    syncMonthInput();
    draw();
  });
  document.getElementById('nu-calendar-create')?.addEventListener('click', () => {
    openScheduleModal({ mode: 'create', presetDate: defaultCreateDate() });
  });
  document.getElementById('nu-calendar-prev-month')?.addEventListener('click', () => moveMonth(-1));
  document.getElementById('nu-calendar-next-month')?.addEventListener('click', () => moveMonth(1));
  document.getElementById('nu-calendar-current-month')?.addEventListener('click', moveCurrentMonth);

  listEl?.addEventListener('click', (evt) => {
    const editBtn = evt.target instanceof Element ? evt.target.closest('[data-role="nu-calendar-edit-btn"]') : null;
    if (!editBtn) return;
    const eventId = editBtn.getAttribute('data-event-id');
    const manageType = editBtn.getAttribute('data-manage-type');
    const targetEvent = findCalendarEvent(eventId, manageType);
    if (!targetEvent) return;
    if (!canEditCalendarEvent(targetEvent)) {
      alert('이 일정은 New UI에서 편집할 수 없습니다.');
      return;
    }
    openScheduleModal({ mode: 'edit', event: targetEvent });
  });

  gridEl?.addEventListener('click', (evt) => {
    const target = evt.target instanceof Element ? evt.target : null;
    if (!target) return;

    const eventBtn = target.closest('[data-role="nu-calendar-event-btn"]');
    if (eventBtn) {
      const eventId = eventBtn.getAttribute('data-event-id');
      const manageType = eventBtn.getAttribute('data-manage-type');
      const targetEvent = findCalendarEvent(eventId, manageType);
      if (!targetEvent) return;
      if (!canEditCalendarEvent(targetEvent)) {
        alert('이 일정은 New UI에서 편집할 수 없습니다.');
        return;
      }
      openScheduleModal({ mode: 'edit', event: targetEvent });
      return;
    }

    const dayCell = target.closest('[data-role="nu-calendar-day"][data-date]');
    if (!dayCell || !canManageSchedule) return;
    const dateKey = dayCell.getAttribute('data-date') || '';
    if (!dateKey) return;
    openScheduleModal({ mode: 'create', presetDate: dateKey });
  });

  modeListBtn?.addEventListener('click', () => {
    viewMode = 'list';
    localStorage.setItem(CALENDAR_VIEW_KEY, viewMode);
    renderViewMode();
  });

  modeCalendarBtn?.addEventListener('click', () => {
    viewMode = 'calendar';
    localStorage.setItem(CALENDAR_VIEW_KEY, viewMode);
    renderViewMode();
  });

  syncMonthInput();
  draw();
}

async function renderBoard(view) {
  const role = state.user?.role || '';
  const canWrite = canWriteBoard(role);
  const boards = await api('/api/boards').catch(() => []);
  const boardRows = Array.isArray(boards) ? boards : [];
  const writableBoards = role === 'admin'
    ? boardRows
    : boardRows.filter((b) => String(b.board_type || '').toLowerCase() !== 'notice');
  let boardId = boardRows[0]?.board_id || null;
  if (state.boardPage.boardId && boardRows.some((b) => Number(b.board_id) === Number(state.boardPage.boardId))) {
    boardId = state.boardPage.boardId;
  }
  let posts = [];
  let currentKeyword = '';

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">게시판</h1>
      <p class="nu-text-muted mt-1">게시글 조회/작성/수정을 New UI에서 바로 처리합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <select id="nu-board-select" class="rounded-lg border nu-border px-3 py-2 nu-surface">
          ${
            boardRows.length
              ? boardRows
                  .map(
                    (b) =>
                      `<option value="${b.board_id}" ${Number(b.board_id) === Number(boardId) ? 'selected' : ''}>${escapeHtml(
                        b.board_name || b.name || `게시판 ${b.board_id}`
                      )}</option>`
                  )
                  .join('')
              : '<option value="">게시판 없음</option>'
          }
        </select>
        <input id="nu-board-search" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="제목/내용 검색" />
        <button id="nu-board-search-btn" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">검색</button>
        ${canWrite ? '<button id="nu-board-new-btn" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">새 글쓰기</button>' : ''}
        <button id="nu-board-prev" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">이전</button>
        <button id="nu-board-next" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">다음</button>
      </div>
      <div id="nu-board-editor-zone" class="mb-4"></div>
      <div id="nu-board-posts" class="overflow-auto"></div>
      <div id="nu-board-detail" class="mt-4"></div>
    </section>
  `;

  const boardSelectEl = document.getElementById('nu-board-select');
  const postEl = document.getElementById('nu-board-posts');
  const detailEl = document.getElementById('nu-board-detail');
  const editorZoneEl = document.getElementById('nu-board-editor-zone');
  const searchInputEl = document.getElementById('nu-board-search');

  const fetchPosts = async () => {
    if (!boardId) {
      posts = [];
      return;
    }
    state.boardPage.boardId = boardId;
    const payload = await api(`/api/boards/${boardId}/posts?skip=${state.boardPage.skip}&limit=${state.boardPage.limit}`).catch(() => []);
    posts = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
  };

  const renderPosts = () => {
    const keyword = currentKeyword.toLowerCase().trim();
    const filtered = keyword
      ? posts.filter((p) => `${p.title || ''} ${p.content || ''}`.toLowerCase().includes(keyword))
      : posts;

    postEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b nu-border">
            <th class="py-2 pr-3">제목</th>
            <th class="py-2 pr-3">작성자</th>
            <th class="py-2 pr-3">작성일</th>
            <th class="py-2 pr-3">관리</th>
          </tr>
        </thead>
        <tbody>
          ${
            filtered.length
              ? filtered.map((p) => `
                  <tr class="border-b nu-border">
                    <td class="py-2 pr-3">
                      <button class="nu-board-open-btn text-left underline underline-offset-2" data-post-id="${p.post_id}">
                        ${escapeHtml(p.title || '-')}
                      </button>
                    </td>
                    <td class="py-2 pr-3">${escapeHtml(p.author_name || '-')}</td>
                    <td class="py-2 pr-3">${formatDateTime(p.created_at)}</td>
                    <td class="py-2 pr-3">
                      <div class="flex items-center gap-2">
                        <button class="nu-board-open-btn rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-post-id="${p.post_id}">보기</button>
                        ${
                          canWrite && (role === 'admin' || Number(p.author_id) === Number(state.user?.user_id))
                            ? `<button class="nu-board-edit-btn rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-post-id="${p.post_id}">수정</button>
                               <button class="nu-board-del-btn rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 bg-red-50" data-post-id="${p.post_id}">삭제</button>`
                            : ''
                        }
                      </div>
                    </td>
                  </tr>
                `).join('')
              : '<tr><td colspan="4" class="py-3 nu-text-muted">게시글이 없습니다.</td></tr>'
          }
        </tbody>
      </table>
    `;

    postEl.querySelectorAll('.nu-board-open-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number.parseInt(btn.dataset.postId, 10);
        if (Number.isNaN(postId)) return;
        try {
          const [post, comments] = await Promise.all([
            api(`/api/boards/posts/${postId}`),
            api(`/api/boards/posts/${postId}/comments`).catch(() => []),
          ]);
          detailEl.innerHTML = `
            <article class="rounded-xl border nu-border p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-lg font-semibold">${escapeHtml(post.title || '-')}</h3>
                  <p class="text-xs nu-text-muted">${escapeHtml(post.author_name || '-')} · ${formatDateTime(post.created_at)} · 조회 ${Number(post.view_count || 0)}</p>
                </div>
                ${
                  canWrite && (role === 'admin' || Number(post.author_id) === Number(state.user?.user_id))
                    ? `<button id="nu-board-detail-edit-btn" class="rounded-lg border nu-border px-3 py-1.5 text-xs nu-surface">이 글 수정</button>`
                    : ''
                }
              </div>
              <div class="mt-3 rich-content">${renderRichContent(post.content, '-')}</div>
              <div class="mt-4">
                <h4 class="font-semibold text-sm">댓글 (${Array.isArray(comments) ? comments.length : 0})</h4>
                <div class="mt-2 space-y-2">
                  ${
                    Array.isArray(comments) && comments.length
                      ? comments.map((c) => `
                          <div class="rounded-lg border nu-border p-2 text-sm">
                            <div class="rich-content">${renderRichContent(c.content, '-')}</div>
                            <div class="text-xs nu-text-muted mt-1">${escapeHtml(c.author_name || '-')} · ${formatDateTime(c.created_at)}</div>
                          </div>
                        `).join('')
                      : '<p class="text-sm nu-text-muted">댓글이 없습니다.</p>'
                  }
                </div>
              </div>
            </article>
          `;
          document.getElementById('nu-board-detail-edit-btn')?.addEventListener('click', () => openEditor(post));
        } catch (err) {
          detailEl.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(err.message || '게시글 조회 실패')}</p>`;
        }
      });
    });

    postEl.querySelectorAll('.nu-board-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number.parseInt(btn.dataset.postId, 10);
        if (Number.isNaN(postId)) return;
        try {
          const post = await api(`/api/boards/posts/${postId}`);
          openEditor(post);
        } catch (err) {
          alert(err.message || '게시글 불러오기 실패');
        }
      });
    });

    postEl.querySelectorAll('.nu-board-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number.parseInt(btn.dataset.postId, 10);
        if (Number.isNaN(postId)) return;
        if (!confirm('게시글을 삭제하시겠습니까?')) return;
        try {
          await api(`/api/boards/posts/${postId}`, { method: 'DELETE' });
          await reload();
        } catch (err) {
          alert(err.message || '게시글 삭제 실패');
        }
      });
    });
  };

  const openEditor = (post = null) => {
    if (!canWrite) return;
    const isEdit = !!post;
    const defaultBoardId = isEdit ? Number(post.board_id) : Number(boardId || writableBoards[0]?.board_id || 0);
    const selectable = writableBoards.length ? writableBoards : boardRows;
    editorZoneEl.innerHTML = `
      <form id="nu-board-form" class="rounded-xl border nu-border p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold text-sm">${isEdit ? '게시글 수정' : '게시글 작성'}</h3>
          <div class="flex items-center gap-2">
            <button type="button" id="nu-board-cancel-btn" class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface">닫기</button>
            <button type="submit" class="rounded-lg px-3 py-1.5 text-xs nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <label>게시판
            <select name="board_id" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
              ${selectable.map((b) => `<option value="${b.board_id}"${Number(b.board_id) === Number(defaultBoardId) ? ' selected' : ''}>${escapeHtml(b.board_name || b.name || '-')}</option>`).join('')}
            </select>
          </label>
          <label>제목
            <input name="title" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(post?.title || '')}" required />
          </label>
        </div>
        <div class="mt-3">
          <div class="text-sm nu-text-muted mb-1">내용</div>
          <div id="nu-board-content-editor"></div>
        </div>
        <p id="nu-board-form-msg" class="mt-2 text-sm text-red-600"></p>
      </form>
    `;

    const contentEditor = createRichField('nu-board-content-editor', {
      initialHTML: post?.content || '',
      placeholder: '게시글 내용을 입력하세요.',
      uploadOptions: { scope: 'board_post', boardId: defaultBoardId || boardId },
    });

    document.getElementById('nu-board-cancel-btn')?.addEventListener('click', () => {
      editorZoneEl.innerHTML = '';
    });

    const form = document.getElementById('nu-board-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const formMsg = document.getElementById('nu-board-form-msg');
      const title = String(fd.get('title') || '').trim();
      const selectedBoardId = Number.parseInt(String(fd.get('board_id') || ''), 10);
      const content = contentEditor.getHTML();
      if (!title) {
        if (formMsg) formMsg.textContent = '제목을 입력하세요.';
        return;
      }
      if (contentEditor.isEmpty()) {
        if (formMsg) formMsg.textContent = '내용을 입력하세요.';
        return;
      }
      try {
        if (isEdit) {
          await api(`/api/boards/posts/${post.post_id}`, {
            method: 'PUT',
            body: JSON.stringify({
              board_id: selectedBoardId,
              title,
              content,
            }),
          });
        } else {
          await api(`/api/boards/${selectedBoardId}/posts`, {
            method: 'POST',
            body: JSON.stringify({
              title,
              content,
            }),
          });
        }
        editorZoneEl.innerHTML = '';
        await reload();
      } catch (err) {
        if (formMsg) formMsg.textContent = err.message || '게시글 저장 실패';
      }
    });
  };

  const reload = async () => {
    await fetchPosts();
    renderPosts();
  };

  boardSelectEl?.addEventListener('change', async () => {
    boardId = Number(boardSelectEl.value) || null;
    state.boardPage.skip = 0;
    detailEl.innerHTML = '';
    editorZoneEl.innerHTML = '';
    await reload();
  });
  document.getElementById('nu-board-prev')?.addEventListener('click', async () => {
    state.boardPage.skip = Math.max(0, state.boardPage.skip - state.boardPage.limit);
    detailEl.innerHTML = '';
    await reload();
  });
  document.getElementById('nu-board-next')?.addEventListener('click', async () => {
    state.boardPage.skip += state.boardPage.limit;
    detailEl.innerHTML = '';
    await reload();
  });
  document.getElementById('nu-board-search-btn')?.addEventListener('click', () => {
    currentKeyword = String(searchInputEl?.value || '').trim();
    renderPosts();
  });
  searchInputEl?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    currentKeyword = String(searchInputEl?.value || '').trim();
    renderPosts();
  });
  document.getElementById('nu-board-new-btn')?.addEventListener('click', () => {
    if (!writableBoards.length) {
      alert('작성 가능한 게시판이 없습니다.');
      return;
    }
    openEditor();
  });

  await reload();
}

function openNuModal({ title, bodyHtml, maxWidth = 'max-w-4xl' }) {
  document.getElementById('nu-modal-overlay')?.remove();
  document.body.classList.add('overflow-hidden');

  const overlay = document.createElement('div');
  overlay.id = 'nu-modal-overlay';
  overlay.className = 'fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center';
  overlay.innerHTML = `
    <div class="w-full ${maxWidth} max-h-[90vh] overflow-hidden rounded-2xl border nu-border nu-surface shadow-xl">
      <div class="flex items-center justify-between px-4 py-3 border-b nu-border">
        <h3 class="font-semibold">${escapeHtml(title)}</h3>
        <button type="button" id="nu-modal-close" class="rounded-lg border nu-border px-2 py-1 text-sm nu-surface">닫기</button>
      </div>
      <div id="nu-modal-body" class="p-4 overflow-auto max-h-[calc(90vh-58px)]">${bodyHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    if (!document.getElementById('nu-modal-overlay')) document.body.classList.remove('overflow-hidden');
  };
  overlay.addEventListener('click', (evt) => {
    if (evt.target === overlay) close();
  });
  overlay.querySelector('#nu-modal-close')?.addEventListener('click', close);

  return {
    overlay,
    close,
    bodyEl: overlay.querySelector('#nu-modal-body'),
  };
}

async function renderAbout(view) {
  const isAdmin = ROLE.canAdmin(state.user?.role || '');
  const ABOUT_TAB_KEY = 'new_ui_about_tab';
  const ABOUT_INCLUDE_HIDDEN_KEY = 'new_ui_about_include_hidden';
  const savedTab = localStorage.getItem(ABOUT_TAB_KEY);
  const activeTab = ['ssp_intro', 'coach_intro', 'coaches'].includes(savedTab) ? savedTab : 'ssp_intro';
  const includeHidden = isAdmin && localStorage.getItem(ABOUT_INCLUDE_HIDDEN_KEY) === 'true';

  const [sspIntro, coachIntro, coaches] = await Promise.all([
    api('/api/about/content?key=ssp_intro'),
    api('/api/about/content?key=coach_intro'),
    api(`/api/about/coaches?batch_id=${Number(state.batchId) || ''}&include_hidden=${includeHidden ? 'true' : 'false'}`).catch(() => []),
  ]);
  const coachRows = Array.isArray(coaches) ? coaches : [];

  const tabClass = (tabId) =>
    `rounded-lg border px-3 py-2 text-sm ${activeTab === tabId ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface hover:nu-soft'}`;
  const showPanel = (tabId) => (activeTab === tabId ? '' : 'hidden');
  const coachTypeLabel = (type) => (String(type || '').toLowerCase() === 'external' ? '외부코치' : '사내코치');

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">SSP+ 소개</h1>
      <p class="nu-text-muted mt-1">프로그램 소개 콘텐츠와 차수별 코치 프로필을 New UI에서 관리합니다.</p>
    </section>

    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button class="${tabClass('ssp_intro')}" data-role="nu-about-tab" data-tab="ssp_intro">SSP+ 소개</button>
        <button class="${tabClass('coach_intro')}" data-role="nu-about-tab" data-tab="coach_intro">코치 소개 안내</button>
        <button class="${tabClass('coaches')}" data-role="nu-about-tab" data-tab="coaches">코치 목록</button>
        ${
          isAdmin
            ? `
              <label class="ml-auto text-sm flex items-center gap-2">
                <input id="nu-about-include-hidden" type="checkbox" ${includeHidden ? 'checked' : ''} />
                숨김 포함
              </label>
            `
            : ''
        }
      </div>

      <div class="${showPanel('ssp_intro')}">
        <div class="rich-content rounded-xl border nu-border p-4">${renderRichContent(sspIntro?.content, '-')}</div>
        ${
          isAdmin
            ? `
              <div class="mt-4 rounded-xl border nu-border p-4">
                <div class="text-sm nu-text-muted mb-2">관리자 편집</div>
                <div id="nu-about-editor-ssp_intro"></div>
                <div class="mt-3 flex items-center gap-2">
                  <button id="nu-about-save-ssp_intro" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">저장</button>
                  <span id="nu-about-msg-ssp_intro" class="text-sm nu-text-muted"></span>
                </div>
              </div>
            `
            : ''
        }
      </div>

      <div class="${showPanel('coach_intro')}">
        <div class="rich-content rounded-xl border nu-border p-4">${renderRichContent(coachIntro?.content, '-')}</div>
        ${
          isAdmin
            ? `
              <div class="mt-4 rounded-xl border nu-border p-4">
                <div class="text-sm nu-text-muted mb-2">관리자 편집</div>
                <div id="nu-about-editor-coach_intro"></div>
                <div class="mt-3 flex items-center gap-2">
                  <button id="nu-about-save-coach_intro" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">저장</button>
                  <span id="nu-about-msg-coach_intro" class="text-sm nu-text-muted"></span>
                </div>
              </div>
            `
            : ''
        }
      </div>

      <div class="${showPanel('coaches')}">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3" id="nu-about-coach-list">
          ${
            coachRows.length
              ? coachRows
                  .map((coach) => {
                    const image = coach.photo_url
                      ? `<img src="${escapeHtml(coach.photo_url)}" alt="${escapeHtml(coach.name || '')}" class="w-16 h-16 rounded-xl object-cover border nu-border" />`
                      : '<div class="w-16 h-16 rounded-xl nu-soft border nu-border flex items-center justify-center text-xs nu-text-muted">No Image</div>';
                    const editable = isAdmin
                      ? `
                          <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <label>이름
                              <input name="name" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface" value="${escapeHtml(coach.name || '')}" />
                            </label>
                            <label>코치 구분
                              <select name="coach_type" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface">
                                <option value="internal" ${String(coach.coach_type || '').toLowerCase() === 'internal' ? 'selected' : ''}>사내코치</option>
                                <option value="external" ${String(coach.coach_type || '').toLowerCase() === 'external' ? 'selected' : ''}>외부코치</option>
                              </select>
                            </label>
                            <label>부서
                              <input name="department" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface" value="${escapeHtml(coach.department || '')}" />
                            </label>
                            <label>소속
                              <input name="affiliation" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface" value="${escapeHtml(coach.affiliation || '')}" />
                            </label>
                            <label>코칭 분야
                              <input name="specialty" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface" value="${escapeHtml(coach.specialty || '')}" />
                            </label>
                            <label>경력
                              <input name="career" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface" value="${escapeHtml(coach.career || '')}" />
                            </label>
                            <label class="md:col-span-2">사진 URL
                              <input name="photo_url" class="mt-1 w-full rounded-lg border nu-border px-2 py-1.5 nu-surface" value="${escapeHtml(coach.photo_url || '')}" />
                            </label>
                            <label class="md:col-span-2 text-sm flex items-center gap-2">
                              <input type="checkbox" name="is_visible" ${coach.is_visible ? 'checked' : ''} />
                              코치 소개 화면에 표시
                            </label>
                          </div>
                          <div class="mt-3 flex flex-wrap items-center gap-2">
                            ${
                              coach.coach_id
                                ? `
                                    <button data-role="nu-about-coach-save" class="rounded-lg px-3 py-1.5 text-xs nu-primary-bg">저장</button>
                                    <button data-role="nu-about-coach-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-1.5 text-xs">삭제</button>
                                    <button data-role="nu-about-coach-move" data-dir="up" class="rounded-lg border nu-border px-3 py-1.5 text-xs nu-surface">위로</button>
                                    <button data-role="nu-about-coach-move" data-dir="down" class="rounded-lg border nu-border px-3 py-1.5 text-xs nu-surface">아래로</button>
                                  `
                                : '<button data-role="nu-about-coach-create" class="rounded-lg px-3 py-1.5 text-xs nu-primary-bg">프로필 생성</button>'
                            }
                          </div>
                        `
                      : '';
                    const detailRows = [
                      coach.department ? `<div><span class="nu-text-muted">부서:</span> ${escapeHtml(coach.department)}</div>` : '',
                      coach.affiliation ? `<div><span class="nu-text-muted">소속:</span> ${escapeHtml(coach.affiliation)}</div>` : '',
                      coach.specialty ? `<div><span class="nu-text-muted">코칭 분야:</span> ${escapeHtml(coach.specialty)}</div>` : '',
                      coach.career ? `<div><span class="nu-text-muted">경력:</span> ${escapeHtml(coach.career)}</div>` : '',
                    ]
                      .filter(Boolean)
                      .join('');
                    return `
                      <article
                        class="rounded-xl border nu-border p-3"
                        data-role="nu-about-coach-card"
                        data-coach-id="${coach.coach_id || ''}"
                        data-user-id="${coach.user_id || ''}"
                      >
                        <div class="flex items-start gap-3">
                          ${image}
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                              <div class="font-semibold">${escapeHtml(coach.name || '-')}</div>
                              <span class="text-xs rounded-full px-2 py-0.5 nu-primary-soft">${coachTypeLabel(coach.coach_type)}</span>
                              ${
                                !coach.is_visible
                                  ? '<span class="text-xs rounded-full px-2 py-0.5 bg-slate-200 text-slate-700">숨김</span>'
                                  : ''
                              }
                              ${
                                !coach.coach_id
                                  ? '<span class="text-xs rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">프로필 미생성</span>'
                                  : ''
                              }
                            </div>
                            <div class="text-sm mt-2 space-y-1">${detailRows || '<div class="nu-text-muted">추가 정보 없음</div>'}</div>
                          </div>
                        </div>
                        ${editable}
                      </article>
                    `;
                  })
                  .join('')
              : '<p class="nu-text-muted text-sm">표시할 코치가 없습니다.</p>'
          }
        </div>
      </div>
    </section>
  `;

  view.querySelectorAll('[data-role="nu-about-tab"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      localStorage.setItem(ABOUT_TAB_KEY, btn.getAttribute('data-tab') || 'ssp_intro');
      renderAbout(view);
    });
  });
  document.getElementById('nu-about-include-hidden')?.addEventListener('change', (evt) => {
    const checked = !!evt.target.checked;
    localStorage.setItem(ABOUT_INCLUDE_HIDDEN_KEY, checked ? 'true' : 'false');
    renderAbout(view);
  });

  if (!isAdmin) return;

  const editors = {
    ssp_intro: createRichField('nu-about-editor-ssp_intro', {
      initialHTML: sspIntro?.content || '',
      placeholder: 'SSP+ 소개 내용을 입력하세요.',
      uploadOptions: { scope: 'about' },
    }),
    coach_intro: createRichField('nu-about-editor-coach_intro', {
      initialHTML: coachIntro?.content || '',
      placeholder: '코치 소개 안내 내용을 입력하세요.',
      uploadOptions: { scope: 'about' },
    }),
  };
  ['ssp_intro', 'coach_intro'].forEach((key) => {
    document.getElementById(`nu-about-save-${key}`)?.addEventListener('click', async () => {
      const msgEl = document.getElementById(`nu-about-msg-${key}`);
      try {
        await api(`/api/about/content/${key}`, {
          method: 'PUT',
          body: JSON.stringify({ content: editors[key].getHTML() }),
        });
        if (msgEl) msgEl.textContent = '저장되었습니다.';
        await renderAbout(view);
      } catch (error) {
        if (msgEl) msgEl.textContent = error.message || '저장 실패';
      }
    });
  });

  const coachListEl = document.getElementById('nu-about-coach-list');
  const readPayload = (cardEl) => {
    const parseNum = (value) => {
      const parsed = Number.parseInt(String(value || ''), 10);
      return Number.isNaN(parsed) ? null : parsed;
    };
    const valueOf = (name) => String(cardEl.querySelector(`[name="${name}"]`)?.value || '').trim() || null;
    return {
      batch_id: Number(state.batchId) || null,
      user_id: parseNum(cardEl.getAttribute('data-user-id')),
      name: valueOf('name'),
      coach_type: String(cardEl.querySelector('[name="coach_type"]')?.value || 'internal'),
      department: valueOf('department'),
      affiliation: valueOf('affiliation'),
      specialty: valueOf('specialty'),
      career: valueOf('career'),
      photo_url: valueOf('photo_url'),
      is_visible: !!cardEl.querySelector('[name="is_visible"]')?.checked,
    };
  };

  coachListEl?.addEventListener('click', async (evt) => {
    const actionBtn = evt.target instanceof Element ? evt.target.closest('button[data-role]') : null;
    if (!actionBtn) return;
    const role = actionBtn.getAttribute('data-role');
    const cardEl = actionBtn.closest('[data-role="nu-about-coach-card"]');
    if (!cardEl) return;
    const coachId = Number.parseInt(cardEl.getAttribute('data-coach-id') || '', 10);
    const payload = readPayload(cardEl);

    if (role === 'nu-about-coach-create') {
      if (!payload.batch_id) return alert('차수를 선택하세요.');
      if (!payload.name) return alert('코치 이름을 입력하세요.');
      try {
        await api('/api/about/coaches', { method: 'POST', body: JSON.stringify(payload) });
        await renderAbout(view);
      } catch (error) {
        alert(error.message || '코치 프로필 생성 실패');
      }
      return;
    }

    if (role === 'nu-about-coach-save') {
      if (Number.isNaN(coachId)) return;
      if (!payload.name) return alert('코치 이름을 입력하세요.');
      try {
        await api(`/api/about/coaches/${coachId}`, { method: 'PUT', body: JSON.stringify(payload) });
        await renderAbout(view);
      } catch (error) {
        alert(error.message || '코치 프로필 저장 실패');
      }
      return;
    }

    if (role === 'nu-about-coach-delete') {
      if (Number.isNaN(coachId) || !confirm('코치 프로필을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/about/coaches/${coachId}`, { method: 'DELETE' });
        await renderAbout(view);
      } catch (error) {
        alert(error.message || '코치 프로필 삭제 실패');
      }
      return;
    }

    if (role === 'nu-about-coach-move') {
      if (Number.isNaN(coachId) || !state.batchId) return;
      const direction = actionBtn.getAttribute('data-dir') || '';
      const ordered = coachRows.filter((row) => row.coach_id).map((row) => Number(row.coach_id));
      const index = ordered.indexOf(coachId);
      if (index < 0) return;
      if (direction === 'up' && index > 0) {
        [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
      } else if (direction === 'down' && index < ordered.length - 1) {
        [ordered[index + 1], ordered[index]] = [ordered[index], ordered[index + 1]];
      } else {
        return;
      }
      try {
        await api('/api/about/coaches/reorder', {
          method: 'PUT',
          body: JSON.stringify({ batch_id: Number(state.batchId), coach_ids: ordered }),
        });
        await renderAbout(view);
      } catch (error) {
        alert(error.message || '코치 정렬 실패');
      }
    }
  });
}

async function renderCoachingPlan(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const role = normalizeRole(state.user?.role || '');
  const isAdmin = role === 'admin';
  const myUserId = Number(state.user?.user_id || 0);
  const MODE_KEY = 'new_ui_coaching_plan_mode';
  const MONTH_KEY = 'new_ui_coaching_plan_month';
  const COACH_KEY = 'new_ui_coaching_plan_coach_filter';

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mode = localStorage.getItem(MODE_KEY) === 'coaching_only' ? 'coaching_only' : 'month';
  const monthValue = /^\d{4}-\d{2}$/.test(localStorage.getItem(MONTH_KEY) || '') ? localStorage.getItem(MONTH_KEY) : thisMonth;
  const coachFilter = isAdmin ? localStorage.getItem(COACH_KEY) || '' : '';

  const toIsoDate = (dateObj) =>
    `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  const getMonthRange = (value) => {
    const matched = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!matched) return null;
    const year = Number.parseInt(matched[1], 10);
    const month = Number.parseInt(matched[2], 10);
    if (!year || !month || month < 1 || month > 12) return null;
    return {
      start: toIsoDate(new Date(year, month - 1, 1)),
      end: toIsoDate(new Date(year, month, 0)),
    };
  };

  const monthRange = getMonthRange(monthValue) || getMonthRange(thisMonth);
  const batchRow = state.batches.find((row) => Number(row.batch_id) === Number(state.batchId));
  let start = monthRange.start;
  let end = monthRange.end;
  if (mode === 'coaching_only') {
    start = toDateInputValue(batchRow?.start_date) || start;
    end = toDateInputValue(batchRow?.end_date) || end;
    const startDt = parseDate(start);
    const endDt = parseDate(end);
    const diffDays = startDt && endDt ? Math.floor((endDt.getTime() - startDt.getTime()) / (24 * 60 * 60 * 1000)) : 0;
    if (diffDays > 550 && startDt) {
      end = toIsoDate(new Date(startDt.getTime() + (550 * 24 * 60 * 60 * 1000)));
    }
  }

  const qs = new URLSearchParams({ batch_id: String(state.batchId), start, end });
  if (isAdmin && coachFilter) qs.set('coach_user_id', coachFilter);

  const [grid, projects] = await Promise.all([
    api(`/api/coaching-plan/grid?${qs.toString()}`),
    api(`/api/batches/${state.batchId}/projects`).catch(() => []),
  ]);
  const rows = Array.isArray(grid?.rows) ? grid.rows : [];
  const projectRows = Array.isArray(projects) ? projects : [];
  const allDates = Array.isArray(grid?.dates) ? grid.dates.map((row) => String(row).slice(0, 10)) : [];
  const globalDates = Array.isArray(grid?.global_schedule_dates) ? grid.global_schedule_dates.map((row) => String(row).slice(0, 10)) : [];
  const coachingDates = Array.isArray(grid?.coaching_schedule_dates) ? grid.coaching_schedule_dates.map((row) => String(row).slice(0, 10)) : [];
  const globalSet = new Set(globalDates);
  const coachingSet = new Set(coachingDates);
  const visibleDates = mode === 'coaching_only' ? allDates.filter((dateKey) => coachingSet.has(dateKey)) : allDates;
  const finalDates = visibleDates.length ? visibleDates : (mode === 'coaching_only' ? [...coachingSet].sort() : allDates);

  const formatDateHeader = (dateKey) => {
    const dt = parseDate(`${dateKey}T00:00:00`);
    if (!dt) return dateKey;
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const ww = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
    return `${mm}-${dd}(${ww})`;
  };

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">코칭 계획/실적</h1>
      <p class="nu-text-muted mt-1">계획은 코치/관리자가 입력하고, 실적은 출석 자동집계 + 관리자 보정으로 관리합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button id="nu-cp-mode-month" class="rounded-lg border px-3 py-2 text-sm ${mode === 'month' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">전체(월별)</button>
        <button id="nu-cp-mode-coaching" class="rounded-lg border px-3 py-2 text-sm ${mode === 'coaching_only' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">코칭일정만(전체)</button>
        ${
          mode === 'month'
            ? `
              <button id="nu-cp-prev" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">이전</button>
              <input id="nu-cp-month" type="month" class="rounded-lg border nu-border px-3 py-2 nu-surface" value="${monthValue}" />
              <button id="nu-cp-next" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">다음</button>
              <button id="nu-cp-current" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">현재월</button>
              <button id="nu-cp-load" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">조회</button>
            `
            : '<span class="text-sm nu-text-muted">코칭 일정이 있는 날짜만 전체 표시합니다.</span>'
        }
        ${
          isAdmin
            ? `
              <select id="nu-cp-coach-filter" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface sm:ml-auto min-w-[220px]">
                <option value="">전체 코치</option>
                ${rows.map((row) => `<option value="${row.coach_user_id}" ${String(row.coach_user_id) === String(coachFilter) ? 'selected' : ''}>${escapeHtml(row.coach_name || row.coach_emp_id || `코치 ${row.coach_user_id}`)}</option>`).join('')}
              </select>
            `
            : ''
        }
      </div>
      <div class="overflow-auto" id="nu-coaching-grid">
        <table class="min-w-full text-xs md:text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky left-0 z-10 bg-white border-b nu-border px-2 py-2 text-left min-w-[170px]">코치</th>
              ${
                finalDates.length
                  ? finalDates
                      .map((dateKey) => `
                        <th class="border-b nu-border px-2 py-2 min-w-[165px] text-left align-top ${coachingSet.has(dateKey) ? 'bg-blue-50' : ''}">
                          <div class="font-semibold">${escapeHtml(formatDateHeader(dateKey))}</div>
                          <div class="mt-1 flex flex-wrap gap-1">
                            ${globalSet.has(dateKey) ? '<span class="rounded-full px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700">공통</span>' : ''}
                            ${coachingSet.has(dateKey) ? '<span class="rounded-full px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700">코칭</span>' : ''}
                          </div>
                        </th>
                      `)
                      .join('')
                  : '<th class="border-b nu-border px-2 py-2 text-left">표시할 날짜가 없습니다.</th>'
              }
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map((row) => {
                      const canEditPlan = isAdmin || Number(row.coach_user_id) === myUserId;
                      const cellMap = new Map((Array.isArray(row.cells) ? row.cells : []).map((cell) => [String(cell.date).slice(0, 10), cell]));
                      return `
                        <tr>
                          <td class="sticky left-0 z-10 bg-white border-b nu-border px-2 py-2 align-top">
                            <div class="font-semibold">${escapeHtml(row.coach_name || '-')}</div>
                            <div class="text-[11px] nu-text-muted">${escapeHtml(row.department || '-')} · ${escapeHtml(row.coach_emp_id || '-')}</div>
                          </td>
                          ${
                            finalDates.length
                              ? finalDates
                                  .map((dateKey) => {
                                    const cell = cellMap.get(dateKey) || null;
                                    const planText = cell?.plan_id
                                      ? (cell.is_all_day ? '종일' : `${cell.start_time || '--:--'}~${cell.end_time || '--:--'}`)
                                      : '미입력';
                                    const actualBadge = cell?.actual_source === 'override'
                                      ? '<span class="rounded-full px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700">보정</span>'
                                      : (cell?.actual_source === 'auto'
                                        ? '<span class="rounded-full px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-700">자동</span>'
                                        : '<span class="rounded-full px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600">미집계</span>');
                                    return `
                                      <td class="border-b nu-border px-2 py-2 align-top ${coachingSet.has(dateKey) ? 'bg-blue-50/40' : ''}">
                                        <div class="space-y-1">
                                          <div><span class="nu-text-muted">계획:</span> ${escapeHtml(planText)}</div>
                                          <div class="flex items-center gap-1"><span class="nu-text-muted">실적:</span> ${escapeHtml(String(Number(cell?.final_minutes || 0)))}분 ${actualBadge}</div>
                                          ${
                                            cell?.actual_start_time || cell?.actual_end_time
                                              ? `<div class="nu-text-muted text-[11px]">${escapeHtml(cell.actual_start_time || '--:--')}~${escapeHtml(cell.actual_end_time || '--:--')}</div>`
                                              : ''
                                          }
                                          ${
                                            cell?.plan_note
                                              ? `<div class="nu-text-muted text-[11px] line-clamp-2">${escapeHtml(cell.plan_note)}</div>`
                                              : ''
                                          }
                                          <div class="flex flex-wrap gap-1 pt-1">
                                            ${
                                              canEditPlan
                                                ? `<button data-role="nu-cp-plan" data-coach-id="${row.coach_user_id}" data-date="${dateKey}" class="rounded border nu-border px-1.5 py-0.5 text-[11px] nu-surface">계획</button>`
                                                : ''
                                            }
                                            ${
                                              isAdmin
                                                ? `<button data-role="nu-cp-actual" data-coach-id="${row.coach_user_id}" data-date="${dateKey}" class="rounded border nu-border px-1.5 py-0.5 text-[11px] nu-surface">실적</button>`
                                                : ''
                                            }
                                          </div>
                                        </div>
                                      </td>
                                    `;
                                  })
                                  .join('')
                              : '<td class="border-b nu-border px-2 py-2 nu-text-muted">-</td>'
                          }
                        </tr>
                      `;
                    })
                    .join('')
                : `<tr><td colspan="${Math.max(1, finalDates.length + 1)}" class="border-b nu-border px-2 py-3 nu-text-muted">데이터가 없습니다.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  const shiftMonth = (value, diff) => {
    const matched = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!matched) return thisMonth;
    const year = Number.parseInt(matched[1], 10);
    const month = Number.parseInt(matched[2], 10);
    const next = new Date(year, month - 1 + diff, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  };

  document.getElementById('nu-cp-mode-month')?.addEventListener('click', () => {
    localStorage.setItem(MODE_KEY, 'month');
    renderCoachingPlan(view);
  });
  document.getElementById('nu-cp-mode-coaching')?.addEventListener('click', () => {
    localStorage.setItem(MODE_KEY, 'coaching_only');
    renderCoachingPlan(view);
  });
  document.getElementById('nu-cp-load')?.addEventListener('click', () => {
    const value = String(document.getElementById('nu-cp-month')?.value || thisMonth);
    localStorage.setItem(MONTH_KEY, /^\d{4}-\d{2}$/.test(value) ? value : thisMonth);
    renderCoachingPlan(view);
  });
  document.getElementById('nu-cp-prev')?.addEventListener('click', () => {
    localStorage.setItem(MONTH_KEY, shiftMonth(monthValue, -1));
    renderCoachingPlan(view);
  });
  document.getElementById('nu-cp-next')?.addEventListener('click', () => {
    localStorage.setItem(MONTH_KEY, shiftMonth(monthValue, 1));
    renderCoachingPlan(view);
  });
  document.getElementById('nu-cp-current')?.addEventListener('click', () => {
    localStorage.setItem(MONTH_KEY, thisMonth);
    renderCoachingPlan(view);
  });
  document.getElementById('nu-cp-coach-filter')?.addEventListener('change', (evt) => {
    localStorage.setItem(COACH_KEY, String(evt.target.value || ''));
    renderCoachingPlan(view);
  });

  const openPlanModal = (row, dateKey, cell) => {
    const canEditPlan = isAdmin || Number(row.coach_user_id) === myUserId;
    if (!canEditPlan) return;
    const modal = openNuModal({
      title: `${row.coach_name} 계획 입력 (${dateKey})`,
      maxWidth: 'max-w-2xl',
      bodyHtml: `
        <form id="nu-cp-plan-form" class="space-y-3">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_all_day" ${cell?.is_all_day !== false ? 'checked' : ''} />
            종일 일정
          </label>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label class="text-sm">시작 시간
              <input type="time" name="start_time" value="${escapeHtml(cell?.start_time || '10:00')}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
            </label>
            <label class="text-sm">종료 시간
              <input type="time" name="end_time" value="${escapeHtml(cell?.end_time || '11:00')}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
            </label>
          </div>
          <label class="text-sm block">메모
            <textarea name="plan_note" rows="4" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">${escapeHtml(cell?.plan_note || '')}</textarea>
          </label>
          <p id="nu-cp-plan-msg" class="text-sm text-red-600"></p>
          <div class="flex items-center gap-2">
            ${
              cell?.plan_id
                ? '<button type="button" id="nu-cp-plan-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm mr-auto">삭제</button>'
                : ''
            }
            <button type="button" id="nu-cp-plan-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">저장</button>
          </div>
        </form>
      `,
    });

    const formEl = modal.bodyEl?.querySelector('#nu-cp-plan-form');
    const msgEl = modal.bodyEl?.querySelector('#nu-cp-plan-msg');
    const allDayEl = formEl?.querySelector('input[name="is_all_day"]');
    const startEl = formEl?.querySelector('input[name="start_time"]');
    const endEl = formEl?.querySelector('input[name="end_time"]');
    const syncAllDay = () => {
      const checked = !!allDayEl?.checked;
      if (!startEl || !endEl) return;
      startEl.disabled = checked;
      endEl.disabled = checked;
    };
    allDayEl?.addEventListener('change', syncAllDay);
    syncAllDay();
    modal.bodyEl?.querySelector('#nu-cp-plan-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl?.querySelector('#nu-cp-plan-delete')?.addEventListener('click', async () => {
      if (!confirm('해당 날짜의 계획을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/coaching-plan/plan?batch_id=${state.batchId}&coach_user_id=${row.coach_user_id}&plan_date=${dateKey}`, { method: 'DELETE' });
        modal.close();
        await renderCoachingPlan(view);
      } catch (error) {
        if (msgEl) msgEl.textContent = error.message || '계획 삭제 실패';
      }
    });
    formEl?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(formEl);
      const isAllDay = fd.has('is_all_day');
      const startTime = String(fd.get('start_time') || '').trim() || null;
      const endTime = String(fd.get('end_time') || '').trim() || null;
      if (!isAllDay && (!startTime || !endTime)) {
        if (msgEl) msgEl.textContent = '시작/종료 시간을 입력하세요.';
        return;
      }
      if (!isAllDay && startTime > endTime) {
        if (msgEl) msgEl.textContent = '종료 시간은 시작 시간보다 빠를 수 없습니다.';
        return;
      }
      try {
        await api('/api/coaching-plan/plan', {
          method: 'PUT',
          body: JSON.stringify({
            batch_id: Number(state.batchId),
            coach_user_id: Number(row.coach_user_id),
            plan_date: dateKey,
            is_all_day: isAllDay,
            start_time: isAllDay ? null : startTime,
            end_time: isAllDay ? null : endTime,
            plan_note: String(fd.get('plan_note') || '').trim() || null,
          }),
        });
        modal.close();
        await renderCoachingPlan(view);
      } catch (error) {
        if (msgEl) msgEl.textContent = error.message || '계획 저장 실패';
      }
    });
  };

  const openActualModal = (row, dateKey, cell) => {
    if (!isAdmin) return;
    const selectedIds = new Set(Array.isArray(cell?.actual_project_ids) ? cell.actual_project_ids.map((v) => Number(v)) : []);
    const modal = openNuModal({
      title: `${row.coach_name} 실적 보정 (${dateKey})`,
      maxWidth: 'max-w-2xl',
      bodyHtml: `
        <form id="nu-cp-actual-form" class="space-y-3">
          <label class="text-sm block">실적 분(min)
            <input type="number" min="0" max="1440" step="10" name="actual_minutes" value="${Number(cell?.override_minutes ?? cell?.final_minutes ?? 0)}" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
          </label>
          <label class="text-sm block">사유
            <textarea name="reason" rows="3" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">${escapeHtml(cell?.override_reason || '')}</textarea>
          </label>
          <div>
            <div class="text-sm mb-1">실적 과제 (복수 선택)</div>
            <div class="max-h-44 overflow-auto rounded-lg border nu-border p-2 space-y-1 text-sm">
              ${
                projectRows.length
                  ? projectRows
                      .map((project) => `
                        <label class="flex items-center gap-2">
                          <input type="checkbox" name="actual_project_ids" value="${project.project_id}" ${selectedIds.has(Number(project.project_id)) ? 'checked' : ''} />
                          <span>${escapeHtml(project.project_name || `과제 ${project.project_id}`)}</span>
                        </label>
                      `)
                      .join('')
                  : '<div class="nu-text-muted">과제 없음</div>'
              }
            </div>
          </div>
          <p id="nu-cp-actual-msg" class="text-sm text-red-600"></p>
          <div class="flex items-center gap-2">
            ${
              cell?.actual_source === 'override'
                ? '<button type="button" id="nu-cp-actual-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm mr-auto">보정 삭제</button>'
                : ''
            }
            <button type="button" id="nu-cp-actual-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">저장</button>
          </div>
        </form>
      `,
    });
    const formEl = modal.bodyEl?.querySelector('#nu-cp-actual-form');
    const msgEl = modal.bodyEl?.querySelector('#nu-cp-actual-msg');
    modal.bodyEl?.querySelector('#nu-cp-actual-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl?.querySelector('#nu-cp-actual-delete')?.addEventListener('click', async () => {
      if (!confirm('실적 보정을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/coaching-plan/actual-override?batch_id=${state.batchId}&coach_user_id=${row.coach_user_id}&work_date=${dateKey}`, { method: 'DELETE' });
        modal.close();
        await renderCoachingPlan(view);
      } catch (error) {
        if (msgEl) msgEl.textContent = error.message || '실적 보정 삭제 실패';
      }
    });
    formEl?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(formEl);
      const minutes = Number.parseInt(String(fd.get('actual_minutes') || '0'), 10);
      const projectIds = fd.getAll('actual_project_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));
      try {
        await api('/api/coaching-plan/actual-override', {
          method: 'PUT',
          body: JSON.stringify({
            batch_id: Number(state.batchId),
            coach_user_id: Number(row.coach_user_id),
            work_date: dateKey,
            actual_minutes: Number.isNaN(minutes) ? 0 : Math.max(0, Math.min(1440, minutes)),
            reason: String(fd.get('reason') || '').trim() || null,
            actual_project_ids: projectIds,
          }),
        });
        modal.close();
        await renderCoachingPlan(view);
      } catch (error) {
        if (msgEl) msgEl.textContent = error.message || '실적 보정 저장 실패';
      }
    });
  };

  document.getElementById('nu-coaching-grid')?.addEventListener('click', (evt) => {
    const actionBtn = evt.target instanceof Element ? evt.target.closest('button[data-role]') : null;
    if (!actionBtn) return;
    const coachId = Number.parseInt(actionBtn.getAttribute('data-coach-id') || '', 10);
    const dateKey = String(actionBtn.getAttribute('data-date') || '');
    if (Number.isNaN(coachId) || !dateKey) return;
    const targetRow = rows.find((row) => Number(row.coach_user_id) === coachId);
    if (!targetRow) return;
    const targetCell = (Array.isArray(targetRow.cells) ? targetRow.cells : []).find((cell) => String(cell.date).slice(0, 10) === dateKey) || null;
    const action = actionBtn.getAttribute('data-role');
    if (action === 'nu-cp-plan') return openPlanModal(targetRow, dateKey, targetCell);
    if (action === 'nu-cp-actual') return openActualModal(targetRow, dateKey, targetCell);
  });
}

async function renderAdmin(view) {
  const ADMIN_TAB_KEY = 'new_ui_admin_tab';
  const currentTab = ['users', 'batches', 'ip'].includes(localStorage.getItem(ADMIN_TAB_KEY))
    ? localStorage.getItem(ADMIN_TAB_KEY)
    : 'users';

  const [users, batches, ipRanges] = await Promise.all([
    api('/api/users?include_inactive=true'),
    api('/api/batches'),
    api('/api/admin/ip-ranges'),
  ]);
  const userRows = Array.isArray(users) ? users : [];
  const batchRows = Array.isArray(batches) ? batches : [];
  const ipRows = Array.isArray(ipRanges) ? ipRanges : [];
  const projectBuckets = await Promise.all(
    batchRows.map(async (batch) => {
      const projects = await api(`/api/batches/${batch.batch_id}/projects`).catch(() => []);
      return (Array.isArray(projects) ? projects : []).map((project) => ({
        ...project,
        batch_name: batch.batch_name,
      }));
    })
  );
  const projectRows = projectBuckets.flat();

  const tabClass = (id) =>
    `rounded-lg border px-3 py-2 text-sm ${currentTab === id ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface hover:nu-soft'}`;

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">관리자</h1>
      <p class="nu-text-muted mt-1">사용자/차수/IP 관리를 New UI에서 직접 처리합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button class="${tabClass('users')}" data-role="nu-admin-tab" data-tab="users">사용자</button>
        <button class="${tabClass('batches')}" data-role="nu-admin-tab" data-tab="batches">차수</button>
        <button class="${tabClass('ip')}" data-role="nu-admin-tab" data-tab="ip">허용 IP</button>
      </div>
      <div id="nu-admin-content"></div>
    </section>
  `;

  view.querySelectorAll('[data-role="nu-admin-tab"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      localStorage.setItem(ADMIN_TAB_KEY, btn.getAttribute('data-tab') || 'users');
      renderAdmin(view);
    });
  });
  const contentEl = document.getElementById('nu-admin-content');
  if (!contentEl) return;

  const openUserEditor = async (user = null) => {
    const isEdit = !!user;
    const roleValue = normalizeRole(user?.role || 'participant');
    const permissions = isEdit
      ? await api(`/api/users/${user.user_id}/permissions`).catch(() => ({ batch_ids: [], project_ids: [] }))
      : { batch_ids: [], project_ids: [] };
    const selectedBatchIds = new Set((permissions.batch_ids || []).map((v) => Number(v)));
    const selectedProjectIds = new Set((permissions.project_ids || []).map((v) => Number(v)));
    const modal = openNuModal({
      title: isEdit ? '사용자 수정' : '사용자 추가',
      bodyHtml: `
        <form id="nu-admin-user-form" class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <label>Knox ID
              <input name="emp_id" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(user?.emp_id || '')}" required />
            </label>
            <label>이름
              <input name="name" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(user?.name || '')}" required />
            </label>
            <label>부서
              <input name="department" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(user?.department || '')}" />
            </label>
            <label>역할
              <select name="role" id="nu-admin-user-role" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                ${USER_ROLE_OPTIONS.map((opt) => `<option value="${opt.value}" ${opt.value === roleValue ? 'selected' : ''}>${opt.label}</option>`).join('')}
              </select>
            </label>
            <label class="md:col-span-2">이메일 (비우면 자동 생성)
              <input name="email" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(user?.email || '')}" />
            </label>
            ${isEdit ? `<label class="md:col-span-2 text-sm flex items-center gap-2"><input type="checkbox" name="is_active" ${user?.is_active ? 'checked' : ''} /> 활성 상태</label>` : ''}
          </div>
          <div id="nu-admin-user-batch-scope" class="rounded-lg border nu-border p-3">
            <div class="text-sm mb-1">차수 권한</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm max-h-36 overflow-auto">
              ${batchRows.map((batch) => `<label class="flex items-center gap-2"><input type="checkbox" name="batch_ids" value="${batch.batch_id}" ${selectedBatchIds.has(Number(batch.batch_id)) ? 'checked' : ''} /><span>${escapeHtml(batch.batch_name || `차수 ${batch.batch_id}`)}</span></label>`).join('') || '<span class="nu-text-muted">차수 없음</span>'}
            </div>
          </div>
          <div id="nu-admin-user-project-scope" class="rounded-lg border nu-border p-3">
            <div class="text-sm mb-1">과제 권한</div>
            <div class="grid grid-cols-1 gap-1 text-sm max-h-40 overflow-auto">
              ${projectRows.map((project) => `<label class="flex items-center gap-2"><input type="checkbox" name="project_ids" value="${project.project_id}" ${selectedProjectIds.has(Number(project.project_id)) ? 'checked' : ''} /><span>[${escapeHtml(project.batch_name || '-')}] ${escapeHtml(project.project_name || `과제 ${project.project_id}`)}</span></label>`).join('') || '<span class="nu-text-muted">과제 없음</span>'}
            </div>
          </div>
          <p id="nu-admin-user-msg" class="text-sm text-red-600"></p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" id="nu-admin-user-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '생성'}</button>
          </div>
        </form>
      `,
    });
    const formEl = modal.bodyEl?.querySelector('#nu-admin-user-form');
    const msgEl = modal.bodyEl?.querySelector('#nu-admin-user-msg');
    const roleEl = modal.bodyEl?.querySelector('#nu-admin-user-role');
    const batchScopeEl = modal.bodyEl?.querySelector('#nu-admin-user-batch-scope');
    const projectScopeEl = modal.bodyEl?.querySelector('#nu-admin-user-project-scope');
    const syncScope = () => {
      const selectedRole = normalizeRole(roleEl?.value || 'participant');
      batchScopeEl?.classList.toggle('hidden', !roleAllowsBatchScope(selectedRole));
      projectScopeEl?.classList.toggle('hidden', !roleAllowsProjectScope(selectedRole));
    };
    roleEl?.addEventListener('change', syncScope);
    syncScope();

    modal.bodyEl?.querySelector('#nu-admin-user-cancel')?.addEventListener('click', modal.close);
    formEl?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(formEl);
      const role = normalizeRole(fd.get('role'));
      const payload = {
        emp_id: String(fd.get('emp_id') || '').trim(),
        name: String(fd.get('name') || '').trim(),
        department: String(fd.get('department') || '').trim() || null,
        role,
        email: String(fd.get('email') || '').trim() || null,
      };
      if (!payload.emp_id || !payload.name) return msgEl && (msgEl.textContent = 'Knox ID와 이름을 입력하세요.');
      try {
        let targetUserId = Number(user?.user_id || 0);
        if (isEdit) {
          await api(`/api/users/${user.user_id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...payload, is_active: fd.has('is_active') }),
          });
        } else {
          const created = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
          targetUserId = Number(created?.user_id || 0);
        }
        const batchIds = fd.getAll('batch_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));
        const projectIds = fd.getAll('project_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));
        if (targetUserId > 0) {
          await api(`/api/users/${targetUserId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({
              batch_ids: roleAllowsBatchScope(role) ? batchIds : [],
              project_ids: roleAllowsProjectScope(role) ? projectIds : [],
            }),
          });
        }
        modal.close();
        await renderAdmin(view);
      } catch (error) {
        if (msgEl) msgEl.textContent = error.message || '사용자 저장 실패';
      }
    });
  };

  if (currentTab === 'users') {
    let keyword = '';
    const selected = new Set();
    const sortedUsers = [...userRows].sort((a, b) => Number(a.user_id) - Number(b.user_id));
    contentEl.innerHTML = `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input id="nu-admin-user-search" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm min-w-[220px]" placeholder="Knox ID / 이름 / 부서 검색" />
        <button id="nu-admin-user-search-btn" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">검색</button>
        <button id="nu-admin-user-create" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">사용자 추가</button>
        <button id="nu-admin-user-bulk-upsert" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">일괄 등록</button>
        <button id="nu-admin-user-bulk-update" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">선택 일괄수정</button>
        <button id="nu-admin-user-bulk-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm">선택 삭제</button>
      </div>
      <div id="nu-admin-user-table" class="overflow-auto"></div>
    `;
    const tableEl = contentEl.querySelector('#nu-admin-user-table');
    const draw = () => {
      const rows = keyword
        ? sortedUsers.filter((row) => `${row.emp_id || ''} ${row.name || ''} ${row.department || ''}`.toLowerCase().includes(keyword.toLowerCase()))
        : sortedUsers;
      tableEl.innerHTML = `
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left border-b nu-border">
              <th class="py-2 pr-3"><input type="checkbox" id="nu-admin-user-check-all" /></th>
              <th class="py-2 pr-3">Knox ID</th>
              <th class="py-2 pr-3">이름</th>
              <th class="py-2 pr-3">부서</th>
              <th class="py-2 pr-3">역할</th>
              <th class="py-2 pr-3">상태</th>
              <th class="py-2 pr-3">관리</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows.map((row) => `
                    <tr class="border-b nu-border">
                      <td class="py-2 pr-3"><input type="checkbox" data-role="nu-admin-user-check" data-user-id="${row.user_id}" ${selected.has(Number(row.user_id)) ? 'checked' : ''} /></td>
                      <td class="py-2 pr-3">${escapeHtml(row.emp_id || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(row.name || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(row.department || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(roleLabel(row.role))}</td>
                      <td class="py-2 pr-3">${row.is_active ? '활성' : '비활성'}</td>
                      <td class="py-2 pr-3">
                        <button data-role="nu-admin-user-edit" data-user-id="${row.user_id}" class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface">수정</button>
                        <button data-role="nu-admin-user-delete" data-user-id="${row.user_id}" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-2 py-1 text-xs ml-1">삭제</button>
                      </td>
                    </tr>
                  `).join('')
                : '<tr><td colspan="7" class="py-3 nu-text-muted">사용자가 없습니다.</td></tr>'
            }
          </tbody>
        </table>
      `;
      tableEl.querySelector('#nu-admin-user-check-all')?.addEventListener('change', (evt) => {
        rows.forEach((row) => (evt.target.checked ? selected.add(Number(row.user_id)) : selected.delete(Number(row.user_id))));
        draw();
      });
      tableEl.querySelectorAll('[data-role="nu-admin-user-check"]').forEach((el) => {
        el.addEventListener('change', () => {
          const id = Number.parseInt(el.getAttribute('data-user-id') || '', 10);
          if (Number.isNaN(id)) return;
          if (el.checked) selected.add(id);
          else selected.delete(id);
        });
      });
      tableEl.querySelectorAll('[data-role="nu-admin-user-edit"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number.parseInt(btn.getAttribute('data-user-id') || '', 10);
          const user = sortedUsers.find((row) => Number(row.user_id) === id);
          if (user) openUserEditor(user);
        });
      });
      tableEl.querySelectorAll('[data-role="nu-admin-user-delete"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number.parseInt(btn.getAttribute('data-user-id') || '', 10);
          if (Number.isNaN(id) || !confirm('사용자를 삭제하시겠습니까?')) return;
          try {
            await api(`/api/users/${id}`, { method: 'DELETE' });
            await renderAdmin(view);
          } catch (error) {
            alert(error.message || '사용자 삭제 실패');
          }
        });
      });
    };
    draw();

    contentEl.querySelector('#nu-admin-user-search-btn')?.addEventListener('click', () => {
      keyword = String(contentEl.querySelector('#nu-admin-user-search')?.value || '').trim();
      draw();
    });
    contentEl.querySelector('#nu-admin-user-search')?.addEventListener('keydown', (evt) => {
      if (evt.key !== 'Enter') return;
      evt.preventDefault();
      keyword = String(contentEl.querySelector('#nu-admin-user-search')?.value || '').trim();
      draw();
    });
    contentEl.querySelector('#nu-admin-user-create')?.addEventListener('click', () => openUserEditor(null));
    contentEl.querySelector('#nu-admin-user-bulk-upsert')?.addEventListener('click', () => {
      const modal = openNuModal({
        title: '일괄 등록',
        maxWidth: 'max-w-3xl',
        bodyHtml: `
          <form id="nu-admin-bulk-upsert-form" class="space-y-3">
            <p class="text-sm nu-text-muted">형식: KnoxID,이름,부서,역할 (한 줄 1명)</p>
            <textarea name="rows" rows="10" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface"></textarea>
            <p id="nu-admin-bulk-msg" class="text-sm text-red-600"></p>
            <div class="flex justify-end gap-2">
              <button type="button" id="nu-admin-bulk-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
              <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">적용</button>
            </div>
          </form>
        `,
      });
      modal.bodyEl?.querySelector('#nu-admin-bulk-cancel')?.addEventListener('click', modal.close);
      modal.bodyEl?.querySelector('#nu-admin-bulk-upsert-form')?.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const msgEl = modal.bodyEl?.querySelector('#nu-admin-bulk-msg');
        const raw = String(modal.bodyEl?.querySelector('textarea[name="rows"]')?.value || '');
        const rows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
          const cols = line.split(/\t|,/).map((v) => v.trim());
          return { emp_id: cols[0] || '', name: cols[1] || '', department: cols[2] || null, role: normalizeRole(cols[3] || 'participant') };
        });
        if (!rows.length) return msgEl && (msgEl.textContent = '입력된 행이 없습니다.');
        try {
          const result = await api('/api/users/bulk-upsert', { method: 'POST', body: JSON.stringify({ rows, reactivate_inactive: true }) });
          alert(`생성 ${result.created} / 수정 ${result.updated} / 실패 ${result.failed}`);
          modal.close();
          await renderAdmin(view);
        } catch (error) {
          if (msgEl) msgEl.textContent = error.message || '일괄 등록 실패';
        }
      });
    });
    contentEl.querySelector('#nu-admin-user-bulk-update')?.addEventListener('click', () => {
      const ids = [...selected];
      if (!ids.length) return alert('수정할 사용자를 선택하세요.');
      openNuModal({
        title: `일괄 수정 대상: ${ids.length}명`,
        maxWidth: 'max-w-3xl',
        bodyHtml: `
          <form id="nu-admin-bulk-update-form" class="space-y-3">
            <label class="text-sm block">부서 (비우면 미변경)
              <input name="department" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
            </label>
            <label class="text-sm block">역할 (선택 시 변경)
              <select name="role" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                <option value="">변경 안함</option>
                ${USER_ROLE_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('')}
              </select>
            </label>
            <label class="text-sm flex items-center gap-2">
              <input type="checkbox" name="apply_batch" />
              차수 권한 변경
            </label>
            <div class="rounded-lg border nu-border p-3 max-h-36 overflow-auto text-sm">
              ${
                batchRows.length
                  ? batchRows
                      .map((batch) => `
                        <label class="flex items-center gap-2">
                          <input type="checkbox" name="batch_ids" value="${batch.batch_id}" />
                          <span>${escapeHtml(batch.batch_name || `차수 ${batch.batch_id}`)}</span>
                        </label>
                      `)
                      .join('')
                  : '<span class="nu-text-muted">차수 없음</span>'
              }
            </div>
            <label class="text-sm flex items-center gap-2">
              <input type="checkbox" name="apply_project" />
              과제 권한 변경
            </label>
            <div class="rounded-lg border nu-border p-3 max-h-40 overflow-auto text-sm">
              ${
                projectRows.length
                  ? projectRows
                      .map((project) => `
                        <label class="flex items-center gap-2">
                          <input type="checkbox" name="project_ids" value="${project.project_id}" />
                          <span>[${escapeHtml(project.batch_name || '-')}] ${escapeHtml(project.project_name || `과제 ${project.project_id}`)}</span>
                        </label>
                      `)
                      .join('')
                  : '<span class="nu-text-muted">과제 없음</span>'
              }
            </div>
            <p id="nu-admin-bulk-update-msg" class="text-sm text-red-600"></p>
            <div class="flex justify-end gap-2">
              <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">적용</button>
            </div>
          </form>
        `,
      });
      const overlay = document.getElementById('nu-modal-overlay');
      const modalBody = overlay?.querySelector('#nu-modal-body');
      modalBody?.querySelector('#nu-admin-bulk-update-form')?.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const fd = new FormData(modalBody.querySelector('#nu-admin-bulk-update-form'));
        const payload = { user_ids: ids };
        const department = String(fd.get('department') || '').trim();
        const role = String(fd.get('role') || '').trim();
        if (department) payload.department = department;
        if (role) payload.role = normalizeRole(role);
        if (fd.has('apply_batch')) {
          payload.batch_ids = fd.getAll('batch_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));
        }
        if (fd.has('apply_project')) {
          payload.project_ids = fd.getAll('project_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));
        }
        if (Object.keys(payload).length <= 1) return;
        try {
          const result = await api('/api/users/bulk-update', { method: 'POST', body: JSON.stringify(payload) });
          alert(`수정 ${result.updated} / 실패 ${result.failed}`);
          overlay?.remove();
          document.body.classList.remove('overflow-hidden');
          await renderAdmin(view);
        } catch (error) {
          const msgEl = modalBody?.querySelector('#nu-admin-bulk-update-msg');
          if (msgEl) msgEl.textContent = error.message || '일괄 수정 실패';
        }
      });
    });
    contentEl.querySelector('#nu-admin-user-bulk-delete')?.addEventListener('click', async () => {
      const ids = [...selected];
      if (!ids.length) return alert('삭제할 사용자를 선택하세요.');
      if (!confirm(`${ids.length}명을 삭제하시겠습니까?`)) return;
      try {
        const result = await api('/api/users/bulk-delete', { method: 'POST', body: JSON.stringify({ user_ids: ids }) });
        alert(`삭제 ${result.deleted} / 실패 ${result.failed}`);
        await renderAdmin(view);
      } catch (error) {
        alert(error.message || '일괄 삭제 실패');
      }
    });
    return;
  }

  if (currentTab === 'batches') {
    const rows = [...batchRows].sort((a, b) => Number(a.batch_id) - Number(b.batch_id));
    contentEl.innerHTML = `
      <div class="flex items-center gap-2 mb-3">
        <button id="nu-admin-batch-create" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">차수 추가</button>
      </div>
      <div class="overflow-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left border-b nu-border">
              <th class="py-2 pr-3">ID</th>
              <th class="py-2 pr-3">차수명</th>
              <th class="py-2 pr-3">시작일</th>
              <th class="py-2 pr-3">코칭 시작일</th>
              <th class="py-2 pr-3">종료일</th>
              <th class="py-2 pr-3">상태</th>
              <th class="py-2 pr-3">관리</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows.map((row) => `
                    <tr class="border-b nu-border">
                      <td class="py-2 pr-3">${row.batch_id}</td>
                      <td class="py-2 pr-3">${escapeHtml(row.batch_name || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(toDateInputValue(row.start_date) || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(toDateInputValue(row.coaching_start_date) || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(toDateInputValue(row.end_date) || '-')}</td>
                      <td class="py-2 pr-3">${escapeHtml(row.status || '-')}</td>
                      <td class="py-2 pr-3">
                        <button data-role="nu-admin-batch-edit" data-batch-id="${row.batch_id}" class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface">수정</button>
                        <button data-role="nu-admin-batch-delete" data-batch-id="${row.batch_id}" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-2 py-1 text-xs ml-1">삭제</button>
                      </td>
                    </tr>
                  `).join('')
                : '<tr><td colspan="7" class="py-3 nu-text-muted">차수가 없습니다.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    `;
    contentEl.querySelector('#nu-admin-batch-create')?.addEventListener('click', () => {
      const open = openNuModal({
        title: '차수 추가',
        maxWidth: 'max-w-xl',
        bodyHtml: `
          <form id="nu-admin-batch-form" class="space-y-3">
            <input name="batch_name" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" placeholder="차수명" required />
            <input type="date" name="start_date" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" required />
            <input type="date" name="coaching_start_date" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
            <input type="date" name="end_date" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" required />
            <button class="rounded-lg px-3 py-2 text-sm nu-primary-bg" type="submit">생성</button>
          </form>
        `,
      });
      open.bodyEl?.querySelector('#nu-admin-batch-form')?.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const fd = new FormData(open.bodyEl.querySelector('#nu-admin-batch-form'));
        try {
          await api('/api/batches', { method: 'POST', body: JSON.stringify({
            batch_name: String(fd.get('batch_name') || '').trim(),
            start_date: String(fd.get('start_date') || '').trim(),
            coaching_start_date: String(fd.get('coaching_start_date') || '').trim() || null,
            end_date: String(fd.get('end_date') || '').trim(),
            status: 'planned',
          }) });
          open.close();
          await ensureBatches();
          await renderAdmin(view);
        } catch (error) {
          alert(error.message || '차수 생성 실패');
        }
      });
    });
    contentEl.querySelectorAll('[data-role="nu-admin-batch-edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number.parseInt(btn.getAttribute('data-batch-id') || '', 10);
        const batch = rows.find((row) => Number(row.batch_id) === id);
        if (!batch) return;
        const open = openNuModal({
          title: `차수 수정 #${id}`,
          maxWidth: 'max-w-xl',
          bodyHtml: `
            <form id="nu-admin-batch-edit-form" class="space-y-3">
              <input name="batch_name" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(batch.batch_name || '')}" required />
              <input type="date" name="start_date" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${toDateInputValue(batch.start_date)}" required />
              <input type="date" name="coaching_start_date" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${toDateInputValue(batch.coaching_start_date)}" />
              <input type="date" name="end_date" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${toDateInputValue(batch.end_date)}" required />
              <button class="rounded-lg px-3 py-2 text-sm nu-primary-bg" type="submit">저장</button>
            </form>
          `,
        });
        open.bodyEl?.querySelector('#nu-admin-batch-edit-form')?.addEventListener('submit', async (evt) => {
          evt.preventDefault();
          const fd = new FormData(open.bodyEl.querySelector('#nu-admin-batch-edit-form'));
          try {
            await api(`/api/batches/${id}`, { method: 'PUT', body: JSON.stringify({
              batch_name: String(fd.get('batch_name') || '').trim(),
              start_date: String(fd.get('start_date') || '').trim(),
              coaching_start_date: String(fd.get('coaching_start_date') || '').trim() || null,
              end_date: String(fd.get('end_date') || '').trim(),
            }) });
            open.close();
            await ensureBatches();
            await renderAdmin(view);
          } catch (error) {
            alert(error.message || '차수 저장 실패');
          }
        });
      });
    });
    contentEl.querySelectorAll('[data-role="nu-admin-batch-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number.parseInt(btn.getAttribute('data-batch-id') || '', 10);
        if (Number.isNaN(id) || !confirm('차수를 삭제하시겠습니까?')) return;
        try {
          await api(`/api/batches/${id}`, { method: 'DELETE' });
          await ensureBatches();
          await renderAdmin(view);
        } catch (error) {
          alert(error.message || '차수 삭제 실패');
        }
      });
    });
    return;
  }

  contentEl.innerHTML = `
    <form id="nu-admin-ip-form" class="grid grid-cols-1 md:grid-cols-[1fr,1fr,auto] gap-2 mb-3">
      <input name="cidr" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="예: 10.0.0.0/24" required />
      <input name="description" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="설명" />
      <button class="rounded-lg px-3 py-2 text-sm nu-primary-bg" type="submit">추가</button>
    </form>
    <div class="overflow-auto">
      <table class="min-w-full text-sm">
        <thead><tr class="text-left border-b nu-border"><th class="py-2 pr-3">CIDR</th><th class="py-2 pr-3">설명</th><th class="py-2 pr-3">상태</th><th class="py-2 pr-3">관리</th></tr></thead>
        <tbody>
          ${
            ipRows.length
              ? ipRows.map((row) => `<tr class="border-b nu-border"><td class="py-2 pr-3">${escapeHtml(row.cidr || '-')}</td><td class="py-2 pr-3">${escapeHtml(row.description || '-')}</td><td class="py-2 pr-3">${row.is_active ? '활성' : '비활성'}</td><td class="py-2 pr-3"><button data-role="nu-admin-ip-delete" data-ip-id="${row.id}" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-2 py-1 text-xs">삭제</button></td></tr>`).join('')
              : '<tr><td colspan="4" class="py-3 nu-text-muted">등록된 IP 대역이 없습니다.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;
  contentEl.querySelector('#nu-admin-ip-form')?.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const fd = new FormData(contentEl.querySelector('#nu-admin-ip-form'));
    const cidr = String(fd.get('cidr') || '').trim();
    if (!cidr) return;
    try {
      await api('/api/admin/ip-ranges', {
        method: 'POST',
        body: JSON.stringify({
          cidr,
          description: String(fd.get('description') || '').trim() || null,
          is_active: true,
        }),
      });
      await renderAdmin(view);
    } catch (error) {
      alert(error.message || 'IP 대역 추가 실패');
    }
  });
  contentEl.querySelectorAll('[data-role="nu-admin-ip-delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number.parseInt(btn.getAttribute('data-ip-id') || '', 10);
      if (Number.isNaN(id) || !confirm('IP 대역을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/admin/ip-ranges/${id}`, { method: 'DELETE' });
        await renderAdmin(view);
      } catch (error) {
        alert(error.message || 'IP 대역 삭제 실패');
      }
    });
  });
}

function renderForbidden(view, feature) {
  view.innerHTML = `
    <section class="rounded-2xl border nu-border nu-surface p-5">
      <h1 class="text-xl font-semibold text-red-600">접근 권한 없음</h1>
      <p class="mt-2 nu-text-muted">${escapeHtml(feature)} 화면에 접근할 수 없습니다.</p>
      <button class="mt-4 rounded-lg px-3 py-2 nu-primary-bg" id="nu-go-projects">과제 화면으로 이동</button>
    </section>
  `;
  document.getElementById('nu-go-projects').addEventListener('click', () => navigate('/projects'));
}

function renderNotFound(view) {
  const homePath = getDefaultAuthedPath();
  const homeLabel = homePath === '/dashboard' ? '대시보드' : '과제';
  view.innerHTML = `
    <section class="rounded-2xl border nu-border nu-surface p-5">
      <h1 class="text-xl font-semibold">404</h1>
      <p class="mt-2 nu-text-muted">요청한 화면을 찾을 수 없습니다.</p>
      <button class="mt-4 rounded-lg px-3 py-2 nu-primary-bg" id="nu-go-dashboard">${escapeHtml(homeLabel)}로 이동</button>
    </section>
  `;
  document.getElementById('nu-go-dashboard').addEventListener('click', () => navigate(homePath));
}

function kpiCard(label, value) {
  return `
    <div class="rounded-2xl border nu-border nu-surface p-4">
      <div class="text-sm nu-text-muted">${escapeHtml(label)}</div>
      <div class="text-2xl font-bold mt-1">${escapeHtml(value)}</div>
    </div>
  `;
}

// P1 parity overrides for New UI

function p1DateLabel(dateKey) {
  const dt = parseDate(`${dateKey}T00:00:00`);
  if (!dt) return dateKey;
  const week = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}(${week})`;
}

function p1TodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function p1ProjectTypeLabel(value) {
  return String(value || 'primary') === 'associate' ? '준참여과제' : '정식과제';
}

function p1HasText(value) {
  return String((value || '').replace(/<[^>]+>/g, '').trim()).length > 0;
}

function p1MentionToken(empId) {
  return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-blue-100 text-blue-700 border border-blue-200">@${escapeHtml(empId)}</span>`;
}

function p1MergeMentionsIntoContent(html, pickedUsers = []) {
  const uniqueEmpIds = [];
  const seen = new Set();
  (pickedUsers || []).forEach((row) => {
    const empId = String(row?.emp_id || '').trim();
    if (!empId || seen.has(empId)) return;
    seen.add(empId);
    uniqueEmpIds.push(empId);
  });
  if (!uniqueEmpIds.length) return html || '';
  const plainText = String(html || '').replace(/<[^>]+>/g, ' ');
  const missing = uniqueEmpIds.filter((empId) => !new RegExp(`@${empId}(\\b|$)`).test(plainText));
  if (!missing.length) return html || '';
  return `${html || ''}<p>${missing.map((empId) => p1MentionToken(empId)).join(' ')}</p>`;
}

async function renderDashboard(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const role = normalizeRole(state.user?.role || '');
  const isAdmin = role === 'admin';
  const MODE_KEY = 'new_ui_dash_mode';
  const TYPE_KEY = 'new_ui_dash_project_type';
  const EXPAND_KEY = 'new_ui_dash_expand_projects';

  let mode = localStorage.getItem(MODE_KEY) || 'progress';
  if (!['progress', 'attendance', 'coaching', 'coach_performance'].includes(mode)) mode = 'progress';
  if (!isAdmin && mode === 'coach_performance') mode = 'progress';
  let projectType = localStorage.getItem(TYPE_KEY) || 'primary';
  if (!['primary', 'associate'].includes(projectType)) projectType = 'primary';
  let expandedProjects = {};
  try {
    expandedProjects = JSON.parse(localStorage.getItem(EXPAND_KEY) || '{}') || {};
  } catch {
    expandedProjects = {};
  }

  const data = await api(`/api/dashboard?batch_id=${state.batchId}`);
  const allDates = Array.isArray(data?.dates) ? data.dates.map((value) => String(value).slice(0, 10)) : [];
  const coachingDateSet = new Set(
    (Array.isArray(data?.coaching_schedule_dates) ? data.coaching_schedule_dates : []).map((value) => String(value).slice(0, 10))
  );
  const dates = allDates.filter((dateKey) => coachingDateSet.has(dateKey));
  const projects = (Array.isArray(data?.projects) ? data.projects : [])
    .filter((row) => String(row.project_type || 'primary') === projectType)
    .sort((a, b) => String(a.project_name || '').localeCompare(String(b.project_name || ''), 'ko'));
  const attendanceRows = Array.isArray(data?.attendance_rows) ? data.attendance_rows : [];
  const noteRows = Array.isArray(data?.note_rows) ? data.note_rows : [];
  const attendanceMemberRows = Array.isArray(data?.attendance_member_rows) ? data.attendance_member_rows : [];
  const coachPerformanceRows = Array.isArray(data?.coach_performance) ? data.coach_performance : [];
  const attendanceRowMap = new Map(attendanceRows.map((row) => [Number(row.project_id), row]));
  const noteRowMap = new Map(noteRows.map((row) => [Number(row.project_id), row]));
  const memberRowMap = new Map(attendanceMemberRows.map((row) => [Number(row.project_id), Array.isArray(row.members) ? row.members : []]));

  const orderedCells = (cells, fallback) => {
    const map = new Map((Array.isArray(cells) ? cells : []).map((cell) => [String(cell.date).slice(0, 10), cell]));
    return dates.map((dateKey) => ({ date: dateKey, ...(fallback || {}), ...(map.get(dateKey) || {}) }));
  };

  const renderProgress = () => {
    if (!projects.length) return '<p class="text-sm nu-text-muted py-3">표시할 과제가 없습니다.</p>';
    return `
      <div class="overflow-auto" id="nu-dash-matrix">
        <table class="min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky top-0 left-0 z-20 nu-surface border-b nu-border px-3 py-2 text-left min-w-[260px]">과제명</th>
              <th class="sticky top-0 left-[260px] z-20 nu-surface border-b nu-border px-3 py-2 text-left min-w-[96px]">구분</th>
              <th class="sticky top-0 left-[356px] z-20 nu-surface border-b nu-border px-3 py-2 text-left min-w-[110px]">합계</th>
              <th class="sticky top-0 z-10 nu-surface border-b nu-border px-3 py-2 text-left min-w-[260px]">진행률</th>
            </tr>
          </thead>
          <tbody>
            ${projects
              .map((project) => {
                const progress = Math.max(0, Math.min(100, Number(project.progress_rate || 0)));
                return `
                  <tr>
                    <td class="sticky left-0 z-10 nu-surface border-b nu-border px-3 py-2 font-medium">
                      <button class="underline underline-offset-2 text-left" data-role="nu-dash-open-project" data-project-id="${project.project_id}">${escapeHtml(project.project_name || '-')}</button>
                    </td>
                    <td class="sticky left-[260px] z-10 nu-surface border-b nu-border px-3 py-2">${escapeHtml(p1ProjectTypeLabel(project.project_type))}</td>
                    <td class="sticky left-[356px] z-10 nu-surface border-b nu-border px-3 py-2 font-semibold">${progress.toFixed(0)}%</td>
                    <td class="border-b nu-border px-3 py-2">
                      <div class="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                        <div class="h-full nu-primary-bg" style="width:${progress}%;"></div>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderAttendance = () => {
    if (!projects.length) return '<p class="text-sm nu-text-muted py-3">표시할 과제가 없습니다.</p>';
    if (!dates.length) return '<p class="text-sm nu-text-muted py-3">코칭 일정 데이터가 없습니다.</p>';
    return `
      <div class="overflow-auto" id="nu-dash-matrix">
        <table class="min-w-full text-xs md:text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky top-0 left-0 z-30 nu-surface border-b nu-border px-3 py-2 text-left min-w-[240px]">과제명</th>
              <th class="sticky top-0 left-[240px] z-30 nu-surface border-b nu-border px-3 py-2 text-left min-w-[120px]">총인원</th>
              <th class="sticky top-0 left-[360px] z-30 nu-surface border-b nu-border px-3 py-2 text-left min-w-[130px]">합계</th>
              ${dates
                .map(
                  (dateKey) =>
                    `<th data-date="${escapeHtml(dateKey)}" class="sticky top-0 z-20 nu-surface border-b nu-border px-2 py-2 min-w-[118px] text-left">${escapeHtml(
                      p1DateLabel(dateKey)
                    )}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${projects
              .map((project) => {
                const row = attendanceRowMap.get(Number(project.project_id)) || {};
                const cells = orderedCells(row.cells, { attendance_count: 0, attendance_rate: 0 });
                const expectedCount = Number(row.expected_count || project.expected_count || 0);
                const attendedDays = cells.filter((cell) => Number(cell.attendance_count || 0) > 0).length;
                const members = memberRowMap.get(Number(project.project_id)) || [];
                const expanded = !!expandedProjects[String(project.project_id)];
                const memberRows = expanded
                  ? members
                      .map((member) => {
                        const attended = new Set((Array.isArray(member.attendance_dates) ? member.attendance_dates : []).map((d) => String(d).slice(0, 10)));
                        return `
                          <tr class="bg-slate-50/60">
                            <td class="sticky left-0 z-10 nu-surface border-b nu-border px-3 py-2 pl-6 text-xs">- ${escapeHtml(member.user_name || `사용자#${member.user_id}`)}</td>
                            <td class="sticky left-[240px] z-10 nu-surface border-b nu-border px-3 py-2"></td>
                            <td class="sticky left-[360px] z-10 nu-surface border-b nu-border px-3 py-2"></td>
                            ${dates.map((dateKey) => `<td class="border-b nu-border px-2 py-2 text-center">${attended.has(dateKey) ? 'V' : ''}</td>`).join('')}
                          </tr>
                        `;
                      })
                      .join('')
                  : '';
                return `
                  <tr>
                    <td class="sticky left-0 z-10 nu-surface border-b nu-border px-3 py-2">
                      <button class="underline underline-offset-2 text-left" data-role="nu-dash-open-project" data-project-id="${project.project_id}">${escapeHtml(
                        project.project_name || '-'
                      )}</button>
                    </td>
                    <td class="sticky left-[240px] z-10 nu-surface border-b nu-border px-3 py-2">
                      <button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-dash-toggle-members" data-project-id="${project.project_id}">
                        대상 ${expectedCount}명 ${expanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td class="sticky left-[360px] z-10 nu-surface border-b nu-border px-3 py-2 font-semibold">
                      ${attendedDays}/${dates.length}
                      <div class="text-[11px] nu-text-muted">한명 이상 출석</div>
                    </td>
                    ${cells
                      .map(
                        (cell) => `
                          <td class="border-b nu-border px-2 py-2 text-center">
                            <div>${Number(cell.attendance_count || 0)}명</div>
                            <div class="text-[11px] nu-text-muted">${Number(cell.attendance_rate || 0).toFixed(1)}%</div>
                          </td>
                        `
                      )
                      .join('')}
                  </tr>
                  ${memberRows}
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderCoaching = () => {
    if (!projects.length) return '<p class="text-sm nu-text-muted py-3">표시할 과제가 없습니다.</p>';
    if (!dates.length) return '<p class="text-sm nu-text-muted py-3">코칭 일정 데이터가 없습니다.</p>';
    return `
      <div class="overflow-auto" id="nu-dash-matrix">
        <table class="min-w-full text-xs md:text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky top-0 left-0 z-30 nu-surface border-b nu-border px-3 py-2 text-left min-w-[240px]">과제명</th>
              <th class="sticky top-0 left-[240px] z-30 nu-surface border-b nu-border px-3 py-2 text-left min-w-[140px]">합계</th>
              ${dates
                .map(
                  (dateKey) =>
                    `<th data-date="${escapeHtml(dateKey)}" class="sticky top-0 z-20 nu-surface border-b nu-border px-2 py-2 min-w-[124px] text-left">${escapeHtml(
                      p1DateLabel(dateKey)
                    )}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${projects
              .map((project) => {
                const row = noteRowMap.get(Number(project.project_id)) || {};
                const cells = orderedCells(row.cells, { note_count: 0, coach_commenter_count: 0 });
                const totalNotes = cells.reduce((acc, cell) => acc + Number(cell.note_count || 0), 0);
                const totalCommenters = cells.reduce((acc, cell) => acc + Number(cell.coach_commenter_count || 0), 0);
                return `
                  <tr>
                    <td class="sticky left-0 z-10 nu-surface border-b nu-border px-3 py-2">
                      <button class="underline underline-offset-2 text-left" data-role="nu-dash-open-project" data-project-id="${project.project_id}">${escapeHtml(
                        project.project_name || '-'
                      )}</button>
                    </td>
                    <td class="sticky left-[240px] z-10 nu-surface border-b nu-border px-3 py-2 font-semibold">
                      ${totalNotes}건
                      <div class="text-[11px] nu-text-muted">코치 ${totalCommenters}명</div>
                    </td>
                    ${cells
                      .map(
                        (cell) => `
                          <td class="border-b nu-border px-2 py-2 text-center">
                            <div>${Number(cell.note_count || 0)}건</div>
                            <div class="text-[11px] nu-text-muted">코치 ${Number(cell.coach_commenter_count || 0)}명</div>
                          </td>
                        `
                      )
                      .join('')}
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderCoachPerformance = () => {
    if (!coachPerformanceRows.length) return '<p class="text-sm nu-text-muted py-3">코칭 실적 데이터가 없습니다.</p>';
    return `
      <div class="overflow-auto">
        <table class="min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky top-0 left-0 z-20 nu-surface border-b nu-border px-3 py-2 text-left min-w-[220px]">코치</th>
              <th class="sticky top-0 left-[220px] z-20 nu-surface border-b nu-border px-3 py-2 text-left min-w-[110px]">합계</th>
              <th class="sticky top-0 z-10 nu-surface border-b nu-border px-3 py-2 text-left min-w-[180px]">입실(코칭) 횟수</th>
              <th class="sticky top-0 z-10 nu-surface border-b nu-border px-3 py-2 text-left min-w-[180px]">코칭의견 작성 건수</th>
            </tr>
          </thead>
          <tbody>
            ${coachPerformanceRows
              .map((row) => {
                const checkinCount = Number(row.checkin_count || 0);
                const commentCount = Number(row.comment_count || 0);
                return `
                  <tr>
                    <td class="sticky left-0 z-10 nu-surface border-b nu-border px-3 py-2">${escapeHtml(row.coach_name || '-')}</td>
                    <td class="sticky left-[220px] z-10 nu-surface border-b nu-border px-3 py-2 font-semibold">${checkinCount + commentCount}</td>
                    <td class="border-b nu-border px-3 py-2">${checkinCount}</td>
                    <td class="border-b nu-border px-3 py-2">${commentCount}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">대시보드</h1>
      <p class="nu-text-muted mt-1">코칭 일정 날짜축 기준으로 진행률/출석/코칭/코칭 실적을 관리합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button data-role="nu-dash-mode" data-mode="progress" class="rounded-lg border px-3 py-2 text-sm ${mode === 'progress' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">진행률</button>
        <button data-role="nu-dash-mode" data-mode="attendance" class="rounded-lg border px-3 py-2 text-sm ${mode === 'attendance' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">출석</button>
        <button data-role="nu-dash-mode" data-mode="coaching" class="rounded-lg border px-3 py-2 text-sm ${mode === 'coaching' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">코칭</button>
        ${isAdmin ? `<button data-role="nu-dash-mode" data-mode="coach_performance" class="rounded-lg border px-3 py-2 text-sm ${mode === 'coach_performance' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">코칭 실적</button>` : ''}
      </div>
      ${
        mode !== 'coach_performance'
          ? `
            <div class="flex flex-wrap items-center gap-2 mb-3">
              <button data-role="nu-dash-type" data-type="primary" class="rounded-lg border px-3 py-2 text-sm ${projectType === 'primary' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">정식과제</button>
              <button data-role="nu-dash-type" data-type="associate" class="rounded-lg border px-3 py-2 text-sm ${projectType === 'associate' ? 'nu-primary-bg border-transparent' : 'nu-border nu-surface'}">준참여과제</button>
            </div>
          `
          : ''
      }
      <div id="nu-dash-content">
        ${mode === 'progress' ? renderProgress() : mode === 'attendance' ? renderAttendance() : mode === 'coaching' ? renderCoaching() : renderCoachPerformance()}
      </div>
    </section>
  `;

  view.querySelectorAll('[data-role="nu-dash-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-mode') || 'progress';
      localStorage.setItem(MODE_KEY, next);
      if (next !== 'attendance') localStorage.setItem(EXPAND_KEY, JSON.stringify({}));
      renderDashboard(view);
    });
  });
  view.querySelectorAll('[data-role="nu-dash-type"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-type') || 'primary';
      localStorage.setItem(TYPE_KEY, next);
      localStorage.setItem(EXPAND_KEY, JSON.stringify({}));
      renderDashboard(view);
    });
  });
  view.querySelectorAll('[data-role="nu-dash-open-project"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const projectId = Number.parseInt(btn.getAttribute('data-project-id') || '', 10);
      if (!Number.isNaN(projectId)) navigate(`/projects/${projectId}`);
    });
  });
  view.querySelectorAll('[data-role="nu-dash-toggle-members"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const projectId = Number.parseInt(btn.getAttribute('data-project-id') || '', 10);
      if (Number.isNaN(projectId)) return;
      expandedProjects = { ...expandedProjects, [String(projectId)]: !expandedProjects[String(projectId)] };
      localStorage.setItem(EXPAND_KEY, JSON.stringify(expandedProjects));
      renderDashboard(view);
    });
  });

  if (mode === 'attendance' || mode === 'coaching') {
    setTimeout(() => {
      const wrap = document.getElementById('nu-dash-matrix');
      if (!wrap || !dates.length) return;
      const targetDate = dates.includes(p1TodayIso()) ? p1TodayIso() : dates[0];
      const target = wrap.querySelector(`thead th[data-date="${targetDate}"]`);
      if (!target) return;
      wrap.scrollLeft = Math.max(target.offsetLeft - wrap.offsetLeft - 12, 0);
    }, 0);
  }
}

async function renderCalendar(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const role = normalizeRole(state.user?.role || '');
  const isAdmin = role === 'admin';
  const canManageSchedules = isAdmin;
  const canManageSessions = ['admin', 'internal_coach', 'external_coach', 'participant'].includes(role);
  const canCreateAnyEvent = canManageSchedules || canManageSessions;
  const CALENDAR_VIEW_KEY = 'new_ui_calendar_view';
  const savedViewMode = localStorage.getItem(CALENDAR_VIEW_KEY);
  let viewMode = savedViewMode === 'list' ? 'list' : 'calendar';
  const now = new Date();
  let monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let events = [];
  const projects = await api(`/api/batches/${state.batchId}/projects`).catch(() => []);
  const projectRows = Array.isArray(projects) ? projects : [];

  const CALENDAR_COLORS = [
    { value: '#4CAF50', label: '초록' },
    { value: '#00ACC1', label: '청록' },
    { value: '#2196F3', label: '파랑' },
    { value: '#3F51B5', label: '인디고' },
    { value: '#FF9800', label: '주황' },
    { value: '#FF7043', label: '코랄' },
    { value: '#E57373', label: '레드' },
    { value: '#FDD835', label: '옐로우' },
    { value: '#8E24AA', label: '퍼플' },
    { value: '#607D8B', label: '슬레이트' },
  ];

  const pad2 = (value) => String(value).padStart(2, '0');
  const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const parseMonthValue = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) return null;
    return { year, month };
  };
  const shiftMonthValue = (value, diff) => {
    const parsed = parseMonthValue(value) || parseMonthValue(monthValue) || { year: now.getFullYear(), month: now.getMonth() + 1 };
    const next = new Date(parsed.year, parsed.month - 1 + diff, 1);
    return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
  };
  const toDateInputValueFromDateTime = (value) => {
    const dt = parseDate(value);
    return dt ? `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}` : '';
  };
  const toTimeInputValue = (value) => {
    const dt = parseDate(value);
    return dt ? `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : '';
  };
  const toDateTimeString = (dateStr, timeStr) => `${dateStr}T${String(timeStr || '00:00').slice(0, 5)}:00`;
  const normalizeScope = (scope, scheduleType) => {
    const raw = String(scope || '').trim().toLowerCase();
    if (raw === 'coaching') return 'coaching';
    if (raw === 'global') return 'global';
    return String(scheduleType || '').toLowerCase() === 'coaching' ? 'coaching' : 'global';
  };
  const resolveEventDate = (event) => parseDate(event?.start || event?.start_time || event?.date);
  const resolveEventSortTime = (event) => resolveEventDate(event)?.getTime() || 0;
  const scopeLabel = (event) => {
    if (String(event?.manage_type || '') === 'session') return '과제';
    const scope = normalizeScope(event?.scope || event?.visibility_scope, event?.schedule_type);
    return scope === 'coaching' ? '코칭' : '공통';
  };
  const typeLabel = (event) => {
    if (String(event?.manage_type || '') === 'session') return '과제 일정';
    const scope = normalizeScope(event?.scope || event?.visibility_scope, event?.schedule_type);
    return scope === 'coaching' ? '코칭 일정' : '공통 일정';
  };
  const canEditEvent = (event) => {
    if (!event) return false;
    if (String(event.manage_type || '') === 'schedule') return canManageSchedules;
    if (String(event.manage_type || '') === 'session') return canManageSessions;
    return false;
  };
  const eventByKey = (id, manageType) =>
    events.find((row) => Number(row.id) === Number(id) && String(row.manage_type || '') === String(manageType || ''));
  const closeCalendarModal = () => {
    document.getElementById('nu-calendar-modal')?.remove();
    document.body.classList.remove('overflow-hidden');
  };
  const openCalendarOverlay = (html) => {
    closeCalendarModal();
    const overlay = document.createElement('div');
    overlay.id = 'nu-calendar-modal';
    overlay.className = 'fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    document.body.classList.add('overflow-hidden');
    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) closeCalendarModal();
    });
    return overlay;
  };
  const dateRangeInWeekly = (startDate, endDate) => {
    const result = [];
    const start = parseDate(`${startDate}T00:00:00`);
    const end = parseDate(`${endDate}T00:00:00`);
    if (!start || !end || end.getTime() < start.getTime()) return result;
    let cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      result.push(toDateKey(cursor));
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (result.length > 200) break;
    }
    return result;
  };

  const openCreateChooser = (presetDate) => {
    if (!canCreateAnyEvent) return;
    if (canManageSchedules && !canManageSessions) {
      openScheduleModal({ mode: 'create', presetDate });
      return;
    }
    if (!canManageSchedules && canManageSessions) {
      openSessionModal({ mode: 'create', presetDate });
      return;
    }
    const overlay = openCalendarOverlay(`
      <div class="w-full max-w-md rounded-2xl border nu-border nu-surface shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b nu-border">
          <h3 class="text-lg font-semibold">일정 유형 선택</h3>
          <button type="button" id="nu-calendar-modal-close" class="rounded-lg border nu-border px-2 py-1 text-sm nu-surface">닫기</button>
        </div>
        <div class="p-4 space-y-2">
          <button id="nu-calendar-create-schedule" class="w-full rounded-lg px-3 py-2 text-sm nu-primary-bg">공통/코칭 일정 추가</button>
          <button id="nu-calendar-create-session" class="w-full rounded-lg border nu-border px-3 py-2 text-sm nu-surface">과제 일정 추가</button>
        </div>
      </div>
    `);
    overlay.querySelector('#nu-calendar-modal-close')?.addEventListener('click', closeCalendarModal);
    overlay.querySelector('#nu-calendar-create-schedule')?.addEventListener('click', () => {
      closeCalendarModal();
      openScheduleModal({ mode: 'create', presetDate });
    });
    overlay.querySelector('#nu-calendar-create-session')?.addEventListener('click', () => {
      closeCalendarModal();
      openSessionModal({ mode: 'create', presetDate });
    });
  };

  const openScheduleModal = ({ mode = 'create', presetDate = '', event = null } = {}) => {
    if (!canManageSchedules) return;
    const isEdit = mode === 'edit' && !!event;
    const hasSeries = isEdit && !!event.repeat_group_id;
    const startDate = toDateInputValueFromDateTime(event?.start) || presetDate || `${monthValue}-01`;
    const startTime = toTimeInputValue(event?.start) || '10:00';
    const endTime = toTimeInputValue(event?.end) || startTime || '11:00';
    const selectedColor = String(event?.color || (normalizeScope(event?.scope, event?.schedule_type) === 'coaching' ? '#00ACC1' : '#4CAF50')).toUpperCase();
    const selectedScope = normalizeScope(event?.scope || event?.visibility_scope, event?.schedule_type);
    const isAllDay = !!event?.is_all_day;
    const overlay = openCalendarOverlay(`
      <div class="w-full max-w-2xl rounded-2xl border nu-border nu-surface shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b nu-border">
          <h3 class="text-lg font-semibold">${isEdit ? '일정 편집' : '일정 추가'}</h3>
          <button type="button" id="nu-calendar-modal-close" class="rounded-lg border nu-border px-2 py-1 text-sm nu-surface">닫기</button>
        </div>
        <form id="nu-calendar-schedule-form" class="p-4 space-y-3">
          ${
            hasSeries
              ? `
                <div>
                  <label class="text-sm font-medium">적용 범위</label>
                  <select name="apply_scope" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                    <option value="single">이 일정만</option>
                    <option value="series">반복 일정 전체</option>
                  </select>
                </div>
              `
              : ''
          }
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-sm">공개 범위
              <select name="visibility_scope" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                <option value="global" ${selectedScope === 'global' ? 'selected' : ''}>공통 일정</option>
                <option value="coaching" ${selectedScope === 'coaching' ? 'selected' : ''}>코칭 일정</option>
              </select>
            </label>
            <label class="text-sm">제목
              <input name="title" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(event?.title || '')}" required />
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="text-sm">날짜
              <input type="date" name="event_date" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(startDate)}" required />
            </label>
            <label class="text-sm">시작 시간
              <input type="time" name="start_time" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(startTime)}" required />
            </label>
            <label class="text-sm">종료 시간
              <input type="time" name="end_time" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(endTime)}" required />
            </label>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_all_day" ${isAllDay ? 'checked' : ''} />
            종일 일정
          </label>
          <div class="space-y-2">
            <div class="text-sm font-medium">색상</div>
            <input type="hidden" name="color" value="${escapeHtml(selectedColor)}" />
            <div class="flex flex-wrap items-center gap-2" id="nu-calendar-color-palette">
              ${CALENDAR_COLORS.map((item) => `
                <button type="button" class="w-7 h-7 rounded-full border-2 ${item.value.toUpperCase() === selectedColor ? 'ring-2 ring-offset-2 ring-slate-500' : ''}" style="background:${item.value}" data-role="nu-calendar-color-btn" data-color="${item.value}" title="${item.label}"></button>
              `).join('')}
            </div>
          </div>
          ${
            !isEdit
              ? `
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="repeat_weekly" />
                  매주 반복
                </label>
                <div id="nu-calendar-repeat-wrap" class="hidden">
                  <label class="text-sm">반복 종료일
                    <input type="date" name="repeat_until" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" />
                  </label>
                </div>
              `
              : ''
          }
          <label class="text-sm block">장소
            <input name="location" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(event?.location || '')}" />
          </label>
          <label class="text-sm block">설명
            <textarea name="description" rows="4" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">${escapeHtml(event?.description || '')}</textarea>
          </label>
          <p id="nu-calendar-schedule-error" class="text-sm text-red-600"></p>
          <div class="flex flex-wrap items-center justify-end gap-2">
            ${isEdit ? '<button type="button" id="nu-calendar-schedule-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm mr-auto">삭제</button>' : ''}
            <button type="button" id="nu-calendar-schedule-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </form>
      </div>
    `);

    const form = overlay.querySelector('#nu-calendar-schedule-form');
    const errorEl = overlay.querySelector('#nu-calendar-schedule-error');
    const allDayEl = form?.querySelector('input[name="is_all_day"]');
    const startEl = form?.querySelector('input[name="start_time"]');
    const endEl = form?.querySelector('input[name="end_time"]');
    const repeatEl = form?.querySelector('input[name="repeat_weekly"]');
    const repeatWrapEl = form?.querySelector('#nu-calendar-repeat-wrap');
    const colorInput = form?.querySelector('input[name="color"]');
    const setError = (message) => {
      if (errorEl) errorEl.textContent = message || '';
    };
    const syncAllDay = () => {
      const checked = !!allDayEl?.checked;
      if (!startEl || !endEl) return;
      startEl.disabled = checked;
      endEl.disabled = checked;
      if (checked) {
        startEl.value = '00:00';
        endEl.value = '23:59';
      } else if (!startEl.value || !endEl.value) {
        startEl.value = startTime || '10:00';
        endEl.value = endTime || '11:00';
      }
    };
    const syncRepeat = () => {
      if (!repeatWrapEl || !repeatEl) return;
      repeatWrapEl.classList.toggle('hidden', !repeatEl.checked);
    };

    overlay.querySelector('#nu-calendar-modal-close')?.addEventListener('click', closeCalendarModal);
    overlay.querySelector('#nu-calendar-schedule-cancel')?.addEventListener('click', closeCalendarModal);
    allDayEl?.addEventListener('change', syncAllDay);
    repeatEl?.addEventListener('change', syncRepeat);
    syncAllDay();
    syncRepeat();

    overlay.querySelectorAll('[data-role="nu-calendar-color-btn"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = String(btn.getAttribute('data-color') || '').toUpperCase();
        if (!colorInput || !color) return;
        colorInput.value = color;
        overlay.querySelectorAll('[data-role="nu-calendar-color-btn"]').forEach((row) => {
          row.classList.remove('ring-2', 'ring-offset-2', 'ring-slate-500');
        });
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-slate-500');
      });
    });

    overlay.querySelector('#nu-calendar-schedule-delete')?.addEventListener('click', async () => {
      if (!event) return;
      const applyScope = hasSeries ? String(form?.querySelector('[name="apply_scope"]')?.value || 'single') : 'single';
      const endpoint = applyScope === 'series' && hasSeries ? `/api/schedules/${event.id}/series` : `/api/schedules/${event.id}`;
      if (!confirm(applyScope === 'series' ? '반복 일정 전체를 삭제하시겠습니까?' : '이 일정을 삭제하시겠습니까?')) return;
      try {
        await api(endpoint, { method: 'DELETE' });
        closeCalendarModal();
        await draw();
      } catch (error) {
        setError(error.message || '일정 삭제 실패');
      }
    });

    form?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim();
      const eventDate = String(fd.get('event_date') || '').trim();
      const isAllDayValue = fd.has('is_all_day');
      const startTimeValue = String(fd.get('start_time') || '').trim() || '00:00';
      const endTimeValue = String(fd.get('end_time') || '').trim() || startTimeValue;
      const scope = normalizeScope(fd.get('visibility_scope'), null);
      const color = String(fd.get('color') || '').trim().toUpperCase() || (scope === 'coaching' ? '#00ACC1' : '#4CAF50');
      const description = String(fd.get('description') || '').trim() || null;
      const location = String(fd.get('location') || '').trim() || null;
      if (!title || !eventDate) {
        setError('제목과 날짜를 입력하세요.');
        return;
      }
      if (!isAllDayValue && endTimeValue < startTimeValue) {
        setError('종료 시간은 시작 시간보다 빠를 수 없습니다.');
        return;
      }

      const payload = {
        title,
        description,
        schedule_type: scope === 'coaching' ? 'coaching' : 'other',
        visibility_scope: scope,
        start_datetime: toDateTimeString(eventDate, isAllDayValue ? '00:00' : startTimeValue),
        end_datetime: toDateTimeString(eventDate, isAllDayValue ? '23:59' : endTimeValue),
        location,
        is_all_day: isAllDayValue,
        color,
      };

      try {
        if (isEdit && event) {
          const applyScope = hasSeries ? String(fd.get('apply_scope') || 'single') : 'single';
          const endpoint = applyScope === 'series' && hasSeries ? `/api/schedules/${event.id}/series` : `/api/schedules/${event.id}`;
          await api(endpoint, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
          const repeatWeekly = fd.has('repeat_weekly');
          const repeatUntil = String(fd.get('repeat_until') || '').trim();
          if (repeatWeekly) {
            if (!repeatUntil) {
              setError('반복 종료일을 입력하세요.');
              return;
            }
            const dateKeys = dateRangeInWeekly(eventDate, repeatUntil);
            if (!dateKeys.length) {
              setError('반복 종료일을 다시 확인하세요.');
              return;
            }
            const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            for (let index = 0; index < dateKeys.length; index += 1) {
              const dateKey = dateKeys[index];
              await api('/api/schedules', {
                method: 'POST',
                body: JSON.stringify({
                  ...payload,
                  batch_id: Number(state.batchId),
                  start_datetime: toDateTimeString(dateKey, isAllDayValue ? '00:00' : startTimeValue),
                  end_datetime: toDateTimeString(dateKey, isAllDayValue ? '23:59' : endTimeValue),
                  repeat_group_id: groupId,
                  repeat_sequence: index + 1,
                }),
              });
            }
          } else {
            await api('/api/schedules', {
              method: 'POST',
              body: JSON.stringify({
                ...payload,
                batch_id: Number(state.batchId),
              }),
            });
          }
        }
        closeCalendarModal();
        await draw();
      } catch (error) {
        setError(error.message || '일정 저장 실패');
      }
    });
  };

  const openSessionModal = ({ mode = 'create', presetDate = '', event = null } = {}) => {
    if (!canManageSessions) return;
    const isEdit = mode === 'edit' && !!event;
    const startDt = parseDate(event?.start || null);
    const endDt = parseDate(event?.end || null);
    const startDate = toDateInputValueFromDateTime(event?.start) || presetDate || `${monthValue}-01`;
    const startTime = startDt ? `${pad2(startDt.getHours())}:${pad2(startDt.getMinutes())}` : '10:00';
    const endTime = endDt ? `${pad2(endDt.getHours())}:${pad2(endDt.getMinutes())}` : '11:00';
    const selectedProjectId = Number(event?.project_id || projectRows[0]?.project_id || 0);
    const overlay = openCalendarOverlay(`
      <div class="w-full max-w-xl rounded-2xl border nu-border nu-surface shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b nu-border">
          <h3 class="text-lg font-semibold">${isEdit ? '과제 일정 편집' : '과제 일정 추가'}</h3>
          <button type="button" id="nu-calendar-modal-close" class="rounded-lg border nu-border px-2 py-1 text-sm nu-surface">닫기</button>
        </div>
        <form id="nu-calendar-session-form" class="p-4 space-y-3">
          <label class="text-sm block">대상 과제
            <select name="project_id" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" ${isEdit ? 'disabled' : ''}>
              ${projectRows
                .map((row) => `<option value="${row.project_id}" ${Number(row.project_id) === Number(selectedProjectId) ? 'selected' : ''}>${escapeHtml(row.project_name || `과제 ${row.project_id}`)}</option>`)
                .join('')}
            </select>
          </label>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="text-sm">날짜
              <input type="date" name="session_date" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(startDate)}" required />
            </label>
            <label class="text-sm">시작 시간
              <input type="time" name="start_time" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(startTime)}" required />
            </label>
            <label class="text-sm">종료 시간
              <input type="time" name="end_time" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(endTime)}" required />
            </label>
          </div>
          ${
            isEdit
              ? `
                <label class="text-sm block">상태
                  <select name="session_status" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                    ${['scheduled', 'in_progress', 'completed', 'cancelled']
                      .map(
                        (status) =>
                          `<option value="${status}" ${String(event?.session_status || '').toLowerCase() === status ? 'selected' : ''}>${escapeHtml(status)}</option>`
                      )
                      .join('')}
                  </select>
                </label>
              `
              : ''
          }
          <label class="text-sm block">장소
            <input name="location" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(event?.location || '')}" />
          </label>
          <label class="text-sm block">메모
            <textarea name="note" rows="4" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">${escapeHtml(event?.description || '')}</textarea>
          </label>
          <p id="nu-calendar-session-error" class="text-sm text-red-600"></p>
          <div class="flex flex-wrap items-center justify-end gap-2">
            ${isEdit ? '<button type="button" id="nu-calendar-session-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm mr-auto">삭제</button>' : ''}
            <button type="button" id="nu-calendar-session-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </form>
      </div>
    `);

    const form = overlay.querySelector('#nu-calendar-session-form');
    const errorEl = overlay.querySelector('#nu-calendar-session-error');
    const setError = (message) => {
      if (errorEl) errorEl.textContent = message || '';
    };
    overlay.querySelector('#nu-calendar-modal-close')?.addEventListener('click', closeCalendarModal);
    overlay.querySelector('#nu-calendar-session-cancel')?.addEventListener('click', closeCalendarModal);
    overlay.querySelector('#nu-calendar-session-delete')?.addEventListener('click', async () => {
      if (!event || !confirm('과제 일정을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/sessions/${event.id}`, { method: 'DELETE' });
        closeCalendarModal();
        await draw();
      } catch (error) {
        setError(error.message || '과제 일정 삭제 실패');
      }
    });
    form?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(form);
      const date = String(fd.get('session_date') || '').trim();
      const startTimeValue = String(fd.get('start_time') || '').trim();
      const endTimeValue = String(fd.get('end_time') || '').trim();
      if (!date || !startTimeValue || !endTimeValue) {
        setError('날짜와 시간을 입력하세요.');
        return;
      }
      if (endTimeValue < startTimeValue) {
        setError('종료 시간은 시작 시간보다 빠를 수 없습니다.');
        return;
      }
      try {
        if (isEdit && event) {
          await api(`/api/sessions/${event.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              session_date: date,
              start_time: startTimeValue,
              end_time: endTimeValue,
              location: String(fd.get('location') || '').trim() || null,
              note: String(fd.get('note') || '').trim() || null,
              session_status: String(fd.get('session_status') || event.session_status || '').trim() || null,
            }),
          });
        } else {
          const projectId = Number.parseInt(String(fd.get('project_id') || ''), 10);
          if (Number.isNaN(projectId)) {
            setError('대상 과제를 선택하세요.');
            return;
          }
          await api('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({
              batch_id: Number(state.batchId),
              project_id: projectId,
              session_date: date,
              start_time: startTimeValue,
              end_time: endTimeValue,
              location: String(fd.get('location') || '').trim() || null,
              note: String(fd.get('note') || '').trim() || null,
            }),
          });
        }
        closeCalendarModal();
        await draw();
      } catch (error) {
        setError(error.message || '과제 일정 저장 실패');
      }
    });
  };

  const openEventDetail = (event) => {
    if (!event) return;
    const isSession = String(event.manage_type || '') === 'session';
    const startText = formatDateTime(event.start || event.start_time);
    const endText = event.end ? formatDateTime(event.end) : '';
    const timeText = event.is_all_day ? '종일 일정' : endText ? `${startText} ~ ${endText}` : startText;
    const coachPlans = Array.isArray(event.coach_plans) ? event.coach_plans : [];
    const coachActuals = Array.isArray(event.coach_actuals) ? event.coach_actuals : [];
    const coachNames = Array.isArray(event.coach_names) ? event.coach_names : [];
    const overlay = openCalendarOverlay(`
      <div class="w-full max-w-2xl rounded-2xl border nu-border nu-surface shadow-xl">
        <div class="flex items-center justify-between px-4 py-3 border-b nu-border">
          <h3 class="text-lg font-semibold">${escapeHtml(event.title || '-')}</h3>
          <button type="button" id="nu-calendar-modal-close" class="rounded-lg border nu-border px-2 py-1 text-sm nu-surface">닫기</button>
        </div>
        <div class="p-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded-full px-2 py-1 bg-slate-100 text-slate-700">${escapeHtml(typeLabel(event))}</span>
            <span class="rounded-full px-2 py-1 bg-blue-100 text-blue-700">${escapeHtml(scopeLabel(event))}</span>
            ${event.project_name ? `<span class="rounded-full px-2 py-1 bg-amber-100 text-amber-700">${escapeHtml(event.project_name)}</span>` : ''}
          </div>
          <div class="rounded-lg border nu-border p-3 text-sm space-y-1">
            <div><span class="nu-text-muted">일시:</span> ${escapeHtml(timeText)}</div>
            ${event.location ? `<div><span class="nu-text-muted">장소:</span> ${escapeHtml(event.location)}</div>` : ''}
            ${event.description ? `<div><span class="nu-text-muted">설명:</span> ${escapeHtml(event.description)}</div>` : ''}
            ${event.repeat_group_id ? `<div><span class="nu-text-muted">반복 그룹:</span> ${escapeHtml(event.repeat_group_id)}</div>` : ''}
          </div>
          ${
            coachPlans.length
              ? `
                <div>
                  <h4 class="font-semibold text-sm mb-1">코치 계획</h4>
                  <div class="rounded-lg border nu-border overflow-auto">
                    <table class="min-w-full text-xs">
                      <thead><tr class="border-b nu-border"><th class="px-2 py-1 text-left">코치</th><th class="px-2 py-1 text-left">계획 시간</th></tr></thead>
                      <tbody>
                        ${coachPlans
                          .map(
                            (row) => `
                              <tr class="border-b nu-border">
                                <td class="px-2 py-1">${escapeHtml(row.coach_name || '-')}</td>
                                <td class="px-2 py-1">${row.is_all_day ? '종일' : `${escapeHtml(row.start_time || '--:--')} ~ ${escapeHtml(row.end_time || '--:--')}`}</td>
                              </tr>
                            `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `
              : ''
          }
          ${
            coachActuals.length
              ? `
                <div>
                  <h4 class="font-semibold text-sm mb-1">코치 실적</h4>
                  <div class="rounded-lg border nu-border overflow-auto">
                    <table class="min-w-full text-xs">
                      <thead><tr class="border-b nu-border"><th class="px-2 py-1 text-left">코치</th><th class="px-2 py-1 text-left">실적</th><th class="px-2 py-1 text-left">출처</th></tr></thead>
                      <tbody>
                        ${coachActuals
                          .map(
                            (row) => `
                              <tr class="border-b nu-border">
                                <td class="px-2 py-1">${escapeHtml(row.coach_name || '-')}</td>
                                <td class="px-2 py-1">${Math.floor(Number(row.final_minutes || 0) / 60)}시간 ${Number(row.final_minutes || 0) % 60}분</td>
                                <td class="px-2 py-1">${escapeHtml(row.actual_source === 'override' ? '보정' : '자동')}</td>
                              </tr>
                            `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `
              : ''
          }
          ${
            isSession && coachNames.length
              ? `
                <div>
                  <h4 class="font-semibold text-sm mb-1">배정 코치</h4>
                  <div class="flex flex-wrap gap-1">${coachNames.map((name) => `<span class="rounded-full px-2 py-1 text-xs bg-indigo-100 text-indigo-700">${escapeHtml(name)}</span>`).join('')}</div>
                </div>
              `
              : ''
          }
          <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
            ${
              canEditEvent(event)
                ? `
                  <button type="button" id="nu-calendar-detail-edit" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">편집</button>
                `
                : ''
            }
            <button type="button" id="nu-calendar-detail-close" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">확인</button>
          </div>
        </div>
      </div>
    `);
    overlay.querySelector('#nu-calendar-modal-close')?.addEventListener('click', closeCalendarModal);
    overlay.querySelector('#nu-calendar-detail-close')?.addEventListener('click', closeCalendarModal);
    overlay.querySelector('#nu-calendar-detail-edit')?.addEventListener('click', () => {
      closeCalendarModal();
      if (String(event.manage_type || '') === 'session') openSessionModal({ mode: 'edit', event });
      else openScheduleModal({ mode: 'edit', event });
    });
  };

  const buildEventMap = () => {
    const grouped = new Map();
    events.forEach((event) => {
      const dt = resolveEventDate(event);
      if (!dt) return;
      const key = toDateKey(dt);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    });
    grouped.forEach((rows) => rows.sort((a, b) => resolveEventSortTime(a) - resolveEventSortTime(b)));
    return grouped;
  };

  const formatEventTime = (event) => {
    if (event?.is_all_day) return '종일';
    const start = parseDate(event?.start || event?.start_time);
    const end = parseDate(event?.end || null);
    if (!start) return '';
    const startText = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
    if (!end) return startText;
    return `${startText}-${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  };

  const drawList = () => {
    const listEl = document.getElementById('nu-calendar-list');
    if (!listEl) return;
    const sorted = [...events].sort((a, b) => resolveEventSortTime(a) - resolveEventSortTime(b));
    listEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b nu-border">
            <th class="py-2 pr-3">일시</th>
            <th class="py-2 pr-3">일정</th>
            <th class="py-2 pr-3">유형</th>
            <th class="py-2 pr-3">공개범위</th>
            <th class="py-2 pr-3">과제</th>
            <th class="py-2 pr-3">관리</th>
          </tr>
        </thead>
        <tbody>
          ${
            sorted.length
              ? sorted
                  .map(
                    (event) => `
                      <tr class="border-b nu-border">
                        <td class="py-2 pr-3">${escapeHtml(event.is_all_day ? `${formatDate(event.start || event.start_time)} (종일)` : `${formatDate(event.start || event.start_time)} ${formatEventTime(event)}`)}</td>
                        <td class="py-2 pr-3">
                          <div class="flex items-center gap-2">
                            <span class="inline-block w-2.5 h-2.5 rounded-full border" style="background:${escapeHtml(event.color || '#94a3b8')};border-color:${escapeHtml(event.color || '#94a3b8')};"></span>
                            <button class="underline underline-offset-2 text-left" data-role="nu-calendar-open-detail" data-event-id="${Number(event.id)}" data-manage-type="${escapeHtml(event.manage_type || '')}">${escapeHtml(event.title || '-')}</button>
                          </div>
                        </td>
                        <td class="py-2 pr-3">${escapeHtml(typeLabel(event))}</td>
                        <td class="py-2 pr-3">${escapeHtml(scopeLabel(event))}</td>
                        <td class="py-2 pr-3">${escapeHtml(event.project_name || '-')}</td>
                        <td class="py-2 pr-3">
                          <div class="flex flex-wrap items-center gap-1">
                            <button class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-calendar-open-detail" data-event-id="${Number(event.id)}" data-manage-type="${escapeHtml(event.manage_type || '')}">상세</button>
                            ${
                              canEditEvent(event)
                                ? `<button class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-calendar-edit-event" data-event-id="${Number(event.id)}" data-manage-type="${escapeHtml(event.manage_type || '')}">편집</button>`
                                : ''
                            }
                          </div>
                        </td>
                      </tr>
                    `
                  )
                  .join('')
              : '<tr><td colspan="6" class="py-3 nu-text-muted">선택한 월의 일정이 없습니다.</td></tr>'
          }
        </tbody>
      </table>
    `;
  };

  const drawCalendarGrid = (year, month) => {
    const gridEl = document.getElementById('nu-calendar-grid');
    if (!gridEl) return;
    const eventMap = buildEventMap();
    const firstDay = new Date(year, month - 1, 1);
    const firstWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const labels = ['일', '월', '화', '수', '목', '금', '토'];
    const cells = [];
    for (let idx = 0; idx < 42; idx += 1) {
      const dayNumber = idx - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        cells.push('<div class="min-h-[132px] border nu-border rounded-lg bg-slate-50/50"></div>');
        continue;
      }
      const currentDate = new Date(year, month - 1, dayNumber);
      const dateKey = toDateKey(currentDate);
      const dayEvents = eventMap.get(dateKey) || [];
      const visible = dayEvents.slice(0, 4);
      const remain = Math.max(0, dayEvents.length - visible.length);
      cells.push(`
        <div class="min-h-[132px] border nu-border rounded-lg p-2 nu-surface flex flex-col gap-1 ${canCreateAnyEvent ? 'cursor-pointer hover:ring-1 hover:ring-slate-300' : ''}" data-role="nu-calendar-day" data-date="${dateKey}">
          <div class="text-xs font-semibold ${idx % 7 === 0 ? 'text-rose-600' : idx % 7 === 6 ? 'text-blue-600' : 'nu-text-muted'}">${dayNumber}</div>
          <div class="flex flex-col gap-1">
            ${visible
              .map(
                (event) => `
                  <button type="button" class="text-left text-[11px] leading-4 px-1.5 py-1 rounded border bg-white/80" style="border-left:4px solid ${escapeHtml(
                    event.color || '#94a3b8'
                  )};" data-role="nu-calendar-open-detail" data-event-id="${Number(event.id)}" data-manage-type="${escapeHtml(event.manage_type || '')}" title="${escapeHtml(
                    event.title || '-'
                  )}">
                    ${event.is_all_day ? '<span class="font-semibold">종일</span> ' : formatEventTime(event) ? `<span class="font-semibold">${escapeHtml(formatEventTime(event))}</span> ` : ''}
                    <span>${escapeHtml(event.title || '-')}</span>
                  </button>
                `
              )
              .join('')}
            ${remain > 0 ? `<div class="text-[11px] nu-text-muted px-1">+${remain}개 더보기</div>` : ''}
          </div>
        </div>
      `);
    }
    gridEl.innerHTML = `
      <div class="grid grid-cols-7 gap-2 mb-2">
        ${labels
          .map(
            (label, index) => `
              <div class="text-xs font-semibold text-center ${index === 0 ? 'text-rose-600' : index === 6 ? 'text-blue-600' : 'nu-text-muted'}">${label}</div>
            `
          )
          .join('')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-7 gap-2">${cells.join('')}</div>
    `;
  };

  const renderViewMode = () => {
    const listEl = document.getElementById('nu-calendar-list');
    const gridEl = document.getElementById('nu-calendar-grid');
    const listBtn = document.getElementById('nu-calendar-mode-list');
    const calBtn = document.getElementById('nu-calendar-mode-calendar');
    const parsed = parseMonthValue(monthValue);
    if (!parsed) return;
    drawList();
    drawCalendarGrid(parsed.year, parsed.month);
    const isCalendar = viewMode === 'calendar';
    if (listEl) listEl.style.display = isCalendar ? 'none' : '';
    if (gridEl) gridEl.style.display = isCalendar ? '' : 'none';
    listBtn?.classList.toggle('nu-primary-bg', !isCalendar);
    listBtn?.classList.toggle('nu-surface', isCalendar);
    calBtn?.classList.toggle('nu-primary-bg', isCalendar);
    calBtn?.classList.toggle('nu-surface', !isCalendar);
  };

  async function draw() {
    const parsed = parseMonthValue(monthValue);
    if (!parsed) return;
    const start = `${parsed.year}-${pad2(parsed.month)}-01`;
    const endDate = new Date(parsed.year, parsed.month, 0);
    const end = `${parsed.year}-${pad2(parsed.month)}-${pad2(endDate.getDate())}`;
    const payload = await api(`/api/calendar?batch_id=${state.batchId}&start=${start}&end=${end}`).catch(() => ({ events: [] }));
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
    events = rows.sort((a, b) => resolveEventSortTime(a) - resolveEventSortTime(b));
    renderViewMode();
  }

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">캘린더</h1>
      <p class="nu-text-muted mt-1">공통/코칭 일정과 과제 일정을 통합 관리합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button id="nu-calendar-prev-month" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">이전</button>
        <input id="nu-calendar-month" type="month" class="rounded-lg border nu-border px-3 py-2 nu-surface" value="${monthValue}" />
        <button id="nu-calendar-next-month" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">다음</button>
        <button id="nu-calendar-current-month" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">현재월</button>
        <button id="nu-calendar-load" class="rounded-lg px-3 py-2 nu-primary-bg text-sm">조회</button>
        ${canCreateAnyEvent ? '<button id="nu-calendar-create" class="rounded-lg px-3 py-2 text-sm bg-emerald-600 text-white">일정 추가</button>' : ''}
        <button id="nu-calendar-mode-calendar" class="rounded-lg border nu-border px-3 py-2 text-sm sm:ml-auto">달력형</button>
        <button id="nu-calendar-mode-list" class="rounded-lg border nu-border px-3 py-2 text-sm">리스트형</button>
      </div>
      <div id="nu-calendar-list" class="overflow-auto"></div>
      <div id="nu-calendar-grid" class="overflow-auto"></div>
    </section>
  `;

  const monthEl = document.getElementById('nu-calendar-month');
  const syncMonthInput = () => {
    if (monthEl) monthEl.value = monthValue;
  };
  const moveMonth = (diff) => {
    monthValue = shiftMonthValue(monthEl?.value || monthValue, diff);
    syncMonthInput();
    draw();
  };
  const moveCurrentMonth = () => {
    monthValue = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    syncMonthInput();
    draw();
  };
  const defaultCreateDate = () => {
    const parsed = parseMonthValue(monthEl?.value || monthValue);
    if (!parsed) return toDateKey(now);
    if (parsed.year === now.getFullYear() && parsed.month === now.getMonth() + 1) return toDateKey(now);
    return `${parsed.year}-${pad2(parsed.month)}-01`;
  };

  document.getElementById('nu-calendar-load')?.addEventListener('click', () => {
    monthValue = parseMonthValue(monthEl?.value || '') ? monthEl.value : monthValue;
    syncMonthInput();
    draw();
  });
  document.getElementById('nu-calendar-create')?.addEventListener('click', () => {
    openCreateChooser(defaultCreateDate());
  });
  document.getElementById('nu-calendar-prev-month')?.addEventListener('click', () => moveMonth(-1));
  document.getElementById('nu-calendar-next-month')?.addEventListener('click', () => moveMonth(1));
  document.getElementById('nu-calendar-current-month')?.addEventListener('click', moveCurrentMonth);
  document.getElementById('nu-calendar-mode-list')?.addEventListener('click', () => {
    viewMode = 'list';
    localStorage.setItem(CALENDAR_VIEW_KEY, viewMode);
    renderViewMode();
  });
  document.getElementById('nu-calendar-mode-calendar')?.addEventListener('click', () => {
    viewMode = 'calendar';
    localStorage.setItem(CALENDAR_VIEW_KEY, viewMode);
    renderViewMode();
  });

  const handleDetailOpen = (target) => {
    const eventId = target.getAttribute('data-event-id');
    const manageType = target.getAttribute('data-manage-type');
    const event = eventByKey(eventId, manageType);
    if (!event) return;
    openEventDetail(event);
  };
  const handleEventEdit = (target) => {
    const eventId = target.getAttribute('data-event-id');
    const manageType = target.getAttribute('data-manage-type');
    const event = eventByKey(eventId, manageType);
    if (!event || !canEditEvent(event)) return;
    if (String(event.manage_type || '') === 'session') openSessionModal({ mode: 'edit', event });
    else openScheduleModal({ mode: 'edit', event });
  };

  document.getElementById('nu-calendar-list')?.addEventListener('click', (evt) => {
    const target = evt.target instanceof Element ? evt.target : null;
    if (!target) return;
    const openBtn = target.closest('[data-role="nu-calendar-open-detail"]');
    if (openBtn) {
      handleDetailOpen(openBtn);
      return;
    }
    const editBtn = target.closest('[data-role="nu-calendar-edit-event"]');
    if (editBtn) handleEventEdit(editBtn);
  });
  document.getElementById('nu-calendar-grid')?.addEventListener('click', (evt) => {
    const target = evt.target instanceof Element ? evt.target : null;
    if (!target) return;
    const openBtn = target.closest('[data-role="nu-calendar-open-detail"]');
    if (openBtn) {
      handleDetailOpen(openBtn);
      return;
    }
    const dayCell = target.closest('[data-role="nu-calendar-day"]');
    if (!dayCell || !canCreateAnyEvent) return;
    const dateKey = String(dayCell.getAttribute('data-date') || '').trim();
    if (!dateKey) return;
    openCreateChooser(dateKey);
  });

  syncMonthInput();
  draw();
}

async function renderBoard(view) {
  const role = normalizeRole(state.user?.role || '');
  const canWrite = canWriteBoard(role);
  const boards = await api('/api/boards').catch(() => []);
  const boardRows = Array.isArray(boards) ? boards : [];
  const writableBoards = role === 'admin' ? boardRows : boardRows.filter((row) => String(row.board_type || '').toLowerCase() !== 'notice');
  let boardId = state.boardPage.boardId && boardRows.some((row) => Number(row.board_id) === Number(state.boardPage.boardId))
    ? Number(state.boardPage.boardId)
    : Number(boardRows[0]?.board_id || 0);
  let posts = [];
  let currentKeyword = '';

  const fetchPosts = async () => {
    if (!boardId) {
      posts = [];
      return;
    }
    state.boardPage.boardId = boardId;
    const payload = await api(`/api/boards/${boardId}/posts?skip=${state.boardPage.skip}&limit=${state.boardPage.limit}`).catch(() => []);
    posts = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  };

  const bindMentionPicker = ({ inputEl, listEl, pickedEl }) => {
    const mentionState = { picked: [], found: [] };
    let timer = null;
    const renderPicked = () => {
      pickedEl.innerHTML = mentionState.picked.length
        ? mentionState.picked
            .map(
              (row, index) => `
                <button type="button" class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-200" data-role="nu-mention-picked-remove" data-index="${index}">
                  @${escapeHtml(row.emp_id)} (${escapeHtml(row.name)}) <span>×</span>
                </button>
              `
            )
            .join('')
        : '';
      pickedEl.querySelectorAll('[data-role="nu-mention-picked-remove"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number.parseInt(btn.getAttribute('data-index') || '', 10);
          if (Number.isNaN(index)) return;
          mentionState.picked.splice(index, 1);
          renderPicked();
        });
      });
    };
    const renderFound = () => {
      listEl.innerHTML = mentionState.found.length
        ? mentionState.found
            .map(
              (row, index) => `
                <button type="button" class="w-full text-left rounded-lg border nu-border px-2 py-1.5 hover:nu-soft" data-role="nu-mention-candidate" data-index="${index}">
                  <div class="font-medium">${escapeHtml(row.name)} <span class="text-xs nu-text-muted">@${escapeHtml(row.emp_id)}</span></div>
                  <div class="text-xs nu-text-muted">${escapeHtml(row.department || '-')} · ${escapeHtml(roleLabel(row.role || '-'))}</div>
                </button>
              `
            )
            .join('')
        : '';
      listEl.querySelectorAll('[data-role="nu-mention-candidate"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number.parseInt(btn.getAttribute('data-index') || '', 10);
          const selected = mentionState.found[index];
          if (!selected) return;
          if (!mentionState.picked.some((row) => Number(row.user_id) === Number(selected.user_id))) {
            mentionState.picked.push(selected);
            renderPicked();
          }
          inputEl.value = '';
          mentionState.found = [];
          renderFound();
          inputEl.focus();
        });
      });
    };
    const fetchCandidates = async () => {
      const keyword = String(inputEl.value || '').trim().replace(/^@+/, '');
      if (keyword.length < 1) {
        mentionState.found = [];
        renderFound();
        return;
      }
      try {
        const candidates = await api(`/api/boards/mention-candidates?q=${encodeURIComponent(keyword)}&limit=8`);
        mentionState.found = Array.isArray(candidates) ? candidates : [];
      } catch {
        mentionState.found = [];
      }
      renderFound();
    };
    inputEl.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchCandidates, 180);
    });
    return mentionState;
  };

  const openCommentEditor = ({ post, comment = null, onSaved }) => {
    if (!canWrite) return;
    const isEdit = !!comment;
    const modal = openNuModal({
      title: isEdit ? '댓글 수정' : '댓글 작성',
      maxWidth: 'max-w-3xl',
      bodyHtml: `
        <form id="nu-board-comment-form" class="space-y-3">
          <div>
            <div class="text-sm nu-text-muted mb-1">내용</div>
            <div id="nu-board-comment-editor"></div>
          </div>
          <div class="rounded-lg border nu-border p-2 space-y-2">
            <div class="text-sm font-medium">멘션 추가</div>
            <input id="nu-board-comment-mention-input" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="@이름 또는 @사번 검색" />
            <div id="nu-board-comment-mention-list" class="space-y-1"></div>
            <div id="nu-board-comment-mention-picked" class="flex flex-wrap gap-1"></div>
          </div>
          <p id="nu-board-comment-error" class="text-sm text-red-600"></p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" id="nu-board-comment-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </form>
      `,
    });
    const editor = createRichField('nu-board-comment-editor', {
      initialHTML: comment?.content || '',
      placeholder: '댓글을 입력하세요.',
      uploadOptions: { scope: 'board_comment', boardId: Number(post.board_id) || Number(boardId) || null },
    });
    const mentionState = bindMentionPicker({
      inputEl: modal.bodyEl.querySelector('#nu-board-comment-mention-input'),
      listEl: modal.bodyEl.querySelector('#nu-board-comment-mention-list'),
      pickedEl: modal.bodyEl.querySelector('#nu-board-comment-mention-picked'),
    });
    modal.bodyEl.querySelector('#nu-board-comment-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl.querySelector('#nu-board-comment-form')?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const errorEl = modal.bodyEl.querySelector('#nu-board-comment-error');
      const contentRaw = editor.getHTML();
      if (editor.isEmpty()) {
        if (errorEl) errorEl.textContent = '댓글 내용을 입력하세요.';
        return;
      }
      const content = p1MergeMentionsIntoContent(contentRaw, mentionState.picked);
      try {
        if (isEdit) {
          await api(`/api/boards/comments/${comment.comment_id}`, { method: 'PUT', body: JSON.stringify({ content }) });
        } else {
          await api(`/api/boards/posts/${post.post_id}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
        }
        modal.close();
        if (typeof onSaved === 'function') await onSaved();
      } catch (error) {
        if (errorEl) errorEl.textContent = error.message || `댓글 ${isEdit ? '저장' : '등록'} 실패`;
      }
    });
  };

  const openPostEditor = ({ post = null, onSaved }) => {
    if (!canWrite) return;
    const isEdit = !!post;
    const selectableBoards = writableBoards.length ? writableBoards : boardRows;
    const defaultBoardId = isEdit ? Number(post.board_id) : Number(boardId || selectableBoards[0]?.board_id || 0);
    const modal = openNuModal({
      title: isEdit ? '게시글 수정' : '게시글 작성',
      maxWidth: 'max-w-4xl',
      bodyHtml: `
        <form id="nu-board-post-form" class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-sm block">게시판
              <select name="board_id" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                ${selectableBoards
                  .map((row) => `<option value="${row.board_id}" ${Number(row.board_id) === Number(defaultBoardId) ? 'selected' : ''}>${escapeHtml(row.board_name || row.name || '-')}</option>`)
                  .join('')}
              </select>
            </label>
            <label class="text-sm block">제목
              <input name="title" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(post?.title || '')}" required />
            </label>
          </div>
          <div>
            <div class="text-sm nu-text-muted mb-1">내용</div>
            <div id="nu-board-post-editor"></div>
          </div>
          <div class="rounded-lg border nu-border p-2 space-y-2">
            <div class="text-sm font-medium">멘션 추가</div>
            <input id="nu-board-post-mention-input" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="@이름 또는 @사번 검색" />
            <div id="nu-board-post-mention-list" class="space-y-1"></div>
            <div id="nu-board-post-mention-picked" class="flex flex-wrap gap-1"></div>
          </div>
          <p id="nu-board-post-error" class="text-sm text-red-600"></p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" id="nu-board-post-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </form>
      `,
    });
    const editor = createRichField('nu-board-post-editor', {
      initialHTML: post?.content || '',
      placeholder: '게시글 내용을 입력하세요.',
      uploadOptions: { scope: 'board_post', boardId: defaultBoardId || boardId },
    });
    const mentionState = bindMentionPicker({
      inputEl: modal.bodyEl.querySelector('#nu-board-post-mention-input'),
      listEl: modal.bodyEl.querySelector('#nu-board-post-mention-list'),
      pickedEl: modal.bodyEl.querySelector('#nu-board-post-mention-picked'),
    });
    modal.bodyEl.querySelector('#nu-board-post-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl.querySelector('#nu-board-post-form')?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const errorEl = modal.bodyEl.querySelector('#nu-board-post-error');
      const fd = new FormData(modal.bodyEl.querySelector('#nu-board-post-form'));
      const title = String(fd.get('title') || '').trim();
      const selectedBoardId = Number.parseInt(String(fd.get('board_id') || ''), 10);
      if (!title || Number.isNaN(selectedBoardId)) {
        if (errorEl) errorEl.textContent = '게시판과 제목을 입력하세요.';
        return;
      }
      if (editor.isEmpty()) {
        if (errorEl) errorEl.textContent = '내용을 입력하세요.';
        return;
      }
      const content = p1MergeMentionsIntoContent(editor.getHTML(), mentionState.picked);
      try {
        if (isEdit) {
          await api(`/api/boards/posts/${post.post_id}`, { method: 'PUT', body: JSON.stringify({ board_id: selectedBoardId, title, content }) });
        } else {
          await api(`/api/boards/${selectedBoardId}/posts`, { method: 'POST', body: JSON.stringify({ title, content }) });
        }
        modal.close();
        if (typeof onSaved === 'function') await onSaved();
      } catch (error) {
        if (errorEl) errorEl.textContent = error.message || `게시글 ${isEdit ? '저장' : '등록'} 실패`;
      }
    });
  };

  const reload = async () => {
    await fetchPosts();
    renderPosts();
  };

  const renderPostDetail = async (postId) => {
    const detailEl = document.getElementById('nu-board-detail');
    if (!detailEl) return;
    try {
      const [post, comments] = await Promise.all([
        api(`/api/boards/posts/${postId}`),
        api(`/api/boards/posts/${postId}/comments`).catch(() => []),
      ]);
      const commentRows = Array.isArray(comments) ? comments : [];
      const canManagePost = canWrite && (role === 'admin' || Number(post.author_id) === Number(state.user?.user_id));
      detailEl.innerHTML = `
        <article class="rounded-xl border nu-border p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="text-xs mb-1"><span class="rounded-full px-2 py-1 bg-slate-100 text-slate-700">${escapeHtml(post.board_type || post.board_name || '-')}</span></div>
              <h3 class="text-lg font-semibold">${escapeHtml(post.title || '-')}</h3>
              <p class="text-xs nu-text-muted mt-1">${escapeHtml(post.author_name || '-')} · ${formatDateTime(post.created_at)} · 조회 ${Number(post.view_count || 0)}</p>
            </div>
            ${
              canManagePost
                ? `<div class="flex items-center gap-2">
                     <button id="nu-board-detail-edit" class="rounded-lg border nu-border px-3 py-1.5 text-xs nu-surface">수정</button>
                     <button id="nu-board-detail-delete" class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-1.5 text-xs">삭제</button>
                   </div>`
                : ''
            }
          </div>
          <div class="mt-3 rich-content">${renderRichContent(post.content, '-')}</div>
          <div class="mt-4 border-t nu-border pt-4">
            <div class="flex items-center justify-between gap-2 mb-2">
              <h4 class="font-semibold text-sm">댓글 (${commentRows.length})</h4>
              ${canWrite ? '<button id="nu-board-comment-create" class="rounded-lg px-3 py-1.5 text-xs nu-primary-bg">댓글 작성</button>' : ''}
            </div>
            <div class="space-y-2">
              ${
                commentRows.length
                  ? commentRows
                      .map((comment) => {
                        const canManageComment = canWrite && (role === 'admin' || Number(comment.author_id) === Number(state.user?.user_id));
                        return `
                          <div class="rounded-lg border nu-border p-2 text-sm">
                            <div class="rich-content">${renderRichContent(comment.content, '-')}</div>
                            <div class="mt-1 text-xs nu-text-muted flex items-center justify-between gap-2">
                              <span>${formatDateTime(comment.created_at)} · ${escapeHtml(comment.author_name || '-')}</span>
                              ${
                                canManageComment
                                  ? `<span class="flex items-center gap-1">
                                       <button class="rounded border nu-border px-2 py-0.5 text-[11px] nu-surface" data-role="nu-board-comment-edit" data-comment-id="${comment.comment_id}">수정</button>
                                       <button class="rounded border border-red-200 px-2 py-0.5 text-[11px] bg-red-50 text-red-600" data-role="nu-board-comment-delete" data-comment-id="${comment.comment_id}">삭제</button>
                                     </span>`
                                  : ''
                              }
                            </div>
                          </div>
                        `;
                      })
                      .join('')
                  : '<p class="text-sm nu-text-muted">댓글이 없습니다.</p>'
              }
            </div>
          </div>
        </article>
      `;
      document.getElementById('nu-board-detail-edit')?.addEventListener('click', () => {
        openPostEditor({ post, onSaved: async () => { await reload(); await renderPostDetail(post.post_id); } });
      });
      document.getElementById('nu-board-detail-delete')?.addEventListener('click', async () => {
        if (!confirm('게시글을 삭제하시겠습니까?')) return;
        try {
          await api(`/api/boards/posts/${post.post_id}`, { method: 'DELETE' });
          detailEl.innerHTML = '';
          await reload();
        } catch (error) {
          alert(error.message || '게시글 삭제 실패');
        }
      });
      document.getElementById('nu-board-comment-create')?.addEventListener('click', () => {
        openCommentEditor({ post, onSaved: async () => { await reload(); await renderPostDetail(post.post_id); } });
      });
      detailEl.querySelectorAll('[data-role="nu-board-comment-edit"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const commentId = Number.parseInt(btn.getAttribute('data-comment-id') || '', 10);
          const comment = commentRows.find((row) => Number(row.comment_id) === commentId);
          if (!comment) return;
          openCommentEditor({ post, comment, onSaved: async () => { await reload(); await renderPostDetail(post.post_id); } });
        });
      });
      detailEl.querySelectorAll('[data-role="nu-board-comment-delete"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const commentId = Number.parseInt(btn.getAttribute('data-comment-id') || '', 10);
          if (Number.isNaN(commentId) || !confirm('댓글을 삭제하시겠습니까?')) return;
          try {
            await api(`/api/boards/comments/${commentId}`, { method: 'DELETE' });
            await reload();
            await renderPostDetail(post.post_id);
          } catch (error) {
            alert(error.message || '댓글 삭제 실패');
          }
        });
      });
    } catch (error) {
      detailEl.innerHTML = `<p class="text-sm text-red-600">${escapeHtml(error.message || '게시글 조회 실패')}</p>`;
    }
  };

  const renderPosts = () => {
    const postEl = document.getElementById('nu-board-posts');
    if (!postEl) return;
    const keyword = currentKeyword.toLowerCase().trim();
    const rows = keyword ? posts.filter((row) => `${row.title || ''} ${row.content || ''}`.toLowerCase().includes(keyword)) : posts;
    postEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b nu-border">
            <th class="py-2 pr-3">분류</th>
            <th class="py-2 pr-3">제목</th>
            <th class="py-2 pr-3">작성자</th>
            <th class="py-2 pr-3">작성일</th>
            <th class="py-2 pr-3">조회</th>
            <th class="py-2 pr-3">댓글</th>
            <th class="py-2 pr-3">관리</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map((row) => {
                    const canManagePost = canWrite && (role === 'admin' || Number(row.author_id) === Number(state.user?.user_id));
                    return `
                      <tr class="border-b nu-border">
                        <td class="py-2 pr-3">${escapeHtml(row.board_name || row.board_type || '-')}</td>
                        <td class="py-2 pr-3"><button class="underline underline-offset-2 text-left" data-role="nu-board-open" data-post-id="${row.post_id}">${escapeHtml(row.title || '-')}</button></td>
                        <td class="py-2 pr-3">${escapeHtml(row.author_name || '-')}</td>
                        <td class="py-2 pr-3">${formatDateTime(row.created_at)}</td>
                        <td class="py-2 pr-3">${Number(row.view_count || 0)}</td>
                        <td class="py-2 pr-3">${Number(row.comment_count || 0)}</td>
                        <td class="py-2 pr-3">
                          <div class="flex flex-wrap items-center gap-1">
                            <button class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-board-open" data-post-id="${row.post_id}">보기</button>
                            ${
                              canManagePost
                                ? `<button class="rounded-lg border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-board-edit" data-post-id="${row.post_id}">수정</button>
                                   <button class="rounded-lg border border-red-200 bg-red-50 text-red-600 px-2 py-1 text-xs" data-role="nu-board-delete" data-post-id="${row.post_id}">삭제</button>`
                                : ''
                            }
                          </div>
                        </td>
                      </tr>
                    `;
                  })
                  .join('')
              : '<tr><td colspan="7" class="py-3 nu-text-muted">게시글이 없습니다.</td></tr>'
          }
        </tbody>
      </table>
    `;
    postEl.querySelectorAll('[data-role="nu-board-open"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const postId = Number.parseInt(btn.getAttribute('data-post-id') || '', 10);
        if (!Number.isNaN(postId)) renderPostDetail(postId);
      });
    });
    postEl.querySelectorAll('[data-role="nu-board-edit"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number.parseInt(btn.getAttribute('data-post-id') || '', 10);
        if (Number.isNaN(postId)) return;
        try {
          const post = await api(`/api/boards/posts/${postId}`);
          openPostEditor({ post, onSaved: async () => { await reload(); await renderPostDetail(postId); } });
        } catch (error) {
          alert(error.message || '게시글 불러오기 실패');
        }
      });
    });
    postEl.querySelectorAll('[data-role="nu-board-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const postId = Number.parseInt(btn.getAttribute('data-post-id') || '', 10);
        if (Number.isNaN(postId) || !confirm('게시글을 삭제하시겠습니까?')) return;
        try {
          await api(`/api/boards/posts/${postId}`, { method: 'DELETE' });
          await reload();
          document.getElementById('nu-board-detail').innerHTML = '';
        } catch (error) {
          alert(error.message || '게시글 삭제 실패');
        }
      });
    });
  };

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">게시판</h1>
      <p class="nu-text-muted mt-1">게시글/댓글 작성과 멘션(@이름, @사번) 기능을 New UI에서 제공합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <select id="nu-board-select" class="rounded-lg border nu-border px-3 py-2 nu-surface">
          ${
            boardRows.length
              ? boardRows.map((row) => `<option value="${row.board_id}" ${Number(row.board_id) === Number(boardId) ? 'selected' : ''}>${escapeHtml(row.board_name || row.name || `게시판 ${row.board_id}`)}</option>`).join('')
              : '<option value="">게시판 없음</option>'
          }
        </select>
        <input id="nu-board-search" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="제목/내용 검색" />
        <button id="nu-board-search-btn" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">검색</button>
        ${canWrite ? '<button id="nu-board-new-btn" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">새 글쓰기</button>' : ''}
        <button id="nu-board-prev" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">이전</button>
        <button id="nu-board-next" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">다음</button>
      </div>
      <div id="nu-board-posts" class="overflow-auto"></div>
      <div id="nu-board-detail" class="mt-4"></div>
    </section>
  `;

  document.getElementById('nu-board-select')?.addEventListener('change', async (evt) => {
    boardId = Number(evt.target.value) || 0;
    state.boardPage.skip = 0;
    currentKeyword = '';
    document.getElementById('nu-board-detail').innerHTML = '';
    await reload();
  });
  document.getElementById('nu-board-prev')?.addEventListener('click', async () => {
    state.boardPage.skip = Math.max(0, state.boardPage.skip - state.boardPage.limit);
    document.getElementById('nu-board-detail').innerHTML = '';
    await reload();
  });
  document.getElementById('nu-board-next')?.addEventListener('click', async () => {
    state.boardPage.skip += state.boardPage.limit;
    document.getElementById('nu-board-detail').innerHTML = '';
    await reload();
  });
  document.getElementById('nu-board-search-btn')?.addEventListener('click', () => {
    currentKeyword = String(document.getElementById('nu-board-search')?.value || '').trim();
    renderPosts();
  });
  document.getElementById('nu-board-search')?.addEventListener('keydown', (evt) => {
    if (evt.key !== 'Enter') return;
    evt.preventDefault();
    currentKeyword = String(document.getElementById('nu-board-search')?.value || '').trim();
    renderPosts();
  });
  document.getElementById('nu-board-new-btn')?.addEventListener('click', () => {
    if (!writableBoards.length) {
      alert('작성 가능한 게시판이 없습니다.');
      return;
    }
    openPostEditor({ onSaved: async () => { await reload(); } });
  });

  await reload();
}

async function renderProjectDetail(view, projectId) {
  const role = normalizeRole(state.user?.role || '');
  const [project, members, notes] = await Promise.all([
    api(`/api/projects/${projectId}`),
    api(`/api/projects/${projectId}/members`).catch(() => []),
    api(`/api/projects/${projectId}/notes`).catch(() => []),
  ]);
  const memberRows = Array.isArray(members) ? members : [];
  const noteRows = (Array.isArray(notes) ? notes : []).sort((a, b) => {
    const aDate = parseDate(a.coaching_date || a.created_at)?.getTime() || 0;
    const bDate = parseDate(b.coaching_date || b.created_at)?.getTime() || 0;
    return bDate - aDate;
  });
  const latestNote = noteRows[0] || null;
  const canEditProject = canEditProjectBasicInfo(role, project);
  const canEditNotes = canWriteCoachingNote(role);
  const canComment = role !== 'observer';
  const canManageMembers = role === 'admin' || (role === 'participant' && !!project?.is_my_project);

  if (!renderProjectDetail._uiState) renderProjectDetail._uiState = {};
  const saved = renderProjectDetail._uiState[projectId] || { memberOpen: false, expandAllNotes: false, expandedNoteIds: [] };
  if (!saved.initialized || saved.forceLatestOpen) {
    saved.expandedNoteIds = latestNote ? [Number(latestNote.note_id)] : [];
    saved.expandAllNotes = false;
    saved.forceLatestOpen = false;
    saved.initialized = true;
  }
  renderProjectDetail._uiState[projectId] = saved;
  const expandedSet = new Set((saved.expandedNoteIds || []).map((value) => Number(value)));

  const noteCommentsEntries = await Promise.all(
    noteRows.map(async (note) => {
      const rows = await api(`/api/notes/${note.note_id}/comments`).catch(() => []);
      return [Number(note.note_id), Array.isArray(rows) ? rows : []];
    })
  );
  const commentsByNote = new Map(noteCommentsEntries);
  const latestComments = latestNote ? commentsByNote.get(Number(latestNote.note_id)) || [] : [];
  const latestFeedbacks = latestComments.filter((comment) => String(comment.comment_type || '').toLowerCase() === 'coaching_feedback' && p1HasText(comment.content));
  const latestMemos = latestComments.filter((comment) => String(comment.comment_type || '').toLowerCase() === 'participant_memo' && p1HasText(comment.content));

  const openFieldEditor = (field) => {
    const current = {
      progress_rate: String(Number(project.progress_rate || 0)),
      ai_tech_category: String(project.ai_tech_category || project.category || ''),
      ai_tech_used: String(project.ai_tech_used || ''),
      project_summary: String(project.project_summary || ''),
      github_repos: (Array.isArray(project.github_repos) ? project.github_repos : []).join('\n'),
    };
    const labels = {
      progress_rate: '진행률',
      ai_tech_category: 'AI기술 분류',
      ai_tech_used: '사용된 AI기술',
      project_summary: '과제 요약',
      github_repos: 'Github Repository',
    };
    const isNumber = field === 'progress_rate';
    const isTextarea = field === 'github_repos';
    const modal = openNuModal({
      title: `${labels[field] || field} 편집`,
      maxWidth: field === 'project_summary' || isTextarea ? 'max-w-3xl' : 'max-w-xl',
      bodyHtml: `
        <form id="nu-project-field-form" class="space-y-3">
          <label class="text-sm block">
            ${labels[field] || field}
            ${
              field === 'project_summary'
                ? '<div id="nu-project-summary-editor" class="mt-1"></div>'
                : isTextarea
                ? `<textarea name="value" rows="8" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">${escapeHtml(current[field] || '')}</textarea>`
                : `<input name="value" ${isNumber ? 'type="number" min="0" max="100"' : ''} class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${escapeHtml(current[field] || '')}" />`
            }
          </label>
          <p id="nu-project-field-error" class="text-sm text-red-600"></p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" id="nu-project-field-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">저장</button>
          </div>
        </form>
      `,
    });
    const summaryEditor =
      field === 'project_summary'
        ? createRichField('nu-project-summary-editor', {
            initialHTML: current.project_summary || '',
            placeholder: '과제 요약을 입력하세요.',
            uploadOptions: { scope: 'project_summary', projectId },
          })
        : null;
    modal.bodyEl.querySelector('#nu-project-field-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl.querySelector('#nu-project-field-form')?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(modal.bodyEl.querySelector('#nu-project-field-form'));
      const value = String(fd.get('value') || '').trim();
      const payload = {};
      if (field === 'project_summary') payload.project_summary = summaryEditor?.getHTML() || null;
      else if (field === 'github_repos') payload.github_repos = value.split('\n').map((row) => row.trim()).filter(Boolean);
      else if (field === 'progress_rate') payload.progress_rate = Number.isNaN(Number.parseInt(value, 10)) ? null : Math.max(0, Math.min(100, Number.parseInt(value, 10)));
      else payload[field] = value || null;
      const errorEl = modal.bodyEl.querySelector('#nu-project-field-error');
      try {
        await api(`/api/projects/${projectId}`, { method: 'PUT', body: JSON.stringify(payload) });
        modal.close();
        await renderProjectDetail(view, projectId);
      } catch (error) {
        if (errorEl) errorEl.textContent = error.message || '저장 실패';
      }
    });
  };

  const openAddMemberModal = () => {
    const modal = openNuModal({
      title: '팀원 추가',
      maxWidth: 'max-w-3xl',
      bodyHtml: `
        <form id="nu-member-add-form" class="space-y-3">
          <div class="rounded-lg border nu-border p-3 space-y-2">
            <div class="text-sm font-medium">사용자 검색</div>
            <input id="nu-member-search" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="이름 또는 사번 검색" />
            <div id="nu-member-candidates" class="max-h-44 overflow-auto space-y-1"></div>
            <div id="nu-member-picked" class="flex flex-wrap gap-1"></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label class="text-sm block">역할
              <select name="member_role" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface">
                <option value="member">member</option>
                <option value="leader">leader</option>
              </select>
            </label>
            <label class="text-sm flex items-center gap-2 pt-7">
              <input type="checkbox" name="is_representative" />
              대표자 지정(첫 사용자 적용)
            </label>
          </div>
          <p id="nu-member-add-error" class="text-sm text-red-600"></p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" id="nu-member-add-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">추가</button>
          </div>
        </form>
      `,
    });
    const searchEl = modal.bodyEl.querySelector('#nu-member-search');
    const candidateEl = modal.bodyEl.querySelector('#nu-member-candidates');
    const pickedEl = modal.bodyEl.querySelector('#nu-member-picked');
    const errorEl = modal.bodyEl.querySelector('#nu-member-add-error');
    const localState = { found: [], picked: [] };
    let timer = null;
    const existingUserIds = new Set(memberRows.map((row) => Number(row.user_id)));

    const renderPicked = () => {
      pickedEl.innerHTML = localState.picked.length
        ? localState.picked.map((row, index) => `<button type="button" class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-200" data-role="nu-member-picked-remove" data-index="${index}">${escapeHtml(row.name)} (@${escapeHtml(row.emp_id)}) <span>×</span></button>`).join('')
        : '<p class="text-xs nu-text-muted">선택된 팀원이 없습니다.</p>';
      pickedEl.querySelectorAll('[data-role="nu-member-picked-remove"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number.parseInt(btn.getAttribute('data-index') || '', 10);
          if (Number.isNaN(index)) return;
          localState.picked.splice(index, 1);
          renderPicked();
        });
      });
    };
    const renderCandidates = () => {
      candidateEl.innerHTML = localState.found.length
        ? localState.found.map((row, index) => `<button type="button" class="w-full text-left rounded-lg border nu-border px-2 py-1.5 hover:nu-soft" data-role="nu-member-candidate" data-index="${index}"><div class="font-medium">${escapeHtml(row.name)} <span class="text-xs nu-text-muted">@${escapeHtml(row.emp_id)}</span></div><div class="text-xs nu-text-muted">${escapeHtml(row.department || '-')} · ${escapeHtml(roleLabel(row.role || '-'))}</div></button>`).join('')
        : '<p class="text-xs nu-text-muted">검색 결과가 없습니다.</p>';
      candidateEl.querySelectorAll('[data-role="nu-member-candidate"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number.parseInt(btn.getAttribute('data-index') || '', 10);
          const selected = localState.found[index];
          if (!selected) return;
          if (!localState.picked.some((row) => Number(row.user_id) === Number(selected.user_id))) {
            localState.picked.push(selected);
            renderPicked();
          }
        });
      });
    };
    const fetchCandidates = async () => {
      const keyword = String(searchEl.value || '').trim();
      if (keyword.length < 1) {
        localState.found = [];
        renderCandidates();
        return;
      }
      try {
        const rows = await api(`/api/boards/mention-candidates?q=${encodeURIComponent(keyword)}&limit=20`);
        localState.found = (Array.isArray(rows) ? rows : []).filter((row) => !existingUserIds.has(Number(row.user_id)));
      } catch {
        localState.found = [];
      }
      renderCandidates();
    };
    searchEl.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchCandidates, 180);
    });
    modal.bodyEl.querySelector('#nu-member-add-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl.querySelector('#nu-member-add-form')?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      if (!localState.picked.length) {
        if (errorEl) errorEl.textContent = '추가할 팀원을 선택하세요.';
        return;
      }
      const fd = new FormData(modal.bodyEl.querySelector('#nu-member-add-form'));
      const memberRole = String(fd.get('member_role') || 'member');
      const representative = fd.has('is_representative');
      try {
        for (let index = 0; index < localState.picked.length; index += 1) {
          const user = localState.picked[index];
          await api(`/api/projects/${projectId}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_id: Number(user.user_id), role: memberRole, is_representative: representative && index === 0 }),
          });
        }
        modal.close();
        await renderProjectDetail(view, projectId);
      } catch (error) {
        if (errorEl) errorEl.textContent = error.message || '팀원 추가 실패';
      }
    });
    renderPicked();
    renderCandidates();
  };

  const openNoteEditor = (note = null) => {
    if (!canEditNotes) return;
    const isEdit = !!note;
    const today = toDateInputValue(new Date()) || '';
    const modal = openNuModal({
      title: isEdit ? '코칭노트 편집' : '코칭노트 작성',
      maxWidth: 'max-w-5xl',
      bodyHtml: `
        <form id="nu-note-form" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div><div class="text-xs nu-text-muted">과제</div><div class="font-semibold">${escapeHtml(project.project_name || '-')}</div></div>
            <label class="text-sm w-36">진행률 (%)
              <input type="number" min="0" max="100" name="progress_rate" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${Number(note?.progress_rate ?? project.progress_rate ?? 0)}" />
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-sm">코칭일자
              <input type="date" name="coaching_date" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${toDateInputValue(note?.coaching_date) || today}" required />
            </label>
            <label class="text-sm">주차
              <input type="number" min="1" name="week_number" class="mt-1 w-full rounded-lg border nu-border px-3 py-2 nu-surface" value="${note?.week_number || ''}" />
            </label>
          </div>
          <div><div class="text-sm nu-text-muted mb-1">현재 상태</div><div id="nu-note-current-editor"></div></div>
          <div><div class="text-sm nu-text-muted mb-1">주요 문제</div><div id="nu-note-issue-editor"></div></div>
          <div><div class="text-sm nu-text-muted mb-1">다음 작업</div><div id="nu-note-action-editor"></div></div>
          <p id="nu-note-form-error" class="text-sm text-red-600"></p>
          <div class="flex items-center justify-end gap-2">
            <button type="button" id="nu-note-form-cancel" class="rounded-lg border nu-border px-3 py-2 text-sm nu-surface">취소</button>
            <button type="submit" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">${isEdit ? '저장' : '등록'}</button>
          </div>
        </form>
      `,
    });
    const currentEditor = createRichField('nu-note-current-editor', { initialHTML: note?.current_status || '', placeholder: '현재 상태를 입력하세요.', uploadOptions: { scope: 'note', projectId } });
    const issueEditor = createRichField('nu-note-issue-editor', { initialHTML: note?.main_issue || '', placeholder: '주요 문제를 입력하세요.', uploadOptions: { scope: 'note', projectId } });
    const actionEditor = createRichField('nu-note-action-editor', { initialHTML: note?.next_action || '', placeholder: '다음 작업을 입력하세요.', uploadOptions: { scope: 'note', projectId } });
    modal.bodyEl.querySelector('#nu-note-form-cancel')?.addEventListener('click', modal.close);
    modal.bodyEl.querySelector('#nu-note-form')?.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const fd = new FormData(modal.bodyEl.querySelector('#nu-note-form'));
      const errorEl = modal.bodyEl.querySelector('#nu-note-form-error');
      const coachingDate = String(fd.get('coaching_date') || '').trim();
      const weekNumber = Number.parseInt(String(fd.get('week_number') || ''), 10);
      const progressRate = Number.parseInt(String(fd.get('progress_rate') || ''), 10);
      if (!coachingDate) {
        if (errorEl) errorEl.textContent = '코칭일자를 입력하세요.';
        return;
      }
      const payload = {
        coaching_date: coachingDate,
        week_number: Number.isNaN(weekNumber) ? null : weekNumber,
        progress_rate: Number.isNaN(progressRate) ? null : Math.max(0, Math.min(100, progressRate)),
        current_status: currentEditor.getHTML() || null,
        main_issue: issueEditor.getHTML() || null,
        next_action: actionEditor.getHTML() || null,
      };
      try {
        if (isEdit) await api(`/api/notes/${note.note_id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api(`/api/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify(payload) });
        renderProjectDetail._uiState[projectId] = { ...saved, forceLatestOpen: true };
        modal.close();
        await renderProjectDetail(view, projectId);
      } catch (error) {
        if (errorEl) errorEl.textContent = error.message || '코칭노트 저장 실패';
      }
    });
  };

  view.innerHTML = `
    <section class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">${escapeHtml(project.project_name || '과제 상세')}</h1>
        <div class="mt-1 text-sm nu-text-muted flex flex-wrap items-center gap-3">
          <span>부서 ${escapeHtml(project.organization || '-')}</span>
          <span>대표 ${escapeHtml(project.representative || '-')}</span>
          <span>진행률 <b>${Number(project.progress_rate || 0)}%</b></span>
        </div>
      </div>
      <button id="nu-back-projects" class="rounded-lg border nu-border px-3 py-2 nu-surface hover:nu-soft">과제 목록</button>
    </section>
    <section class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="xl:col-span-2 space-y-4">
        <article class="rounded-2xl border nu-border nu-surface p-4 space-y-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">기본정보</h2>
            <span class="text-xs nu-text-muted">${canEditProject ? '항목별 edit 버튼으로 수정' : '읽기 전용'}</span>
          </div>
          <div class="rounded-xl border nu-border p-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-semibold text-sm">팀원 리스트 (${memberRows.length})</h3>
              <div class="flex items-center gap-2">
                <button id="nu-member-toggle" class="rounded border nu-border px-2 py-1 text-xs nu-surface">${saved.memberOpen ? '접기' : '펼치기'}</button>
                ${canManageMembers ? '<button id="nu-member-add" class="rounded border nu-border px-2 py-1 text-xs nu-surface">팀원 추가</button>' : ''}
              </div>
            </div>
            <div id="nu-member-list" class="mt-2 ${saved.memberOpen ? '' : 'hidden'} space-y-1">
              ${
                memberRows.length
                  ? memberRows
                      .map(
                        (member) => `
                          <div class="flex items-center justify-between gap-2 rounded-lg border nu-border px-2 py-1.5 text-sm">
                            <div>
                              <span class="font-medium">${escapeHtml(member.user_name || '-')}</span>
                              <span class="nu-text-muted ml-1">@${escapeHtml(member.user_emp_id || '-')}</span>
                              <span class="nu-text-muted ml-1">${escapeHtml(member.role || 'member')}</span>
                              ${member.is_representative ? '<span class="ml-1 text-xs rounded-full px-1.5 py-0.5 bg-emerald-100 text-emerald-700">대표</span>' : ''}
                            </div>
                            ${canManageMembers ? `<button class="rounded border border-red-200 bg-red-50 text-red-600 px-2 py-1 text-xs" data-role="nu-member-remove" data-user-id="${member.user_id}">제거</button>` : ''}
                          </div>
                        `
                      )
                      .join('')
                  : '<p class="text-sm nu-text-muted">등록된 팀원이 없습니다.</p>'
              }
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="rounded-xl border nu-border p-3">
              <div class="flex items-center justify-between gap-2"><div class="text-sm font-medium">AI기술 분류</div>${canEditProject ? '<button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-project-edit-field" data-field="ai_tech_category">edit</button>' : ''}</div>
              <div class="mt-2 text-sm">${escapeHtml(project.ai_tech_category || project.category || '-')}</div>
            </div>
            <div class="rounded-xl border nu-border p-3">
              <div class="flex items-center justify-between gap-2"><div class="text-sm font-medium">사용된 AI기술</div>${canEditProject ? '<button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-project-edit-field" data-field="ai_tech_used">edit</button>' : ''}</div>
              <div class="mt-2 text-sm">${escapeHtml(project.ai_tech_used || '-')}</div>
            </div>
          </div>
          <div class="rounded-xl border nu-border p-3">
            <div class="flex items-center justify-between gap-2"><div class="text-sm font-medium">Github Repository</div>${canEditProject ? '<button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-project-edit-field" data-field="github_repos">edit</button>' : ''}</div>
            <div class="mt-2 text-sm space-y-1">${(Array.isArray(project.github_repos) ? project.github_repos : []).length ? project.github_repos.map((url) => `<div><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">${escapeHtml(url)}</a></div>`).join('') : '<span class="nu-text-muted">-</span>'}</div>
          </div>
          <div class="rounded-xl border nu-border p-3">
            <div class="flex items-center justify-between gap-2"><div class="text-sm font-medium">과제 요약</div>${canEditProject ? '<button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-project-edit-field" data-field="project_summary">edit</button>' : ''}</div>
            <div class="mt-2 text-sm rich-content">${renderRichContent(project.project_summary, '-')}</div>
          </div>
        </article>

        <article id="nu-note-section" class="rounded-2xl border nu-border nu-surface p-4">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 class="font-semibold">코칭노트 (${noteRows.length})</h2>
            <div class="flex items-center gap-2">
              <button id="nu-note-toggle-all" class="rounded border nu-border px-2 py-1 text-xs nu-surface">${saved.expandAllNotes ? '전체 접기' : '전체 펼치기'}</button>
              ${canEditNotes ? '<button id="nu-note-create" class="rounded-lg px-3 py-2 text-sm nu-primary-bg">새 코칭노트</button>' : '<span class="text-xs nu-text-muted">코칭노트 작성 권한 없음</span>'}
            </div>
          </div>
          <div class="space-y-3">
            ${
              noteRows.length
                ? noteRows
                    .map((note) => {
                      const expanded = saved.expandAllNotes || expandedSet.has(Number(note.note_id));
                      const comments = commentsByNote.get(Number(note.note_id)) || [];
                      const validFeedbacks = comments.filter((comment) => String(comment.comment_type || '').toLowerCase() === 'coaching_feedback' && p1HasText(comment.content));
                      const validMemos = comments.filter((comment) => String(comment.comment_type || '').toLowerCase() === 'participant_memo' && p1HasText(comment.content));
                      return `
                        <article class="rounded-xl border nu-border p-3">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div class="font-semibold">${escapeHtml(toDateInputValue(note.coaching_date) || '-')} ${note.week_number ? `· ${note.week_number}주차` : ''}</div>
                              <div class="text-xs nu-text-muted">${formatDateTime(note.created_at)} · ${escapeHtml(note.author_name || '-')} · 진행률 ${Number(note.progress_rate ?? project.progress_rate ?? 0)}%</div>
                            </div>
                            <div class="flex items-center gap-1">
                              <button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-note-toggle" data-note-id="${note.note_id}">${expanded ? '접기' : '펼치기'}</button>
                              ${canEditNotes ? `<button class="rounded border nu-border px-2 py-1 text-xs nu-surface" data-role="nu-note-edit" data-note-id="${note.note_id}">편집</button><button class="rounded border border-red-200 bg-red-50 text-red-600 px-2 py-1 text-xs" data-role="nu-note-delete" data-note-id="${note.note_id}">삭제</button>` : ''}
                            </div>
                          </div>
                          ${
                            expanded
                              ? `
                                <div class="mt-3 space-y-3 text-sm">
                                  ${p1HasText(note.current_status) ? `<div><div class="text-xs nu-text-muted mb-1">현재 상태</div><div class="rich-content">${renderRichContent(note.current_status, '-')}</div></div>` : ''}
                                  ${p1HasText(note.main_issue) ? `<div><div class="text-xs nu-text-muted mb-1">주요 문제</div><div class="rich-content">${renderRichContent(note.main_issue, '-')}</div></div>` : ''}
                                  ${p1HasText(note.next_action) ? `<div><div class="text-xs nu-text-muted mb-1">다음 작업</div><div class="rich-content">${renderRichContent(note.next_action, '-')}</div></div>` : ''}
                                  ${
                                    !p1HasText(note.current_status) && !p1HasText(note.main_issue) && !p1HasText(note.next_action)
                                      ? '<p class="text-xs nu-text-muted">입력된 본문이 없습니다.</p>'
                                      : ''
                                  }
                                  <div class="border-t nu-border pt-2 space-y-2">
                                    ${
                                      validFeedbacks.length
                                        ? `<div><div class="text-xs font-semibold mb-1">코칭 의견 (${validFeedbacks.length})</div>${validFeedbacks.map((comment) => `<div class="rounded-lg border nu-border p-2 mb-1"><div class="rich-content text-sm">${renderRichContent(comment.content, '-')}</div><div class="text-xs nu-text-muted mt-1 flex items-center justify-between gap-2"><span>${formatDateTime(comment.created_at)} · ${escapeHtml(comment.author_name || '-')}</span>${Number(comment.author_id) === Number(state.user?.user_id) || role === 'admin' ? `<button class="rounded border border-red-200 bg-red-50 text-red-600 px-2 py-0.5 text-[11px]" data-role="nu-note-comment-delete" data-comment-id="${comment.comment_id}">삭제</button>` : ''}</div></div>`).join('')}</div>`
                                        : ''
                                    }
                                    ${
                                      validMemos.length
                                        ? `<div><div class="text-xs font-semibold mb-1">참여자 메모 (${validMemos.length})</div>${validMemos.map((comment) => `<div class="rounded-lg border nu-border p-2 mb-1"><div class="rich-content text-sm">${renderRichContent(comment.content, '-')}</div><div class="text-xs nu-text-muted mt-1 flex items-center justify-between gap-2"><span>${formatDateTime(comment.created_at)} · ${escapeHtml(comment.author_name || '-')}</span>${Number(comment.author_id) === Number(state.user?.user_id) || role === 'admin' ? `<button class="rounded border border-red-200 bg-red-50 text-red-600 px-2 py-0.5 text-[11px]" data-role="nu-note-comment-delete" data-comment-id="${comment.comment_id}">삭제</button>` : ''}</div></div>`).join('')}</div>`
                                        : ''
                                    }
                                    ${
                                      canComment
                                        ? `<form class="rounded-lg border nu-border p-2 space-y-2" data-role="nu-note-comment-form" data-note-id="${note.note_id}"><textarea name="content" rows="3" class="w-full rounded-lg border nu-border px-3 py-2 nu-surface text-sm" placeholder="${canEditNotes ? '코칭 의견을 입력하세요.' : '참여자 메모를 입력하세요.'}"></textarea><div class="flex items-center justify-between gap-2">${canEditNotes ? '<label class="text-xs flex items-center gap-1"><input type="checkbox" name="is_coach_only" /> 코치들에게만 공유</label>' : '<span></span>'}<button type="submit" class="rounded px-2.5 py-1 text-xs nu-primary-bg">등록</button></div></form>`
                                        : '<p class="text-xs nu-text-muted">참관자는 의견을 작성할 수 없습니다.</p>'
                                    }
                                  </div>
                                </div>
                              `
                              : ''
                          }
                        </article>
                      `;
                    })
                    .join('')
                : '<p class="text-sm nu-text-muted">코칭노트가 없습니다.</p>'
            }
          </div>
        </article>
      </div>
      <aside class="space-y-4">
        <article class="rounded-2xl border nu-border nu-surface p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">최근 코칭 노트</h2>
            <button id="nu-latest-note-go" class="rounded border nu-border px-2 py-1 text-xs nu-surface">목록 이동</button>
          </div>
          ${
            latestNote
              ? `<button id="nu-latest-note-card" class="mt-3 w-full text-left rounded-xl border nu-border p-3 hover:nu-soft">
                   <div class="font-semibold">${escapeHtml(toDateInputValue(latestNote.coaching_date) || '-')} ${latestNote.week_number ? `· ${latestNote.week_number}주차` : ''}</div>
                   ${p1HasText(latestNote.current_status) ? `<div class="mt-2"><div class="text-xs nu-text-muted mb-1">현재 상태</div><div class="rich-content text-sm">${renderRichContent(latestNote.current_status, '-')}</div></div>` : ''}
                   ${p1HasText(latestNote.main_issue) ? `<div class="mt-2"><div class="text-xs nu-text-muted mb-1">주요 문제</div><div class="rich-content text-sm">${renderRichContent(latestNote.main_issue, '-')}</div></div>` : ''}
                   ${p1HasText(latestNote.next_action) ? `<div class="mt-2"><div class="text-xs nu-text-muted mb-1">다음 작업</div><div class="rich-content text-sm">${renderRichContent(latestNote.next_action, '-')}</div></div>` : ''}
                   ${latestFeedbacks.length ? `<div class="mt-2"><div class="text-xs font-semibold">코칭 의견 (${latestFeedbacks.length})</div>${latestFeedbacks.map((comment) => `<div class="text-xs rounded border nu-border p-1.5 mt-1"><div class="rich-content">${renderRichContent(comment.content, '-')}</div><div class="nu-text-muted mt-1">${formatDateTime(comment.created_at)} · ${escapeHtml(comment.author_name || '-')}</div></div>`).join('')}</div>` : ''}
                   ${latestMemos.length ? `<div class="mt-2"><div class="text-xs font-semibold">참여자 메모 (${latestMemos.length})</div>${latestMemos.map((comment) => `<div class="text-xs rounded border nu-border p-1.5 mt-1"><div class="rich-content">${renderRichContent(comment.content, '-')}</div><div class="nu-text-muted mt-1">${formatDateTime(comment.created_at)} · ${escapeHtml(comment.author_name || '-')}</div></div>`).join('')}</div>` : ''}
                 </button>`
              : '<p class="mt-3 text-sm nu-text-muted">코칭노트가 없습니다.</p>'
          }
        </article>
      </aside>
    </section>
  `;

  document.getElementById('nu-back-projects')?.addEventListener('click', () => navigate('/projects'));
  document.getElementById('nu-member-toggle')?.addEventListener('click', () => {
    renderProjectDetail._uiState[projectId] = { ...saved, memberOpen: !saved.memberOpen };
    renderProjectDetail(view, projectId);
  });
  document.getElementById('nu-member-add')?.addEventListener('click', openAddMemberModal);
  view.querySelectorAll('[data-role="nu-member-remove"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const userId = Number.parseInt(btn.getAttribute('data-user-id') || '', 10);
      if (Number.isNaN(userId) || !confirm('팀원을 제거하시겠습니까?')) return;
      try {
        await api(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
        await renderProjectDetail(view, projectId);
      } catch (error) {
        alert(error.message || '팀원 제거 실패');
      }
    });
  });
  view.querySelectorAll('[data-role="nu-project-edit-field"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-field');
      if (field) openFieldEditor(field);
    });
  });

  const goToNotes = () => {
    const target = document.getElementById('nu-note-section');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  document.getElementById('nu-latest-note-go')?.addEventListener('click', goToNotes);
  document.getElementById('nu-latest-note-card')?.addEventListener('click', goToNotes);
  document.getElementById('nu-note-create')?.addEventListener('click', () => openNoteEditor());
  document.getElementById('nu-note-toggle-all')?.addEventListener('click', () => {
    const nextExpandAll = !saved.expandAllNotes;
    renderProjectDetail._uiState[projectId] = { ...saved, expandAllNotes: nextExpandAll, expandedNoteIds: nextExpandAll ? noteRows.map((row) => Number(row.note_id)) : (latestNote ? [Number(latestNote.note_id)] : []) };
    renderProjectDetail(view, projectId);
  });
  view.querySelectorAll('[data-role="nu-note-toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const noteId = Number.parseInt(btn.getAttribute('data-note-id') || '', 10);
      if (Number.isNaN(noteId)) return;
      const nextSet = new Set(expandedSet);
      if (nextSet.has(noteId)) nextSet.delete(noteId);
      else nextSet.add(noteId);
      renderProjectDetail._uiState[projectId] = { ...saved, expandAllNotes: false, expandedNoteIds: [...nextSet] };
      renderProjectDetail(view, projectId);
    });
  });
  view.querySelectorAll('[data-role="nu-note-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const noteId = Number.parseInt(btn.getAttribute('data-note-id') || '', 10);
      const note = noteRows.find((row) => Number(row.note_id) === noteId);
      if (note) openNoteEditor(note);
    });
  });
  view.querySelectorAll('[data-role="nu-note-delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const noteId = Number.parseInt(btn.getAttribute('data-note-id') || '', 10);
      if (Number.isNaN(noteId) || !confirm('코칭노트를 삭제하시겠습니까?')) return;
      try {
        await api(`/api/notes/${noteId}`, { method: 'DELETE' });
        renderProjectDetail._uiState[projectId] = { ...saved, forceLatestOpen: true };
        await renderProjectDetail(view, projectId);
      } catch (error) {
        alert(error.message || '코칭노트 삭제 실패');
      }
    });
  });
  view.querySelectorAll('[data-role="nu-note-comment-form"]').forEach((form) => {
    form.addEventListener('submit', async (evt) => {
      evt.preventDefault();
      const noteId = Number.parseInt(form.getAttribute('data-note-id') || '', 10);
      if (Number.isNaN(noteId)) return;
      const fd = new FormData(form);
      const content = String(fd.get('content') || '').trim();
      if (!content) {
        alert('내용을 입력하세요.');
        return;
      }
      try {
        await api(`/api/notes/${noteId}/comments`, { method: 'POST', body: JSON.stringify({ content, is_coach_only: fd.has('is_coach_only') }) });
        await renderProjectDetail(view, projectId);
      } catch (error) {
        alert(error.message || '의견 등록 실패');
      }
    });
  });
  view.querySelectorAll('[data-role="nu-note-comment-delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = Number.parseInt(btn.getAttribute('data-comment-id') || '', 10);
      if (Number.isNaN(commentId) || !confirm('해당 의견을 삭제하시겠습니까?')) return;
      try {
        await api(`/api/comments/${commentId}`, { method: 'DELETE' });
        await renderProjectDetail(view, projectId);
      } catch (error) {
        alert(error.message || '의견 삭제 실패');
      }
    });
  });
}
