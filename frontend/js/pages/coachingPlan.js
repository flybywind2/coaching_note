/**
 * 코칭 계획/실적 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.coachingPlan = {
  async render(el) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      if (!Auth.isAdminOrInternalCoach()) {
        el.innerHTML = '<div class="error-state">코칭 계획/실적 접근 권한이 없습니다.</div>';
        return;
      }

      const isAdmin = user.role === 'admin';
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }

      const batchId = State.get('currentBatchId') || batches[0].batch_id;
      State.set('currentBatchId', batchId);

      el.innerHTML = `
        <div class="page-container coaching-plan-page">
          <div class="page-header">
            <h1>코칭 계획/실적</h1>
            <p class="search-sub">코칭 일정 날짜만 표시됩니다.</p>
            <div class="cp-controls">
              <select id="cp-batch">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
              <button id="cp-today" class="btn btn-sm">오늘 위치로 이동</button>
              <span id="cp-range-label" class="cal-month"></span>
            </div>
          </div>
          <div id="cp-grid" class="card cp-grid-wrap"><div class="loading">로딩 중...</div></div>
        </div>
      `;

      const gridEl = document.getElementById('cp-grid');
      const rangeLabelEl = document.getElementById('cp-range-label');
      const batchSelectEl = document.getElementById('cp-batch');

      const loadView = async (focusDate = null) => {
        const selectedBatchId = Number.parseInt(batchSelectEl.value, 10);
        const batch = await API.getBatch(selectedBatchId);
        const payload = {
          batch_id: selectedBatchId,
          start: batch.start_date,
          end: batch.end_date,
          coaching_start_date: batch.coaching_start_date || batch.start_date,
        };
        await this._renderGrid({
          gridEl,
          payload,
          user,
          isAdmin,
          rangeLabelEl,
          focusDate,
        });
      };

      batchSelectEl.addEventListener('change', async (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        State.set('currentBatchId', nextBatchId);
        State.set('cpFocusDate', null);
        await loadView(this._todayKey());
      });

      document.getElementById('cp-today')?.addEventListener('click', () => {
        const todayKey = this._todayKey();
        State.set('cpFocusDate', todayKey);
        this._focusDate(gridEl, todayKey);
      });

      await loadView(State.get('cpFocusDate') || this._todayKey());
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async _renderGrid({ gridEl, payload, user, isAdmin, rangeLabelEl, focusDate = null }) {
    gridEl.innerHTML = '<div class="loading">로딩 중...</div>';
    const data = await API.getCoachingPlanGrid(payload);
    const coachingDateSet = new Set((data.coaching_schedule_dates || []).map((d) => String(d).slice(0, 10)));
    const visibleDateKeys = (data.dates || [])
      .map((dt) => String(dt).slice(0, 10))
      .filter((dateKey) => coachingDateSet.has(dateKey));

    rangeLabelEl.textContent = `코칭일정 ${visibleDateKeys.length}일 (${payload.start} ~ ${payload.end})`;

    if (!data.rows || !data.rows.length) {
      gridEl.innerHTML = '<p class="empty-state">표시할 코치 데이터가 없습니다.</p>';
      return;
    }
    if (!visibleDateKeys.length) {
      gridEl.innerHTML = '<p class="empty-state">선택한 기간에 코칭 일정이 없습니다.</p>';
      return;
    }

    const todayKey = this._todayKey();
    const weekBaseDate = payload.coaching_start_date || payload.start;
    const emptyPlanDates = this._findEmptyPlanDates(data.rows || [], visibleDateKeys);
    const editablePlanRows = (data.rows || []).filter((row) => isAdmin || row.coach_user_id === user.user_id);
    gridEl.innerHTML = `
      ${emptyPlanDates.length ? `
        <div class="cp-plan-empty-days">
          <span class="cp-plan-empty-days-title">코칭 계획이 비어있는 날짜</span>
          <div class="cp-plan-empty-days-list">
            ${emptyPlanDates.map((dateKey) => `<button type="button" class="cp-plan-empty-day" data-date="${Fmt.escape(dateKey)}">${Fmt.escape(this._dayLabel(dateKey))}</button>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="cp-table-wrap">
        <table class="data-table coaching-plan-table">
          <thead>
            <tr>
              <th class="cp-coach-col">코치</th>
              <th class="cp-kind-col">구분</th>
              ${visibleDateKeys.map((dateKey) => `<th class="${dateKey === todayKey ? 'cp-today-col' : ''}" data-date="${Fmt.escape(dateKey)}">${this._dateHeaderHtml(dateKey, weekBaseDate)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((row) => {
              const cellMap = {};
              (row.cells || []).forEach((cell) => {
                cellMap[String(cell.date).slice(0, 10)] = cell;
              });
              const isSelfRow = row.coach_user_id === user.user_id;
              const coachHref = this._coachHref(row.coach_user_id, payload.batch_id);
              const canEditPlan = isAdmin || row.coach_user_id === user.user_id;
              const canEditActual = isAdmin;
              const planCells = visibleDateKeys.map((dateKey) => {
                const cell = cellMap[dateKey] || { date: dateKey };
                const cellJson = this._escapeAttrJson(cell);
                const classes = [
                  'cp-plan-cell',
                  dateKey === todayKey ? 'cp-today-col' : '',
                  canEditPlan ? 'cp-editable' : '',
                ].filter(Boolean).join(' ');
                return `
                  <td class="${classes}" data-date="${Fmt.escape(dateKey)}" data-coach="${row.coach_user_id}" data-cell="${cellJson}">
                    <div class="cp-cell cp-cell-compact">
                      <div class="cp-line">${Fmt.escape(this._formatPlanTime(cell))}</div>
                    </div>
                  </td>
                `;
              }).join('');

              const actualCells = visibleDateKeys.map((dateKey) => {
                const cell = cellMap[dateKey] || { date: dateKey };
                const cellJson = this._escapeAttrJson(cell);
                const classes = [
                  'cp-actual-cell',
                  dateKey === todayKey ? 'cp-today-col' : '',
                  canEditActual ? 'cp-editable' : '',
                  cell.actual_source === 'override' ? 'cp-actual-override' : '',
                ].filter(Boolean).join(' ');
                return `
                  <td class="${classes}" data-date="${Fmt.escape(dateKey)}" data-coach="${row.coach_user_id}" data-name="${Fmt.escape(row.coach_name)}" data-cell="${cellJson}">
                    <div class="cp-cell cp-cell-compact">
                      <div class="cp-line">${Fmt.escape(this._formatActualRange(cell))}</div>
                    </div>
                  </td>
                `;
              }).join('');

              return `
                <tr class="cp-row-plan${isSelfRow ? ' cp-row-self' : ''}">
                  <th class="cp-coach-col" rowspan="2">
                    ${coachHref
    ? `<a href="${coachHref}" class="cp-coach-link"><strong>${Fmt.escape(row.coach_name)}</strong></a>`
    : `<strong>${Fmt.escape(row.coach_name)}</strong>`}
                    <div class="hint">${Fmt.escape(row.coach_emp_id)}${row.department ? ` · ${Fmt.escape(row.department)}` : ''}</div>
                  </th>
                  <th class="cp-kind-col">계획</th>
                  ${planCells}
                </tr>
                <tr class="cp-row-actual${isSelfRow ? ' cp-row-self' : ''}">
                  <th class="cp-kind-col">실적</th>
                  ${actualCells}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    const openPlanEditor = async ({ coachUserId, workDate, cell = null }) => {
      const row = (data.rows || []).find((item) => Number(item.coach_user_id) === Number(coachUserId));
      if (!row) return;
      const targetCell = cell || (row.cells || []).find((item) => String(item.date).slice(0, 10) === workDate) || { date: workDate };
      await this._openPlanModal({
        payload,
        coachUserId: Number(row.coach_user_id),
        workDate,
        cell: targetCell,
        reload: async (nextFocusDate) => {
          State.set('cpFocusDate', nextFocusDate || workDate);
          await this._renderGrid({
            gridEl,
            payload,
            user,
            isAdmin,
            rangeLabelEl,
            focusDate: nextFocusDate || workDate,
          });
        },
      });
    };

    gridEl.querySelectorAll('.cp-plan-empty-day').forEach((dayEl) => {
      dayEl.addEventListener('click', async () => {
        const workDate = dayEl.dataset.date;
        if (!workDate) return;
        State.set('cpFocusDate', workDate);
        this._focusDate(gridEl, workDate);
        if (!editablePlanRows.length) return;
        if (editablePlanRows.length === 1) {
          await openPlanEditor({ coachUserId: editablePlanRows[0].coach_user_id, workDate });
          return;
        }
        this._openPlanCoachPickerModal({
          rows: editablePlanRows,
          workDate,
          onSelect: async (coachUserId) => {
            await openPlanEditor({ coachUserId, workDate });
          },
        });
      });
    });

    gridEl.querySelectorAll('.cp-plan-cell.cp-editable').forEach((cellEl) => {
      cellEl.addEventListener('click', async () => {
        const coachUserId = Number.parseInt(cellEl.dataset.coach, 10);
        const workDate = cellEl.dataset.date;
        const cell = JSON.parse(cellEl.dataset.cell || '{}');
        await openPlanEditor({ coachUserId, workDate, cell });
      });
    });

    if (isAdmin) {
      gridEl.querySelectorAll('.cp-actual-cell.cp-editable').forEach((cellEl) => {
        cellEl.addEventListener('click', async () => {
          const coachUserId = Number.parseInt(cellEl.dataset.coach, 10);
          const coachName = cellEl.dataset.name || '';
          const workDate = cellEl.dataset.date;
          const cell = JSON.parse(cellEl.dataset.cell || '{}');
          await this._openActualModal({
            payload,
            coachUserId,
            coachName,
            workDate,
            cell,
            reload: async (nextFocusDate) => {
              State.set('cpFocusDate', nextFocusDate || workDate);
              await this._renderGrid({
                gridEl,
                payload,
                user,
                isAdmin,
                rangeLabelEl,
                focusDate: nextFocusDate || workDate,
              });
            },
          });
        });
      });
    }

    this._focusDate(gridEl, focusDate || State.get('cpFocusDate') || todayKey);
  },

  _focusDate(gridEl, focusDate) {
    const wrap = gridEl.querySelector('.cp-table-wrap');
    if (!wrap || !focusDate) return;
    const target = wrap.querySelector(`[data-date="${focusDate}"]`);
    if (!target) return;
    const coachWidth = wrap.querySelector('.cp-coach-col')?.offsetWidth || 180;
    const kindWidth = wrap.querySelector('.cp-kind-col')?.offsetWidth || 68;
    wrap.scrollLeft = Math.max(0, target.offsetLeft - coachWidth - kindWidth - 24);
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

  _weekNumberFromBaseline(targetDateText, baselineDateText) {
    if (!targetDateText || !baselineDateText) return 1;
    const target = new Date(`${targetDateText}T00:00:00`);
    const baseline = new Date(`${baselineDateText}T00:00:00`);
    if (Number.isNaN(target.getTime()) || Number.isNaN(baseline.getTime())) return 1;
    const deltaDays = Math.floor((target - baseline) / 86400000);
    return deltaDays >= 0 ? Math.floor(deltaDays / 7) + 1 : 1;
  },

  _dateHeaderHtml(dateText, baselineDateText) {
    const weekNo = this._weekNumberFromBaseline(dateText, baselineDateText);
    return `<div class="cp-week-label">${weekNo}주차</div><div class="cp-day-label">${this._dayLabel(dateText)}</div>`;
  },

  _coachHref(coachUserId, batchId) {
    const coachId = Number.parseInt(String(coachUserId || ''), 10);
    if (Number.isNaN(coachId)) return '';
    return `#/coaching-plan/coach/${coachId}?batch_id=${encodeURIComponent(String(batchId || ''))}`;
  },

  _findEmptyPlanDates(rows, visibleDateKeys) {
    const rowCellMaps = (rows || []).map((row) => {
      const cellMap = {};
      (row.cells || []).forEach((cell) => {
        cellMap[String(cell.date).slice(0, 10)] = cell;
      });
      return cellMap;
    });
    return visibleDateKeys.filter((dateKey) => !rowCellMaps.some((cellMap) => {
      const cell = cellMap[dateKey];
      return Boolean(cell?.plan_id) && Boolean(cell?.is_all_day);
    }));
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

  _formatPlanTime(cell) {
    if (!cell.plan_id) return '-';
    if (cell.is_all_day) return '종일';
    if (cell.start_time && cell.end_time) return `${cell.start_time} ~ ${cell.end_time}`;
    return '-';
  },

  _normalizeTimeValue(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return '';
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  },

  _timeOptions(selectedValue) {
    const selected = this._normalizeTimeValue(selectedValue);
    const options = ['<option value="">선택</option>'];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let minute = 0; minute < 60; minute += 10) {
        const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        options.push(`<option value="${value}"${value === selected ? ' selected' : ''}>${value}</option>`);
      }
    }
    return options.join('');
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

  _escapeAttrJson(value) {
    return String(JSON.stringify(value || {}))
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },

  _openPlanCoachPickerModal({ rows, workDate, onSelect }) {
    if (!rows || !rows.length) return;
    Modal.open(`
      <h2>코치 선택</h2>
      <form id="cp-empty-day-coach-form">
        <div class="form-group">
          <label>날짜</label>
          <input value="${Fmt.escape(workDate)}" disabled />
        </div>
        <div class="form-group">
          <label for="cp-empty-day-coach">코치</label>
          <select id="cp-empty-day-coach" name="coach_user_id" required>
            ${rows.map((row) => `<option value="${row.coach_user_id}">${Fmt.escape(row.coach_name)} (${Fmt.escape(row.coach_emp_id || '-')})</option>`).join('')}
          </select>
        </div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">계획 입력</button>
        </div>
      </form>
    `, null, { className: 'modal-box-md' });

    document.getElementById('cp-empty-day-coach-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const coachUserId = Number.parseInt(String(new FormData(e.target).get('coach_user_id') || ''), 10);
      if (Number.isNaN(coachUserId)) return;
      Modal.close();
      if (onSelect) await onSelect(coachUserId);
    });
  },

  async _openPlanModal({ payload, coachUserId, workDate, cell, reload }) {
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
            <select name="start_time">
              ${this._timeOptions(cell.start_time)}
            </select>
          </div>
          <div>
            <label>종료 시간</label>
            <select name="end_time">
              ${this._timeOptions(cell.end_time)}
            </select>
          </div>
        </div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          ${cell.plan_id ? '<button type="button" id="cp-plan-delete" class="btn btn-danger">삭제</button>' : ''}
        </div>
        <p class="form-error" id="cp-plan-err" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-md' });

    const allDayEl = document.querySelector('#cp-plan-form input[name="is_all_day"]');
    const startEl = document.querySelector('#cp-plan-form [name="start_time"]');
    const endEl = document.querySelector('#cp-plan-form [name="end_time"]');
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
          plan_note: null,
        });
        Modal.close();
        await reload(workDate);
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
        await reload(workDate);
      } catch (err) {
        const errEl = document.getElementById('cp-plan-err');
        errEl.textContent = err.message || '삭제 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openActualModal({ payload, coachUserId, coachName, workDate, cell, reload }) {
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
          <input name="actual_minutes" type="number" min="0" max="1440" step="10" value="${cell.override_minutes != null ? String(cell.override_minutes) : String(cell.auto_minutes || 0)}" required />
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
      const errEl = document.getElementById('cp-actual-err');
      errEl.style.display = 'none';
      try {
        await API.upsertCoachingActualOverride({
          batch_id: payload.batch_id,
          coach_user_id: coachUserId,
          work_date: workDate,
          actual_minutes: Number.parseInt(String(fd.get('actual_minutes') || '0'), 10),
          reason: fd.get('reason') ? String(fd.get('reason')).trim() : null,
        });
        Modal.close();
        await reload(workDate);
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
        await reload(workDate);
      } catch (err) {
        const errEl = document.getElementById('cp-actual-err');
        errEl.textContent = err.message || '삭제 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
