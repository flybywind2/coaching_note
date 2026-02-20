/**
 * ProjectList 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.projectList = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const batches = await API.getBatches();
      State.set('batches', batches);

      let batchId = params.batchId ? parseInt(params.batchId) : (batches[0]?.batch_id);
      if (!batchId) {
        el.innerHTML = '<div class="empty-state">차수(Batch)가 없습니다. 관리자에게 문의하세요.</div>';
        return;
      }
      State.set('currentBatchId', batchId);

      const projects = await API.getProjects(batchId);
      const user = Auth.getUser();

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <div class="page-title-row">
              <h1>과제 목록</h1>
              ${user.role === 'admin' ? `<button id="add-project-btn" class="btn btn-primary">+ 과제 추가</button>` : ''}
            </div>
            <div class="batch-tabs">
              ${batches.map(b => `<button class="batch-tab${b.batch_id === batchId ? ' active' : ''}" data-bid="${b.batch_id}">${Fmt.escape(b.batch_name)}</button>`).join('')}
            </div>
          </div>
          <div class="project-grid" id="project-grid">
            ${projects.length === 0 ? '<p class="empty-state">이 차수에 과제가 없습니다.</p>' :
              projects.map(p => `
                <div class="project-card" data-id="${p.project_id}">
                  <div class="card-header">
                    <span class="tag tag-${p.status}">${Fmt.status(p.status)}</span>
                    <span class="tag tag-vis">${p.visibility === 'public' ? '공개' : '비공개'}</span>
                  </div>
                  <h3 class="card-title">${Fmt.escape(p.project_name)}</h3>
                  <p class="card-org">${Fmt.escape(p.organization)}</p>
                  ${Fmt.progress(p.progress_rate)}
                  <div class="card-footer">
                    <span>${p.category || '-'}</span>
                    <div class="card-actions">
                      <a href="#/project/${p.project_id}" class="btn btn-sm">상세 보기</a>
                      ${user.role === 'admin' ? `<button class="btn btn-sm btn-danger delete-project-btn" data-project-id="${p.project_id}" data-project-name="${Fmt.escape(p.project_name)}">삭제</button>` : ''}
                    </div>
                  </div>
                </div>`).join('')}
          </div>
        </div>`;

      el.querySelectorAll('.batch-tab').forEach(btn => {
        btn.addEventListener('click', () => Router.go(`/projects/${btn.dataset.bid}`));
      });

      if (user.role === 'admin') {
        document.getElementById('add-project-btn')?.addEventListener('click', () => {
          this._showCreateModal(batchId, () => this.render(el, params));
        });

        el.querySelectorAll('.delete-project-btn').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const projectId = +btn.dataset.projectId;
            const projectName = btn.dataset.projectName || '';
            if (!confirm(`과제를 삭제하시겠습니까?\n${projectName}`)) return;
            try {
              await API.deleteProject(projectId);
              await this.render(el, params);
            } catch (err) {
              alert(err.message || '과제 삭제 실패');
            }
          });
        });
      }
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _showCreateModal(batchId, onDone) {
    Modal.open(`
      <h2>과제 추가</h2>
      <form id="create-project-form">
        <div class="form-group"><label>과제명 *</label><input name="project_name" required /></div>
        <div class="form-group"><label>조직 *</label><input name="organization" required /></div>
        <div class="form-group"><label>대표자</label><input name="representative" /></div>
        <div class="form-group"><label>분류</label><input name="category" /></div>
        <div class="form-group"><label>공개여부</label>
          <select name="visibility"><option value="public">공개</option><option value="restricted">비공개</option></select>
        </div>
        <button type="submit" class="btn btn-primary">생성</button>
        <p class="form-error" id="modal-err" style="display:none;"></p>
      </form>`, onDone);

    document.getElementById('create-project-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      try {
        await API.createProject(batchId, data);
        Modal.close();
        onDone();
      } catch (err) {
        const errEl = document.getElementById('modal-err');
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });
  },
};


