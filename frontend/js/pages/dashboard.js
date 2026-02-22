/**
 * Dashboard 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.dashboard = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      if (!Auth.isAdminOrInternalCoach()) {
        el.innerHTML = '<div class="error-state">대시보드 접근 권한이 없습니다.</div>';
        return;
      }

      const isAdmin = user.role === 'admin';
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수 데이터가 없습니다.</div>';
        return;
      }

      const batchId = State.get('currentBatchId') || batches[0]?.batch_id;
      let mode = State.get('dashMode') || 'progress';
      if (!isAdmin && mode === 'coach-performance') {
        mode = 'progress';
        State.set('dashMode', mode);
      }
      const projectType = State.get('dashProjectType') || 'primary';
      const expandedProjects = State.get('dashExpandedProjects') || {};
      const data = await API.getDashboard(batchId);
      const coachingDates = this._getCoachingDates(data);
      const coachingStartDate = data?.batch?.coaching_start_date || data?.batch?.start_date || null;
      const projects = this._getFilteredProjects(data, projectType);

      el.innerHTML = `
        <div class="page-container dashboard-page">
          <div class="page-header">
            <div class="inline-actions" style="justify-content:space-between; width:100%; align-items:flex-end; gap:10px;">
              <div>
                <h1>대시보드</h1>
                <p class="hint">코칭일정 기준으로 진행률/출석/코칭 지표를 확인합니다.</p>
              </div>
              <select id="dash-batch">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
            </div>
            <div class="dash-controls">
              <div class="dash-mode-group">
                <button type="button" class="btn btn-sm dash-mode-btn${mode === 'progress' ? ' btn-primary' : ' btn-secondary'}" data-mode="progress">진행률</button>
                <button type="button" class="btn btn-sm dash-mode-btn${mode === 'attendance' ? ' btn-primary' : ' btn-secondary'}" data-mode="attendance">출석</button>
                <button type="button" class="btn btn-sm dash-mode-btn${mode === 'coaching' ? ' btn-primary' : ' btn-secondary'}" data-mode="coaching">코칭</button>
                ${isAdmin ? `<button type="button" class="btn btn-sm dash-mode-btn${mode === 'coach-performance' ? ' btn-primary' : ' btn-secondary'}" data-mode="coach-performance">코칭 실적</button>` : ''}
              </div>
              ${mode !== 'coach-performance' ? `
                <div class="dash-type-group">
                  <button type="button" class="btn btn-sm dash-type-btn${projectType === 'primary' ? ' btn-primary' : ' btn-secondary'}" data-type="primary">정식과제</button>
                  <button type="button" class="btn btn-sm dash-type-btn${projectType === 'associate' ? ' btn-primary' : ' btn-secondary'}" data-type="associate">준참여과제</button>
                </div>
              ` : ''}
            </div>
          </div>
          <section class="dash-panel">
            ${this._renderMatrix({
              mode,
              projects,
              dates: coachingDates,
              attendanceRows: data.attendance_rows || [],
              noteRows: data.note_rows || [],
              attendanceMemberRows: data.attendance_member_rows || [],
              coachPerformanceRows: data.coach_performance || [],
              expandedProjects,
              coachingStartDate,
            })}
          </section>
        </div>
      `;

      document.getElementById('dash-batch')?.addEventListener('change', (e) => {
        State.set('currentBatchId', Number.parseInt(e.target.value, 10));
        State.set('dashExpandedProjects', {});
        this.render(el, params);
      });
      el.querySelectorAll('.dash-mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.mode;
          if (!next || next === mode) return;
          State.set('dashMode', next);
          if (next !== 'attendance') State.set('dashExpandedProjects', {});
          this.render(el, params);
        });
      });
      el.querySelectorAll('.dash-type-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.type;
          if (!next || next === projectType) return;
          State.set('dashProjectType', next);
          State.set('dashExpandedProjects', {});
          this.render(el, params);
        });
      });
      el.querySelectorAll('.dash-toggle-members-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const projectId = Number.parseInt(btn.dataset.projectId, 10);
          if (Number.isNaN(projectId)) return;
          const current = { ...(State.get('dashExpandedProjects') || {}) };
          current[projectId] = !current[projectId];
          State.set('dashExpandedProjects', current);
          this.render(el, params);
        });
      });

      if (mode === 'attendance' || mode === 'coaching') {
        this._scrollToFocusDate('dash-matrix-wrap', coachingDates);
      }
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _getCoachingDates(data) {
    const dates = Array.isArray(data?.dates) ? data.dates : [];
    const set = new Set(Array.isArray(data?.coaching_schedule_dates) ? data.coaching_schedule_dates : []);
    return dates.filter((d) => set.has(d));
  },

  _getFilteredProjects(data, projectType) {
    const list = Array.isArray(data?.projects) ? data.projects : [];
    return list
      .filter((row) => (row.project_type || 'primary') === projectType)
      .sort((a, b) => String(a.project_name || '').localeCompare(String(b.project_name || '')));
  },

  _renderMatrix({
    mode,
    projects,
    dates,
    attendanceRows,
    noteRows,
    attendanceMemberRows,
    coachPerformanceRows,
    expandedProjects,
    coachingStartDate,
  }) {
    if (mode === 'coach-performance') {
      if (!coachPerformanceRows.length) {
        return '<p class="empty-state">코칭 실적 데이터가 없습니다.</p>';
      }
      return `
        <div class="dash-matrix-wrap" id="dash-matrix-wrap">
          <table class="data-table dash-matrix-table dash-coach-perf-table">
            <thead>
              <tr>
                <th class="sticky-col sticky-col-project">코치</th>
                <th class="sticky-col sticky-col-total">합계</th>
                <th>입실(코칭) 횟수</th>
                <th>코칭의견 작성 건수</th>
              </tr>
            </thead>
            <tbody>
              ${coachPerformanceRows.map((row) => {
                const checkinCount = Number(row.checkin_count || 0);
                const commentCount = Number(row.comment_count || 0);
                return `
                  <tr>
                    <td class="sticky-col sticky-col-project">${Fmt.escape(row.coach_name || '-')}</td>
                    <td class="sticky-col sticky-col-total dash-total-cell">${checkinCount + commentCount}</td>
                    <td class="dash-value-cell">${checkinCount}</td>
                    <td class="dash-value-cell">${commentCount}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (!projects.length) {
      return '<p class="empty-state">표시할 과제가 없습니다.</p>';
    }
    if (mode !== 'progress' && !dates.length) {
      return '<p class="empty-state">코칭 일정 데이터가 없습니다.</p>';
    }

    const attendanceMap = new Map(attendanceRows.map((row) => [row.project_id, row]));
    const noteMap = new Map(noteRows.map((row) => [row.project_id, row]));
    const attendanceMemberMap = new Map(attendanceMemberRows.map((row) => [row.project_id, row.members || []]));

    if (mode === 'progress') {
      return `
        <div class="dash-matrix-wrap" id="dash-matrix-wrap">
          <table class="data-table dash-matrix-table dash-progress-table">
            <thead>
              <tr>
                <th class="sticky-col sticky-col-project">과제</th>
                <th class="sticky-col sticky-col-total">합계</th>
                <th>진행률</th>
              </tr>
            </thead>
            <tbody>
              ${projects.map((project) => {
                const progress = Number(project.progress_rate || 0);
                const safe = Math.max(0, Math.min(100, progress));
                return `
                  <tr>
                    <td class="sticky-col sticky-col-project">
                      <a href="#/project/${project.project_id}" class="proj-link">${Fmt.escape(project.project_name)}</a>
                    </td>
                    <td class="sticky-col sticky-col-total dash-total-cell">${safe.toFixed(0)}%</td>
                    <td class="dash-value-cell">
                      <div class="dash-progress-bar"><span class="dash-progress-fill" style="width:${safe}%;"></span></div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (mode === 'attendance') {
      return `
        <div class="dash-matrix-wrap" id="dash-matrix-wrap">
          <table class="data-table dash-matrix-table dash-attendance-table">
            <thead>
              <tr>
                <th class="sticky-col sticky-col-project">과제</th>
                <th class="sticky-col sticky-col-people">총인원</th>
                <th class="sticky-col sticky-col-total">합계</th>
                ${dates.map((d) => `<th data-date="${Fmt.escape(d)}">${this._dateHeader(d, coachingStartDate)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${projects.map((project) => this._renderAttendanceRows({
                project,
                dates,
                row: attendanceMap.get(project.project_id) || { cells: [], expected_count: Number(project.expected_count || 0) },
                members: attendanceMemberMap.get(project.project_id) || [],
                expanded: !!expandedProjects[project.project_id],
              })).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="dash-matrix-wrap" id="dash-matrix-wrap">
        <table class="data-table dash-matrix-table dash-coaching-table">
          <thead>
            <tr>
              <th class="sticky-col sticky-col-project">과제</th>
              <th class="sticky-col sticky-col-total">합계</th>
              ${dates.map((d) => `<th data-date="${Fmt.escape(d)}">${this._dateHeader(d, coachingStartDate)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${projects.map((project) => {
              const row = noteMap.get(project.project_id) || { cells: [] };
              const cells = this._orderedCells(row.cells || [], dates, { note_count: 0, coach_commenter_count: 0 });
              const totalNotes = cells.reduce((acc, cell) => acc + Number(cell.note_count || 0), 0);
              const totalCommenters = cells.reduce((acc, cell) => acc + Number(cell.coach_commenter_count || 0), 0);
              return `
                <tr>
                  <td class="sticky-col sticky-col-project">
                    <a href="#/project/${project.project_id}" class="proj-link">${Fmt.escape(project.project_name)}</a>
                  </td>
                  <td class="sticky-col sticky-col-total dash-total-cell">
                    ${totalNotes}건
                    <div class="dash-subtext">코치 ${totalCommenters}명</div>
                  </td>
                  ${cells.map((cell) => `
                    <td class="dash-value-cell" data-date="${Fmt.escape(cell.date)}">
                      ${Number(cell.note_count || 0)}건
                      <div class="dash-subtext">코치 ${Number(cell.coach_commenter_count || 0)}명</div>
                    </td>
                  `).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  _renderAttendanceRows({ project, dates, row, members, expanded }) {
    const expectedCount = Number(row.expected_count || project.expected_count || 0);
    const cells = this._orderedCells(row.cells || [], dates, { attendance_count: 0, attendance_rate: 0 });
    const attendedDays = cells.filter((cell) => Number(cell.attendance_count || 0) > 0).length;
    const totalCoachingDays = dates.length;
    const memberRows = expanded
      ? (members || []).map((member) => {
        const attendedSet = new Set((member.attendance_dates || []).map((d) => String(d)));
        return `
          <tr class="dash-member-row">
            <td class="sticky-col sticky-col-project dash-member-name">- ${Fmt.escape(member.user_name || `#${member.user_id}`)}</td>
            <td class="sticky-col sticky-col-people"></td>
            <td class="sticky-col sticky-col-total"></td>
            ${dates.map((dateKey) => `<td class="dash-value-cell">${attendedSet.has(dateKey) ? 'V' : ''}</td>`).join('')}
          </tr>
        `;
      }).join('')
      : '';

    return `
      <tr>
        <td class="sticky-col sticky-col-project">
          <a href="#/project/${project.project_id}" class="proj-link">${Fmt.escape(project.project_name)}</a>
        </td>
        <td class="sticky-col sticky-col-people dash-value-cell">
          <button type="button" class="dash-toggle-members-btn" data-project-id="${project.project_id}">
            대상 ${expectedCount}명 ${expanded ? '▲' : '▼'}
          </button>
        </td>
        <td class="sticky-col sticky-col-total dash-total-cell">
          ${attendedDays}/${totalCoachingDays}
          <div class="dash-subtext">출석일수</div>
        </td>
        ${cells.map((cell) => `
          <td class="dash-value-cell" data-date="${Fmt.escape(cell.date)}">
            ${Number(cell.attendance_count || 0)}
            <div class="dash-subtext">${Number(cell.attendance_rate || 0).toFixed(1)}%</div>
          </td>
        `).join('')}
      </tr>
      ${memberRows}
    `;
  },

  _orderedCells(cells, dates, fallback) {
    const map = {};
    (cells || []).forEach((cell) => {
      map[cell.date] = cell;
    });
    return (dates || []).map((date) => ({ date, ...(fallback || {}), ...(map[date] || {}) }));
  },

  _dateLabel(isoDate) {
    const parsed = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    const week = ['일', '월', '화', '수', '목', '금', '토'][parsed.getDay()];
    return `${parsed.getMonth() + 1}/${parsed.getDate()}(${week})`;
  },

  _weekNumberFromBaseline(targetIsoDate, baselineIsoDate) {
    if (!targetIsoDate || !baselineIsoDate) return 1;
    const target = new Date(`${targetIsoDate}T00:00:00`);
    const baseline = new Date(`${baselineIsoDate}T00:00:00`);
    if (Number.isNaN(target.getTime()) || Number.isNaN(baseline.getTime())) return 1;
    const deltaDays = Math.floor((target - baseline) / 86400000);
    return deltaDays >= 0 ? Math.floor(deltaDays / 7) + 1 : 1;
  },

  _dateHeader(isoDate, baselineIsoDate) {
    const weekNo = this._weekNumberFromBaseline(isoDate, baselineIsoDate);
    return `<div class="dash-week-label">${weekNo}주차</div><div class="dash-day-label">${this._dateLabel(isoDate)}</div>`;
  },

  _todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _scrollToFocusDate(wrapId, dates) {
    setTimeout(() => {
      const wrap = document.getElementById(wrapId);
      if (!wrap || !Array.isArray(dates) || !dates.length) return;
      const targetDate = dates.includes(this._todayIso()) ? this._todayIso() : dates[0];
      const target = wrap.querySelector(`thead th[data-date="${targetDate}"]`);
      if (!target) return;
      const left = target.offsetLeft - wrap.offsetLeft - 16;
      wrap.scrollLeft = Math.max(left, 0);
    }, 0);
  },
};
