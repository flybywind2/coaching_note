/**
 * Search 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.search = {
  async render(el, params = {}) {
    const queryParams = Router.getCurrentParams().params || {};
    const q = (queryParams.q || '').trim();
    const types = (queryParams.types || 'project,note,document,board').split(',').filter(Boolean);
    const batchId = queryParams.batch_id || '';
    const startDate = queryParams.start_date || '';
    const endDate = queryParams.end_date || '';
    const authorId = queryParams.author_id || '';

    const user = Auth.getUser();
    const [batches, authorOptions] = await Promise.all([
      API.getBatches().catch(() => []),
      user.role === 'admin' ? API.getUsers(true).catch(() => []) : Promise.resolve([]),
    ]);

    el.innerHTML = `
      <div class="page-container">
        <div class="page-header">
          <div class="page-title-row">
            <h1>통합 검색</h1>
            <button id="back-to-projects-btn" class="btn btn-secondary">과제 목록으로</button>
          </div>
          <p class="search-sub">과제/코칭노트/과제기록/게시글을 한 번에 검색합니다.</p>
        </div>

        <form id="workspace-search-form" class="search-form">
          <div class="form-group">
            <label>검색어</label>
            <input name="q" value="${Fmt.escape(q)}" placeholder="검색어 2글자 이상 입력" />
          </div>
          <div class="search-filter-grid">
            <div class="form-group">
              <label>차수</label>
              <select name="batch_id">
                <option value="">전체</option>
                ${batches.map((b) => `<option value="${b.batch_id}"${String(b.batch_id) === String(batchId) ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>작성자</label>
              <select name="author_id">
                <option value="">전체</option>
                <option value="${user.user_id}"${String(user.user_id) === String(authorId) ? ' selected' : ''}>나</option>
                ${authorOptions.map((u) => `<option value="${u.user_id}"${String(u.user_id) === String(authorId) ? ' selected' : ''}>${Fmt.escape(u.name)} (${Fmt.escape(u.emp_id)})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>시작일</label>
              <input type="date" name="start_date" value="${Fmt.escape(startDate)}" />
            </div>
            <div class="form-group">
              <label>종료일</label>
              <input type="date" name="end_date" value="${Fmt.escape(endDate)}" />
            </div>
          </div>
          <div class="search-type-row">
            ${[
              ['project', '과제'],
              ['note', '코칭노트'],
              ['document', '과제기록'],
              ['board', '게시글'],
            ].map(([v, label]) => `
              <label><input type="checkbox" name="types" value="${v}"${types.includes(v) ? ' checked' : ''} /> ${label}</label>
            `).join('')}
          </div>
          <div class="page-actions">
            <button type="submit" class="btn btn-primary">검색</button>
            <button type="button" id="search-reset-btn" class="btn btn-secondary">초기화</button>
          </div>
        </form>

        <div id="workspace-search-result"></div>
      </div>
    `;

    const resultEl = document.getElementById('workspace-search-result');
    const renderResults = async () => {
      if (!q || q.length < 2) {
        resultEl.innerHTML = '<p class="empty-state">검색어를 2글자 이상 입력하세요.</p>';
        return;
      }
      resultEl.innerHTML = '<div class="loading">검색 중...</div>';
      try {
        const data = await API.searchWorkspace({
          q,
          types: types.join(','),
          batch_id: batchId,
          author_id: authorId,
          start_date: startDate,
          end_date: endDate,
          limit: 80,
        });
        const rows = data.results || [];
        resultEl.innerHTML = `
          <div class="search-result-head">검색 결과 ${rows.length}건</div>
          ${rows.length === 0 ? '<p class="empty-state">검색 결과가 없습니다.</p>' : `
            <div class="search-result-list">
              ${rows.map((r) => `
                <a class="search-result-row" href="${Fmt.escape(r.route)}">
                  <div class="search-row-top">
                    <span class="tag">${Fmt.escape(this._label(r.type))}</span>
                    <strong>${Fmt.escape(r.title || '')}</strong>
                  </div>
                  <div class="search-row-snippet">${Fmt.escape(Fmt.excerpt(r.snippet || '', 180))}</div>
                  <div class="search-row-meta">
                    ${r.project_name ? `<span>${Fmt.escape(r.project_name)}</span>` : ''}
                    ${r.author_name ? `<span>작성자 ${Fmt.escape(r.author_name)}</span>` : ''}
                    ${r.created_at ? `<span>${Fmt.datetime(r.created_at)}</span>` : ''}
                  </div>
                </a>
              `).join('')}
            </div>
          `}
        `;
      } catch (err) {
        resultEl.innerHTML = `<div class="error-state">${Fmt.escape(err.message || '검색 실패')}</div>`;
      }
    };

    await renderResults();

    document.getElementById('workspace-search-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const nextQ = (fd.get('q') || '').toString().trim();
      const nextTypes = fd.getAll('types');
      const qs = new URLSearchParams();
      if (nextQ) qs.set('q', nextQ);
      if (nextTypes.length) qs.set('types', nextTypes.join(','));
      ['batch_id', 'author_id', 'start_date', 'end_date'].forEach((k) => {
        const v = (fd.get(k) || '').toString().trim();
        if (v) qs.set(k, v);
      });
      Router.go(`/search${qs.toString() ? `?${qs.toString()}` : ''}`);
    });

    document.getElementById('search-reset-btn')?.addEventListener('click', () => {
      Router.go('/search');
    });
    document.getElementById('back-to-projects-btn')?.addEventListener('click', () => {
      Router.go('/projects');
    });
  },

  _label(type) {
    const map = {
      project: '과제',
      note: '코칭노트',
      document: '과제기록',
      board: '게시글',
    };
    return map[type] || type;
  },
};
