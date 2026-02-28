/**
 * ProjectList 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.projectList = {
  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const batches = await API.getBatches();
      State.set('batches', batches);

      let batchId = params.batchId ? parseInt(params.batchId, 10) : (batches[0]?.batch_id);
      if (!batchId) {
        el.innerHTML = '<div class="empty-state">차수(Batch)가 없습니다. 관리자에게 문의하세요.</div>';
        return;
      }
      State.set('currentBatchId', batchId);

      const projects = await API.getProjects(batchId);
      const user = Auth.getUser();
      let sortBy = 'project_name';
      let sortDir = 'asc';
      let page = 1;
      const pageSize = 12;
      const canManage = user.role === 'admin';
      const showOwnProjects = user.role === 'participant';
      let activeType = 'primary';

      const normalizeType = (value) => {
        const text = (value || '').toString().trim().toLowerCase();
        return text === 'associate' ? 'associate' : 'primary';
      };

      const ownProjects = projects.filter((p) => p.is_my_project);

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <div class="page-title-row">
              <h1>과제 목록</h1>
              <div class="inline-actions">
                <button id="open-search-btn" class="btn btn-secondary">통합 검색</button>
                ${canManage ? `<button id="add-project-btn" class="btn btn-primary">+ 과제 추가</button>` : ''}
              </div>
            </div>
            <div class="batch-tabs">
              ${batches.map((b) => `<button class="batch-tab${b.batch_id === batchId ? ' active' : ''}" data-bid="${b.batch_id}">${Fmt.escape(b.batch_name)}</button>`).join('')}
            </div>
          </div>

          ${showOwnProjects ? `
            <div class="project-own-table-section">
              <h3>내 과제</h3>
              <div class="project-list-table-wrap">
                <table class="data-table project-list-table">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>과제명</th>
                      <th>부서명</th>
                      <th>과제 대표자</th>
                      <th>AI기술 분류</th>
                      <th>사용된 AI기술</th>
                    </tr>
                  </thead>
                  <tbody id="own-project-list-body"></tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <div class="project-type-tabs">
            <button class="project-type-tab" data-type="all">전체</button>
            <button class="project-type-tab active" data-type="primary">정식과제</button>
            <button class="project-type-tab" data-type="associate">준참여과제</button>
          </div>

          <div class="project-list-table-wrap">
            <table class="data-table project-list-table">
              <thead>
                <tr>
                  <th><button class="sort-btn" data-key="project_name">과제명</button></th>
                  <th><button class="sort-btn" data-key="organization">부서명</button></th>
                  <th><button class="sort-btn" data-key="representative">과제 대표자</button></th>
                  <th><button class="sort-btn" data-key="ai_tech_category">AI기술 분류</button></th>
                  <th><button class="sort-btn" data-key="ai_tech_used">사용된 AI기술</button></th>
                </tr>
              </thead>
              <tbody id="project-list-body"></tbody>
            </table>
          </div>
          <div id="project-list-pagination"></div>
        </div>`;

      const ownBody = document.getElementById('own-project-list-body');
      const listBody = document.getElementById('project-list-body');
      const paginationEl = document.getElementById('project-list-pagination');

      const valueByKey = (project, key) => {
        const v = project[key];
        if (v === null || v === undefined) return '';
        return String(v).toLowerCase();
      };

      const renderProjectRows = (rows, includeType = false) => {
        if (!rows.length) {
          const colCount = includeType ? 6 : 5;
          return `<tr><td colspan="${colCount}" class="empty-state">표시할 과제가 없습니다.</td></tr>`;
        }
        return rows.map((p) => `
          <tr class="project-list-row" data-id="${p.project_id}">
            ${includeType ? `<td><span class="tag">${normalizeType(p.project_type) === 'primary' ? '정식과제' : '준참여과제'}</span></td>` : ''}
            <td><strong>${Fmt.escape(p.project_name)}</strong></td>
            <td>${Fmt.escape(p.organization || '-')}</td>
            <td>${Fmt.escape(p.representative || '-')}</td>
            <td>${Fmt.escape(p.ai_tech_category || p.category || '-')}</td>
            <td>${Fmt.escape(p.ai_tech_used || '-')}</td>
          </tr>
        `).join('');
      };

      const sortedRows = (rows) => {
        const copied = [...rows];
        copied.sort((a, b) => {
          const av = valueByKey(a, sortBy);
          const bv = valueByKey(b, sortBy);
          if (av === bv) return 0;
          const result = av > bv ? 1 : -1;
          return sortDir === 'asc' ? result : -result;
        });
        return copied;
      };

      const renderOwnTable = () => {
        if (!showOwnProjects || !ownBody) return;
        const rows = sortedRows(ownProjects);
        ownBody.innerHTML = renderProjectRows(rows, true);
        ownBody.querySelectorAll('.project-list-row').forEach((row) => row.addEventListener('click', () => {
          Router.go(`/project/${row.dataset.id}`);
        }));
      };

      const renderMainTable = () => {
        const typed = activeType === 'all'
          ? projects
          : projects.filter((p) => normalizeType(p.project_type) === activeType);
        const rows = sortedRows(typed);
        const total = rows.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (page > totalPages) page = totalPages;
        const start = (page - 1) * pageSize;
        const pageRows = rows.slice(start, start + pageSize);

        listBody.innerHTML = renderProjectRows(pageRows, false);
        listBody.querySelectorAll('.project-list-row').forEach((row) => row.addEventListener('click', () => {
          Router.go(`/project/${row.dataset.id}`);
        }));

        renderPagination(paginationEl, total, pageSize, page, (nextPage) => {
          page = nextPage;
          renderMainTable();
        });

        el.querySelectorAll('.sort-btn').forEach((btn) => {
          const active = btn.dataset.key === sortBy;
          btn.classList.toggle('active', active);
          btn.textContent = `${btn.textContent.replace(/[▲▼]\s*$/, '').trim()}${active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}`;
        });

        el.querySelectorAll('.project-type-tab').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.type === activeType);
        });
      };

      const renderAll = () => {
        renderOwnTable();
        renderMainTable();
      };

      renderAll();

      el.querySelectorAll('.batch-tab').forEach((btn) => {
        btn.addEventListener('click', () => Router.go(`/projects/${btn.dataset.bid}`));
      });

      document.getElementById('open-search-btn')?.addEventListener('click', () => Router.go('/search'));

      el.querySelectorAll('.sort-btn').forEach((btn) => btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (sortBy === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else {
          sortBy = key;
          sortDir = 'asc';
        }
        page = 1;
        renderAll();
      }));

      el.querySelectorAll('.project-type-tab').forEach((btn) => btn.addEventListener('click', () => {
        const nextType = btn.dataset.type;
        activeType = ['all', 'primary', 'associate'].includes(nextType) ? nextType : 'primary';
        page = 1;
        renderMainTable();
      }));

      if (canManage) {
        document.getElementById('add-project-btn')?.addEventListener('click', () => {
          this._showCreateModal(batchId, () => this.render(el, params));
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
        <div class="form-group"><label>과제 구분</label>
          <select name="project_type"><option value="primary">정식과제</option><option value="associate">준참여과제</option></select>
        </div>
        <div class="form-group"><label>공개여부</label>
          <select name="visibility"><option value="public">공개</option><option value="restricted">비공개</option></select>
        </div>
        <div class="form-group"><label>상태</label>
          <select name="status">
            <option value="preparing">준비중</option>
            <option value="in_progress">진행중</option>
            <option value="completed">완료</option>
            <option value="drop">Drop</option>
          </select>
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
