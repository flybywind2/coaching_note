Pages.coachingNote = {
  async render(el, params) {
    const { id: projectId, noteId } = params;
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [note, comments] = await Promise.all([
        API.getNote(noteId),
        API.getComments(noteId),
      ]);
      const user = Auth.getUser();
      const canWrite = user.role === 'admin' || user.role === 'coach';

      el.innerHTML = `
        <div class="page-container">
          <a href="#/project/${projectId}" class="back-link">← 과제로 돌아가기</a>
          <div class="note-detail">
            <div class="note-detail-header">
              <h2>코칭노트</h2>
              <div class="note-meta">
                <span>${Fmt.date(note.coaching_date)}</span>
                ${note.week_number ? `<span>${note.week_number}주차</span>` : ''}
                ${note.progress_rate != null ? `<span>진행률 ${note.progress_rate}%</span>` : ''}
              </div>
              ${canWrite ? `
                <div class="note-actions">
                  <button id="edit-note-btn" class="btn btn-sm btn-secondary">편집</button>
                  <button id="delete-note-btn" class="btn btn-sm btn-danger">삭제</button>
                </div>` : ''}
            </div>
            <div class="note-fields">
              <div class="note-field"><label>현재 상태</label><div class="field-val rich-content">${Fmt.rich(note.current_status, '-')}</div></div>
              <div class="note-field"><label>당면 문제</label><div class="field-val rich-content">${Fmt.rich(note.main_issue, '-')}</div></div>
              <div class="note-field"><label>다음 액션</label><div class="field-val rich-content">${Fmt.rich(note.next_action, '-')}</div></div>
            </div>
          </div>

          <div class="comments-section">
            <h3>코칭 의견 (${comments.length})</h3>
            <div id="comment-list">
              ${comments.map(c => `
                <div class="comment-card ${c.is_coach_only ? 'coach-only' : ''}">
                  ${c.is_coach_only ? '<span class="coach-only-badge">코치 전용</span>' : ''}
                  <div class="comment-content rich-content">${Fmt.rich(c.content, '-')}</div>
                  ${c.code_snippet ? `<pre class="code-snippet">${Fmt.escape(c.code_snippet)}</pre>` : ''}
                  <div class="comment-meta">
                    ${Fmt.datetime(c.created_at)}
                    ${(c.author_id === user.user_id || user.role === 'admin') ? `<button class="btn btn-sm btn-danger delete-comment-btn" data-comment-id="${c.comment_id}">삭제</button>` : ''}
                  </div>
                </div>`).join('') || '<p class="empty-state">의견이 없습니다.</p>'}
            </div>
            <div class="comment-form">
              <h4>의견 작성</h4>
              <form id="comment-form">
                <div id="comment-editor-wrap"></div>
                ${canWrite ? `<label><input type="checkbox" name="is_coach_only" /> 코치 전용 메모</label>` : ''}
                <button type="submit" class="btn btn-primary">등록</button>
              </form>
            </div>
          </div>
        </div>`;

      const commentEditor = RichEditor.create(document.getElementById('comment-editor-wrap'), {
        compact: true,
        placeholder: '의견을 입력하세요. 이미지/표 삽입이 가능합니다.',
        onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'comment', projectId: +projectId }),
      });

      document.getElementById('comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const content = commentEditor.getSanitizedHTML();
        if (commentEditor.isEmpty()) {
          alert('의견 내용을 입력하세요.');
          return;
        }
        await API.createComment(noteId, {
          content,
          is_coach_only: fd.has('is_coach_only'),
        });
        await this.render(el, params);
      });

      if (canWrite) {
        document.getElementById('edit-note-btn')?.addEventListener('click', () => {
          this.showEditModal(projectId, note, async () => {
            await this.render(el, params);
          });
        });

        document.getElementById('delete-note-btn')?.addEventListener('click', async () => {
          if (!confirm('코칭노트를 삭제하시겠습니까?')) return;
          try {
            await API.deleteNote(note.note_id);
            Router.go(`/project/${projectId}`);
          } catch (err) {
            alert(err.message || '코칭노트 삭제 실패');
          }
        });
      }

      el.querySelectorAll('.delete-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const commentId = +btn.dataset.commentId;
        if (!confirm('의견을 삭제하시겠습니까?')) return;
        try {
          await API.deleteComment(commentId);
          await this.render(el, params);
        } catch (err) {
          alert(err.message || '의견 삭제 실패');
        }
      }));
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  showCreateModal(projectId, onDone) {
    Modal.open(`<h2>코칭노트 작성</h2>
      <form id="create-note-form">
        <div class="form-group"><label>코칭 날짜 *</label><input type="date" name="coaching_date" required value="${new Date().toISOString().slice(0,10)}" /></div>
        <div class="form-group"><label>주차</label><input type="number" name="week_number" min="1" /></div>
        <div class="form-group"><label>현재 상태</label><div id="note-current-editor"></div></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" /></div>
        <div class="form-group"><label>당면 문제</label><div id="note-issue-editor"></div></div>
        <div class="form-group"><label>다음 액션</label><div id="note-action-editor"></div></div>
        <button type="submit" class="btn btn-primary">저장</button>
      </form>`);

    const currentEditor = RichEditor.create(document.getElementById('note-current-editor'), {
      compact: true,
      placeholder: '현재 상태를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const issueEditor = RichEditor.create(document.getElementById('note-issue-editor'), {
      compact: true,
      placeholder: '당면 문제를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const actionEditor = RichEditor.create(document.getElementById('note-action-editor'), {
      compact: true,
      placeholder: '다음 액션을 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });

    document.getElementById('create-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        coaching_date: fd.get('coaching_date'),
        week_number: fd.get('week_number') ? parseInt(fd.get('week_number')) : null,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate')) : null,
        main_issue: issueEditor.getSanitizedHTML() || null,
        next_action: actionEditor.getSanitizedHTML() || null,
      };
      await API.createNote(projectId, data);
      Modal.close();
      if (onDone) onDone();
    });
  },

  showEditModal(projectId, note, onDone) {
    Modal.open(`<h2>코칭노트 편집</h2>
      <form id="edit-note-form">
        <div class="form-group"><label>코칭 날짜 *</label><input type="date" name="coaching_date" required value="${note.coaching_date}" /></div>
        <div class="form-group"><label>주차</label><input type="number" name="week_number" min="1" value="${note.week_number || ''}" /></div>
        <div class="form-group"><label>현재 상태</label><div id="edit-note-current-editor"></div></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" value="${note.progress_rate ?? ''}" /></div>
        <div class="form-group"><label>당면 문제</label><div id="edit-note-issue-editor"></div></div>
        <div class="form-group"><label>다음 액션</label><div id="edit-note-action-editor"></div></div>
        <button type="submit" class="btn btn-primary">저장</button>
      </form>`);

    const currentEditor = RichEditor.create(document.getElementById('edit-note-current-editor'), {
      compact: true,
      initialHTML: note.current_status || '',
      placeholder: '현재 상태를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const issueEditor = RichEditor.create(document.getElementById('edit-note-issue-editor'), {
      compact: true,
      initialHTML: note.main_issue || '',
      placeholder: '당면 문제를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const actionEditor = RichEditor.create(document.getElementById('edit-note-action-editor'), {
      compact: true,
      initialHTML: note.next_action || '',
      placeholder: '다음 액션을 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });

    document.getElementById('edit-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        coaching_date: fd.get('coaching_date'),
        week_number: fd.get('week_number') ? parseInt(fd.get('week_number')) : null,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate')) : null,
        main_issue: issueEditor.getSanitizedHTML() || null,
        next_action: actionEditor.getSanitizedHTML() || null,
      };
      await API.updateNote(note.note_id, data);
      Modal.close();
      if (onDone) onDone();
    });
  },
};
