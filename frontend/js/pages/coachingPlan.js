/**
 * 코칭 계획/실적 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.coachingPlan = {
  async render(el) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const isAdmin = user.role === 'admin';
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }

      const batchId = State.get('currentBatchId') || batches[0].batch_id;
      const viewMode = State.get('cpViewMode') || 'monthly';
      const coaches = isAdmin ? await API.getUsers().then((rows) => rows.filter((u) => ['admin', 'coach'].includes(u.role))) : [];

      el.innerHTML = `
        <div class="page-container coaching-plan-page">
          <div class="page-header">
            <h1>코칭 계획/실적</h1>
            <p class="search-sub">기본은 코치별 월 단위 관리 화면이며, 필요 시 기존 전체 그리드로 전환할 수 있습니다.</p>
            <div class="cp-controls">
              <select id="cp-batch">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
              <select id="cp-view-mode">
                <option value="monthly"${viewMode === 'monthly' ? ' selected' : ''}>월별 코치관리</option>
                <option value="grid"${viewMode === 'grid' ? ' selected' : ''}>전체 그리드(기존)</option>
              </select>
              <select id="cp-month"></select>
              ${isAdmin ? `
                <select id="cp-coach-filter">
                  <option value="">전체 코치</option>
                  ${coaches.map((c) => `<option value="${c.user_id}">${Fmt.escape(c.name)} (${Fmt.escape(c.emp_id)})</option>`).join('')}
                </select>
              ` : ''}
              <button id="cp-today" class="btn btn-sm">오늘/이번달</button>
              <span id="cp-range-label" class="cal-month"></span>
            </div>
          </div>
          <div id="cp-grid" class="card cp-grid-wrap"><div class="loading">로딩 중...</div></div>
        </div>
      `;

      const monthSelect = document.getElementById('cp-month');
      const rangeLabelEl = document.getElementById('cp-range-label');
      const gridEl = document.getElementById('cp-grid');

      const syncMonthOptions = (batch, forceCurrentMonth = false) => {
        const options = this._buildMonthOptions(batch.start_date, batch.end_date);
        if (!options.length) {
          monthSelect.innerHTML = '';
          return;
        }
        const todayMonthKey = this._todayKey().slice(0, 7);
        const currentValue = monthSelect.value;
        const savedMonth = State.get('cpMonthKey');
        const hasToday = options.some((opt) => opt.value === todayMonthKey);
        const selectedMonth = forceCurrentMonth && hasToday
          ? todayMonthKey
          : (currentValue && options.some((opt) => opt.value === currentValue)
            ? currentValue
            : (savedMonth && options.some((opt) => opt.value === savedMonth)
              ? savedMonth
              : options[options.length - 1].value));
        monthSelect.innerHTML = options
          .map((opt) => `<option value="${opt.value}"${opt.value === selectedMonth ? ' selected' : ''}>${opt.label}</option>`)
          .join('');
        State.set('cpMonthKey', selectedMonth);
      };

      const loadView = async ({ forceCurrentMonth = false } = {}) => {
        const selectedBatchId = Number.parseInt(document.getElementById('cp-batch').value, 10);
        const batch = await API.getBatch(selectedBatchId);
        syncMonthOptions(batch, forceCurrentMonth);
        const currentMode = document.getElementById('cp-view-mode').value;
        const payload = {
          batch_id: selectedBatchId,
        };
        const coachFilter = document.getElementById('cp-coach-filter')?.value;
        if (coachFilter) payload.coach_user_id = Number.parseInt(coachFilter, 10);

        if (currentMode === 'monthly') {
          const monthKey = monthSelect.value;
          if (!monthKey) {
            rangeLabelEl.textContent = '-';
            gridEl.innerHTML = '<p class="empty-state">표시할 월 데이터가 없습니다.</p>';
            return;
          }
          const monthRange = this._resolveMonthRange(monthKey, batch.start_date, batch.end_date);
          payload.start = monthRange.start;
          payload.end = monthRange.end;
          rangeLabelEl.textContent = `${monthRange.label} (${payload.start} ~ ${payload.end})`;
          await this._renderMonthlyView(gridEl, payload, user);
          return;
        }

        payload.start = batch.start_date;
        payload.end = batch.end_date;
        rangeLabelEl.textContent = `${batch.start_date} ~ ${batch.end_date}`;
        await this._renderGrid(gridEl, payload, user);
      };

      document.getElementById('cp-batch').addEventListener('change', async (e) => {
        State.set('currentBatchId', Number.parseInt(e.target.value, 10));
        await loadView({ forceCurrentMonth: true });
      });
      document.getElementById('cp-view-mode').addEventListener('change', async (e) => {
        State.set('cpViewMode', e.target.value);
        await loadView();
      });
      monthSelect.addEventListener('change', async (e) => {
        State.set('cpMonthKey', e.target.value);
        if (document.getElementById('cp-view-mode').value === 'monthly') {
          await loadView();
        }
      });
      document.getElementById('cp-coach-filter')?.addEventListener('change', loadView);
      document.getElementById('cp-today').addEventListener('click', async () => {
        const currentMode = document.getElementById('cp-view-mode').value;
        if (currentMode === 'monthly') {
          const todayMonthKey = this._todayKey().slice(0, 7);
          if ([...monthSelect.options].some((opt) => opt.value === todayMonthKey)) {
            monthSelect.value = todayMonthKey;
            State.set('cpMonthKey', todayMonthKey);
            await loadView();
          }
          this._focusTodayInMonthly(gridEl);
          return;
        }
        const wrap = gridEl.querySelector('.cp-table-wrap');
        if (!wrap) return;
        const todayKey = this._todayKey();
        const target = wrap.querySelector(`[data-date="${todayKey}"]`);
        if (!target) return;
        const coachWidth = wrap.querySelector('.cp-coach-col')?.offsetWidth || 180;
        wrap.scrollLeft = Math.max(0, target.offsetLeft - coachWidth - 24);
      });

      await loadView({ forceCurrentMonth: true });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _todayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _dayLabel(dateText) {
    const d = new Date(`${dateText}T00:00:00`);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
  },

  _formatMinutes(minutes) {
    const mins = Number(minutes || 0);
    if (!mins) return '0분';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}분`;
    if (!m) return `${h}시간`;
    return `${h}시간${m}분`;
  },

  _formatActualRange(cell) {
    const minutes = Number(cell.final_minutes || 0);
    if (!minutes) return '-';
    const durationText = this._formatMinutes(minutes);
    if (cell.actual_start_time && cell.actual_end_time) {
      return `${cell.actual_start_time} - ${cell.actual_end_time} (${durationText})`;
    }
    if (cell.actual_start_time && !cell.actual_end_time) {
      return `${cell.actual_start_time} - 진행중 (${durationText})`;
    }
    return durationText;
  },

  _formatActualProjectNames(cell) {
    const raw = Array.isArray(cell.actual_project_names) ? cell.actual_project_names : [];
    const names = raw.map((name) => String(name || '').trim()).filter(Boolean);
    return names.join(', ');
  },

  _formatPlanTime(cell) {
    if (!cell.plan_id) return '-';
    if (cell.is_all_day) return '종일';
    if (cell.start_time && cell.end_time) return `${cell.start_time} ~ ${cell.end_time}`;
    return '-';
  },

  _parseDateText(text) {
    const [year, month, day] = String(text).split('-').map((n) => Number.parseInt(n, 10));
    return new Date(year, (month || 1) - 1, day || 1);
  },

  _toDateKey(dateObj) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  },

  _buildMonthOptions(startText, endText) {
    const start = this._parseDateText(startText);
    const end = this._parseDateText(endText);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const options = [];
    while (cursor <= endMonth) {
      const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      options.push({ value, label: `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월` });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return options;
  },

  _resolveMonthRange(monthKey, batchStartText, batchEndText) {
    const [yearText, monthText] = String(monthKey || '').split('-');
    const batchStart = this._parseDateText(batchStartText);
    const batchEnd = this._parseDateText(batchEndText);
    const fallbackYear = batchStart.getFullYear();
    const fallbackMonth = batchStart.getMonth() + 1;
    const year = Number.parseInt(yearText, 10) || fallbackYear;
    const month = Number.parseInt(monthText, 10) || fallbackMonth;
    const monthStart = new Date(year, Math.max(0, (month || 1) - 1), 1);
    const monthEnd = new Date(year, (month || 1), 0);
    const start = monthStart < batchStart ? batchStart : monthStart;
    const end = monthEnd > batchEnd ? batchEnd : monthEnd;
    return {
      start: this._toDateKey(start),
      end: this._toDateKey(end),
      label: `${start.getFullYear()}년 ${start.getMonth() + 1}월`,
    };
  },

  _focusTodayInMonthly(gridEl) {
    const todayTarget = gridEl.querySelector(`.cp-month-row[data-date="${this._todayKey()}"]`);
    if (!todayTarget) return;
    todayTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async _renderMonthlyView(gridEl, payload, user) {
    gridEl.innerHTML = '<div class="loading">로딩 중...</div>';
    const isAdmin = user.role === 'admin';
    const [data, projects] = await Promise.all([
      API.getCoachingPlanGrid(payload),
      API.getProjects(payload.batch_id).catch(() => []),
    ]);
    const projectMap = {};
    projects.forEach((p) => { projectMap[p.project_id] = p.project_name; });

    if (!data.rows || !data.rows.length) {
      gridEl.innerHTML = '<p class="empty-state">표시할 코치 데이터가 없습니다.</p>';
      return;
    }

    const todayKey = this._todayKey();
    const globalDateSet = new Set((data.global_schedule_dates || []).map((d) => String(d).slice(0, 10)));
    const coachingDateSet = new Set((data.coaching_schedule_dates || []).map((d) => String(d).slice(0, 10)));

    gridEl.innerHTML = `
      <div class="cp-month-wrap">
        ${data.rows.map((row) => {
          const canEditPlan = isAdmin || row.coach_user_id === user.user_id;
          const canEditActual = isAdmin || row.coach_user_id === user.user_id;
          const planCount = row.cells.filter((cell) => !!cell.plan_id).length;
          const actualTotalMinutes = row.cells.reduce((acc, cell) => acc + Number(cell.final_minutes || 0), 0);

          const rowsHtml = row.cells.map((cell) => {
            const dateKey = String(cell.date).slice(0, 10);
            const dateObj = this._parseDateText(dateKey);
            const day = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
            const isWeekend = day === '토' || day === '일';
            const cellJson = this._escapeAttrJson(cell);
            const rowClasses = [
              'cp-month-row',
              globalDateSet.has(dateKey) ? 'cp-global-date' : '',
              coachingDateSet.has(dateKey) ? 'cp-coaching-date' : '',
              dateKey === todayKey ? 'cp-today-col' : '',
            ].filter(Boolean).join(' ');
            return `
              <tr class="${rowClasses}" data-date="${Fmt.escape(dateKey)}">
                <td class="cp-month-date">
                  <strong>${Fmt.escape(`${dateObj.getMonth() + 1}/${dateObj.getDate()}`)}</strong>
                  <span class="${isWeekend ? 'cp-weekend' : ''}">${Fmt.escape(day)}</span>
                  ${globalDateSet.has(dateKey) ? '<span class="tag">공통일정</span>' : ''}
                  ${coachingDateSet.has(dateKey) ? '<span class="tag">코칭일정</span>' : ''}
                </td>
                <td class="cp-month-plan">
                  <div class="cp-line">${Fmt.escape(this._formatPlanTime(cell))}</div>
                  ${cell.plan_note ? `<div class="cp-line hint">${Fmt.escape(cell.plan_note)}</div>` : ''}
                  ${cell.entered_previous_day ? '<span class="tag">전일입력</span>' : ''}
                </td>
                <td class="cp-month-actual">
                  <div class="cp-line">${Fmt.escape(this._formatActualRange(cell))}</div>
                  ${this._formatActualProjectNames(cell) ? `<div class="cp-line hint">과제: ${Fmt.escape(this._formatActualProjectNames(cell))}</div>` : ''}
                  ${cell.actual_source === 'override' ? '<div class="cp-line hint">수동 입력값 적용</div>' : ''}
                </td>
                <td class="cp-month-actions">
                  ${canEditPlan ? `<button class="btn btn-xs cp-edit-plan" data-coach="${row.coach_user_id}" data-date="${Fmt.escape(dateKey)}" data-cell="${cellJson}">계획</button>` : ''}
                  ${canEditActual ? `<button class="btn btn-xs btn-secondary cp-edit-actual" data-coach="${row.coach_user_id}" data-name="${Fmt.escape(row.coach_name)}" data-date="${Fmt.escape(dateKey)}" data-cell="${cellJson}">실적</button>` : ''}
                </td>
              </tr>
            `;
          }).join('');

          return `
            <section class="cp-month-coach-card">
              <div class="cp-month-coach-head">
                <div>
                  <h3>${Fmt.escape(row.coach_name)}</h3>
                  <p class="hint">${Fmt.escape(row.coach_emp_id)}${row.department ? ` · ${Fmt.escape(row.department)}` : ''}</p>
                </div>
                <div class="cp-month-summary">
                  <span class="tag">계획 ${planCount}일</span>
                  <span class="tag">실적 ${Fmt.escape(this._formatMinutes(actualTotalMinutes))}</span>
                </div>
              </div>
              <div class="cp-month-table-wrap">
                <table class="data-table cp-month-table">
                  <thead>
                    <tr>
                      <th>일자</th>
                      <th>계획</th>
                      <th>실적</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </section>
          `;
        }).join('')}
      </div>
    `;

    gridEl.querySelectorAll('.cp-edit-plan').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const coachUserId = Number.parseInt(btn.dataset.coach, 10);
        const workDate = btn.dataset.date;
        const cell = JSON.parse(btn.dataset.cell || '{}');
        await this._openPlanModal({ payload, coachUserId, workDate, cell, projectMap, reload: () => this._renderMonthlyView(gridEl, payload, user) });
      });
    });

    gridEl.querySelectorAll('.cp-edit-actual').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const coachUserId = Number.parseInt(btn.dataset.coach, 10);
        const coachName = btn.dataset.name || '';
        const workDate = btn.dataset.date;
        const cell = JSON.parse(btn.dataset.cell || '{}');
        await this._openActualModal({
          payload,
          coachUserId,
          coachName,
          workDate,
          cell,
          projectMap,
          reload: () => this._renderMonthlyView(gridEl, payload, user),
        });
      });
    });

    this._focusTodayInMonthly(gridEl);
  },

  async _renderGrid(gridEl, payload, user) {
    gridEl.innerHTML = '<div class="loading">로딩 중...</div>';
    const isAdmin = user.role === 'admin';
    const [data, projects] = await Promise.all([
      API.getCoachingPlanGrid(payload),
      API.getProjects(payload.batch_id).catch(() => []),
    ]);
    const projectMap = {};
    projects.forEach((p) => { projectMap[p.project_id] = p.project_name; });

    if (!data.rows || !data.rows.length) {
      gridEl.innerHTML = '<p class="empty-state">표시할 코치 데이터가 없습니다.</p>';
      return;
    }

    const todayKey = this._todayKey();
    const globalDateSet = new Set((data.global_schedule_dates || []).map((d) => String(d).slice(0, 10)));
    const coachingDateSet = new Set((data.coaching_schedule_dates || []).map((d) => String(d).slice(0, 10)));

    gridEl.innerHTML = `
      <div class="cp-table-wrap">
        <table class="data-table coaching-plan-table">
          <thead>
            <tr>
              <th class="cp-coach-col">코치</th>
              <th class="cp-kind-col">구분</th>
              ${data.dates.map((dt) => {
                const dateKey = String(dt).slice(0, 10);
                const classes = [
                  globalDateSet.has(dateKey) ? 'cp-global-date' : '',
                  coachingDateSet.has(dateKey) ? 'cp-coaching-date' : '',
                  dateKey === todayKey ? 'cp-today-col' : '',
                ].filter(Boolean).join(' ');
                return `<th class="${classes}" data-date="${Fmt.escape(dateKey)}">${this._dayLabel(dateKey)}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((row) => {
              const canEditPlan = isAdmin || row.coach_user_id === user.user_id;
              const canEditActual = isAdmin || row.coach_user_id === user.user_id;
              const planCells = row.cells.map((cell) => {
                const dateKey = String(cell.date).slice(0, 10);
                const cellJson = this._escapeAttrJson(cell);
                const classes = [
                  'cp-plan-cell',
                  cell.plan_id ? 'cp-plan-entered' : '',
                  globalDateSet.has(dateKey) ? 'cp-global-date' : '',
                  coachingDateSet.has(dateKey) ? 'cp-coaching-date' : '',
                  dateKey === todayKey ? 'cp-today-col' : '',
                ].filter(Boolean).join(' ');
                return `<td class="${classes}" data-date="${Fmt.escape(dateKey)}">
                  <div class="cp-cell">
                    <div class="cp-line">${Fmt.escape(this._formatPlanTime(cell))}</div>
                    ${cell.entered_previous_day ? '<span class="tag">전일입력</span>' : ''}
                    <div class="cp-line hint">${cell.plan_note ? Fmt.escape(cell.plan_note) : ''}</div>
                    ${canEditPlan ? `<button class="btn btn-xs cp-edit-plan" data-coach="${row.coach_user_id}" data-date="${Fmt.escape(dateKey)}" data-cell="${cellJson}">계획</button>` : ''}
                  </div>
                </td>`;
              }).join('');

              const actualCells = row.cells.map((cell) => {
                const dateKey = String(cell.date).slice(0, 10);
                const cellJson = this._escapeAttrJson(cell);
                const actualProjectNames = this._formatActualProjectNames(cell);
                const classes = [
                  'cp-actual-cell',
                  globalDateSet.has(dateKey) ? 'cp-global-date' : '',
                  coachingDateSet.has(dateKey) ? 'cp-coaching-date' : '',
                  dateKey === todayKey ? 'cp-today-col' : '',
                ].filter(Boolean).join(' ');
                return `<td class="${classes}" data-date="${Fmt.escape(dateKey)}">
                  <div class="cp-cell">
                    <div class="cp-line">${Fmt.escape(this._formatActualRange(cell))}</div>
                    <div class="cp-line hint">${actualProjectNames ? `과제: ${Fmt.escape(actualProjectNames)}` : ''}</div>
                    <div class="cp-line hint">${Fmt.escape(cell.actual_source === 'override' ? '수동 입력값 적용' : '')}</div>
                    ${canEditActual ? `<button class="btn btn-xs btn-secondary cp-edit-actual" data-coach="${row.coach_user_id}" data-name="${Fmt.escape(row.coach_name)}" data-date="${Fmt.escape(dateKey)}" data-cell="${cellJson}">실적</button>` : ''}
                  </div>
                </td>`;
              }).join('');

              return `
                <tr class="cp-row-plan">
                  <th class="cp-coach-col" rowspan="2">
                    <strong>${Fmt.escape(row.coach_name)}</strong>
                    <div class="hint">${Fmt.escape(row.coach_emp_id)} ${row.department ? `· ${Fmt.escape(row.department)}` : ''}</div>
                  </th>
                  <th class="cp-kind-col">계획</th>
                  ${planCells}
                </tr>
                <tr class="cp-row-actual">
                  <th class="cp-kind-col">실적</th>
                  ${actualCells}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    gridEl.querySelectorAll('.cp-edit-plan').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const coachUserId = Number.parseInt(btn.dataset.coach, 10);
        const workDate = btn.dataset.date;
        const cell = JSON.parse(btn.dataset.cell || '{}');
        await this._openPlanModal({ payload, coachUserId, workDate, cell, projectMap, reload: () => this._renderGrid(gridEl, payload, user) });
      });
    });

    gridEl.querySelectorAll('.cp-edit-actual').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const coachUserId = Number.parseInt(btn.dataset.coach, 10);
        const coachName = btn.dataset.name || '';
        const workDate = btn.dataset.date;
        const cell = JSON.parse(btn.dataset.cell || '{}');
        await this._openActualModal({
          payload,
          coachUserId,
          coachName,
          workDate,
          cell,
          projectMap,
          reload: () => this._renderGrid(gridEl, payload, user),
        });
      });
    });

    const wrap = gridEl.querySelector('.cp-table-wrap');
    const todayTarget = wrap?.querySelector(`[data-date="${todayKey}"]`);
    if (wrap && todayTarget) {
      const coachWidth = wrap.querySelector('.cp-coach-col')?.offsetWidth || 180;
      wrap.scrollLeft = Math.max(0, todayTarget.offsetLeft - coachWidth - 24);
    }
  },

  _escapeAttrJson(value) {
    return String(JSON.stringify(value || {}))
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },
  async _openPlanModal({ payload, coachUserId, workDate, cell, projectMap, reload }) {
    Modal.open(`
      <h2>코칭 계획 입력</h2>
      <form id="cp-plan-form">
        <div class="form-group">
          <label>날짜</label>
          <input value="${Fmt.escape(workDate)}" disabled />
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_all_day" ${cell.plan_id ? (cell.is_all_day ? 'checked' : '') : 'checked'} /> 종일</label>
        </div>
        <div class="form-group cal-time-row">
          <div>
            <label>시작 시간</label>
            <input name="start_time" type="time" value="${Fmt.escape(cell.start_time || '')}" />
          </div>
          <div>
            <label>종료 시간</label>
            <input name="end_time" type="time" value="${Fmt.escape(cell.end_time || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label>메모</label>
          <textarea name="plan_note" rows="4" placeholder="당일 코칭 계획 메모">${Fmt.escape(cell.plan_note || '')}</textarea>
        </div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          ${cell.plan_id ? '<button type="button" id="cp-plan-delete" class="btn btn-danger">삭제</button>' : ''}
        </div>
        <p class="form-error" id="cp-plan-err" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-lg' });

    const allDayEl = document.querySelector('#cp-plan-form input[name="is_all_day"]');
    const startEl = document.querySelector('#cp-plan-form input[name="start_time"]');
    const endEl = document.querySelector('#cp-plan-form input[name="end_time"]');
    const syncAllDay = () => {
      if (!allDayEl || !startEl || !endEl) return;
      const isAllDay = allDayEl.checked;
      startEl.disabled = isAllDay;
      endEl.disabled = isAllDay;
      if (isAllDay) {
        startEl.value = '';
        endEl.value = '';
      }
    };
    allDayEl?.addEventListener('change', syncAllDay);
    syncAllDay();

    document.getElementById('cp-plan-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = document.getElementById('cp-plan-err');
      errEl.style.display = 'none';
      try {
        await API.upsertCoachingPlan({
          batch_id: payload.batch_id,
          coach_user_id: coachUserId,
          plan_date: workDate,
          is_all_day: fd.has('is_all_day'),
          start_time: fd.get('start_time') ? String(fd.get('start_time')) : null,
          end_time: fd.get('end_time') ? String(fd.get('end_time')) : null,
          plan_note: fd.get('plan_note') ? String(fd.get('plan_note')).trim() : null,
        });
        Modal.close();
        await reload();
      } catch (err) {
        errEl.textContent = err.message || '저장 실패';
        errEl.style.display = 'block';
      }
    });

    document.getElementById('cp-plan-delete')?.addEventListener('click', async () => {
      if (!confirm('이 계획을 삭제하시겠습니까?')) return;
      try {
        await API.deleteCoachingPlan({
          batch_id: payload.batch_id,
          coach_user_id: coachUserId,
          plan_date: workDate,
        });
        Modal.close();
        await reload();
      } catch (err) {
        const errEl = document.getElementById('cp-plan-err');
        errEl.textContent = err.message || '삭제 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openActualModal({ payload, coachUserId, coachName, workDate, cell, projectMap, reload }) {
    const selectedProjectIds = new Set((Array.isArray(cell.actual_project_ids) ? cell.actual_project_ids : []).map((id) => String(id)));
    const projectEntries = Object.entries(projectMap || {});
    Modal.open(`
      <h2>실적 보정</h2>
      <form id="cp-actual-form">
        <div class="info-grid">
          <div class="info-item"><label>코치</label><span>${Fmt.escape(coachName)}</span></div>
          <div class="info-item"><label>날짜</label><span>${Fmt.escape(workDate)}</span></div>
          <div class="info-item"><label>자동 실적</label><span>${Fmt.escape(this._formatActualRange({ ...cell, final_minutes: cell.auto_minutes }))}</span></div>
        </div>
        <div class="form-group">
          <label>보정 실적(분)</label>
          <input name="actual_minutes" type="number" min="0" max="1440" value="${cell.override_minutes != null ? String(cell.override_minutes) : String(cell.auto_minutes || 0)}" required />
        </div>
        <div class="form-group">
          <label>실적 과제 (복수 선택)</label>
          ${projectEntries.length ? `
            <div class="cp-project-checks">
              ${projectEntries.map(([projectId, projectName]) => `
                <label>
                  <input type="checkbox" name="actual_project_ids" value="${Fmt.escape(projectId)}"${selectedProjectIds.has(String(projectId)) ? ' checked' : ''} />
                  ${Fmt.escape(projectName)}
                </label>
              `).join('')}
            </div>
          ` : '<p class="hint">선택 가능한 과제가 없습니다.</p>'}
        </div>
        <div class="form-group">
          <label>사유</label>
          <textarea name="reason" rows="3" placeholder="보정 사유를 입력하세요">${Fmt.escape(cell.override_reason || '')}</textarea>
        </div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          ${cell.override_minutes != null ? '<button type="button" id="cp-actual-delete" class="btn btn-danger">보정 삭제</button>' : ''}
        </div>
        <p class="form-error" id="cp-actual-err" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-md' });

    document.getElementById('cp-actual-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const actualProjectIds = Array.from(document.querySelectorAll('#cp-actual-form input[name="actual_project_ids"]:checked'))
        .map((el) => Number.parseInt(String(el.value), 10))
        .filter((num) => Number.isInteger(num) && num > 0);
      const errEl = document.getElementById('cp-actual-err');
      errEl.style.display = 'none';
      try {
        await API.upsertCoachingActualOverride({
          batch_id: payload.batch_id,
          coach_user_id: coachUserId,
          work_date: workDate,
          actual_minutes: Number.parseInt(String(fd.get('actual_minutes') || '0'), 10),
          reason: fd.get('reason') ? String(fd.get('reason')).trim() : null,
          actual_project_ids: actualProjectIds,
        });
        Modal.close();
        await reload();
      } catch (err) {
        errEl.textContent = err.message || '저장 실패';
        errEl.style.display = 'block';
      }
    });

    document.getElementById('cp-actual-delete')?.addEventListener('click', async () => {
      if (!confirm('보정 실적을 삭제하시겠습니까?')) return;
      try {
        await API.deleteCoachingActualOverride({
          batch_id: payload.batch_id,
          coach_user_id: coachUserId,
          work_date: workDate,
        });
        Modal.close();
        await reload();
      } catch (err) {
        const errEl = document.getElementById('cp-actual-err');
        errEl.textContent = err.message || '삭제 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
