/**
 * Board 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.board = {
  async render(el, params = {}) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const [boards, allPosts] = await Promise.all([
        API.getBoards(),
        API.getAllPosts({ limit: 300 }),
      ]);

      if (!boards.length) {
        el.innerHTML = '<div class="empty-state">게시판 설정이 없습니다.</div>';
        return;
      }

      const boardIdFromPath = Number.parseInt(params.boardId, 10);
      const boardFromPath = Number.isNaN(boardIdFromPath)
        ? null
        : boards.find((b) => b.board_id === boardIdFromPath) || null;
      const initialCategory = boardFromPath?.board_type || 'all';
      const selectedCategory = params.category || initialCategory;

      const filtered = selectedCategory === 'all'
        ? allPosts
        : allPosts.filter((post) => (post.board_type || '') === selectedCategory);

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>게시판</h1>
            <div class="inline-actions">
              <label class="hint" for="board-category-filter">분류</label>
              <select id="board-category-filter">
                <option value="all"${selectedCategory === 'all' ? ' selected' : ''}>전체</option>
                ${boards.map((b) => `<option value="${Fmt.escape(b.board_type)}"${selectedCategory === b.board_type ? ' selected' : ''}>${Fmt.escape(b.board_name)}</option>`).join('')}
              </select>
              ${user.role !== 'observer' ? '<button id="new-post-btn" class="btn btn-primary">+ 글쓰기</button>' : ''}
            </div>
          </div>

          <div class="post-list board-table-wrap">
            ${filtered.length === 0 ? '<p class="empty-state" style="padding:16px;">게시글이 없습니다.</p>' : `
              <table class="data-table board-table">
                <thead>
                  <tr>
                    <th style="width:72px;">번호</th>
                    <th style="width:120px;">분류</th>
                    <th>제목</th>
                    <th style="width:130px;">작성자</th>
                    <th style="width:130px;">날짜</th>
                    <th style="width:84px;">조회수</th>
                    <th style="width:84px;">댓글수</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.map((p, idx) => `
                    <tr class="board-row ${p.is_notice ? 'notice' : ''}" data-post-id="${p.post_id}">
                      <td>${filtered.length - idx}</td>
                      <td>${p.is_notice ? '<span class="tag tag-notice">공지</span>' : `<span class="tag">${Fmt.escape(p.board_name || p.board_type || '-')}</span>`}</td>
                      <td><a href="#/board/post/${p.post_id}" class="post-title">${Fmt.escape(p.title)}</a></td>
                      <td>${Fmt.escape(p.author_name || `#${p.author_id}`)}</td>
                      <td>${Fmt.date(p.created_at)}</td>
                      <td>${p.view_count || 0}</td>
                      <td>${p.comment_count || 0}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>`;

      document.getElementById('board-category-filter')?.addEventListener('change', (e) => {
        const next = e.target.value || 'all';
        Router.go(next === 'all' ? '/board' : `/board?category=${encodeURIComponent(next)}`);
      });

      document.getElementById('new-post-btn')?.addEventListener('click', () => {
        this._openPostModal({
          boards,
          user,
          initialBoardId: boardFromPath?.board_id || boards[0].board_id,
          onSaved: async () => {
            await this.render(el, params);
          },
        });
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _openPostModal({ boards, user, post = null, initialBoardId = null, onSaved }) {
    const isEdit = !!post;
    const defaultBoardId = post?.board_id || initialBoardId || boards[0]?.board_id;
    Modal.open(`<h2>${isEdit ? '게시글 수정' : '글쓰기'}</h2>
      <form id="board-post-form">
        <div class="form-group">
          <label>분류 *</label>
          <select name="board_id" required>
            ${boards.map((b) => `<option value="${b.board_id}"${b.board_id === defaultBoardId ? ' selected' : ''}>${Fmt.escape(b.board_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(post?.title || '')}" /></div>
        <div class="form-group"><label>내용 *</label><div id="board-post-editor"></div></div>
        <p class="form-hint">멘션은 @사번 또는 @이름 형태로 작성하세요.</p>
        ${user.role === 'admin' ? `<div class="form-group"><label><input type="checkbox" name="is_notice"${post?.is_notice ? ' checked' : ''} /> 공지로 등록</label></div>` : ''}
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
        <p class="form-error" id="board-post-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const postEditor = RichEditor.create(document.getElementById('board-post-editor'), {
      initialHTML: post?.content || '',
      placeholder: '게시글 본문을 입력하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_post', boardId: post?.board_id || defaultBoardId }),
    });

    document.getElementById('board-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = (fd.get('title') || '').toString().trim();
      const boardId = Number.parseInt((fd.get('board_id') || '').toString(), 10);
      if (!title || Number.isNaN(boardId)) return;
      if (postEditor.isEmpty()) {
        const errEl = document.getElementById('board-post-err');
        errEl.textContent = '내용을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        if (isEdit) {
          const payload = {
            title,
            content: postEditor.getSanitizedHTML(),
            is_notice: fd.has('is_notice'),
          };
          if (boardId !== post.board_id) {
            await API.createPost(boardId, payload);
            await API.deletePost(post.post_id);
          } else {
            await API.updatePost(post.post_id, payload);
          }
        } else {
          await API.createPost(boardId, {
            title,
            content: postEditor.getSanitizedHTML(),
            is_notice: fd.has('is_notice'),
          });
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('board-post-err');
        errEl.textContent = err.message || `게시글 ${isEdit ? '수정' : '등록'} 실패`;
        errEl.style.display = 'block';
      }
    });
  },

  _openCommentModal({ postId, comment = null, boardId = null, onSaved }) {
    const isEdit = !!comment;
    Modal.open(`<h2>${isEdit ? '댓글 수정' : '댓글 작성'}</h2>
      <form id="board-comment-form">
        <div id="board-comment-editor"></div>
        <p class="form-hint">멘션은 @사번 또는 @이름 형태로 작성하세요.</p>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
        <p class="form-error" id="board-comment-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const commentEditor = RichEditor.create(document.getElementById('board-comment-editor'), {
      compact: true,
      initialHTML: comment?.content || '',
      placeholder: '댓글을 입력하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_comment', boardId }),
    });

    document.getElementById('board-comment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (commentEditor.isEmpty()) {
        const errEl = document.getElementById('board-comment-err');
        errEl.textContent = '댓글 내용을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        const content = commentEditor.getSanitizedHTML();
        if (isEdit) {
          await API.updatePostComment(comment.comment_id, { content });
        } else {
          await API.createPostComment(postId, { content });
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('board-comment-err');
        errEl.textContent = err.message || `댓글 ${isEdit ? '수정' : '등록'} 실패`;
        errEl.style.display = 'block';
      }
    });
  },

  async renderPost(el, params) {
    const postId = Number.parseInt(params.postId, 10);
    if (Number.isNaN(postId)) {
      el.innerHTML = '<div class="error-state">잘못된 게시글 주소입니다.</div>';
      return;
    }

    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [post, comments, boards] = await Promise.all([
        API.getPost(params.boardId, postId),
        API.getPostComments(postId),
        API.getBoards(),
      ]);
      const user = Auth.getUser();
      const canManagePost = user.role === 'admin' || post.author_id === user.user_id;

      el.innerHTML = `
        <div class="page-container">
          <a href="#/board" class="back-link">← 게시판으로</a>
          <div class="post-detail">
            <div class="inline-actions">
              ${post.is_notice ? '<span class="tag tag-notice">공지</span>' : `<span class="tag">${Fmt.escape(post.board_name || post.board_type || '-')}</span>`}
            </div>
            <h2>${Fmt.escape(post.title)}</h2>
            <div class="post-meta">${Fmt.datetime(post.created_at)} · 작성자 ${Fmt.escape(post.author_name || `#${post.author_id}`)} · 조회 ${post.view_count}</div>
            ${canManagePost ? `
              <div class="post-actions">
                <button id="edit-post-btn" class="btn btn-sm btn-secondary">수정</button>
                <button id="delete-post-btn" class="btn btn-sm btn-danger">삭제</button>
              </div>` : ''}
            <div class="post-body rich-content">${Fmt.rich(post.content, '-')}</div>
          </div>

          <div class="comments-section">
            <div class="inline-actions" style="justify-content:space-between; width:100%;">
              <h3>댓글 (${comments.length})</h3>
              ${user.role !== 'observer' ? '<button id="new-comment-btn" class="btn btn-sm btn-primary">댓글 작성</button>' : ''}
            </div>
            ${comments.map((c) => `
              <div class="comment-card">
                <div class="comment-content rich-content">${Fmt.rich(c.content, '-')}</div>
                <div class="comment-meta">
                  <span>${Fmt.datetime(c.created_at)}</span>
                  ${(user.role === 'admin' || c.author_id === user.user_id)
                    ? `<span class="inline-actions">
                        <button class="btn btn-sm btn-secondary edit-post-comment-btn" data-comment-id="${c.comment_id}">수정</button>
                        <button class="btn btn-sm btn-danger delete-post-comment-btn" data-comment-id="${c.comment_id}">삭제</button>
                      </span>`
                    : ''}
                </div>
              </div>
            `).join('') || '<p class="empty-state">댓글이 없습니다.</p>'}
            ${user.role === 'observer' ? '<p class="empty-state">참관자는 댓글을 작성할 수 없습니다.</p>' : ''}
          </div>
        </div>`;

      document.getElementById('edit-post-btn')?.addEventListener('click', () => {
        this._openPostModal({
          boards,
          user,
          post,
          onSaved: async () => {
            await this.renderPost(el, params);
          },
        });
      });

      document.getElementById('delete-post-btn')?.addEventListener('click', async () => {
        if (!confirm('게시글을 삭제하시겠습니까?')) return;
        try {
          await API.deletePost(postId);
          Router.go('/board');
        } catch (err) {
          alert(err.message || '게시글 삭제 실패');
        }
      });

      document.getElementById('new-comment-btn')?.addEventListener('click', () => {
        this._openCommentModal({
          postId,
          boardId: post.board_id,
          onSaved: async () => {
            await this.renderPost(el, params);
          },
        });
      });

      const commentById = new Map(comments.map((c) => [c.comment_id, c]));
      el.querySelectorAll('.edit-post-comment-btn').forEach((btn) => btn.addEventListener('click', () => {
        const commentId = Number.parseInt(btn.dataset.commentId, 10);
        const comment = commentById.get(commentId);
        if (!comment) return;
        this._openCommentModal({
          postId,
          comment,
          boardId: post.board_id,
          onSaved: async () => {
            await this.renderPost(el, params);
          },
        });
      }));

      el.querySelectorAll('.delete-post-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const commentId = Number.parseInt(btn.dataset.commentId, 10);
        if (Number.isNaN(commentId)) return;
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
