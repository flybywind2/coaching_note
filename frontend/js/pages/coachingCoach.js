/**
 * 코치별 코칭 계획/실적 관리 화면입니다.
 */

Pages.coachingCoach = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      if (!Auth.isAdminOrInternalCoach()) {
        el.innerHTML = '<div class="error-state">코칭 계획/실적 접근 권한이 없습니다.</div>';
        return;
      }

      const coachUserId = Number.parseInt(params.id, 10);
      if (Number.isNaN(coachUserId)) {
        el.innerHTML = '<div class="error-state">유효하지 않은 코치입니다.</div>';
        return;
      }
      const user = Auth.getUser();
      const isAdmin = user.role === 'admin';

      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }

      const requestedBatchId = Number.parseInt(params.batch_id, 10);
      const stateBatchId = Number.parseInt(State.get('currentBatchId'), 10);
      const batchId = [requestedBatchId, stateBatchId, batches[0].batch_id]
        .find((id) => Number.isInteger(id) && batches.some((b) => b.batch_id === id));
      State.set('currentBatchId', batchId);

      const batch = await API.getBatch(batchId);
      const payload = {
        batch_id: batchId,
        start: batch.start_date,
        end: batch.end_date,
        coaching_start_date: batch.coaching_start_date || batch.start_date,
      };
      const grid = await API.getCoachingPlanGrid(payload);
      const row = (grid.rows || []).find((r) => Number(r.coach_user_id) === coachUserId);
      if (!row) {
        el.innerHTML = '<div class="error-state">선택한 차수에서 코치 데이터를 찾을 수 없습니다.</div>';
        return;
      }
      const canEditPlan = isAdmin || Number(user.user_id) === Number(row.coach_user_id);

      const coachingDateSet = new Set((grid.coaching_schedule_dates || []).map((d) => String(d).slice(0, 10)));
      const visibleDateKeys = (grid.dates || [])
        .map((dt) => String(dt).slice(0, 10))
        .filter((dateKey) => coachingDateSet.has(dateKey));
      const cellMap = {};
      (row.cells || []).forEach((cell) => {
        cellMap[String(cell.date).slice(0, 10)] = cell;
      });
      const rows = visibleDateKeys.map((dateKey) => ({
        date: dateKey,
        weekNo: this._weekNumberFromBaseline(dateKey, payload.coaching_start_date || payload.start),
        ...(cellMap[dateKey] || {}),
      }));

      const plannedDays = rows.filter((item) => item.plan_id).length;
      const actualDays = rows.filter((item) => Number(item.final_minutes || 0) > 0).length;
      const totalMinutes = rows.reduce((acc, item) => acc + Number(item.final_minutes || 0), 0);

      const dashboard = await API.getDashboard(batchId).catch(() => null);
      const coachPerformance = this._resolveCoachPerformance(dashboard?.coach_performance || [], row);
      const checkinCount = Number(coachPerformance?.checkin_count || 0);
      const commentCount = Number(coachPerformance?.comment_count || 0);

      el.innerHTML = `
        <div class="page-container coaching-coach-page">
          <a href="#/coaching-plan" class="back-link">← 코칭 계획/실적으로</a>
          <div class="page-header">
            <h1>${Fmt.escape(row.coach_name)}</h1>
            <p class="hint">${Fmt.escape(row.coach_emp_id || '-')} ${row.department ? `· ${Fmt.escape(row.department)}` : ''} · ${Fmt.escape(batch.batch_name || '')}</p>
            <div class="inline-actions">
              <label for="coach-batch-select">차수</label>
              <select id="coach-batch-select">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <section class="card coach-summary-grid">
            <div class="coach-summary-item">
              <div class="coach-summary-label">계획 입력일</div>
              <div class="coach-summary-value">${plannedDays}/${visibleDateKeys.length}</div>
            </div>
            <div class="coach-summary-item">
              <div class="coach-summary-label">실적 입력일</div>
              <div class="coach-summary-value">${actualDays}/${visibleDateKeys.length}</div>
            </div>
            <div class="coach-summary-item">
              <div class="coach-summary-label">실적 합계</div>
              <div class="coach-summary-value">${Fmt.escape(this._formatMinutes(totalMinutes))}</div>
            </div>
            <div class="coach-summary-item">
              <div class="coach-summary-label">입실(코칭) 횟수</div>
              <div class="coach-summary-value">${checkinCount}</div>
            </div>
            <div class="coach-summary-item">
              <div class="coach-summary-label">코칭의견 작성 건수</div>
              <div class="coach-summary-value">${commentCount}</div>
            </div>
          </section>

          <section class="card">
            <div class="coach-table-wrap">
              <table class="data-table coach-detail-table">
                <thead>
                  <tr>
                    <th>주차</th>
                    <th>날짜</th>
                    <th>계획</th>
                    <th>실적</th>
                    <th>실적(분)</th>
                    <th>계획 관리</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.length ? rows.map((item) => `
                    <tr>
                      <td>${item.weekNo}주차</td>
                      <td>${Fmt.escape(this._dateLabel(item.date))}</td>
                      <td>${Fmt.escape(this._formatPlanTime(item))}</td>
                      <td>${Fmt.escape(this._formatActualRange(item))}</td>
                      <td>${Number(item.final_minutes || 0)}</td>
                      <td>
                        ${canEditPlan
    ? `<button type="button" class="btn btn-sm coach-plan-edit-btn" data-date="${Fmt.escape(item.date)}" data-cell="${this._escapeAttrJson(item)}">${item.plan_id ? '수정' : '입력'}</button>`
    : '-'}
                      </td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" class="empty-state">코칭 일정 데이터가 없습니다.</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      `;

      document.getElementById('coach-batch-select')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        Router.go(`#/coaching-plan/coach/${coachUserId}?batch_id=${encodeURIComponent(String(nextBatchId || ''))}`);
      });
      if (canEditPlan) {
        el.querySelectorAll('.coach-plan-edit-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const workDate = btn.dataset.date;
            const cell = JSON.parse(btn.dataset.cell || '{}');
            await this._openPlanModal({
              payload,
              coachUserId,
              workDate,
              cell,
              reload: async (nextFocusDate) => {
                await this.render(el, {
                  ...params,
                  id: String(coachUserId),
                  batch_id: String(batchId),
                  focus_date: nextFocusDate || workDate,
                });
              },
            });
          });
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _resolveCoachPerformance(rows, coachRow) {
    const coachUserId = Number(coachRow.coach_user_id);
    if (!Number.isNaN(coachUserId)) {
      const byId = rows.find((item) => Number(item.coach_user_id) === coachUserId);
      if (byId) return byId;
    }
    const coachEmpId = String(coachRow.coach_emp_id || '').trim();
    if (coachEmpId) {
      const byEmp = rows.find((item) => String(item.coach_emp_id || '').trim() === coachEmpId);
      if (byEmp) return byEmp;
    }
    const coachName = String(coachRow.coach_name || '').trim();
    if (coachName) {
      return rows.find((item) => String(item.coach_name || '').trim() === coachName) || null;
    }
    return null;
  },

  _dateLabel(dateText) {
    const d = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateText;
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

  _formatPlanTime(cell) {
    if (!cell.plan_id) return '-';
    if (cell.is_all_day) return '종일';
    if (cell.start_time && cell.end_time) return `${cell.start_time} ~ ${cell.end_time}`;
    return '-';
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

  _formatMinutes(minutes) {
    const mins = Number(minutes || 0);
    if (!mins) return '0분';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m}분`;
    if (!m) return `${h}시간`;
    return `${h}시간${m}분`;
  },

  _escapeAttrJson(value) {
    return String(JSON.stringify(value || {}))
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },

  async _openPlanModal({ payload, coachUserId, workDate, cell, reload }) {
    Modal.open(`
      <h2>코칭 계획 입력</h2>
      <form id="cp-coach-plan-form">
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
            <input name="start_time" type="time" step="600" value="${Fmt.escape(cell.start_time || '')}" />
          </div>
          <div>
            <label>종료 시간</label>
            <input name="end_time" type="time" step="600" value="${Fmt.escape(cell.end_time || '')}" />
          </div>
        </div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          ${cell.plan_id ? '<button type="button" id="cp-coach-plan-delete" class="btn btn-danger">삭제</button>' : ''}
        </div>
        <p class="form-error" id="cp-coach-plan-err" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-md' });

    const allDayEl = document.querySelector('#cp-coach-plan-form input[name="is_all_day"]');
    const startEl = document.querySelector('#cp-coach-plan-form input[name="start_time"]');
    const endEl = document.querySelector('#cp-coach-plan-form input[name="end_time"]');
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

    document.getElementById('cp-coach-plan-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = document.getElementById('cp-coach-plan-err');
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

    document.getElementById('cp-coach-plan-delete')?.addEventListener('click', async () => {
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
        const errEl = document.getElementById('cp-coach-plan-err');
        errEl.textContent = err.message || '삭제 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
