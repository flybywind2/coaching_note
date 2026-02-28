/**
 * Board 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.board = {
  async render(el, params = {}) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const [boards, batches] = await Promise.all([API.getBoards(), API.getBatches()]);

      if (!boards.length) {
        el.innerHTML = '<div class="empty-state">게시판 설정이 없습니다.</div>';
        return;
      }
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수 정보가 없습니다.</div>';
        return;
      }

      const boardIdFromPath = Number.parseInt(params.boardId, 10);
      const boardFromPath = Number.isNaN(boardIdFromPath)
        ? null
        : boards.find((b) => b.board_id === boardIdFromPath) || null;
      // [FEEDBACK7] 게시판 차수 분리 기본 선택 로직
      const requestedBatchId = Number.parseInt(params.batch_id, 10);
      const stateBatchId = Number.parseInt(State.get('currentBatchId'), 10);
      const selectedBatchId = [requestedBatchId, stateBatchId, batches[0].batch_id]
        .find((id) => Number.isInteger(id) && batches.some((b) => b.batch_id === id));
      State.set('currentBatchId', selectedBatchId);
      const initialCategory = boardFromPath?.board_type || 'all';
      const selectedCategory = params.category || initialCategory;
      const searchQuery = (params.q || '').trim();

      const posts = await API.getAllPosts({
        limit: 300,
        category: selectedCategory === 'all' ? null : selectedCategory,
        q: searchQuery || null,
        batch_id: selectedBatchId,
      });

      const buildListUrl = (category, q, batchId) => {
        const query = new URLSearchParams();
        if (category && category !== 'all') query.set('category', category);
        if (q) query.set('q', q);
        if (batchId != null) query.set('batch_id', String(batchId));
        return `/board${query.toString() ? `?${query.toString()}` : ''}`;
      };

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>게시판</h1>
            <div class="inline-actions">
              <label class="hint" for="board-batch-filter">차수</label>
              <select id="board-batch-filter">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === selectedBatchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
              <label class="hint" for="board-category-filter">분류</label>
              <select id="board-category-filter">
                <option value="all"${selectedCategory === 'all' ? ' selected' : ''}>전체</option>
                ${boards.map((b) => `<option value="${Fmt.escape(b.board_type)}"${selectedCategory === b.board_type ? ' selected' : ''}>${Fmt.escape(b.board_name)}</option>`).join('')}
              </select>
              <form id="board-search-form" class="board-search-form">
                <input
                  id="board-search-input"
                  type="search"
                  maxlength="100"
                  placeholder="제목/내용/작성자 검색"
                  value="${Fmt.escape(searchQuery)}"
                />
                <button type="submit" class="btn btn-secondary btn-sm">검색</button>
                ${searchQuery ? '<button type="button" id="board-search-clear-btn" class="btn btn-secondary btn-sm">초기화</button>' : ''}
              </form>
              ${user.role !== 'observer' ? '<button id="new-post-btn" class="btn btn-primary">+ 글쓰기</button>' : ''}
            </div>
          </div>

          <div class="post-list board-table-wrap">
            ${posts.length === 0
              ? `<p class="empty-state" style="padding:16px;">${searchQuery ? '검색 결과가 없습니다.' : '게시글이 없습니다.'}</p>`
              : `
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
                  ${posts.map((p) => `
                    <tr class="board-row ${p.is_notice ? 'notice' : ''}" data-post-id="${p.post_id}">
                      <td>${p.post_no != null ? p.post_no : ''}</td>
                      <td>${p.board_type === 'notice' ? '<span class="tag tag-notice">공지사항</span>' : `<span class="tag">${Fmt.escape(p.board_name || p.board_type || '-')}</span>`}</td>
                      <td>
                        <a href="#/board/post/${p.post_id}" class="post-title">${Fmt.escape(p.title)}</a>
                        ${p.is_batch_private ? '<span class="tag tag-batch-private">차수공개</span>' : ''}
                      </td>
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

      document.getElementById('board-batch-filter')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(nextBatchId)) {
          State.set('currentBatchId', nextBatchId);
          Router.go(buildListUrl(selectedCategory, searchQuery, nextBatchId));
        }
      });

      document.getElementById('board-category-filter')?.addEventListener('change', (e) => {
        const next = e.target.value || 'all';
        Router.go(buildListUrl(next, searchQuery, selectedBatchId));
      });

      document.getElementById('board-search-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const keyword = (document.getElementById('board-search-input')?.value || '').trim();
        Router.go(buildListUrl(selectedCategory, keyword, selectedBatchId));
      });

      document.getElementById('board-search-clear-btn')?.addEventListener('click', () => {
        Router.go(buildListUrl(selectedCategory, '', selectedBatchId));
      });

      document.getElementById('new-post-btn')?.addEventListener('click', () => {
        this._openPostModal({
          boards,
          batches,
          selectedBatchId,
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

  _openPostModal({ boards, batches, selectedBatchId = null, user, post = null, initialBoardId = null, onSaved }) {
    const isEdit = !!post;
    let selectableBoards = user.role === 'admin'
      ? boards
      : boards.filter((b) => b.board_type !== 'notice');
    if (isEdit && post?.board_type === 'notice') {
      selectableBoards = boards.filter((b) => b.board_id === post.board_id);
    } else if (isEdit) {
      selectableBoards = selectableBoards.filter((b) => b.board_type !== 'notice');
    }
    if (!selectableBoards.length) {
      alert('작성 가능한 게시판이 없습니다.');
      return;
    }
    const isBoardLocked = isEdit && post?.board_type === 'notice';
    const fallbackBoardId = selectableBoards[0]?.board_id || boards[0]?.board_id;
    const defaultBoardId = post?.board_id || initialBoardId || fallbackBoardId;
    const fallbackBatchId = selectedBatchId || batches[0]?.batch_id || null;
    const defaultBatchId = post?.batch_id || fallbackBatchId;
    Modal.open(`<h2>${isEdit ? '게시글 수정' : '글쓰기'}</h2>
      <form id="board-post-form">
        <div class="form-group">
          <label>차수 *</label>
          <select name="batch_id" required>
            ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === defaultBatchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>분류 *</label>
          <select name="board_id" required ${isBoardLocked ? 'disabled' : ''}>
            ${selectableBoards.map((b) => `<option value="${b.board_id}"${b.board_id === defaultBoardId ? ' selected' : ''}>${Fmt.escape(b.board_name)}</option>`).join('')}
          </select>
          ${isBoardLocked ? '<p class="hint">공지사항 게시글은 분류를 변경할 수 없습니다.</p>' : ''}
          ${isBoardLocked ? `<input type="hidden" name="board_id" value="${defaultBoardId}" />` : ''}
        </div>
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(post?.title || '')}" /></div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="is_batch_private" ${post?.is_batch_private ? 'checked' : ''} />
            해당 차수에게만 공개
          </label>
        </div>
        <div class="form-group"><label>내용 *</label><div id="board-post-editor"></div></div>
        <div class="form-group mention-picker-group">
          <label>멘션 추가</label>
          <input id="board-mention-input" placeholder="@이름 또는 @사번 입력" />
          <div id="board-mention-list" class="mention-candidate-list"></div>
          <div id="board-mention-picked" class="mention-picked-list"></div>
        </div>
        <p class="form-hint">멘션은 @사번 또는 @이름(예: @coach001, @이영희) 형태로 작성하세요. 저장 시 멘션 대상에게 알림이 발송됩니다.</p>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
        <p class="form-hint" id="board-post-saving" style="display:none;">저장 중입니다. RAG 동기화로 수 초 걸릴 수 있습니다.</p>
        <p class="form-error" id="board-post-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const postEditor = RichEditor.create(document.getElementById('board-post-editor'), {
      initialHTML: post?.content || '',
      placeholder: '게시글 본문을 입력하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_post', boardId: post?.board_id || defaultBoardId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'board_post', boardId: post?.board_id || defaultBoardId }),
    });
    const mentionState = this._bindMentionPicker({
      inputId: 'board-mention-input',
      listId: 'board-mention-list',
      pickedId: 'board-mention-picked',
    });
    const postForm = document.getElementById('board-post-form');
    const postErrEl = document.getElementById('board-post-err');
    const postSavingEl = document.getElementById('board-post-saving');
    const postSubmitBtn = postForm?.querySelector('button[type="submit"]');

    const setPostSaving = (isSaving) => {
      if (postSubmitBtn) {
        postSubmitBtn.disabled = !!isSaving;
        postSubmitBtn.textContent = isSaving ? '저장 중...' : (isEdit ? '저장' : '등록');
      }
      if (postSavingEl) {
        postSavingEl.style.display = isSaving ? 'block' : 'none';
      }
    };

    const setPostError = (msg) => {
      if (!postErrEl) return;
      if (!msg) {
        postErrEl.style.display = 'none';
        postErrEl.textContent = '';
        return;
      }
      postErrEl.textContent = msg;
      postErrEl.style.display = 'block';
    };

    document.getElementById('board-post-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setPostError('');
      const fd = new FormData(e.target);
      const title = (fd.get('title') || '').toString().trim();
      const boardId = Number.parseInt((fd.get('board_id') || '').toString(), 10);
      const batchId = Number.parseInt((fd.get('batch_id') || '').toString(), 10);
      const isBatchPrivate = fd.get('is_batch_private') === 'on';
      if (!title || Number.isNaN(boardId) || Number.isNaN(batchId)) return;
      if (postEditor.isEmpty()) {
        setPostError('내용을 입력하세요.');
        return;
      }
      setPostSaving(true);
      try {
        const content = this._mergeMentionsIntoContent(postEditor.getSanitizedHTML(), mentionState?.picked || []);
        if (isEdit) {
          await API.updatePost(post.post_id, {
            title,
            content,
            board_id: boardId,
            batch_id: batchId,
            is_batch_private: isBatchPrivate,
          });
        } else {
          await API.createPost(boardId, {
            title,
            content,
            batch_id: batchId,
            is_batch_private: isBatchPrivate,
          });
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        setPostError(err.message || `게시글 ${isEdit ? '수정' : '등록'} 실패`);
      } finally {
        if (document.body.contains(postForm)) {
          setPostSaving(false);
        }
      }
    });
  },

  _openCommentModal({ postId, comment = null, boardId = null, onSaved }) {
    const isEdit = !!comment;
    Modal.open(`<h2>${isEdit ? '댓글 수정' : '댓글 작성'}</h2>
      <form id="board-comment-form">
        <div id="board-comment-editor"></div>
        <div class="form-group mention-picker-group">
          <label>멘션 추가</label>
          <input id="board-comment-mention-input" placeholder="@이름 또는 @사번 입력" />
          <div id="board-comment-mention-list" class="mention-candidate-list"></div>
          <div id="board-comment-mention-picked" class="mention-picked-list"></div>
        </div>
        <p class="form-hint">멘션은 @사번 또는 @이름(예: @coach001, @이영희) 형태로 작성하세요. 저장 시 멘션 대상에게 알림이 발송됩니다.</p>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
        <p class="form-hint" id="board-comment-saving" style="display:none;">저장 중입니다. RAG 동기화로 수 초 걸릴 수 있습니다.</p>
        <p class="form-error" id="board-comment-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const commentEditor = RichEditor.create(document.getElementById('board-comment-editor'), {
      compact: true,
      initialHTML: comment?.content || '',
      placeholder: '댓글을 입력하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'board_comment', boardId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'board_comment', boardId }),
    });
    const mentionState = this._bindMentionPicker({
      inputId: 'board-comment-mention-input',
      listId: 'board-comment-mention-list',
      pickedId: 'board-comment-mention-picked',
    });
    const commentForm = document.getElementById('board-comment-form');
    const commentErrEl = document.getElementById('board-comment-err');
    const commentSavingEl = document.getElementById('board-comment-saving');
    const commentSubmitBtn = commentForm?.querySelector('button[type="submit"]');

    const setCommentSaving = (isSaving) => {
      if (commentSubmitBtn) {
        commentSubmitBtn.disabled = !!isSaving;
        commentSubmitBtn.textContent = isSaving ? '저장 중...' : (isEdit ? '저장' : '등록');
      }
      if (commentSavingEl) {
        commentSavingEl.style.display = isSaving ? 'block' : 'none';
      }
    };

    const setCommentError = (msg) => {
      if (!commentErrEl) return;
      if (!msg) {
        commentErrEl.style.display = 'none';
        commentErrEl.textContent = '';
        return;
      }
      commentErrEl.textContent = msg;
      commentErrEl.style.display = 'block';
    };

    document.getElementById('board-comment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setCommentError('');
      if (commentEditor.isEmpty()) {
        setCommentError('댓글 내용을 입력하세요.');
        return;
      }
      setCommentSaving(true);
      try {
        const content = this._mergeMentionsIntoContent(commentEditor.getSanitizedHTML(), mentionState?.picked || []);
        if (isEdit) {
          await API.updatePostComment(comment.comment_id, { content });
        } else {
          await API.createPostComment(postId, { content });
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        setCommentError(err.message || `댓글 ${isEdit ? '수정' : '등록'} 실패`);
      } finally {
        if (document.body.contains(commentForm)) {
          setCommentSaving(false);
        }
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
      const [post, comments, boards, batches] = await Promise.all([
        API.getPost(params.boardId, postId),
        API.getPostComments(postId),
        API.getBoards(),
        API.getBatches(),
      ]);
      const user = Auth.getUser();
      const canManagePost = user.role === 'admin' || post.author_id === user.user_id;

      el.innerHTML = `
        <div class="page-container">
          <a href="#/board" class="back-link">← 게시판으로</a>
          <div class="post-detail">
            <div class="inline-actions">
              ${post.board_type === 'notice' ? '<span class="tag tag-notice">공지사항</span>' : `<span class="tag">${Fmt.escape(post.board_name || post.board_type || '-')}</span>`}
              ${post.is_batch_private ? '<span class="tag tag-batch-private">차수공개</span>' : ''}
            </div>
            <h2>${Fmt.escape(post.title)}</h2>
            <div class="post-meta">${Fmt.escape(post.author_name || `#${post.author_id}`)} · ${Fmt.datetime(post.created_at)} · 조회 ${post.view_count}</div>
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
                  <span>${Fmt.datetime(c.created_at)} · ${Fmt.escape(c.author_name || `#${c.author_id}`)}</span>
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
          batches,
          selectedBatchId: post.batch_id,
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

  _mergeMentionsIntoContent(html, pickedUsers = []) {
    const unique = [];
    const seen = new Set();
    (pickedUsers || []).forEach((row) => {
      const empId = String(row?.emp_id || '').trim();
      if (!empId || seen.has(empId)) return;
      seen.add(empId);
      unique.push(empId);
    });
    if (!unique.length) return html;
    const existing = Fmt.excerpt(html || '', 5000);
    const missing = unique.filter((empId) => !existing.includes(`@${empId}`));
    if (!missing.length) return html;
    const mentionHtml = missing
      .map((empId) => `<span class="mention-token">@${Fmt.escape(empId)}</span>`)
      .join(' ');
    return `${html || ''}<p>${mentionHtml}</p>`;
  },

  _bindMentionPicker({ inputId, listId, pickedId }) {
    const inputEl = document.getElementById(inputId);
    const listEl = document.getElementById(listId);
    const pickedEl = document.getElementById(pickedId);
    if (!inputEl || !listEl || !pickedEl) {
      return { picked: [] };
    }
    const state = { picked: [], found: [] };
    let debounceTimer = null;

    const renderPicked = () => {
      if (!state.picked.length) {
        pickedEl.innerHTML = '';
        return;
      }
      pickedEl.innerHTML = state.picked.map((row, idx) => `
        <button type="button" class="mention-picked-chip" data-idx="${idx}">
          @${Fmt.escape(row.emp_id)} (${Fmt.escape(row.name)})
          <span>×</span>
        </button>
      `).join('');
      pickedEl.querySelectorAll('.mention-picked-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number.parseInt(btn.dataset.idx, 10);
          if (Number.isNaN(idx)) return;
          state.picked.splice(idx, 1);
          renderPicked();
        });
      });
    };

    const renderFound = () => {
      if (!state.found.length) {
        listEl.innerHTML = '';
        return;
      }
      listEl.innerHTML = state.found.map((row, idx) => `
        <button type="button" class="mention-candidate-item" data-idx="${idx}">
          <strong>${Fmt.escape(row.name)}</strong>
          <span>@${Fmt.escape(row.emp_id)}</span>
          ${row.department ? `<em>${Fmt.escape(row.department)}</em>` : ''}
        </button>
      `).join('');
      listEl.querySelectorAll('.mention-candidate-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number.parseInt(btn.dataset.idx, 10);
          const picked = state.found[idx];
          if (!picked) return;
          if (!state.picked.some((row) => row.user_id === picked.user_id)) {
            state.picked.push(picked);
            renderPicked();
          }
          inputEl.value = '';
          state.found = [];
          renderFound();
          inputEl.focus();
        });
      });
    };

    const fetchCandidates = async () => {
      const keyword = String(inputEl.value || '').trim().replace(/^@+/, '');
      if (keyword.length < 1) {
        state.found = [];
        renderFound();
        return;
      }
      try {
        state.found = await API.getBoardMentionCandidates(keyword, 8);
      } catch (_) {
        state.found = [];
      }
      renderFound();
    };

    inputEl.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchCandidates, 180);
    });

    return state;
  },
};
