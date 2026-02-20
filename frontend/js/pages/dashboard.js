/**
 * Dashboard 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.dashboard = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const batches = await API.getBatches();
      const batchId = State.get('currentBatchId') || batches[0]?.batch_id;
      const data = await API.getDashboard(batchId);

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <div class="inline-actions" style="justify-content:space-between; width:100%;">
              <h1>대시보드</h1>
              <select id="dash-batch">${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}</select>
            </div>
          </div>

          <div class="dash-grid dash-grid-single">
            <section class="dash-panel">
              <h3>과제별 · 날짜별 출석 현황</h3>
              ${this._renderAttendanceTable(data.project_daily_attendance || [])}
            </section>

            <section class="dash-panel">
              <h3>과제별 · 날짜별 코칭노트/코칭의견 지표</h3>
              ${this._renderNoteTable(data.project_daily_notes || [])}
            </section>

            <section class="dash-panel">
              <h3>코치별 작성 통계</h3>
              ${this._renderCoachTable(data.coach_activity || [])}
            </section>
          </div>
        </div>`;

      document.getElementById('dash-batch')?.addEventListener('change', (e) => {
        State.set('currentBatchId', parseInt(e.target.value, 10));
        this.render(el, params);
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderAttendanceTable(rows) {
    if (!rows.length) return '<p class="empty-state">출석 데이터가 없습니다.</p>';
    return `<div class="dash-table-wrap"><table class="data-table dash-table">
      <thead><tr><th>날짜</th><th>과제</th><th>출석 인원</th><th>대상 인원</th><th>출석률</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${Fmt.date(row.date)}</td>
          <td><a href="#/project/${row.project_id}" class="proj-link">${Fmt.escape(row.project_name)}</a></td>
          <td>${row.attendance_count}</td>
          <td>${row.expected_count}</td>
          <td>${row.attendance_rate}%</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  },

  _renderNoteTable(rows) {
    if (!rows.length) return '<p class="empty-state">코칭노트 데이터가 없습니다.</p>';
    return `<div class="dash-table-wrap"><table class="data-table dash-table">
      <thead><tr><th>날짜</th><th>과제</th><th>코칭노트 건수</th><th>코칭의견 작성 코치 수</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${Fmt.date(row.date)}</td>
          <td><a href="#/project/${row.project_id}" class="proj-link">${Fmt.escape(row.project_name)}</a></td>
          <td>${row.note_count}</td>
          <td>${row.coach_commenter_count}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  },

  _renderCoachTable(rows) {
    if (!rows.length) return '<p class="empty-state">코치 데이터가 없습니다.</p>';
    return `<div class="dash-table-wrap"><table class="data-table dash-table">
      <thead><tr><th>코치</th><th>코칭노트 작성</th><th>코칭의견 작성</th><th>합계</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${Fmt.escape(row.coach_name)}</td>
          <td>${row.note_count}</td>
          <td>${row.comment_count}</td>
          <td>${(row.note_count || 0) + (row.comment_count || 0)}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  },
};
