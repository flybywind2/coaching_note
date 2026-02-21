/**
 * Calendar 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.calendar = {
  currentDate: new Date(),
  viewMode: 'month',
  selectedProjectByBatch: {},
  projectOptionsByBatch: {},

  async render(el) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const role = user.role;
      const policy = {
        role,
        isAdmin: role === 'admin',
        isParticipant: role === 'participant',
        canManageProjectEvents: role === 'admin' || role === 'participant',
      };

      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }
      const batchId = State.get('currentBatchId') || batches[0].batch_id;
      State.set('currentBatchId', batchId);

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
              <select id="cal-project-filter"></select>
              ${policy.canManageProjectEvents ? '<button id="cal-add-event-btn" class="btn btn-sm btn-primary">+ 일정 추가</button>' : ''}
              <button id="cal-prev" class="btn btn-sm">◀</button>
              <span id="cal-month-label" class="cal-month"></span>
              <button id="cal-next" class="btn btn-sm">▶</button>
            </div>
          </div>
          <div id="cal-grid" class="cal-grid"></div>
          <div class="cal-legend">
            <span class="legend-item"><span class="dot" style="background:#4CAF50"></span>공통 일정</span>
            <span class="legend-item"><span class="dot" style="background:#2196F3"></span>과제 일정</span>
            <span class="legend-item"><span class="dot" style="background:#8A5CF6"></span>마일스톤</span>
          </div>
        </div>`;

      const getBatchId = () => parseInt(document.getElementById('cal-batch').value, 10);

      document.getElementById('cal-prev').addEventListener('click', async () => {
        this._shiftWindow(-1);
        await this._renderView(getBatchId(), policy);
      });
      document.getElementById('cal-next').addEventListener('click', async () => {
        this._shiftWindow(1);
        await this._renderView(getBatchId(), policy);
      });
      document.getElementById('cal-batch').addEventListener('change', async (e) => {
        const changedBatch = parseInt(e.target.value, 10);
        State.set('currentBatchId', changedBatch);
        await this._loadProjectFilter(changedBatch, policy);
        await this._renderView(changedBatch, policy);
      });
      document.getElementById('cal-view-mode').addEventListener('change', async (e) => {
        this.viewMode = e.target.value;
        await this._renderView(getBatchId(), policy);
      });
      document.getElementById('cal-project-filter').addEventListener('change', async (e) => {
        const value = (e.target.value || '').trim();
        this.selectedProjectByBatch[getBatchId()] = value ? parseInt(value, 10) : null;
        await this._renderView(getBatchId(), policy);
      });
      document.getElementById('cal-add-event-btn')?.addEventListener('click', async () => {
        const selectedProjectId = this._getSelectedProjectId(getBatchId());
        await this._openEventCreateModal(getBatchId(), {
          policy,
          presetScope: policy.isParticipant ? 'project' : (selectedProjectId ? 'project' : 'global'),
          presetProjectId: selectedProjectId,
        });
      });

      await this._loadProjectFilter(batchId, policy);
      await this._renderView(batchId, policy);
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async _loadProjectFilter(batchId, policy) {
    const selectEl = document.getElementById('cal-project-filter');
    if (!selectEl) return;

    const projects = await API.getProjects(batchId).catch(() => []);
    const visibleProjects = policy.isParticipant ? projects.filter((p) => p.is_my_project) : projects;
    this.projectOptionsByBatch[batchId] = visibleProjects;

    const options = [];
    if (!policy.isParticipant) {
      options.push('<option value="">공통 캘린더</option>');
    }
    options.push(...visibleProjects.map((p) => `<option value="${p.project_id}">${Fmt.escape(p.project_name)}</option>`));

    if (!options.length) {
      selectEl.innerHTML = '<option value="">선택 가능한 과제가 없습니다</option>';
      selectEl.disabled = true;
      this.selectedProjectByBatch[batchId] = null;
      return;
    }

    selectEl.innerHTML = options.join('');
    selectEl.disabled = false;

    const selected = this.selectedProjectByBatch[batchId];
    const availableIds = visibleProjects.map((p) => p.project_id);
    if (selected && availableIds.includes(selected)) {
      selectEl.value = String(selected);
      return;
    }

    if (policy.isParticipant) {
      const fallback = visibleProjects[0]?.project_id || null;
      this.selectedProjectByBatch[batchId] = fallback;
      selectEl.value = fallback ? String(fallback) : '';
      return;
    }

    this.selectedProjectByBatch[batchId] = null;
    selectEl.value = '';
  },

  _getSelectedProjectId(batchId) {
    const value = this.selectedProjectByBatch[batchId];
    return Number.isInteger(value) ? value : null;
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
    const diff = (day + 6) % 7;
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

  _eventChip(ev, maxLen = 20) {
    const payload = encodeURIComponent(JSON.stringify(ev));
    const title = Fmt.escape(ev.title || '이벤트');
    let label = (ev.title || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    if (!label) label = ev.title || '이벤트';
    const color = ev.color || '#4CAF50';
    return `<button type="button" class="cal-event cal-event-btn" data-event="${this._escapeAttr(payload)}" style="background:${Fmt.escape(color)}" title="${title}">${Fmt.escape(label.slice(0, maxLen))}</button>`;
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
      const projectId = this._getSelectedProjectId(batchId);
      const calendarData = await API.getCalendar(batchId, start, end, projectId);
      const events = calendarData.events || [];

      grid.innerHTML = this._renderMonthGrid(year, month, events);
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
      const dayEvents = (eventsByDate[dateStr] || []).sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
      const isToday = dateStr === todayKey;

      html += `<div class="cal-day cal-day-clickable${isToday ? ' today' : ''}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        ${dayEvents.slice(0, 3).map((ev) => this._eventChip(ev, 20)).join('')}
        ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3}</div>` : ''}
      </div>`;
    }
    html += '</div>';
    return html;
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
      const projectId = this._getSelectedProjectId(batchId);
      const [calendarData, projects] = await Promise.all([
        API.getCalendar(batchId, start, end, projectId),
        API.getProjects(batchId).catch(() => []),
      ]);
      const allEvents = calendarData.events || [];
      const milestones = allEvents.filter((ev) => ev.event_type === 'milestone');

      const visibleProjects = policy.isParticipant ? projects.filter((p) => p.is_my_project) : projects;
      const projectMap = {};
      const orderedProjectIds = [];
      visibleProjects.forEach((p) => {
        projectMap[p.project_id] = p.project_name;
      });

      if (projectId) {
        orderedProjectIds.push(projectId);
        if (!projectMap[projectId]) {
          const fromEvent = milestones.find((row) => row.project_id === projectId);
          projectMap[projectId] = fromEvent?.project_name || `프로젝트 ${projectId}`;
        }
      } else {
        milestones.forEach((ev) => {
          if (!projectMap[ev.project_id]) {
            projectMap[ev.project_id] = ev.project_name || `프로젝트 ${ev.project_id}`;
          }
        });
        Object.keys(projectMap).forEach((pid) => orderedProjectIds.push(parseInt(pid, 10)));
      }

      const weekStarts = Array.from({ length: 10 }, (_, i) => {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        d.setDate(d.getDate() + (i * 7));
        return d;
      });

      const cellMap = {};
      milestones.forEach((ev) => {
        if (projectId && ev.project_id !== projectId) return;
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
          // malformed payload ignore
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

        const selectedProjectId = this._getSelectedProjectId(batchId);
        const presetScope = policy.isParticipant ? 'project' : (selectedProjectId ? 'project' : 'global');
        await this._openEventCreateModal(batchId, {
          presetDate,
          presetScope,
          presetProjectId: selectedProjectId,
          policy,
        });
      });
    });
  },

  _buildRepeatingDates(baseDateStr, repeatType, repeatEndDate, maxEndDate) {
    const base = new Date(`${baseDateStr}T00:00:00`);
    if (Number.isNaN(base.getTime())) return [];

    const hardEnd = repeatEndDate ? new Date(`${repeatEndDate}T00:00:00`) : base;
    if (Number.isNaN(hardEnd.getTime())) return [];
    if (hardEnd < base) return [];

    const batchEnd = maxEndDate ? new Date(`${maxEndDate}T00:00:00`) : null;
    if (batchEnd && !Number.isNaN(batchEnd.getTime()) && hardEnd > batchEnd) {
      return [];
    }

    if (repeatType === 'none') return [baseDateStr];

    const rows = [];
    const endLimit = hardEnd;
    let cursor = new Date(base.getTime());
    let guard = 0;
    while (cursor <= endLimit && guard < 260) {
      rows.push(this._toDateKey(cursor));
      if (repeatType === 'daily') {
        cursor.setDate(cursor.getDate() + 1);
      } else if (repeatType === 'weekly') {
        cursor.setDate(cursor.getDate() + 7);
      } else if (repeatType === 'biweekly') {
        cursor.setDate(cursor.getDate() + 14);
      } else if (repeatType === 'monthly') {
        cursor.setMonth(cursor.getMonth() + 1);
      } else {
        break;
      }
      guard += 1;
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
    if (text.includes('T')) return text.slice(11, 16);
    return text.slice(0, 5);
  },

  _stripProjectPrefix(title) {
    return String(title || '').replace(/^\[[^\]]+\]\s*/, '').trim();
  },

  _formatDateTimeValue(value) {
    if (!value) return '-';
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct.toLocaleString('ko-KR');
    return String(value);
  },

  _formatEventPeriod(event) {
    if (event.is_all_day) {
      const dateText = this._toDateInputValue(event.start || event.end);
      return `${dateText || '-'} (종일 일정)`;
    }
    const startText = this._formatDateTimeValue(event.start);
    const endText = this._formatDateTimeValue(event.end);
    if (!event.end) return startText;
    return `${startText} ~ ${endText}`;
  },

  _coachPlanLabel(row) {
    if (!row) return '-';
    if (row.is_all_day) return `${row.coach_name} (종일)`;
    if (row.start_time && row.end_time) return `${row.coach_name} (${row.start_time}~${row.end_time})`;
    return row.coach_name;
  },

  async _openEventCreateModal(batchId, options = {}) {
    const {
      presetDate = '',
      presetScope = 'global',
      presetProjectId = null,
      policy = { isAdmin: false, isParticipant: false, canManageProjectEvents: false },
    } = options;

    const allowGlobalScope = policy.isAdmin;
    const scopeValue = policy.isParticipant ? 'project' : presetScope;
    const [projects, batch] = await Promise.all([
      API.getProjects(batchId).catch(() => []),
      API.getBatch(batchId),
    ]);

    const selectableProjects = policy.isParticipant ? projects.filter((p) => p.is_my_project) : projects;
    if (policy.canManageProjectEvents && scopeValue === 'project' && !selectableProjects.length) {
      alert('일정을 관리할 수 있는 과제가 없습니다.');
      return;
    }

    Modal.open(`<h2>일정 추가</h2>
      <form id="calendar-event-form">
        <div class="form-group"${allowGlobalScope ? '' : ' style="display:none;"'}>
          <label>공개 범위 *</label>
          <select name="scope" id="cal-event-scope">
            <option value="global"${scopeValue === 'global' ? ' selected' : ''}>공통 일정</option>
            <option value="project"${scopeValue === 'project' ? ' selected' : ''}>과제 일정</option>
          </select>
        </div>
        ${allowGlobalScope ? '' : '<input type="hidden" name="scope" value="project" />'}
        <div class="form-group" id="cal-project-row" style="display:none;">
          <label>대상 과제 *</label>
          <select name="project_id" id="cal-project-select">
            <option value="">선택</option>
            ${selectableProjects.map((p) => `<option value="${p.project_id}"${Number(presetProjectId) === p.project_id ? ' selected' : ''}>${Fmt.escape(p.project_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>제목 *</label>
          <input name="title" required placeholder="예: 코칭 점검" />
        </div>
        <div class="form-group" id="cal-color-row">
          <label>색상</label>
          <input type="color" name="color" value="#4caf50" />
        </div>
        <div class="form-group">
          <label>설명</label>
          <textarea name="description" rows="3" placeholder="필요 시 일정 설명을 입력하세요"></textarea>
        </div>
        <div class="form-group" id="cal-all-day-row">
          <label><input type="checkbox" name="is_all_day" /> 종일 일정</label>
        </div>
        <div class="form-group cal-time-row">
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
        <div class="form-group">
          <label>장소</label>
          <input name="location" placeholder="예: 회의실 A / 온라인" />
        </div>
        <div class="form-group cal-repeat-row" id="cal-repeat-row">
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
            <label>반복 종료일</label>
            <input type="date" name="repeat_end_date" max="${Fmt.escape(String(batch.end_date || ''))}" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p class="form-error" id="calendar-event-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const scopeEl = document.getElementById('cal-event-scope');
    const projectRow = document.getElementById('cal-project-row');
    const colorRow = document.getElementById('cal-color-row');
    const repeatRow = document.getElementById('cal-repeat-row');
    const projectSelect = document.getElementById('cal-project-select');
    const allDayInput = document.querySelector('input[name="is_all_day"]');
    const startTimeInput = document.querySelector('input[name="start_time"]');
    const endTimeInput = document.querySelector('input[name="end_time"]');

    if (!allowGlobalScope && presetProjectId == null && selectableProjects.length === 1) {
      projectSelect.value = String(selectableProjects[0].project_id);
    }

    const syncScope = () => {
      const isProject = allowGlobalScope ? scopeEl.value === 'project' : true;
      projectRow.style.display = isProject ? '' : 'none';
      colorRow.style.display = isProject ? 'none' : '';
      repeatRow.style.display = isProject ? 'none' : '';
      if (isProject && !projectSelect.value && selectableProjects.length === 1) {
        projectSelect.value = String(selectableProjects[0].project_id);
      }
    };

    const syncAllDay = () => {
      const isAllDay = !!allDayInput.checked;
      startTimeInput.disabled = isAllDay;
      endTimeInput.disabled = isAllDay;
      if (isAllDay) {
        startTimeInput.value = '00:00';
        endTimeInput.value = '23:59';
      }
    };

    if (allowGlobalScope) scopeEl.addEventListener('change', syncScope);
    allDayInput.addEventListener('change', syncAllDay);
    syncScope();
    syncAllDay();

    document.getElementById('calendar-event-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const scope = allowGlobalScope ? (fd.get('scope') || 'global').toString() : 'project';
      const title = (fd.get('title') || '').toString().trim();
      const description = (fd.get('description') || '').toString().trim();
      const date = (fd.get('event_date') || '').toString();
      const startTime = (fd.get('start_time') || '').toString() || '00:00';
      const endTime = (fd.get('end_time') || '').toString() || startTime;
      const location = (fd.get('location') || '').toString().trim();
      const isAllDay = fd.has('is_all_day');
      const projectId = Number.parseInt((fd.get('project_id') || '').toString(), 10);
      const repeatType = (fd.get('repeat_type') || 'none').toString();
      const repeatEndDate = (fd.get('repeat_end_date') || '').toString() || date;
      const color = (fd.get('color') || '#4CAF50').toString();

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

      const dates = scope === 'global'
        ? this._buildRepeatingDates(date, repeatType, repeatEndDate, String(batch.end_date || ''))
        : [date];
      if (!dates.length) {
        errEl.textContent = '반복 종료일이 올바르지 않거나 차수 종료일을 초과했습니다.';
        errEl.style.display = 'block';
        return;
      }

      try {
        const repeatGroupId = dates.length > 1 ? `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null;
        for (let i = 0; i < dates.length; i += 1) {
          const dateStr = dates[i];
          if (scope === 'global') {
            await API.createSchedule({
              batch_id: batchId,
              title,
              description: description || null,
              schedule_type: 'other',
              start_datetime: this._toDateTimeString(dateStr, isAllDay ? '00:00' : startTime),
              end_datetime: this._toDateTimeString(dateStr, isAllDay ? '23:59' : endTime),
              location: location || null,
              is_all_day: isAllDay,
              color,
              repeat_group_id: repeatGroupId,
              repeat_sequence: i + 1,
            });
          } else {
            await API.createSession({
              batch_id: batchId,
              project_id: projectId,
              session_date: dateStr,
              start_time: isAllDay ? '00:00' : startTime,
              end_time: isAllDay ? '23:59' : endTime,
              location: location || null,
              note: title,
            });
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
    const coachPlans = Array.isArray(event.coach_plans) ? event.coach_plans : [];
    const canEdit = (
      (policy.isAdmin && ['schedule', 'session', 'task'].includes(event.manage_type))
      || (policy.isParticipant && event.scope === 'project' && ['session', 'task'].includes(event.manage_type))
    );
    const canDelete = canEdit;

    const lines = [];
    lines.push(`<div class="info-item full"><label>제목</label><span>${Fmt.escape(event.title || '-')}</span></div>`);
    if (event.project_name) lines.push(`<div class="info-item full"><label>과제</label><span>${Fmt.escape(event.project_name)}</span></div>`);
    lines.push(`<div class="info-item full"><label>일정</label><span>${Fmt.escape(this._formatEventPeriod(event))}</span></div>`);
    if (event.location) lines.push(`<div class="info-item"><label>장소</label><span>${Fmt.escape(event.location)}</span></div>`);
    if (event.description) lines.push(`<div class="info-item full"><label>설명</label><span>${Fmt.escape(event.description)}</span></div>`);
    if (event.scope) lines.push(`<div class="info-item"><label>공개 범위</label><span>${Fmt.escape(event.scope === 'global' ? '공통' : '과제')}</span></div>`);
    if (coachPlans.length) {
      lines.push(`<div class="info-item full"><label>참여 코치</label><span>${Fmt.escape(coachPlans.map((row) => this._coachPlanLabel(row)).join(', '))}</span></div>`);
    }

    Modal.open(`<h2>일정 상세</h2>
      <div class="info-grid">${lines.join('')}</div>
      ${(canEdit || canDelete) ? `<div class="page-actions">
        ${canEdit ? '<button id="cal-edit-event-btn" class="btn btn-secondary">일정 수정</button>' : ''}
        ${canDelete ? '<button id="cal-delete-event-btn" class="btn btn-danger">일정 삭제</button>' : ''}
      </div>` : ''}`);

    document.getElementById('cal-edit-event-btn')?.addEventListener('click', async () => {
      await this._openEventEditModal(event, batchId, policy);
    });

    document.getElementById('cal-delete-event-btn')?.addEventListener('click', async () => {
      let deleteSeries = false;
      if (event.manage_type === 'schedule' && event.repeat_group_id) {
        deleteSeries = confirm('반복 일정 전체를 삭제하려면 확인을 누르세요.\n취소를 누르면 이번 일정만 삭제합니다.');
      }
      if (!confirm(deleteSeries ? '반복 일정 전체를 삭제하시겠습니까?' : '이 일정을 삭제하시겠습니까?')) return;

      try {
        if (event.manage_type === 'schedule') {
          if (deleteSeries) await API.deleteScheduleSeries(event.id);
          else await API.deleteSchedule(event.id);
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
        ${event.project_name ? `<div class="form-group"><label>과제</label><input disabled value="${Fmt.escape(event.project_name)}" /></div>` : ''}
        ${isSchedule ? `<div class="form-group"><label>색상</label><input type="color" name="color" value="${Fmt.escape((event.color || '#4CAF50').toLowerCase())}" /></div>` : ''}
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
        ${isSchedule ? `<div class="form-group"><label><input type="checkbox" name="is_all_day" ${event.is_all_day ? 'checked' : ''} /> 종일 일정</label></div>` : ''}
        <div class="form-group" ${isTask ? 'style="display:none;"' : ''}>
          <label>장소</label>
          <input name="location" value="${Fmt.escape(event.location || '')}" />
        </div>
        ${isTask ? `<div class="form-group">
          <label>상태</label>
          <select name="status">
            <option value="todo"${(event.status || 'todo') === 'todo' ? ' selected' : ''}>todo</option>
            <option value="in_progress"${event.status === 'in_progress' ? ' selected' : ''}>in_progress</option>
            <option value="completed"${event.status === 'completed' ? ' selected' : ''}>completed</option>
            <option value="cancelled"${event.status === 'cancelled' ? ' selected' : ''}>cancelled</option>
          </select>
        </div>` : ''}
        ${isSchedule && event.repeat_group_id ? `<div class="form-group">
          <label>수정 범위</label>
          <select name="apply_scope">
            <option value="single">이번 일정만</option>
            <option value="series">반복 일정 전체</option>
          </select>
        </div>` : ''}
        <div class="page-actions"><button type="submit" class="btn btn-primary">저장</button></div>
        <p class="form-error" id="calendar-event-edit-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const allDayToggle = document.querySelector('#calendar-event-edit-form input[name="is_all_day"]');
    const startInput = document.querySelector('#calendar-event-edit-form input[name="start_time"]');
    const endInput = document.querySelector('#calendar-event-edit-form input[name="end_time"]');
    const syncAllDay = () => {
      if (!allDayToggle || !startInput || !endInput) return;
      const checked = allDayToggle.checked;
      startInput.disabled = checked;
      endInput.disabled = checked;
      if (checked) {
        startInput.value = '00:00';
        endInput.value = '23:59';
      }
    };
    allDayToggle?.addEventListener('change', syncAllDay);
    syncAllDay();

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
          const schedulePayload = {
            title,
            description,
            schedule_type: event.schedule_type || 'other',
            start_datetime: this._toDateTimeString(eventDate, allDayToggle?.checked ? '00:00' : startTime),
            end_datetime: this._toDateTimeString(eventDate, allDayToggle?.checked ? '23:59' : endTime),
            location,
            is_all_day: !!allDayToggle?.checked,
            color: (fd.get('color') || event.color || '#4CAF50').toString(),
          };
          const applyScope = (fd.get('apply_scope') || 'single').toString();
          if (event.repeat_group_id && applyScope === 'series') {
            await API.updateScheduleSeries(event.id, schedulePayload);
          } else {
            await API.updateSchedule(event.id, schedulePayload);
          }
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
