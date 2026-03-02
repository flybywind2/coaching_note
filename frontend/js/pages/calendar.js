/**
 * Calendar 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.calendar = {
  currentDate: new Date(),
  selectedProjectByBatch: {},
  projectOptionsByBatch: {},
  scheduleColorOptions: [
    { value: '#4CAF50', label: '그린' },
    { value: '#00ACC1', label: '민트' },
    { value: '#2196F3', label: '블루' },
    { value: '#3F51B5', label: '인디고' },
    { value: '#8E24AA', label: '퍼플' },
    { value: '#E57373', label: '레드' },
    { value: '#FF7043', label: '코랄' },
    { value: '#FF9800', label: '오렌지' },
    { value: '#FDD835', label: '옐로우' },
    { value: '#607D8B', label: '슬레이트' },
  ],

  async render(el) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      if (user.role === 'external_coach') {
        el.innerHTML = '<div class="error-state">외부코치는 캘린더에 접근할 수 없습니다.</div>';
        return;
      }
      const role = user.role;
      const policy = {
        role,
        isAdmin: role === 'admin',
        isParticipant: role === 'participant',
        canManageProjectEvents: ['admin', 'participant', 'coach', 'internal_coach'].includes(role),
      };

      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }
      const batchId = State.get('currentBatchId') || batches[0].batch_id;
      State.set('currentBatchId', batchId);

      // [FEEDBACK7] 캘린더 범례에 강의일정을 추가합니다.
      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>캘린더</h1>
            <div class="cal-controls">
              <select id="cal-batch">${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}</select>
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
            <span class="legend-item"><span class="dot" style="background:#00ACC1"></span>코칭 일정</span>
            <span class="legend-item"><span class="dot" style="background:#2196F3"></span>과제 일정</span>
            <span class="legend-item"><span class="dot" style="background:#8E24AA"></span>강의일정</span>
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
    this.currentDate.setMonth(this.currentDate.getMonth() + step);
  },

  _toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  _normalizeTimeValue(value) {
    if (!value) return '';
    const text = String(value).trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '';
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  },

  _timeOptions(selectedValue, { includeEmpty = false } = {}) {
    const selected = this._normalizeTimeValue(selectedValue);
    const options = [];
    if (includeEmpty) options.push('<option value="">선택</option>');
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 10) {
        const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        options.push(`<option value="${value}"${value === selected ? ' selected' : ''}>${value}</option>`);
      }
    }
    if (selected === '23:59') {
      options.push('<option value="23:59" selected>23:59</option>');
    }
    return options.join('');
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

  _formatMinutes(minutes) {
    const total = Number(minutes || 0);
    if (!total) return '0분';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m}분`;
    if (!m) return `${h}시간`;
    return `${h}시간 ${m}분`;
  },

  _coachActualLabel(row) {
    if (!row) return '-';
    const source = row.actual_source === 'override' ? '수동' : '자동';
    return `${row.coach_name} (${this._formatMinutes(row.final_minutes)} · ${source})`;
  },

  _scopeLabel(scope) {
    if (scope === 'global') return '공통';
    if (scope === 'coaching') return '코칭';
    if (scope === 'project') return '과제';
    if (scope === 'lecture') return '강의일정';
    return scope || '-';
  },

  _defaultScheduleColor(scope) {
    return scope === 'coaching' ? '#00ACC1' : '#4CAF50';
  },

  _normalizeScheduleColor(value, scope = 'global') {
    const text = String(value || '').trim().toUpperCase();
    const found = this.scheduleColorOptions.find((opt) => opt.value.toUpperCase() === text);
    return found ? found.value : this._defaultScheduleColor(scope);
  },

  _buildColorPaletteHtml(selectedColor, scope = 'global', inputName = 'color') {
    const normalized = this._normalizeScheduleColor(selectedColor, scope);
    return `
      <input type="hidden" name="${Fmt.escape(inputName)}" value="${Fmt.escape(normalized)}" />
      <div class="cal-color-palette" data-role="cal-color-palette" data-input-name="${Fmt.escape(inputName)}">
        ${this.scheduleColorOptions.map((opt) => `
          <button
            type="button"
            class="cal-color-swatch${opt.value === normalized ? ' active' : ''}"
            data-color="${Fmt.escape(opt.value)}"
            title="${Fmt.escape(opt.label)}"
            style="background:${Fmt.escape(opt.value)}"
            aria-label="${Fmt.escape(opt.label)}"
          ></button>
        `).join('')}
      </div>
    `;
  },

  _bindColorPalette(formEl, inputName = 'color') {
    if (!formEl) return;
    const hiddenInput = formEl.querySelector(`input[name="${inputName}"]`);
    const swatches = formEl.querySelectorAll('.cal-color-swatch');
    if (!hiddenInput || !swatches.length) return;
    swatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        const next = swatch.dataset.color || '';
        hiddenInput.value = next;
        swatches.forEach((node) => {
          node.classList.toggle('active', node.dataset.color === next);
        });
      });
    });
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
            <option value="coaching"${scopeValue === 'coaching' ? ' selected' : ''}>코칭 일정</option>
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
          ${this._buildColorPaletteHtml(this._defaultScheduleColor(scopeValue), scopeValue)}
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
            <select name="start_time" required>
              ${this._timeOptions('10:00')}
            </select>
          </div>
          <div>
            <label>종료 시간 *</label>
            <select name="end_time" required>
              ${this._timeOptions('11:00')}
            </select>
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
    const startTimeInput = document.querySelector('#calendar-event-form [name="start_time"]');
    const endTimeInput = document.querySelector('#calendar-event-form [name="end_time"]');
    const formEl = document.getElementById('calendar-event-form');

    if (!allowGlobalScope && presetProjectId == null && selectableProjects.length === 1) {
      projectSelect.value = String(selectableProjects[0].project_id);
    }

    const syncScope = () => {
      const isProject = allowGlobalScope ? scopeEl.value === 'project' : true;
      const isCoaching = allowGlobalScope ? scopeEl.value === 'coaching' : false;
      projectRow.style.display = isProject ? '' : 'none';
      colorRow.style.display = isProject ? 'none' : '';
      repeatRow.style.display = isProject ? 'none' : '';
      if (allowGlobalScope) {
        const colorRowEl = document.getElementById('cal-color-row');
        if (colorRowEl && !isProject) {
          const nextScope = isCoaching ? 'coaching' : 'global';
          colorRowEl.innerHTML = `<label>색상</label>${this._buildColorPaletteHtml(this._defaultScheduleColor(nextScope), nextScope)}`;
          this._bindColorPalette(formEl, 'color');
        }
      }
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
      } else {
        if (!startTimeInput.value) startTimeInput.value = '10:00';
        if (!endTimeInput.value) endTimeInput.value = '11:00';
      }
    };

    if (allowGlobalScope) scopeEl.addEventListener('change', syncScope);
    allDayInput.addEventListener('change', syncAllDay);
    this._bindColorPalette(formEl, 'color');
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

      const dates = scope === 'project'
        ? [date]
        : this._buildRepeatingDates(date, repeatType, repeatEndDate, String(batch.end_date || ''));
      if (scope !== 'project' && !dates.length) {
        errEl.textContent = '반복 종료일이 올바르지 않거나 차수 종료일을 초과했습니다.';
        errEl.style.display = 'block';
        return;
      }

      try {
        const repeatGroupId = dates.length > 1 ? `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null;
        for (let i = 0; i < dates.length; i += 1) {
          const dateStr = dates[i];
          if (scope === 'project') {
            await API.createSession({
              batch_id: batchId,
              project_id: projectId,
              session_date: dateStr,
              start_time: isAllDay ? '00:00' : startTime,
              end_time: isAllDay ? '23:59' : endTime,
              location: location || null,
              note: title,
            });
          } else {
            const isCoaching = scope === 'coaching';
            await API.createSchedule({
              batch_id: batchId,
              title,
              description: description || null,
              schedule_type: isCoaching ? 'coaching' : 'other',
              visibility_scope: isCoaching ? 'coaching' : 'global',
              start_datetime: this._toDateTimeString(dateStr, isAllDay ? '00:00' : startTime),
              end_datetime: this._toDateTimeString(dateStr, isAllDay ? '23:59' : endTime),
              location: location || null,
              is_all_day: isAllDay,
              color: this._normalizeScheduleColor(fd.get('color'), isCoaching ? 'coaching' : 'global'),
              repeat_group_id: repeatGroupId,
              repeat_sequence: i + 1,
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
    const coachActuals = Array.isArray(event.coach_actuals) ? event.coach_actuals : [];
    const canManageProjectSession = (
      policy.canManageProjectEvents
      && event.scope === 'project'
      && event.manage_type === 'session'
    );
    const canEdit = (
      (policy.isAdmin && ['schedule', 'session', 'lecture'].includes(event.manage_type)) // [feedback8] 관리자 캘린더 강의 수정 허용
      || canManageProjectSession
    );
    const canDelete = (
      (policy.isAdmin && ['schedule', 'session'].includes(event.manage_type))
      || canManageProjectSession
    );
    // [FEEDBACK7] 강의 일정 상세에서 강의 소개 페이지 링크 제공
    const canOpenLecturePage = event.manage_type === 'lecture' && !!event.link_url;

    const lines = [];
    lines.push(`<div class="info-item full"><label>제목</label><span>${Fmt.escape(event.title || '-')}</span></div>`);
    if (event.project_name) lines.push(`<div class="info-item full"><label>과제</label><span>${Fmt.escape(event.project_name)}</span></div>`);
    lines.push(`<div class="info-item full"><label>일정</label><span>${Fmt.escape(this._formatEventPeriod(event))}</span></div>`);
    if (event.location) lines.push(`<div class="info-item"><label>장소</label><span>${Fmt.escape(event.location)}</span></div>`);
    if (event.description) lines.push(`<div class="info-item full"><label>설명</label><span>${Fmt.escape(event.description)}</span></div>`);
    if (event.scope) lines.push(`<div class="info-item"><label>공개 범위</label><span>${Fmt.escape(this._scopeLabel(event.scope))}</span></div>`);
    if (coachPlans.length) {
      lines.push(`<div class="info-item full"><label>참여 코치</label><span>${Fmt.escape(coachPlans.map((row) => this._coachPlanLabel(row)).join(', '))}</span></div>`);
    }
    if (coachActuals.length) {
      lines.push(`<div class="info-item full"><label>코치 실적</label><span>${Fmt.escape(coachActuals.map((row) => this._coachActualLabel(row)).join(', '))}</span></div>`);
    }

    Modal.open(`<h2>일정 상세</h2>
      <div class="info-grid">${lines.join('')}</div>
      ${(canEdit || canDelete || canOpenLecturePage) ? `<div class="page-actions">
        ${canOpenLecturePage ? '<button id="cal-open-lecture-btn" class="btn btn-secondary">강의 소개 페이지 이동</button>' : ''}
        ${canEdit ? `<button id="cal-edit-event-btn" class="btn btn-secondary">${event.manage_type === 'lecture' ? '강의 수정' : '일정 수정'}</button>` : ''}
        ${canDelete ? '<button id="cal-delete-event-btn" class="btn btn-danger">일정 삭제</button>' : ''}
      </div>` : ''}`);

    document.getElementById('cal-open-lecture-btn')?.addEventListener('click', () => {
      Modal.close();
      Router.go(event.link_url);
    });

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
    const isLecture = kind === 'lecture';
    const initialTitle = this._stripProjectPrefix(event.title || '');
    const initialDesc = event.description || '';
    const initialDate = this._toDateInputValue(event.start);
    const initialStart = this._toTimeInputValue(event.start) || '10:00';
    const initialEnd = this._toTimeInputValue(event.end) || initialStart || '11:00';
    const isSchedule = kind === 'schedule';
    const isSession = kind === 'session';

    if (isLecture) {
      await this._openLectureEditModal(event, batchId, policy);
      return;
    }

    if (!isSchedule && !isSession) {
      alert('수정할 수 없는 일정 유형입니다.');
      return;
    }

    Modal.open(`<h2>일정 수정</h2>
      <form id="calendar-event-edit-form">
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(initialTitle)}" /></div>
        ${event.project_name ? `<div class="form-group"><label>과제</label><input disabled value="${Fmt.escape(event.project_name)}" /></div>` : ''}
        ${isSchedule ? `<div class="form-group"><label>색상</label>${this._buildColorPaletteHtml(event.color, event.scope === 'coaching' ? 'coaching' : 'global')}</div>` : ''}
        <div class="form-group"><label>설명</label><textarea name="description" rows="3">${Fmt.escape(initialDesc)}</textarea></div>
        <div class="form-group cal-time-row">
          <div>
            <label>날짜 *</label>
            <input type="date" name="event_date" value="${Fmt.escape(initialDate)}" required />
          </div>
          <div>
            <label>시작 시간 *</label>
            <select name="start_time" required>
              ${this._timeOptions(initialStart)}
            </select>
          </div>
          <div>
            <label>종료 시간 *</label>
            <select name="end_time" required>
              ${this._timeOptions(initialEnd)}
            </select>
          </div>
        </div>
        ${isSchedule ? `<div class="form-group"><label><input type="checkbox" name="is_all_day" ${event.is_all_day ? 'checked' : ''} /> 종일 일정</label></div>` : ''}
        <div class="form-group">
          <label>장소</label>
          <input name="location" value="${Fmt.escape(event.location || '')}" />
        </div>
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
    const startInput = document.querySelector('#calendar-event-edit-form [name="start_time"]');
    const endInput = document.querySelector('#calendar-event-edit-form [name="end_time"]');
    const editFormEl = document.getElementById('calendar-event-edit-form');
    if (isSchedule) this._bindColorPalette(editFormEl, 'color');
    const syncAllDay = () => {
      if (!allDayToggle || !startInput || !endInput) return;
      const checked = allDayToggle.checked;
      startInput.disabled = checked;
      endInput.disabled = checked;
      if (checked) {
        startInput.value = '00:00';
        endInput.value = '23:59';
      } else {
        if (!startInput.value) startInput.value = initialStart;
        if (!endInput.value) endInput.value = initialEnd;
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
            visibility_scope: event.scope === 'coaching' ? 'coaching' : 'global',
            start_datetime: this._toDateTimeString(eventDate, allDayToggle?.checked ? '00:00' : startTime),
            end_datetime: this._toDateTimeString(eventDate, allDayToggle?.checked ? '23:59' : endTime),
            location,
            is_all_day: !!allDayToggle?.checked,
            color: this._normalizeScheduleColor(fd.get('color'), event.scope === 'coaching' ? 'coaching' : 'global'),
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
        }
        Modal.close();
        await this._renderView(batchId, policy);
      } catch (err) {
        errEl.textContent = err.message || '일정 수정 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openLectureEditModal(event, batchId, policy) {
    if (!policy.isAdmin) {
      alert('강의 수정은 관리자만 가능합니다.');
      return;
    }
    let detail = null;
    try {
      detail = await API.getLectureDetail(event.id);
    } catch (err) {
      alert(err.message || '강의 정보를 불러올 수 없습니다.');
      return;
    }
    const lecture = detail?.lecture;
    if (!lecture) {
      alert('강의 정보를 찾을 수 없습니다.');
      return;
    }
    const startDate = this._toDateInputValue(lecture.start_datetime);
    const startTime = this._toTimeInputValue(lecture.start_datetime) || '10:00';
    const endDate = this._toDateInputValue(lecture.end_datetime);
    const endTime = this._toTimeInputValue(lecture.end_datetime) || '11:00';

    // [feedback8] 캘린더에서 관리자 강의 내용을 직접 편집할 수 있는 전용 모달입니다.
    Modal.open(`
      <h2>강의 수정</h2>
      <form id="calendar-lecture-edit-form">
        <div class="form-group"><label>강의명 *</label><input name="title" required value="${Fmt.escape(lecture.title || '')}" /></div>
        <div class="form-group"><label>강의 요약</label><textarea name="summary" rows="3">${Fmt.escape(lecture.summary || '')}</textarea></div>
        <div class="form-group"><label>강의 상세</label><textarea name="description" rows="4">${Fmt.escape(lecture.description || '')}</textarea></div>
        <div class="form-group"><label>강사</label><input name="instructor" value="${Fmt.escape(lecture.instructor || '')}" /></div>
        <div class="form-group"><label>장소</label><input name="location" value="${Fmt.escape(lecture.location || '')}" /></div>
        <div class="form-group cal-time-row">
          <div><label>강의 시작일 *</label><input type="date" name="start_date" required value="${Fmt.escape(startDate)}" /></div>
          <div><label>시작 시간 *</label><select name="start_time" required>${this._timeOptions(startTime)}</select></div>
        </div>
        <div class="form-group cal-time-row">
          <div><label>강의 종료일 *</label><input type="date" name="end_date" required value="${Fmt.escape(endDate)}" /></div>
          <div><label>종료 시간 *</label><select name="end_time" required>${this._timeOptions(endTime)}</select></div>
        </div>
        <div class="form-group"><label>신청 시작일 *</label><input type="date" name="apply_start_date" required value="${Fmt.escape(String(lecture.apply_start_date || ''))}" /></div>
        <div class="form-group"><label>신청 종료일 *</label><input type="date" name="apply_end_date" required value="${Fmt.escape(String(lecture.apply_end_date || ''))}" /></div>
        <div class="form-group"><label>총 정원</label><input type="number" min="1" name="capacity_total" value="${Fmt.escape(String(lecture.capacity_total || ''))}" /></div>
        <div class="form-group"><label>팀별 정원</label><input type="number" min="1" name="capacity_team" value="${Fmt.escape(String(lecture.capacity_team || ''))}" /></div>
        <div class="form-group"><label><input type="checkbox" name="is_visible" ${lecture.is_visible !== false ? 'checked' : ''} /> 공개</label></div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p id="calendar-lecture-edit-err" class="form-error" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-xl' });

    document.getElementById('calendar-lecture-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const startDateValue = String(fd.get('start_date') || '').trim();
      const startTimeValue = String(fd.get('start_time') || '').trim();
      const endDateValue = String(fd.get('end_date') || '').trim();
      const endTimeValue = String(fd.get('end_time') || '').trim();
      const startDateTime = this._toDateTimeString(startDateValue, startTimeValue);
      const endDateTime = this._toDateTimeString(endDateValue, endTimeValue);
      const payload = {
        batch_id: lecture.batch_id,
        title: String(fd.get('title') || '').trim(),
        summary: String(fd.get('summary') || '').trim() || null,
        description: String(fd.get('description') || '').trim() || null,
        instructor: String(fd.get('instructor') || '').trim() || null,
        location: String(fd.get('location') || '').trim() || null,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        apply_start_date: String(fd.get('apply_start_date') || '').trim(),
        apply_end_date: String(fd.get('apply_end_date') || '').trim(),
        capacity_total: fd.get('capacity_total') ? Number.parseInt(String(fd.get('capacity_total')), 10) : null,
        capacity_team: fd.get('capacity_team') ? Number.parseInt(String(fd.get('capacity_team')), 10) : null,
        is_visible: fd.get('is_visible') === 'on',
      };
      const errEl = document.getElementById('calendar-lecture-edit-err');
      errEl.style.display = 'none';

      if (!payload.title || !payload.start_datetime || !payload.end_datetime || !payload.apply_start_date || !payload.apply_end_date) {
        errEl.textContent = '필수 값을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }

      try {
        await API.updateLecture(lecture.lecture_id, payload);
        Modal.close();
        await this._renderView(batchId, policy);
      } catch (err) {
        errEl.textContent = err.message || '강의 수정 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
