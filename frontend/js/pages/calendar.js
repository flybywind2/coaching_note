/**
 * Calendar 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.calendar = {
  currentDate: new Date(),
  viewMode: 'month',
  projectWise: false,

  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const role = user.role;
      const isAdmin = role === 'admin';
      const isParticipant = role === 'participant';
      const canManageProjectEvents = isAdmin || isParticipant;
      const calendarPolicy = {
        role,
        isAdmin,
        isParticipant,
        canManageProjectEvents,
      };
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }
      const batchId = State.get('currentBatchId') || batches[0].batch_id;

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>캘린더</h1>
            <div class="cal-controls">
              <select id="cal-batch">${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}</select>
              <select id="cal-view-mode">
                <option value="month"${this.viewMode === 'month' ? ' selected' : ''}>월간</option>
                <option value="tenweeks"${this.viewMode === 'tenweeks' ? ' selected' : ''}>10주 마일스톤</option>
              </select>
              ${isAdmin ? `<label class="cal-project-wise"><input id="cal-project-wise" type="checkbox"${this.projectWise ? ' checked' : ''} /> 과제별 캘린더</label>` : ''}
              ${canManageProjectEvents ? '<button id="cal-add-event-btn" class="btn btn-sm btn-primary">+ 일정 추가</button>' : ''}
              <button id="cal-prev" class="btn btn-sm">◀</button>
              <span id="cal-month-label" class="cal-month"></span>
              <button id="cal-next" class="btn btn-sm">▶</button>
            </div>
          </div>
          <div id="cal-grid" class="cal-grid"></div>
          <div class="cal-legend">
            <span class="legend-item"><span class="dot" style="background:#4CAF50"></span>전체 일정</span>
            <span class="legend-item"><span class="dot" style="background:#2196F3"></span>코칭/과제 일정</span>
            <span class="legend-item"><span class="dot" style="background:#9C27B0"></span>마일스톤</span>
          </div>
        </div>`;

      const getBatchId = () => parseInt(document.getElementById('cal-batch').value, 10);

      document.getElementById('cal-prev').addEventListener('click', async () => {
        this._shiftWindow(-1);
        await this._renderView(getBatchId(), calendarPolicy);
      });
      document.getElementById('cal-next').addEventListener('click', async () => {
        this._shiftWindow(1);
        await this._renderView(getBatchId(), calendarPolicy);
      });
      document.getElementById('cal-batch').addEventListener('change', async (e) => {
        State.set('currentBatchId', parseInt(e.target.value, 10));
        await this._renderView(getBatchId(), calendarPolicy);
      });
      document.getElementById('cal-view-mode').addEventListener('change', async (e) => {
        this.viewMode = e.target.value;
        await this._renderView(getBatchId(), calendarPolicy);
      });
      document.getElementById('cal-project-wise')?.addEventListener('change', async (e) => {
        this.projectWise = e.target.checked;
        await this._renderView(getBatchId(), calendarPolicy);
      });
      document.getElementById('cal-add-event-btn')?.addEventListener('click', async () => {
        await this._openEventCreateModal(getBatchId(), { policy: calendarPolicy });
      });

      await this._renderView(batchId, calendarPolicy);
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _shiftWindow(step) {
    if (this.viewMode === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() + step);
      return;
    }
    this.currentDate.setDate(this.currentDate.getDate() + (step * 70));
  },

  _toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _parseDate(value) {
    const text = String(value).slice(0, 10);
    const [y, m, d] = text.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  },

  _startOfWeek(dateObj) {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday start
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  _formatRangeDate(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  _escapeAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },

  _eventChip(ev, maxLen = 18) {
    const payload = encodeURIComponent(JSON.stringify(ev));
    const title = Fmt.escape(ev.title || '이벤트');
    let label = (ev.title || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    if (ev.time_label) {
      label = `${ev.time_label} ${label}`;
    }
    if (!label) label = ev.title || '이벤트';
    return `<button type="button" class="cal-event cal-event-btn" data-event="${this._escapeAttr(payload)}" style="background:${ev.color}" title="${title}">${Fmt.escape(label.slice(0, maxLen))}</button>`;
  },

  async _renderView(batchId, policy) {
    if (this.viewMode === 'tenweeks') {
      await this._renderTenWeeks(batchId, policy);
      return;
    }
    await this._renderMonth(batchId, policy);
  },

  async _renderMonth(batchId, policy) {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    document.getElementById('cal-month-label').textContent = `${year}년 ${month + 1}월`;

    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const [calendarData, projects] = await Promise.all([
        API.getCalendar(batchId, start, end),
        API.getProjects(batchId).catch(() => []),
      ]);
      const events = calendarData.events || [];
      const visibleProjects = policy.isParticipant
        ? projects.filter((p) => p.is_my_project)
        : projects;

      const useProjectWise = policy.isAdmin
        ? this.projectWise
        : policy.isParticipant;
      if (useProjectWise) {
        grid.innerHTML = this._renderProjectMonthCalendars(year, month, visibleProjects, events);
      } else {
        grid.innerHTML = this._renderMonthGrid(year, month, events);
      }
      this._bindEventDetailButtons(batchId, policy);
      this._bindDayCreateButtons(batchId, policy);
    } catch (e) {
      grid.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderMonthGrid(year, month, events) {
    const eventsByDate = {};
    events.forEach((ev) => {
      const key = String(ev.start).slice(0, 10);
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push(ev);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const todayKey = this._toDateKey(new Date());

    let html = '<div class="cal-week-header">' + days.map((d) => `<div>${d}</div>`).join('') + '</div>';
    html += '<div class="cal-days">';
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = eventsByDate[dateStr] || [];
      const isToday = dateStr === todayKey;

      html += `<div class="cal-day cal-day-clickable${isToday ? ' today' : ''}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        ${dayEvents.slice(0, 3).map((ev) => this._eventChip(ev, 22)).join('')}
        ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3}</div>` : ''}
      </div>`;
    }
    html += '</div>';
    return html;
  },

  _renderProjectMonthCalendars(year, month, projects, events) {
    const projectEvents = events.filter((ev) => ev.project_id && ['milestone', 'session'].includes(ev.event_type));
    const globalEvents = events.filter((ev) => ev.event_type === 'program' || ev.scope === 'global');
    if (!projects.length) {
      return '<div class="empty-state">이 차수에 과제가 없습니다.</div>';
    }

    const byProjectDate = {};
    projectEvents.forEach((ev) => {
      const key = `${ev.project_id}|${String(ev.start).slice(0, 10)}`;
      if (!byProjectDate[key]) byProjectDate[key] = [];
      byProjectDate[key].push(ev);
    });
    const globalByDate = {};
    globalEvents.forEach((ev) => {
      const key = String(ev.start).slice(0, 10);
      if (!globalByDate[key]) globalByDate[key] = [];
      globalByDate[key].push(ev);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];

    return `<div class="project-cal-list">
      ${projects.map((p) => {
        let section = `<section class="project-cal-card">
          <header class="project-cal-header"><h3>${Fmt.escape(p.project_name)}</h3><span class="tag">${Fmt.escape(p.status || '-')}</span></header>
          <div class="cal-week-header mini">${days.map((d) => `<div>${d}</div>`).join('')}</div>
          <div class="cal-days mini">`;

        for (let i = 0; i < firstDay; i++) section += '<div class="cal-day mini empty"></div>';
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dayEvents = [
            ...(globalByDate[dateStr] || []),
            ...(byProjectDate[`${p.project_id}|${dateStr}`] || []),
          ].sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
          section += `<div class="cal-day mini cal-day-clickable" data-date="${dateStr}" data-project-id="${p.project_id}">
            <span class="cal-day-num">${d}</span>
            ${dayEvents.slice(0, 3).map((ev) => this._eventChip(ev, 16)).join('')}
            ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3}</div>` : ''}
          </div>`;
        }
        section += '</div></section>';
        return section;
      }).join('')}
    </div>`;
  },

  async _renderTenWeeks(batchId, policy) {
    const startDate = this._startOfWeek(this.currentDate);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    endDate.setDate(endDate.getDate() + 69);
    document.getElementById('cal-month-label').textContent = `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')} ~ ${endDate.getFullYear()}.${String(endDate.getMonth() + 1).padStart(2, '0')}.${String(endDate.getDate()).padStart(2, '0')} (10주)`;

    const start = this._toDateKey(startDate);
    const end = this._toDateKey(endDate);
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const [calendarData, projects] = await Promise.all([
        API.getCalendar(batchId, start, end),
        API.getProjects(batchId).catch(() => []),
      ]);
      const allEvents = calendarData.events || [];
      const milestones = allEvents.filter((ev) => ev.event_type === 'milestone');
      const visibleProjects = policy.isParticipant
        ? projects.filter((p) => p.is_my_project)
        : projects;

      const projectMap = {};
      const orderedProjectIds = [];
      visibleProjects.forEach((p) => {
        projectMap[p.project_id] = p.project_name;
        orderedProjectIds.push(p.project_id);
      });
      milestones.forEach((ev) => {
        if (!projectMap[ev.project_id]) {
          projectMap[ev.project_id] = ev.project_name || `프로젝트 ${ev.project_id}`;
          orderedProjectIds.push(ev.project_id);
        }
      });

      const weekStarts = Array.from({ length: 10 }, (_, i) => {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        d.setDate(d.getDate() + (i * 7));
        return d;
      });

      const cellMap = {};
      milestones.forEach((ev) => {
        const due = this._parseDate(ev.start);
        if (!due) return;
        const diffDays = Math.floor((due.getTime() - startDate.getTime()) / 86400000);
        const idx = Math.floor(diffDays / 7);
        if (idx < 0 || idx > 9) return;
        const key = `${ev.project_id}|${idx}`;
        if (!cellMap[key]) cellMap[key] = [];
        cellMap[key].push(ev);
      });

      if (!orderedProjectIds.length) {
        grid.innerHTML = '<div class="empty-state">표시할 과제가 없습니다.</div>';
        return;
      }

      grid.innerHTML = `<div class="tenweek-wrap">
        <table class="tenweek-table">
          <thead>
            <tr>
              <th class="project-col">과제</th>
              ${weekStarts.map((d, idx) => `<th>${idx + 1}주차<br><small>${this._formatRangeDate(d)}</small></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${orderedProjectIds.map((pid) => `<tr>
              <th class="project-col">${Fmt.escape(projectMap[pid] || `프로젝트 ${pid}`)}</th>
              ${weekStarts.map((_, idx) => {
                const items = cellMap[`${pid}|${idx}`] || [];
                return `<td>
                  ${items.slice(0, 3).map((ev) => `<div class="milestone-chip" title="${Fmt.escape(ev.title)}">${Fmt.escape(ev.title.replace(/^\[[^\]]+\]\s*/, '').slice(0, 24))}</div>`).join('')}
                  ${items.length > 3 ? `<div class="cal-more">+${items.length - 3}</div>` : ''}
                </td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    } catch (e) {
      grid.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`;
    }
  },

  _bindEventDetailButtons(batchId, policy) {
    document.querySelectorAll('.cal-event-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          const raw = decodeURIComponent(btn.dataset.event || '');
          const event = JSON.parse(raw);
          this._openEventDetailModal(event, batchId, policy);
        } catch (_) {
          // ignore malformed payload
        }
      });
    });
  },

  _bindDayCreateButtons(batchId, policy) {
    if (!policy.canManageProjectEvents) return;
    document.querySelectorAll('.cal-day-clickable[data-date]').forEach((cell) => {
      cell.addEventListener('click', async (e) => {
        if (e.target instanceof Element && e.target.closest('.cal-event-btn')) return;
        const presetDate = (cell.dataset.date || '').slice(0, 10);
        if (!presetDate) return;
        const projectId = Number.parseInt(cell.dataset.projectId || '', 10);
        const hasProject = !Number.isNaN(projectId);
        const defaultScope = policy.isParticipant ? 'project' : (hasProject ? 'project' : 'global');
        await this._openEventCreateModal(batchId, {
          presetDate,
          presetScope: defaultScope,
          presetProjectId: hasProject ? projectId : null,
          policy,
        });
      });
    });
  },

  _buildRepeatingDates(baseDateStr, repeatType, repeatCount) {
    const count = Math.max(1, Math.min(30, Number.parseInt(repeatCount, 10) || 1));
    const base = new Date(`${baseDateStr}T00:00:00`);
    if (Number.isNaN(base.getTime())) return [];
    const dayStepMap = { none: 0, daily: 1, weekly: 7, biweekly: 14, monthly: 0 };
    const rows = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(base.getTime());
      if (repeatType === 'monthly') {
        d.setMonth(d.getMonth() + i);
      } else {
        d.setDate(d.getDate() + ((dayStepMap[repeatType] || 0) * i));
      }
      rows.push(this._toDateKey(d));
    }
    return rows;
  },

  _toDateTimeString(dateStr, timeStr) {
    if (!dateStr) return null;
    const safeTime = (timeStr || '00:00').slice(0, 5);
    return `${dateStr}T${safeTime}:00`;
  },

  _toDateInputValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  },

  _toTimeInputValue(value) {
    if (!value) return '';
    const text = String(value);
    if (text.includes('T')) {
      return text.slice(11, 16);
    }
    return text.slice(0, 5);
  },

  _stripProjectPrefix(title) {
    return String(title || '').replace(/^\[[^\]]+\]\s*/, '').trim();
  },

  _formatDateTimeValue(value) {
    if (!value) return '-';
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) {
      return direct.toLocaleString('ko-KR');
    }
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}T\d{4}$/.test(raw)) {
      const normalized = `${raw.slice(0, 10)}T${raw.slice(11, 13)}:${raw.slice(13, 15)}:00`;
      const normalizedDate = new Date(normalized);
      if (!Number.isNaN(normalizedDate.getTime())) {
        return normalizedDate.toLocaleString('ko-KR');
      }
      return normalized.replace('T', ' ');
    }
    return raw;
  },

  async _openEventCreateModal(batchId, options = {}) {
    const {
      presetDate = '',
      presetScope = 'global',
      presetProjectId = null,
      presetProjectKind = 'session',
      policy = { isAdmin: false, isParticipant: false, canManageProjectEvents: false },
    } = options;
    const allowGlobalScope = policy.isAdmin;
    const scopeValue = policy.isParticipant ? 'project' : presetScope;
    const [projects, users] = await Promise.all([
      API.getProjects(batchId).catch(() => []),
      API.getUsers().catch(() => []),
    ]);
    const selectableProjects = policy.isParticipant
      ? projects.filter((p) => p.is_my_project)
      : projects;
    if (policy.canManageProjectEvents && !selectableProjects.length) {
      alert('일정을 관리할 수 있는 본인 과제가 없습니다.');
      return;
    }
    const coaches = users.filter((u) => u.role === 'coach' || u.role === 'admin');

    Modal.open(`<h2>일정 추가</h2>
      <form id="calendar-event-form">
        <div class="form-group"${allowGlobalScope ? '' : ' style="display:none;"'}>
          <label>공개 범위 *</label>
          <select name="scope" id="cal-event-scope">
            <option value="global"${scopeValue === 'global' ? ' selected' : ''}>전체 일정 (모든 사용자 공개)</option>
            <option value="project"${scopeValue === 'project' ? ' selected' : ''}>과제 특수 일정 (과제 단위 공개)</option>
          </select>
        </div>
        ${allowGlobalScope ? '' : '<input type="hidden" name="scope" value="project" />'}
        <div class="form-group" id="cal-project-kind-row" style="display:none;">
          <label>과제 일정 유형 *</label>
          <select name="project_event_kind" id="cal-project-kind">
            <option value="session"${presetProjectKind === 'session' ? ' selected' : ''}>코칭 일정</option>
            <option value="milestone"${presetProjectKind === 'milestone' ? ' selected' : ''}>마일스톤</option>
          </select>
        </div>
        <div class="form-group">
          <label>제목 *</label>
          <input name="title" required placeholder="예: 중간 발표 리허설" />
        </div>
        <div class="form-group">
          <label>설명</label>
          <textarea name="description" rows="3" placeholder="필요 시 일정 설명을 입력하세요"></textarea>
        </div>
        <div class="form-group" id="cal-project-row" style="display:none;">
          <label>대상 과제 *</label>
          <select name="project_id">
            <option value="">선택</option>
            ${selectableProjects.map((p) => `<option value="${p.project_id}"${Number(presetProjectId) === p.project_id ? ' selected' : ''}>${Fmt.escape(p.project_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="cal-coach-row" style="display:none;">
          <label>참석 코치 (복수 선택)</label>
          <div class="cal-coach-grid">
            ${coaches.map((coach) => `<label><input type="checkbox" name="coach_ids" value="${coach.user_id}" /> ${Fmt.escape(coach.name)} (${Fmt.escape(coach.emp_id)})</label>`).join('') || '<p class="empty-state">선택 가능한 코치가 없습니다.</p>'}
          </div>
        </div>
        <div class="form-group" id="cal-schedule-type-row">
          <label>일정 카테고리</label>
          <select name="schedule_type">
            <option value="orientation">오리엔테이션</option>
            <option value="workshop">워크샵</option>
            <option value="mid_presentation">중간발표</option>
            <option value="final_presentation">최종발표</option>
            <option value="networking">네트워킹</option>
            <option value="other" selected>기타</option>
          </select>
        </div>
        <div class="form-group" id="cal-all-day-row">
          <label><input type="checkbox" name="is_all_day" /> 종일 일정</label>
        </div>
        <div class="form-group cal-time-row" id="cal-time-row-wrap">
          <div>
            <label>날짜 *</label>
            <input type="date" name="event_date" value="${Fmt.escape(presetDate)}" required />
          </div>
          <div>
            <label>시작 시간 *</label>
            <input type="time" name="start_time" value="10:00" required />
          </div>
          <div>
            <label>종료 시간 *</label>
            <input type="time" name="end_time" value="11:00" required />
          </div>
        </div>
        <div class="form-group" id="cal-location-row">
          <label>장소</label>
          <input name="location" placeholder="예: 회의실 A / 온라인" />
        </div>
        <div class="form-group cal-repeat-row">
          <div>
            <label>반복</label>
            <select name="repeat_type">
              <option value="none" selected>반복 없음</option>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="biweekly">격주</option>
              <option value="monthly">매월</option>
            </select>
          </div>
          <div>
            <label>반복 횟수</label>
            <input type="number" min="1" max="30" name="repeat_count" value="1" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p class="form-error" id="calendar-event-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const scopeEl = document.getElementById('cal-event-scope');
    const projectKindEl = document.getElementById('cal-project-kind');
    const projectKindRow = document.getElementById('cal-project-kind-row');
    const projectRow = document.getElementById('cal-project-row');
    const coachRow = document.getElementById('cal-coach-row');
    const scheduleTypeRow = document.getElementById('cal-schedule-type-row');
    const allDayRow = document.getElementById('cal-all-day-row');
    const timeRowWrap = document.getElementById('cal-time-row-wrap');
    const locationRow = document.getElementById('cal-location-row');
    const startTimeInput = document.querySelector('input[name="start_time"]');
    const endTimeInput = document.querySelector('input[name="end_time"]');
    if (!allowGlobalScope && presetProjectId == null && selectableProjects.length === 1) {
      document.querySelector('select[name="project_id"]').value = String(selectableProjects[0].project_id);
    }
    const syncScope = () => {
      const isProject = allowGlobalScope ? scopeEl.value === 'project' : true;
      const isMilestone = isProject && projectKindEl.value === 'milestone';
      projectRow.style.display = isProject ? '' : 'none';
      projectKindRow.style.display = isProject ? '' : 'none';
      coachRow.style.display = allowGlobalScope && isProject && !isMilestone ? '' : 'none';
      scheduleTypeRow.style.display = isProject ? 'none' : '';
      allDayRow.style.display = isMilestone ? 'none' : '';
      timeRowWrap.style.display = '';
      locationRow.style.display = isMilestone ? 'none' : '';
      if (startTimeInput && endTimeInput) {
        startTimeInput.disabled = isMilestone;
        endTimeInput.disabled = isMilestone;
        if (isMilestone) {
          startTimeInput.value = '00:00';
          endTimeInput.value = '00:00';
        } else if (!startTimeInput.value || !endTimeInput.value) {
          startTimeInput.value = startTimeInput.value || '10:00';
          endTimeInput.value = endTimeInput.value || '11:00';
        }
      }
    };
    if (allowGlobalScope) {
      scopeEl.addEventListener('change', syncScope);
    }
    projectKindEl.addEventListener('change', syncScope);
    syncScope();

    document.getElementById('calendar-event-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const scope = allowGlobalScope ? (fd.get('scope') || 'global').toString() : 'project';
      const projectEventKind = (fd.get('project_event_kind') || 'session').toString();
      const title = (fd.get('title') || '').toString().trim();
      const description = (fd.get('description') || '').toString().trim();
      const date = (fd.get('event_date') || '').toString();
      const startTime = (fd.get('start_time') || '').toString() || '00:00';
      const endTime = (fd.get('end_time') || '').toString() || startTime;
      const location = (fd.get('location') || '').toString().trim();
      const scheduleType = (fd.get('schedule_type') || 'other').toString();
      const repeatType = (fd.get('repeat_type') || 'none').toString();
      const repeatCount = (fd.get('repeat_count') || '1').toString();
      const isAllDay = fd.has('is_all_day');
      const projectId = Number.parseInt((fd.get('project_id') || '').toString(), 10);
      const coachIds = fd.getAll('coach_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));

      const errEl = document.getElementById('calendar-event-err');
      errEl.style.display = 'none';

      if (!title || !date) {
        errEl.textContent = '제목과 날짜를 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      if (scope === 'project' && Number.isNaN(projectId)) {
        errEl.textContent = '대상 과제를 선택하세요.';
        errEl.style.display = 'block';
        return;
      }

      const dates = this._buildRepeatingDates(date, repeatType, repeatCount);
      if (!dates.length) {
        errEl.textContent = '반복 일정 계산에 실패했습니다.';
        errEl.style.display = 'block';
        return;
      }

      try {
        for (const dateStr of dates) {
          if (scope === 'global') {
            await API.createSchedule({
              batch_id: batchId,
              title,
              description: description || null,
              schedule_type: scheduleType,
              start_datetime: this._toDateTimeString(dateStr, isAllDay ? '00:00' : startTime),
              end_datetime: this._toDateTimeString(dateStr, isAllDay ? '23:59' : endTime),
              location: location || null,
              is_all_day: isAllDay,
            });
          } else if (projectEventKind === 'milestone') {
            await API.createTask(projectId, {
              title,
              description: description || null,
              due_date: dateStr,
              priority: 'medium',
              status: 'todo',
              is_milestone: true,
            });
          } else {
            const createdSession = await API.createSession({
              batch_id: batchId,
              project_id: projectId,
              session_date: dateStr,
              start_time: isAllDay ? '00:00' : startTime,
              end_time: isAllDay ? '23:59' : endTime,
              location: location || null,
              note: title,
            });
            if (allowGlobalScope) {
              for (const coachId of coachIds) {
                await API.addSessionAttendee(createdSession.session_id, {
                  user_id: coachId,
                  attendee_role: 'coach',
                });
              }
            }
          }
        }

        Modal.close();
        await this._renderView(batchId, policy);
      } catch (err) {
        errEl.textContent = err.message || '일정 저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  _openEventDetailModal(event, batchId, policy) {
    const coachLine = event.coach_names && event.coach_names.length
      ? event.coach_names.join(', ')
      : '-';
    const canEdit = (
      (policy.isAdmin && (event.manage_type === 'schedule' || event.manage_type === 'session' || event.manage_type === 'task'))
      || (policy.isParticipant && event.scope === 'project' && (event.manage_type === 'session' || event.manage_type === 'task'))
    );
    const canDelete = (
      (policy.isAdmin && (event.manage_type === 'schedule' || event.manage_type === 'session' || event.manage_type === 'task'))
      || (policy.isParticipant && event.scope === 'project' && (event.manage_type === 'session' || event.manage_type === 'task'))
    );

    Modal.open(`<h2>일정 상세</h2>
      <div class="info-grid">
        <div class="info-item full"><label>제목</label><span>${Fmt.escape(event.title || '-')}</span></div>
        <div class="info-item"><label>유형</label><span>${Fmt.escape(event.event_type || '-')}</span></div>
        <div class="info-item"><label>공개 범위</label><span>${Fmt.escape(event.scope || '-')}</span></div>
        <div class="info-item"><label>시작</label><span>${Fmt.escape(this._formatDateTimeValue(event.start))}</span></div>
        <div class="info-item"><label>종료</label><span>${Fmt.escape(this._formatDateTimeValue(event.end))}</span></div>
        <div class="info-item"><label>장소</label><span>${Fmt.escape(event.location || '-')}</span></div>
        <div class="info-item"><label>과제</label><span>${Fmt.escape(event.project_name || '-')}</span></div>
        <div class="info-item"><label>코치 배정</label><span>${Fmt.escape(coachLine)}</span></div>
        <div class="info-item full"><label>설명</label><span>${Fmt.escape(event.description || '-')}</span></div>
      </div>
      ${(canEdit || canDelete) ? `<div class="page-actions">
        ${canEdit ? '<button id="cal-edit-event-btn" class="btn btn-secondary">일정 수정</button>' : ''}
        ${canDelete ? '<button id="cal-delete-event-btn" class="btn btn-danger">일정 삭제</button>' : ''}
      </div>` : ''}`);

    document.getElementById('cal-edit-event-btn')?.addEventListener('click', async () => {
      await this._openEventEditModal(event, batchId, policy);
    });

    document.getElementById('cal-delete-event-btn')?.addEventListener('click', async () => {
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      try {
        if (event.manage_type === 'schedule') {
          await API.deleteSchedule(event.id);
        } else if (event.manage_type === 'session') {
          await API.deleteSession(event.id);
        } else if (event.manage_type === 'task') {
          await API.deleteTask(event.id);
        }
        Modal.close();
        await this._renderView(batchId, policy);
      } catch (err) {
        alert(err.message || '일정 삭제 실패');
      }
    });
  },

  async _openEventEditModal(event, batchId, policy) {
    const kind = event.manage_type;
    const initialTitle = this._stripProjectPrefix(event.title || '');
    const initialDesc = event.description || '';
    const initialDate = this._toDateInputValue(event.start);
    const initialStart = this._toTimeInputValue(event.start) || '10:00';
    const initialEnd = this._toTimeInputValue(event.end) || initialStart || '11:00';
    const isTask = kind === 'task';
    const isSchedule = kind === 'schedule';
    const isSession = kind === 'session';

    if (!isTask && !isSchedule && !isSession) {
      alert('수정할 수 없는 일정 유형입니다.');
      return;
    }

    Modal.open(`<h2>일정 수정</h2>
      <form id="calendar-event-edit-form">
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(initialTitle)}" /></div>
        <div class="form-group"><label>설명</label><textarea name="description" rows="3">${Fmt.escape(initialDesc)}</textarea></div>
        <div class="form-group cal-time-row">
          <div>
            <label>날짜 *</label>
            <input type="date" name="event_date" value="${Fmt.escape(initialDate)}" required />
          </div>
          <div ${isTask ? 'style="display:none;"' : ''}>
            <label>시작 시간 *</label>
            <input type="time" name="start_time" value="${Fmt.escape(initialStart)}" ${isTask ? '' : 'required'} />
          </div>
          <div ${isTask ? 'style="display:none;"' : ''}>
            <label>종료 시간 *</label>
            <input type="time" name="end_time" value="${Fmt.escape(initialEnd)}" ${isTask ? '' : 'required'} />
          </div>
        </div>
        <div class="form-group" ${isTask ? 'style="display:none;"' : ''}>
          <label>장소</label>
          <input name="location" value="${Fmt.escape(event.location || '')}" />
        </div>
        <div class="form-group" ${isTask ? '' : 'style="display:none;"'}>
          <label>상태</label>
          <select name="status">
            <option value="todo"${(event.status || 'todo') === 'todo' ? ' selected' : ''}>todo</option>
            <option value="in_progress"${event.status === 'in_progress' ? ' selected' : ''}>in_progress</option>
            <option value="completed"${event.status === 'completed' ? ' selected' : ''}>completed</option>
            <option value="cancelled"${event.status === 'cancelled' ? ' selected' : ''}>cancelled</option>
          </select>
        </div>
        <div class="page-actions"><button type="submit" class="btn btn-primary">저장</button></div>
        <p class="form-error" id="calendar-event-edit-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    document.getElementById('calendar-event-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = (fd.get('title') || '').toString().trim();
      const description = (fd.get('description') || '').toString().trim() || null;
      const eventDate = (fd.get('event_date') || '').toString();
      const startTime = (fd.get('start_time') || '').toString() || '10:00';
      const endTime = (fd.get('end_time') || '').toString() || startTime;
      const location = (fd.get('location') || '').toString().trim() || null;
      const status = (fd.get('status') || 'todo').toString();
      const errEl = document.getElementById('calendar-event-edit-err');
      errEl.style.display = 'none';

      if (!title || !eventDate) {
        errEl.textContent = '제목과 날짜를 입력하세요.';
        errEl.style.display = 'block';
        return;
      }

      try {
        if (kind === 'schedule') {
          await API.updateSchedule(event.id, {
            title,
            description,
            schedule_type: event.schedule_type || 'other',
            start_datetime: this._toDateTimeString(eventDate, startTime),
            end_datetime: this._toDateTimeString(eventDate, endTime),
            location,
            is_all_day: !!event.is_all_day,
          });
        } else if (kind === 'session') {
          await API.updateSession(event.id, {
            session_date: eventDate,
            start_time: startTime,
            end_time: endTime,
            location,
            note: title,
          });
        } else if (kind === 'task') {
          await API.updateTask(event.id, {
            title,
            description,
            due_date: eventDate,
            status,
          });
        }
        Modal.close();
        await this._renderView(batchId, policy);
      } catch (err) {
        errEl.textContent = err.message || '일정 수정 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
