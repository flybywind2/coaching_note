/**
 * Home 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.home = {
  async render(el) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const canSelectBatch = user.role === 'admin' || user.role === 'coach';
      const batches = await API.getBatches();
      const batchId = canSelectBatch
        ? (State.get('currentBatchId') || batches[0]?.batch_id || null)
        : null;

      const home = await API.getHome(batchId);
      const stats = home.stats || {};

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <div class="page-title-row">
              <h1>개인 홈</h1>
              <a href="#/search" class="btn btn-secondary">통합 검색</a>
            </div>
            ${canSelectBatch ? `
              <div class="home-batch-filter">
                <label>차수</label>
                <select id="home-batch-select">
                  ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
                </select>
              </div>` : ''}
          </div>

          <div class="stat-cards">
            <div class="stat-card"><div class="stat-num">${stats.project_count || 0}</div><div class="stat-label">접근 가능 과제</div></div>
            <div class="stat-card"><div class="stat-num">${stats.today_task_count || 0}</div><div class="stat-label">오늘 마감 Task</div></div>
            <div class="stat-card"><div class="stat-num">${stats.overdue_task_count || 0}</div><div class="stat-label">지연 Task</div></div>
            <div class="stat-card"><div class="stat-num">${stats.upcoming_session_count || 0}</div><div class="stat-label">7일 내 세션</div></div>
          </div>

          <div class="home-grid">
            <section class="home-panel">
              <h3>오늘 할 일</h3>
              ${(home.today_tasks || []).length === 0 ? '<p class="empty-state">오늘 마감 Task가 없습니다.</p>' : `
                <div class="home-list">
                  ${(home.today_tasks || []).map((t) => `
                    <a class="home-list-row" href="#/project/${t.project_id}">
                      <div class="home-row-main">
                        <span class="tag tag-${t.status}">${Fmt.status(t.status)}</span>
                        <strong>${Fmt.escape(t.title)}</strong>
                        ${t.is_milestone ? '<span class="tag">마일스톤</span>' : ''}
                      </div>
                      <div class="home-row-sub">${Fmt.escape(t.project_name)} · ${Fmt.date(t.due_date)}</div>
                    </a>
                  `).join('')}
                </div>
              `}
            </section>

            <section class="home-panel">
              <h3>예정 세션 (7일)</h3>
              ${(home.upcoming_sessions || []).length === 0 ? '<p class="empty-state">예정된 세션이 없습니다.</p>' : `
                <div class="home-list">
                  ${(home.upcoming_sessions || []).map((s) => `
                    <a class="home-list-row" href="#/session/${s.session_id}">
                      <div class="home-row-main">
                        <span class="tag tag-${s.session_status}">${Fmt.status(s.session_status)}</span>
                        <strong>${Fmt.escape(s.project_name)}</strong>
                      </div>
                      <div class="home-row-sub">${Fmt.date(s.session_date)} ${Fmt.escape(s.start_time)}~${Fmt.escape(s.end_time)} · ${Fmt.escape(s.location || '-')}</div>
                    </a>
                  `).join('')}
                </div>
              `}
            </section>
          </div>

          <section class="home-panel home-project-panel">
            <h3>주간 공지</h3>
            ${(home.weekly_notices || []).length === 0 ? '<p class="empty-state">최근 7일 공지가 없습니다.</p>' : `
              <div class="home-list">
                ${(home.weekly_notices || []).map((n) => `
                  <a class="home-list-row" href="#/board/${n.board_id}/post/${n.post_id}">
                    <div class="home-row-main">
                      <span class="tag tag-notice">공지</span>
                      <strong>${Fmt.escape(n.title)}</strong>
                    </div>
                    <div class="home-row-sub">${Fmt.escape(n.board_name || '-')} · ${Fmt.datetime(n.created_at)}</div>
                  </a>
                `).join('')}
              </div>
            `}
          </section>

          <section class="home-panel home-project-panel">
            <h3>내 과제</h3>
            ${(home.projects || []).length === 0 ? '<p class="empty-state">표시할 과제가 없습니다.</p>' : `
              <div class="home-project-grid">
                ${(home.projects || []).map((p) => `
                  <a class="home-project-card" href="#/project/${p.project_id}">
                    <div class="card-header">
                      <span class="tag tag-${p.status}">${Fmt.status(p.status)}</span>
                    </div>
                    <strong class="home-project-title">${Fmt.escape(p.project_name)}</strong>
                    ${Fmt.progress(p.progress_rate || 0)}
                  </a>
                `).join('')}
              </div>
            `}
          </section>
        </div>
      `;

      if (canSelectBatch) {
        document.getElementById('home-batch-select')?.addEventListener('change', (e) => {
          const nextBatchId = parseInt(e.target.value, 10);
          if (!Number.isNaN(nextBatchId)) {
            State.set('currentBatchId', nextBatchId);
            this.render(el);
          }
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },
};
