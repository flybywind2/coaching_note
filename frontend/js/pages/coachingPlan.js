/**
 * 코칭 계획/실적 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.coachingPlan = {
  anchorDate: new Date(),

  async render(el, params = {}) {
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
            <p class="search-sub">코치별 계획(시간대/메모)과 입퇴실 기반 실적을 날짜 축으로 확인합니다.</p>
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
              <button id="cp-prev" class="btn btn-sm">◀ 이전 주</button>
              <span id="cp-range-label" class="cal-month"></span>
              <button id="cp-next" class="btn btn-sm">다음 주 ▶</button>
            </div>
          </div>
          <div id="cp-grid" class="card cp-grid-wrap"><div class="loading">로딩 중...</div></div>
        </div>
      `;

      const loadGrid = async () => {
        const range = this._weekRange(this.anchorDate);
        const payload = {
          batch_id: Number.parseInt(document.getElementById('cp-batch').value, 10),
          start: range.start,
          end: range.end,
        };
        const coachFilter = document.getElementById('cp-coach-filter')?.value;
        if (coachFilter) payload.coach_user_id = Number.parseInt(coachFilter, 10);

        document.getElementById('cp-range-label').textContent = `${range.start} ~ ${range.end}`;
        await this._renderGrid(document.getElementById('cp-grid'), payload, user);
      };

      document.getElementById('cp-batch').addEventListener('change', async (e) => {
        State.set('currentBatchId', Number.parseInt(e.target.value, 10));
        await loadGrid();
      });
      document.getElementById('cp-coach-filter')?.addEventListener('change', loadGrid);
      document.getElementById('cp-prev').addEventListener('click', async () => {
        this.anchorDate.setDate(this.anchorDate.getDate() - 7);
        await loadGrid();
      });
      document.getElementById('cp-next').addEventListener('click', async () => {
        this.anchorDate.setDate(this.anchorDate.getDate() + 7);
        await loadGrid();
      });

      await loadGrid();
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _weekRange(anchorDate) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    const day = d.getDay();
    const mondayOffset = (day + 6) % 7;
    d.setDate(d.getDate() - mondayOffset);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    end.setDate(end.getDate() + 6);
    return { start: this._dateKey(d), end: this._dateKey(end) };
  },

  _dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
    return `${h}시간 ${m}분`;
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

    gridEl.innerHTML = `
      <div class="cp-table-wrap">
        <table class="data-table coaching-plan-table">
          <thead>
            <tr>
              <th class="cp-coach-col">코치</th>
              ${data.dates.map((dt) => `<th>${this._dayLabel(dt)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((row) => `
              <tr>
                <th class="cp-coach-col">
                  <strong>${Fmt.escape(row.coach_name)}</strong>
                  <div class="hint">${Fmt.escape(row.coach_emp_id)} ${row.department ? `· ${Fmt.escape(row.department)}` : ''}</div>
                </th>
                ${row.cells.map((cell) => {
                  const canEditPlan = isAdmin || row.coach_user_id === user.user_id;
                  return `
                    <td>
                      <div class="cp-cell">
                        <div class="cp-plan">
                          <div class="cp-line"><strong>계획</strong></div>
                          <div class="cp-line">${cell.start_time && cell.end_time ? `${Fmt.escape(cell.start_time)} ~ ${Fmt.escape(cell.end_time)}` : '-'}</div>
                          <div class="cp-line">${cell.project_name ? Fmt.escape(cell.project_name) : '-'}</div>
                          ${cell.entered_previous_day ? '<span class="tag">전일입력</span>' : ''}
                        </div>
                        <div class="cp-actual">
                          <div class="cp-line"><strong>실적</strong></div>
                          <div class="cp-line">${this._formatMinutes(cell.final_minutes)}</div>
                          <div class="cp-line hint">${cell.log_count}건 로그 ${cell.actual_source === 'override' ? '(보정)' : (cell.actual_source === 'auto' ? '(자동)' : '')}</div>
                        </div>
                        <div class="cp-actions">
                          ${canEditPlan ? `<button class="btn btn-xs cp-edit-plan" data-coach="${row.coach_user_id}" data-date="${cell.date}" data-cell='${Fmt.escape(JSON.stringify(cell))}'>계획</button>` : ''}
                          ${isAdmin ? `<button class="btn btn-xs btn-secondary cp-edit-actual" data-coach="${row.coach_user_id}" data-name="${Fmt.escape(row.coach_name)}" data-date="${cell.date}" data-cell='${Fmt.escape(JSON.stringify(cell))}'>실적</button>` : ''}
                        </div>
                      </div>
                    </td>`;
                }).join('')}
              </tr>
            `).join('')}
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
          <div class="info-item"><label>자동 실적</label><span>${this._formatMinutes(cell.auto_minutes)}</span></div>
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

