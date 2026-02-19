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
            <h1>대시보드</h1>
            <select id="dash-batch">${batches.map(b=>`<option value="${b.batch_id}"${b.batch_id===batchId?' selected':''}>${Fmt.escape(b.batch_name)}</option>`).join('')}</select>
          </div>

          <div class="stat-cards">
            <div class="stat-card">
              <div class="stat-num">${data.total_projects}</div>
              <div class="stat-label">전체 과제</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${data.coaching_note_count}</div>
              <div class="stat-label">코칭노트 수</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${data.session_stats.completed}/${data.session_stats.total}</div>
              <div class="stat-label">완료 세션</div>
            </div>
            <div class="stat-card">
              <div class="stat-num">${data.task_stats.completed}/${data.task_stats.total}</div>
              <div class="stat-label">완료 Task</div>
            </div>
          </div>

          <div class="dash-grid">
            <div class="dash-panel">
              <h3>과제 진행률 분포</h3>
              <div class="progress-dist">
                ${Object.entries(data.progress_distribution).map(([range, count]) => `
                  <div class="dist-row">
                    <span class="dist-label">${range}%</span>
                    <div class="dist-bar"><div class="dist-fill" style="width:${data.total_projects ? count/data.total_projects*100 : 0}%"></div></div>
                    <span class="dist-count">${count}</span>
                  </div>`).join('')}
              </div>
            </div>

            <div class="dash-panel">
              <h3>과제 현황</h3>
              <div class="project-status-list">
                ${data.projects.map(p => `
                  <div class="dash-project-row">
                    <a href="#/project/${p.project_id}" class="proj-link">${Fmt.escape(p.project_name)}</a>
                    ${Fmt.progress(p.progress_rate)}
                    <span class="tag tag-${p.status}">${Fmt.status(p.status)}</span>
                  </div>`).join('') || '<p class="empty-state">과제가 없습니다.</p>'}
              </div>
            </div>
          </div>
        </div>`;

      document.getElementById('dash-batch').addEventListener('change', async (e) => {
        State.set('currentBatchId', parseInt(e.target.value));
        this.render(el, params);
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },
};
