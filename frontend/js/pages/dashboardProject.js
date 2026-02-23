/**
 * 대시보드의 과제별 출석/코칭 전체 현황 상세 페이지입니다.
 */

Pages.dashboardProject = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      if (!Auth.isAdminOrInternalCoach()) {
        el.innerHTML = '<div class="error-state">대시보드 접근 권한이 없습니다.</div>';
        return;
      }

      const projectId = Number.parseInt(params.id, 10);
      if (Number.isNaN(projectId)) {
        el.innerHTML = '<div class="error-state">유효하지 않은 과제입니다.</div>';
        return;
      }

      const mode = params.mode === 'coaching' ? 'coaching' : 'attendance';
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수 데이터가 없습니다.</div>';
        return;
      }

      const requestedBatchId = Number.parseInt(params.batch_id, 10);
      const fallbackBatchId = Number.parseInt(State.get('currentBatchId'), 10);
      const batchId = [requestedBatchId, fallbackBatchId, batches[0].batch_id]
        .find((id) => Number.isInteger(id) && batches.some((b) => b.batch_id === id));

      State.set('dashMode', mode);
      State.set('currentBatchId', batchId);

      const data = await API.getDashboard(batchId);
      const project = (data.projects || []).find((p) => Number(p.project_id) === projectId);
      if (!project) {
        el.innerHTML = '<div class="error-state">해당 과제를 찾을 수 없습니다.</div>';
        return;
      }

      const coachingDates = this._getCoachingDates(data);
      const baselineIsoDate = data?.batch?.coaching_start_date || data?.batch?.start_date || null;
      const detail = mode === 'attendance'
        ? this._buildAttendanceDetail(data, project, coachingDates, baselineIsoDate)
        : this._buildCoachingDetail(data, project, coachingDates, baselineIsoDate);

      el.innerHTML = `
        <div class="page-container dashboard-project-page">
          <a href="#/dashboard" class="back-link">← 대시보드로</a>
          <div class="page-header">
            <h1>${Fmt.escape(project.project_name)}</h1>
            <p class="hint">
              ${mode === 'attendance' ? '출석' : '코칭'} 전체 현황
              · ${Fmt.escape(data?.batch?.batch_name || '')}
            </p>
          </div>

          <div class="dash-project-controls">
            <div class="dash-mode-group">
              <button type="button" class="btn btn-sm ${mode === 'attendance' ? 'btn-primary' : 'btn-secondary'}" id="dash-project-mode-attendance">출석</button>
              <button type="button" class="btn btn-sm ${mode === 'coaching' ? 'btn-primary' : 'btn-secondary'}" id="dash-project-mode-coaching">코칭</button>
            </div>
            <div class="dash-week-group">
              <label for="dash-project-batch">차수</label>
              <select id="dash-project-batch">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <section class="dash-panel">
            <div class="dash-project-summary">
              ${mode === 'attendance' ? `
                <div class="dash-project-stat">
                  <div class="dash-project-stat-label">대상 인원</div>
                  <div class="dash-project-stat-value">${detail.expectedCount}명</div>
                </div>
                <div class="dash-project-stat">
                  <div class="dash-project-stat-label">출석 일수</div>
                  <div class="dash-project-stat-value">${detail.attendedDays}/${detail.totalDays}</div>
                </div>
              ` : `
                <div class="dash-project-stat">
                  <div class="dash-project-stat-label">코칭의견 합계</div>
                  <div class="dash-project-stat-value">${detail.totalNotes}건</div>
                </div>
                <div class="dash-project-stat">
                  <div class="dash-project-stat-label">코치 참여 합계</div>
                  <div class="dash-project-stat-value">${detail.totalCommenters}명</div>
                </div>
              `}
              <div class="dash-project-stat">
                <div class="dash-project-stat-label">코칭 일정</div>
                <div class="dash-project-stat-value">${coachingDates.length}일</div>
              </div>
            </div>

            <div class="dash-project-table-wrap">
              <table class="data-table dash-project-table">
                <thead>
                  <tr>
                    <th>주차</th>
                    <th>날짜</th>
                    ${mode === 'attendance' ? '<th>출석 인원</th><th>출석률</th>' : '<th>코칭의견</th><th>코치 수</th>'}
                  </tr>
                </thead>
                <tbody>
                  ${detail.rows.length ? detail.rows.map((row) => `
                    <tr>
                      <td>${row.weekNo}주차</td>
                      <td>${Fmt.escape(this._dateLabel(row.date))}</td>
                      ${mode === 'attendance'
                        ? `<td>${Number(row.attendance_count || 0)}</td><td>${Number(row.attendance_rate || 0).toFixed(1)}%</td>`
                        : `<td>${Number(row.note_count || 0)}건</td><td>${Number(row.coach_commenter_count || 0)}명</td>`}
                    </tr>
                  `).join('') : `
                    <tr><td colspan="4" class="empty-state">표시할 데이터가 없습니다.</td></tr>
                  `}
                </tbody>
              </table>
            </div>

            ${mode === 'attendance' && detail.members.length ? `
              <div class="dash-project-member-wrap">
                <h3>팀원 출석 요약</h3>
                <div class="dash-project-table-wrap">
                  <table class="data-table dash-project-table">
                    <thead>
                      <tr>
                        <th>이름</th>
                        <th>출석 일수</th>
                        <th>출석률</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${detail.members.map((member) => `
                        <tr>
                          <td>${Fmt.escape(member.user_name || `#${member.user_id}`)}</td>
                          <td>${member.attendedDays}/${coachingDates.length}</td>
                          <td>${coachingDates.length ? ((member.attendedDays / coachingDates.length) * 100).toFixed(1) : '0.0'}%</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}
          </section>
        </div>
      `;

      document.getElementById('dash-project-mode-attendance')?.addEventListener('click', () => {
        Router.go(this._route(projectId, 'attendance', batchId));
      });
      document.getElementById('dash-project-mode-coaching')?.addEventListener('click', () => {
        Router.go(this._route(projectId, 'coaching', batchId));
      });
      document.getElementById('dash-project-batch')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        Router.go(this._route(projectId, mode, nextBatchId));
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _route(projectId, mode, batchId) {
    return `#/dashboard/project/${projectId}?mode=${encodeURIComponent(mode)}&batch_id=${encodeURIComponent(String(batchId || ''))}`;
  },

  _getCoachingDates(data) {
    const dates = Array.isArray(data?.dates) ? data.dates : [];
    const set = new Set(Array.isArray(data?.coaching_schedule_dates) ? data.coaching_schedule_dates : []);
    return dates.filter((d) => set.has(d));
  },

  _buildAttendanceDetail(data, project, dates, baselineIsoDate) {
    const attendanceRows = Array.isArray(data?.attendance_rows) ? data.attendance_rows : [];
    const attendanceMemberRows = Array.isArray(data?.attendance_member_rows) ? data.attendance_member_rows : [];
    const row = attendanceRows.find((item) => Number(item.project_id) === Number(project.project_id)) || {};
    const membersRow = attendanceMemberRows.find((item) => Number(item.project_id) === Number(project.project_id)) || {};
    const rows = this._orderedCells(row.cells || [], dates, { attendance_count: 0, attendance_rate: 0 })
      .map((cell) => ({ ...cell, weekNo: this._weekNumberFromBaseline(cell.date, baselineIsoDate) }));
    const attendedDays = rows.filter((cell) => Number(cell.attendance_count || 0) > 0).length;
    const expectedCount = Number(row.expected_count || project.expected_count || 0);
    const members = (membersRow.members || []).map((member) => {
      const attendedSet = new Set((member.attendance_dates || []).map((d) => String(d)));
      return {
        ...member,
        attendedDays: dates.filter((dateKey) => attendedSet.has(dateKey)).length,
      };
    });
    return {
      rows,
      attendedDays,
      totalDays: dates.length,
      expectedCount,
      members,
    };
  },

  _buildCoachingDetail(data, project, dates, baselineIsoDate) {
    const noteRows = Array.isArray(data?.note_rows) ? data.note_rows : [];
    const row = noteRows.find((item) => Number(item.project_id) === Number(project.project_id)) || {};
    const rows = this._orderedCells(row.cells || [], dates, { note_count: 0, coach_commenter_count: 0 })
      .map((cell) => ({ ...cell, weekNo: this._weekNumberFromBaseline(cell.date, baselineIsoDate) }));
    return {
      rows,
      totalNotes: rows.reduce((acc, cell) => acc + Number(cell.note_count || 0), 0),
      totalCommenters: rows.reduce((acc, cell) => acc + Number(cell.coach_commenter_count || 0), 0),
    };
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
};
