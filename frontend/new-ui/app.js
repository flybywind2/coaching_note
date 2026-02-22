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

const ROLE = {
  canDashboard(role) {
    return ['admin', 'coach', 'internal_coach'].includes(role);
  },
  canCalendar(role) {
    return ['admin', 'coach', 'internal_coach', 'participant', 'observer'].includes(role);
  },
  canAdmin(role) {
    return role === 'admin';
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
  });
}

function hashPath() {
  return location.hash.replace(/^#/, '') || (state.token ? '/dashboard' : '/login');
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
    navigate('/dashboard');
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
    if (path === '/admin') {
      if (!ROLE.canAdmin(state.user?.role || '')) return renderForbidden(view, '관리자');
      renderAdminGuide(view);
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
              <a href="/#/" class="text-sm px-3 py-2 rounded-lg border nu-border nu-surface hover:nu-soft">기존 UI</a>
              <button id="nu-logout" class="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100">로그아웃</button>
            </div>
          </div>
          <div class="mt-2 text-sm nu-text-muted">
            사용자: <b>${escapeHtml(state.user?.name || '-')}</b> (${escapeHtml(state.user?.role || '-')})
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
      navigate('/dashboard');
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
  const [project, members, notes, tasks] = await Promise.all([
    api(`/api/projects/${projectId}`),
    api(`/api/projects/${projectId}/members`).catch(() => []),
    api(`/api/projects/${projectId}/notes`).catch(() => []),
    api(`/api/projects/${projectId}/tasks`).catch(() => []),
  ]);

  const memberRows = Array.isArray(members) ? members : [];
  const noteRows = Array.isArray(notes) ? notes : [];
  const taskRows = Array.isArray(tasks) ? tasks : [];

  view.innerHTML = `
    <section class="mb-4 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">${escapeHtml(project.project_name || '과제 상세')}</h1>
        <p class="nu-text-muted mt-1">${escapeHtml(project.organization || '-')} · 대표자 ${escapeHtml(project.representative || '-')}</p>
      </div>
      <button id="nu-back-projects" class="rounded-lg border nu-border px-3 py-2 nu-surface hover:nu-soft">과제 목록</button>
    </section>

    <section class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div class="rounded-2xl border nu-border nu-surface p-4">
        <h2 class="font-semibold">기본 정보</h2>
        <dl class="mt-3 space-y-2 text-sm">
          <div><dt class="nu-text-muted">구분</dt><dd>${escapeHtml(project.project_type || 'primary')}</dd></div>
          <div><dt class="nu-text-muted">AI 분류</dt><dd>${escapeHtml(project.ai_tech_category || project.category || '-')}</dd></div>
          <div><dt class="nu-text-muted">AI 기술</dt><dd>${escapeHtml(project.ai_tech_used || '-')}</dd></div>
          <div><dt class="nu-text-muted">진행률</dt><dd>${Number(project.progress_rate || 0).toFixed(1)}%</dd></div>
        </dl>
      </div>
      <div class="rounded-2xl border nu-border nu-surface p-4">
        <h2 class="font-semibold">참여자 (${memberRows.length})</h2>
        <ul class="mt-3 space-y-2 text-sm">
          ${
            memberRows.length
              ? memberRows
                  .map(
                    (m) =>
                      `<li class="rounded-lg nu-soft px-3 py-2">${escapeHtml(m.user_name || m.name || '-')} <span class="nu-text-muted">(${escapeHtml(
                        m.role || '-'
                      )})</span></li>`
                  )
                  .join('')
              : '<li class="nu-text-muted">참여자 데이터가 없습니다.</li>'
          }
        </ul>
      </div>
      <div class="rounded-2xl border nu-border nu-surface p-4">
        <h2 class="font-semibold">과제 (${taskRows.length})</h2>
        <ul class="mt-3 space-y-2 text-sm">
          ${
            taskRows.length
              ? taskRows
                  .slice(0, 8)
                  .map(
                    (t) =>
                      `<li class="rounded-lg nu-soft px-3 py-2">${escapeHtml(t.title || t.task_name || '-')} <span class="nu-text-muted">(${escapeHtml(
                        t.status || '-'
                      )})</span></li>`
                  )
                  .join('')
              : '<li class="nu-text-muted">등록된 과제가 없습니다.</li>'
          }
        </ul>
      </div>
    </section>

    <section class="rounded-2xl border nu-border nu-surface p-4 mt-4">
      <h2 class="font-semibold">코칭 노트 (${noteRows.length})</h2>
      <div class="mt-3 overflow-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left border-b nu-border">
              <th class="py-2 pr-3">제목</th>
              <th class="py-2 pr-3">작성자</th>
              <th class="py-2 pr-3">작성일</th>
            </tr>
          </thead>
          <tbody>
            ${
              noteRows.length
                ? noteRows
                    .slice(0, 15)
                    .map(
                      (n) => `
                  <tr class="border-b nu-border">
                    <td class="py-2 pr-3">${escapeHtml(n.title || '제목 없음')}</td>
                    <td class="py-2 pr-3">${escapeHtml(n.author_name || n.created_by_name || '-')}</td>
                    <td class="py-2 pr-3">${formatDateTime(n.created_at)}</td>
                  </tr>
                `
                    )
                    .join('')
                : '<tr><td colspan="3" class="py-3 nu-text-muted">코칭 노트가 없습니다.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.getElementById('nu-back-projects').addEventListener('click', () => navigate('/projects'));
}
async function renderCalendar(view) {
  if (!state.batchId) {
    view.innerHTML = '<div class="rounded-xl border nu-border nu-surface p-4 nu-text-muted">차수 데이터가 없습니다.</div>';
    return;
  }

  const now = new Date();
  let monthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  async function draw() {
    const [year, month] = monthValue.split('-').map((v) => Number(v));
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    const payload = await api(`/api/calendar?batch_id=${state.batchId}&start=${start}&end=${end}`).catch(() => []);
    const events = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [];

    listEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b nu-border">
            <th class="py-2 pr-3">일시</th>
            <th class="py-2 pr-3">일정</th>
            <th class="py-2 pr-3">유형</th>
            <th class="py-2 pr-3">공개범위</th>
            <th class="py-2 pr-3">과제</th>
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
                  <td class="py-2 pr-3">${escapeHtml(ev.visibility_scope || '-')}</td>
                  <td class="py-2 pr-3">${escapeHtml(ev.project_name || '-')}</td>
                </tr>
              `
                  )
                  .join('')
              : '<tr><td colspan="5" class="py-3 nu-text-muted">선택한 월의 일정이 없습니다.</td></tr>'
          }
        </tbody>
      </table>
    `;
  }

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">캘린더</h1>
      <p class="nu-text-muted mt-1">월 단위로 전체 코칭/공통 일정을 확인합니다.</p>
    </section>
    <section class="rounded-2xl border nu-border nu-surface p-4">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input id="nu-calendar-month" type="month" class="rounded-lg border nu-border px-3 py-2 nu-surface" value="${monthValue}" />
        <button id="nu-calendar-load" class="rounded-lg px-3 py-2 nu-primary-bg text-sm">조회</button>
      </div>
      <div id="nu-calendar-list" class="overflow-auto"></div>
    </section>
  `;

  const monthEl = document.getElementById('nu-calendar-month');
  const listEl = document.getElementById('nu-calendar-list');
  document.getElementById('nu-calendar-load').addEventListener('click', () => {
    monthValue = monthEl.value;
    draw();
  });
  draw();
}

