/**
 * Board 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

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
                <span class="post-date">${Fmt.escape(Fmt.excerpt(p.content || '', 50))}</span>
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
            <div class="form-group"><label>내용 *</label><div id="board-post-editor"></div></div>
            ${user.role === 'admin' ? `<div class="form-group"><label><input type="checkbox" name="is_notice" /> 공지로 등록</label></div>` : ''}
            <button type="submit" class="btn btn-primary">등록</button>
            <p class="form-error" id="board-post-err" style="display:none;"></p>
          </form>`);
        const postEditor = RichEditor.create(document.getElementById('board-post-editor'), {
          placeholder: '게시글 본문을 입력하세요. 이미지/표 삽입이 가능합니다.',
          onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_post', boardId }),
        });
        document.getElementById('new-post-form').addEventListener('submit', async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const title = (fd.get('title') || '').trim();
          if (!title) return;
          if (postEditor.isEmpty()) {
            document.getElementById('board-post-err').textContent = '내용을 입력하세요.';
            document.getElementById('board-post-err').style.display = 'block';
            return;
          }
          try {
            await API.createPost(boardId, {
              title,
              content: postEditor.getSanitizedHTML(),
              is_notice: fd.has('is_notice'),
            });
            Modal.close();
            Pages.board.render(el, params);
          } catch (err) {
            document.getElementById('board-post-err').textContent = err.message || '게시글 등록 실패';
            document.getElementById('board-post-err').style.display = 'block';
          }
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
      const canManagePost = user.role === 'admin' || post.author_id === user.user_id;

      el.innerHTML = `
        <div class="page-container">
          <a href="#/board/${boardId}" class="back-link">← 게시판으로</a>
          <div class="post-detail">
            ${post.is_notice ? '<span class="tag tag-notice">공지</span>' : ''}
            <h2>${Fmt.escape(post.title)}</h2>
            <div class="post-meta">${Fmt.datetime(post.created_at)} · 조회 ${post.view_count}</div>
            ${canManagePost ? `
              <div class="post-actions">
                <button id="edit-post-btn" class="btn btn-sm btn-secondary">수정</button>
                <button id="delete-post-btn" class="btn btn-sm btn-danger">삭제</button>
              </div>` : ''}
            <div class="post-body rich-content">${Fmt.rich(post.content, '-')}</div>
          </div>
          <div class="comments-section">
            <h3>댓글 (${comments.length})</h3>
            ${comments.map(c => `
              <div class="comment-card">
                <div class="comment-content rich-content">${Fmt.rich(c.content, '-')}</div>
                <div class="comment-meta">
                  ${Fmt.datetime(c.created_at)}
                  ${(user.role === 'admin' || c.author_id === user.user_id) ? `<button class="btn btn-sm btn-danger delete-post-comment-btn" data-comment-id="${c.comment_id}">삭제</button>` : ''}
                </div>
              </div>`).join('') || '<p class="empty-state">댓글이 없습니다.</p>'}
            ${user.role !== 'observer' ? `
            <form id="post-comment-form" class="comment-form">
              <div id="board-comment-editor"></div>
              <button type="submit" class="btn btn-primary">등록</button>
              <p class="form-error" id="board-comment-err" style="display:none;"></p>
            </form>` : '<p class="empty-state">참관자는 댓글을 작성할 수 없습니다.</p>'}
          </div>
        </div>`;

      if (user.role !== 'observer') {
        const commentEditor = RichEditor.create(document.getElementById('board-comment-editor'), {
          compact: true,
          placeholder: '댓글을 입력하세요. 이미지/표 삽입이 가능합니다.',
          onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_comment', boardId: +boardId }),
        });

        document.getElementById('post-comment-form').addEventListener('submit', async e => {
          e.preventDefault();
          if (commentEditor.isEmpty()) {
            document.getElementById('board-comment-err').textContent = '댓글 내용을 입력하세요.';
            document.getElementById('board-comment-err').style.display = 'block';
            return;
          }
          try {
            await API.createPostComment(postId, { content: commentEditor.getSanitizedHTML() });
            Pages.board.renderPost(el, params);
          } catch (err) {
            document.getElementById('board-comment-err').textContent = err.message || '댓글 등록 실패';
            document.getElementById('board-comment-err').style.display = 'block';
          }
        });
      }

      document.getElementById('edit-post-btn')?.addEventListener('click', () => {
        Modal.open(`<h2>게시글 수정</h2>
          <form id="edit-post-form">
            <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(post.title)}" /></div>
            <div class="form-group"><label>내용 *</label><div id="edit-board-post-editor"></div></div>
            ${user.role === 'admin' ? `<div class="form-group"><label><input type="checkbox" name="is_notice"${post.is_notice ? ' checked' : ''} /> 공지로 등록</label></div>` : ''}
            <button type="submit" class="btn btn-primary">저장</button>
            <p class="form-error" id="edit-board-post-err" style="display:none;"></p>
          </form>`);
        const editEditor = RichEditor.create(document.getElementById('edit-board-post-editor'), {
          initialHTML: post.content || '',
          placeholder: '게시글 본문을 입력하세요. 이미지/표 삽입이 가능합니다.',
          onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_post', boardId: +boardId }),
        });
        document.getElementById('edit-post-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const title = (fd.get('title') || '').trim();
          if (!title) return;
          if (editEditor.isEmpty()) {
            document.getElementById('edit-board-post-err').textContent = '내용을 입력하세요.';
            document.getElementById('edit-board-post-err').style.display = 'block';
            return;
          }
          try {
            await API.updatePost(+postId, {
              title,
              content: editEditor.getSanitizedHTML(),
              is_notice: fd.has('is_notice'),
            });
            Modal.close();
            await this.renderPost(el, params);
          } catch (err) {
            document.getElementById('edit-board-post-err').textContent = err.message || '게시글 수정 실패';
            document.getElementById('edit-board-post-err').style.display = 'block';
          }
        });
      });

      document.getElementById('delete-post-btn')?.addEventListener('click', async () => {
        if (!confirm('게시글을 삭제하시겠습니까?')) return;
        try {
          await API.deletePost(+postId);
          Router.go(`/board/${boardId}`);
        } catch (err) {
          alert(err.message || '게시글 삭제 실패');
        }
      });

      el.querySelectorAll('.delete-post-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const commentId = +btn.dataset.commentId;
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        try {
          await API.deletePostComment(commentId);
          await this.renderPost(el, params);
        } catch (err) {
          alert(err.message || '댓글 삭제 실패');
        }
      }));
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },
};


