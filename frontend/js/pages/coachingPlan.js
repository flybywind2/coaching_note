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
      const coaches = isAdmin ? await API.getUsers().then((rows) => rows.filter((u) => ['admin', 'coach'].includes(u.role))) : [];

      el.innerHTML = `
        <div class="page-container coaching-plan-page">
          <div class="page-header">
            <h1>코칭 계획/실적</h1>
            <p class="search-sub">차수 전체 기간 기준으로 코치별 계획/실적을 확인합니다.</p>
            <div class="cp-controls">
              <select id="cp-batch">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
              ${isAdmin ? `
                <select id="cp-coach-filter">
                  <option value="">전체 코치</option>
                  ${coaches.map((c) => `<option value="${c.user_id}">${Fmt.escape(c.name)} (${Fmt.escape(c.emp_id)})</option>`).join('')}
                </select>
              ` : ''}
              <button id="cp-today" class="btn btn-sm">오늘 위치로 이동</button>
              <span id="cp-range-label" class="cal-month"></span>
            </div>
          </div>
          <div id="cp-grid" class="card cp-grid-wrap"><div class="loading">로딩 중...</div></div>
        </div>
      `;

      const loadGrid = async () => {
        const selectedBatchId = Number.parseInt(document.getElementById('cp-batch').value, 10);
        const batch = await API.getBatch(selectedBatchId);
        const payload = {
          batch_id: selectedBatchId,
          start: batch.start_date,
          end: batch.end_date,
        };
        const coachFilter = document.getElementById('cp-coach-filter')?.value;
        if (coachFilter) payload.coach_user_id = Number.parseInt(coachFilter, 10);

        document.getElementById('cp-range-label').textContent = `${batch.start_date} ~ ${batch.end_date}`;
        await this._renderGrid(document.getElementById('cp-grid'), payload, user);
      };

      document.getElementById('cp-batch').addEventListener('change', async (e) => {
        State.set('currentBatchId', Number.parseInt(e.target.value, 10));
        await loadGrid();
      });
      document.getElementById('cp-coach-filter')?.addEventListener('change', loadGrid);
      document.getElementById('cp-today').addEventListener('click', () => {
        const wrap = document.querySelector('.cp-table-wrap');
        if (!wrap) return;
        const todayKey = this._todayKey();
        const target = wrap.querySelector(`[data-date="${todayKey}"]`);
        if (target) {
          const coachWidth = wrap.querySelector('.cp-coach-col')?.offsetWidth || 180;
          wrap.scrollLeft = Math.max(0, target.offsetLeft - coachWidth - 24);
        }
      });

      await loadGrid();
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

  _formatPlanTime(cell) {
    if (!cell.plan_id) return '-';
    if (cell.is_all_day) return '종일';
    if (cell.start_time && cell.end_time) return `${cell.start_time} ~ ${cell.end_time}`;
    return '-';
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
                  dateKey === todayKey ? 'cp-today-col' : '',
                ].filter(Boolean).join(' ');
                return `<th class="${classes}" data-date="${Fmt.escape(dateKey)}">${this._dayLabel(dateKey)}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((row) => {
              const canEditPlan = isAdmin || row.coach_user_id === user.user_id;
              const planCells = row.cells.map((cell) => {
                const dateKey = String(cell.date).slice(0, 10);
                const cellJson = this._escapeAttrJson(cell);
                const classes = [
                  'cp-plan-cell',
                  cell.plan_id ? 'cp-plan-entered' : '',
                  globalDateSet.has(dateKey) ? 'cp-global-date' : '',
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
                const classes = [
                  'cp-actual-cell',
                  globalDateSet.has(dateKey) ? 'cp-global-date' : '',
                  dateKey === todayKey ? 'cp-today-col' : '',
                ].filter(Boolean).join(' ');
                return `<td class="${classes}" data-date="${Fmt.escape(dateKey)}">
                  <div class="cp-cell">
                    <div class="cp-line">${Fmt.escape(this._formatActualRange(cell))}</div>
                    <div class="cp-line hint">${Fmt.escape(cell.actual_source === 'override' ? '관리자 보정값 적용' : '')}</div>
                    ${isAdmin ? `<button class="btn btn-xs btn-secondary cp-edit-actual" data-coach="${row.coach_user_id}" data-name="${Fmt.escape(row.coach_name)}" data-date="${Fmt.escape(dateKey)}" data-cell="${cellJson}">실적</button>` : ''}
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
        await this._openActualModal({ payload, coachUserId, coachName, workDate, cell, reload: () => this._renderGrid(gridEl, payload, user) });
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
          <label>과제</label>
          <select name="planned_project_id">
            <option value="">선택 안함</option>
            ${Object.entries(projectMap).map(([pid, name]) => `<option value="${pid}"${String(cell.planned_project_id || '') === String(pid) ? ' selected' : ''}>${Fmt.escape(name)}</option>`).join('')}
          </select>
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
          planned_project_id: fd.get('planned_project_id') ? Number.parseInt(String(fd.get('planned_project_id')), 10) : null,
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
          <input name="actual_minutes" type="number" min="0" max="1440" value="${cell.override_minutes != null ? String(cell.override_minutes) : String(cell.auto_minutes || 0)}" required />
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