async function renderBoard(view) {
  const boards = await api('/api/boards').catch(() => []);
  const boardRows = Array.isArray(boards) ? boards : [];
  let boardId = boardRows[0]?.board_id || null;
  if (state.boardPage.boardId) {
    const exists = boardRows.some((b) => Number(b.board_id) === Number(state.boardPage.boardId));
    if (exists) boardId = state.boardPage.boardId;
  }

  async function drawPosts() {
    if (!boardId) {
      postEl.innerHTML = '<div class="py-3 nu-text-muted">게시판이 없습니다.</div>';
      return;
    }
    state.boardPage.boardId = boardId;
    const payload = await api(`/api/boards/${boardId}/posts?skip=${state.boardPage.skip}&limit=${state.boardPage.limit}`).catch(() => []);
    const posts = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];

    postEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b nu-border">
            <th class="py-2 pr-3">제목</th>
            <th class="py-2 pr-3">작성자</th>
            <th class="py-2 pr-3">카테고리</th>
            <th class="py-2 pr-3">작성일</th>
          </tr>
        </thead>
        <tbody>
          ${
            posts.length
              ? posts
                  .map(
                    (p) => `
                <tr class="border-b nu-border">
                  <td class="py-2 pr-3">${escapeHtml(p.title || '-')}</td>
                  <td class="py-2 pr-3">${escapeHtml(p.author_name || p.created_by_name || '-')}</td>
                  <td class="py-2 pr-3">${escapeHtml(p.category || '-')}</td>
                  <td class="py-2 pr-3">${formatDateTime(p.created_at)}</td>
                </tr>
              `
                  )
                  .join('')
              : '<tr><td colspan="4" class="py-3 nu-text-muted">게시글이 없습니다.</td></tr>'
          }
        </tbody>
      </table>
    `;
  }

  view.innerHTML = `
    <section class="mb-4">
      <h1 class="text-2xl font-bold">게시판</h1>
      <p class="nu-text-muted mt-1">최근 게시글을 빠르게 확인합니다.</p>
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
                        b.name || b.board_name || `게시판 ${b.board_id}`
                      )}</option>`
                  )
                  .join('')
              : '<option value="">게시판 없음</option>'
          }
        </select>
        <button id="nu-board-prev" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">이전</button>
        <button id="nu-board-next" class="rounded-lg border nu-border px-3 py-2 nu-surface text-sm">다음</button>
      </div>
      <div id="nu-board-posts" class="overflow-auto"></div>
    </section>
  `;

  const boardSelectEl = document.getElementById('nu-board-select');
  const postEl = document.getElementById('nu-board-posts');

  boardSelectEl.addEventListener('change', () => {
    boardId = Number(boardSelectEl.value) || null;
    state.boardPage.skip = 0;
    drawPosts();
  });
  document.getElementById('nu-board-prev').addEventListener('click', () => {
    state.boardPage.skip = Math.max(0, state.boardPage.skip - state.boardPage.limit);
    drawPosts();
  });
  document.getElementById('nu-board-next').addEventListener('click', () => {
    state.boardPage.skip += state.boardPage.limit;
    drawPosts();
  });

  drawPosts();
}

