/**
 * Dashboard 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.dashboard = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수 데이터가 없습니다.</div>';
        return;
      }

      const batchId = State.get('currentBatchId') || batches[0]?.batch_id;
      const data = await API.getDashboard(batchId);
      const dates = Array.isArray(data?.dates) ? data.dates : [];

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <div class="inline-actions" style="justify-content:space-between; width:100%; align-items:flex-end; gap:10px;">
              <div>
                <h1>대시보드</h1>
                <p class="hint">과제 진행률과 날짜축 기반 운영 지표를 확인합니다.</p>
              </div>
              <select id="dash-batch">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <section class="dash-panel">
            <div class="dash-panel-head">
              <h3>과제별 진행률</h3>
            </div>
            ${this._renderProgressGrid(data.projects || [])}
          </section>

          <section class="dash-panel">
            <div class="dash-panel-head">
              <h3>출석 현황 (과제 × 날짜)</h3>
              <button id="dash-attendance-today-btn" class="btn btn-secondary btn-sm">오늘 위치로 이동</button>
            </div>
            ${this._renderAttendanceMatrix(data.attendance_rows || [], dates, data.pre_schedule_dates || [])}
          </section>

          <section class="dash-panel">
            <div class="dash-panel-head">
              <h3>코칭노트/코칭의견 지표</h3>
              <button id="dash-note-today-btn" class="btn btn-secondary btn-sm">오늘 위치로 이동</button>
            </div>
            ${this._renderNoteMatrix(data.note_rows || [], dates, data.pre_schedule_dates || [])}
          </section>
        </div>`;

      document.getElementById('dash-batch')?.addEventListener('change', (e) => {
        State.set('currentBatchId', parseInt(e.target.value, 10));
        this.render(el, params);
      });

      this._attachTodayScroll('dash-attendance-wrap', dates);
      this._attachTodayScroll('dash-note-wrap', dates);
      document.getElementById('dash-attendance-today-btn')?.addEventListener('click', () => {
        this._scrollToToday('dash-attendance-wrap', dates);
      });
      document.getElementById('dash-note-today-btn')?.addEventListener('click', () => {
        this._scrollToToday('dash-note-wrap', dates);
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderProgressGrid(projects) {
    if (!projects.length) return '<p class="empty-state">표시할 과제가 없습니다.</p>';
    return `<div class="dash-progress-grid">
      ${projects.map((row) => `
        <article class="dash-progress-card">
          <a href="#/project/${row.project_id}" class="proj-link">${Fmt.escape(row.project_name)}</a>
          <div class="dash-progress-meta">
            <span>${Fmt.status(row.status || '-')}</span>
            <span>대상 ${row.expected_count || 0}명</span>
          </div>
          <div class="dash-progress-bar">
            <span class="dash-progress-fill" style="width:${Math.max(0, Math.min(100, Number(row.progress_rate) || 0))}%;"></span>
          </div>
          <div class="dash-progress-rate">${Number(row.progress_rate) || 0}%</div>
        </article>
      `).join('')}
    </div>`;
  },

  _renderAttendanceMatrix(rows, dates, preScheduleDates) {
    if (!rows.length || !dates.length) return '<p class="empty-state">출석 데이터가 없습니다.</p>';
    const preSet = new Set(preScheduleDates || []);
    return `<div class="dash-matrix-wrap" id="dash-attendance-wrap"><table class="data-table dash-matrix-table">
      <thead>
        <tr>
          <th class="sticky-col sticky-col-project">과제 (대상)</th>
          <th class="sticky-col sticky-col-total">합계</th>
          ${dates.map((d) => `<th data-date="${d}" class="${this._dateHeaderClass(d, preSet)}">${this._dateLabel(d)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td class="sticky-col sticky-col-project">
              <a href="#/project/${row.project_id}" class="proj-link">${Fmt.escape(row.project_name)}</a>
              <div class="dash-subtext">대상 ${row.expected_count || 0}명</div>
            </td>
            <td class="sticky-col sticky-col-total dash-total-cell">
              ${row.total_attendance || 0}/${row.total_expected || 0}
              <div class="dash-subtext">${Number(row.total_rate || 0).toFixed(1)}%</div>
            </td>
            ${(row.cells || []).map((cell) => `
              <td data-date="${cell.date}" class="${this._dateCellClass(cell.date, preSet)}">
                ${cell.attendance_count || 0}
                <div class="dash-subtext">${Number(cell.attendance_rate || 0).toFixed(1)}%</div>
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;
  },

  _renderNoteMatrix(rows, dates, preScheduleDates) {
    if (!rows.length || !dates.length) return '<p class="empty-state">코칭노트 데이터가 없습니다.</p>';
    const preSet = new Set(preScheduleDates || []);
    return `<div class="dash-matrix-wrap" id="dash-note-wrap"><table class="data-table dash-matrix-table dash-note-table">
      <thead>
        <tr>
          <th class="sticky-col sticky-col-project">과제</th>
          <th class="sticky-col sticky-col-metric">지표</th>
          <th class="sticky-col sticky-col-total">합계</th>
          ${dates.map((d) => `<th data-date="${d}" class="${this._dateHeaderClass(d, preSet)}">${this._dateLabel(d)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td class="sticky-col sticky-col-project" rowspan="2">
              <a href="#/project/${row.project_id}" class="proj-link">${Fmt.escape(row.project_name)}</a>
            </td>
            <td class="sticky-col sticky-col-metric">코칭노트 건수</td>
            <td class="sticky-col sticky-col-total dash-total-cell">${row.total_note_count || 0}</td>
            ${(row.cells || []).map((cell) => `
              <td data-date="${cell.date}" class="${this._dateCellClass(cell.date, preSet)}">${cell.note_count || 0}</td>
            `).join('')}
          </tr>
          <tr>
            <td class="sticky-col sticky-col-metric">코칭의견 작성 코치 수</td>
            <td class="sticky-col sticky-col-total dash-total-cell">${row.total_coach_commenter_count || 0}</td>
            ${(row.cells || []).map((cell) => `
              <td data-date="${cell.date}" class="${this._dateCellClass(cell.date, preSet)}">${cell.coach_commenter_count || 0}</td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;
  },

  _dateLabel(isoDate) {
    const parsed = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    const week = ['일', '월', '화', '수', '목', '금', '토'][parsed.getDay()];
    return `${parsed.getMonth() + 1}/${parsed.getDate()}(${week})`;
  },

  _todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _dateHeaderClass(isoDate, preSet) {
    const names = [];
    if (preSet.has(isoDate)) names.push('pre-schedule-day');
    if (isoDate === this._todayIso()) names.push('today-col');
    return names.join(' ');
  },

  _dateCellClass(isoDate, preSet) {
    const names = ['dash-value-cell'];
    if (preSet.has(isoDate)) names.push('pre-schedule-day');
    if (isoDate === this._todayIso()) names.push('today-col');
    return names.join(' ');
  },

  _attachTodayScroll(wrapId, dates) {
    setTimeout(() => this._scrollToToday(wrapId, dates), 0);
  },

  _scrollToToday(wrapId, dates) {
    const wrap = document.getElementById(wrapId);
    if (!wrap || !Array.isArray(dates) || !dates.length) return;
    const targetDate = dates.includes(this._todayIso()) ? this._todayIso() : dates[0];
    const target = wrap.querySelector(`thead th[data-date="${targetDate}"]`);
    if (!target) return;
    const left = target.offsetLeft - wrap.offsetLeft - 10;
    wrap.scrollLeft = Math.max(left, 0);
  },
};
