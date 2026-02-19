Pages.board = {
  async render(el, params) {
    const boardId = parseInt(params.boardId);
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [boards, posts] = await Promise.all([API.getBoards(), API.getPosts(boardId)]);
      const board = boards.find(b => b.board_id === boardId) || boards[0];
      const user = Auth.getUser();

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>게시판</h1>
            <div class="board-tabs">
              ${boards.map(b => `<button class="board-tab${b.board_id===boardId?' active':''}" data-bid="${b.board_id}">${Fmt.escape(b.board_name)}</button>`).join('')}
            </div>
            ${user.role !== 'observer' ? `<button id="new-post-btn" class="btn btn-primary">+ 글쓰기</button>` : ''}
          </div>
          <div class="post-list">
            ${posts.length === 0 ? '<p class="empty-state">게시글이 없습니다.</p>' : posts.map(p => `
              <div class="post-row${p.is_notice ? ' notice' : ''}">
                ${p.is_notice ? '<span class="tag tag-notice">공지</span>' : ''}
                <a href="#/board/${boardId}/post/${p.post_id}" class="post-title">${Fmt.escape(p.title)}</a>
                <span class="post-date">${Fmt.date(p.created_at)}</span>
                <span class="post-views">👁 ${p.view_count}</span>
              </div>`).join('')}
          </div>
        </div>`;

      el.querySelectorAll('.board-tab').forEach(btn => {
        btn.addEventListener('click', () => Router.go(`/board/${btn.dataset.bid}`));
      });

      document.getElementById('new-post-btn')?.addEventListener('click', () => {
        Modal.open(`<h2>글쓰기</h2>
          <form id="new-post-form">
            <div class="form-group"><label>제목 *</label><input name="title" required /></div>
            <div class="form-group"><label>내용 *</label><textarea name="content" rows="6" required></textarea></div>
            ${user.role === 'admin' ? `<div class="form-group"><label><input type="checkbox" name="is_notice" /> 공지로 등록</label></div>` : ''}
            <button type="submit" class="btn btn-primary">등록</button>
          </form>`);
        document.getElementById('new-post-form').addEventListener('submit', async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          await API.createPost(boardId, { title: fd.get('title'), content: fd.get('content'), is_notice: fd.has('is_notice') });
          Modal.close();
          Pages.board.render(el, params);
        });
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async renderPost(el, params) {
    const { boardId, postId } = params;
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [post, comments] = await Promise.all([
        API.getPost(boardId, postId),
        API.getPostComments(postId),
      ]);
      const user = Auth.getUser();

      el.innerHTML = `
        <div class="page-container">
          <a href="#/board/${boardId}" class="back-link">← 게시판으로</a>
          <div class="post-detail">
            ${post.is_notice ? '<span class="tag tag-notice">공지</span>' : ''}
            <h2>${Fmt.escape(post.title)}</h2>
            <div class="post-meta">${Fmt.datetime(post.created_at)} · 조회 ${post.view_count}</div>
            <div class="post-body">${Fmt.escape(post.content).replace(/\n/g, '<br>')}</div>
          </div>
          <div class="comments-section">
            <h3>댓글 (${comments.length})</h3>
            ${comments.map(c => `<div class="comment-card"><div class="comment-content">${Fmt.escape(c.content)}</div><div class="comment-meta">${Fmt.datetime(c.created_at)}</div></div>`).join('') || '<p class="empty-state">댓글이 없습니다.</p>'}
            <form id="post-comment-form" class="comment-form">
              <textarea name="content" placeholder="댓글 입력..." rows="2" required></textarea>
              <button type="submit" class="btn btn-primary">등록</button>
            </form>
          </div>
        </div>`;

      document.getElementById('post-comment-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.createPostComment(postId, { content: fd.get('content') });
        Pages.board.renderPost(el, params);
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },
};