function renderAdminGuide(view) {
  view.innerHTML = `
    <section class="rounded-2xl border nu-border nu-surface p-5">
      <h1 class="text-2xl font-bold">관리자 메뉴</h1>
      <p class="nu-text-muted mt-2">이 New UI는 사용자 친화적인 조회/탐색 중심 레이아웃입니다.</p>
      <p class="nu-text-muted mt-1">기존 관리자 상세 편집 기능은 기존 UI에서 계속 사용할 수 있습니다.</p>
      <div class="mt-4 flex items-center gap-2">
        <a href="/#/admin" class="rounded-lg px-3 py-2 nu-primary-bg">기존 관리자 UI 열기</a>
        <a href="/#/" class="rounded-lg border nu-border px-3 py-2 nu-surface hover:nu-soft">기존 UI 홈</a>
      </div>
    </section>
  `;
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
  view.innerHTML = `
    <section class="rounded-2xl border nu-border nu-surface p-5">
      <h1 class="text-xl font-semibold">404</h1>
      <p class="mt-2 nu-text-muted">요청한 화면을 찾을 수 없습니다.</p>
      <button class="mt-4 rounded-lg px-3 py-2 nu-primary-bg" id="nu-go-dashboard">대시보드로 이동</button>
    </section>
  `;
  document.getElementById('nu-go-dashboard').addEventListener('click', () => navigate('/dashboard'));
}

function kpiCard(label, value) {
  return `
    <div class="rounded-2xl border nu-border nu-surface p-4">
      <div class="text-sm nu-text-muted">${escapeHtml(label)}</div>
      <div class="text-2xl font-bold mt-1">${escapeHtml(value)}</div>
    </div>
  `;
}
