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
            </div>
            <div class="note-fields">
              <div class="note-field"><label>현재 상태</label><div class="field-val">${Fmt.escape(note.current_status || '-')}</div></div>
              <div class="note-field"><label>당면 문제</label><div class="field-val">${Fmt.escape(note.main_issue || '-')}</div></div>
              <div class="note-field"><label>다음 액션</label><div class="field-val">${Fmt.escape(note.next_action || '-')}</div></div>
            </div>
          </div>

          <div class="comments-section">
            <h3>코칭 의견 (${comments.length})</h3>
            <div id="comment-list">
              ${comments.map(c => `
                <div class="comment-card ${c.is_coach_only ? 'coach-only' : ''}">
                  ${c.is_coach_only ? '<span class="coach-only-badge">코치 전용</span>' : ''}
                  <div class="comment-content">${Fmt.escape(c.content)}</div>
                  ${c.code_snippet ? `<pre class="code-snippet">${Fmt.escape(c.code_snippet)}</pre>` : ''}
                  <div class="comment-meta">${Fmt.datetime(c.created_at)}</div>
                </div>`).join('') || '<p class="empty-state">의견이 없습니다.</p>'}
            </div>
            <div class="comment-form">
              <h4>의견 작성</h4>
              <form id="comment-form">
                <textarea name="content" placeholder="의견을 입력하세요..." rows="3" required></textarea>
                ${canWrite ? `<label><input type="checkbox" name="is_coach_only" /> 코치 전용 메모</label>` : ''}
                <button type="submit" class="btn btn-primary">등록</button>
              </form>
            </div>
          </div>
        </div>`;

      document.getElementById('comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.createComment(noteId, {
          content: fd.get('content'),
          is_coach_only: fd.has('is_coach_only'),
        });
        Router.go(`/project/${projectId}/notes/${noteId}`);
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  showCreateModal(projectId, onDone) {
    Modal.open(`<h2>코칭노트 작성</h2>
      <form id="create-note-form">
        <div class="form-group"><label>코칭 날짜 *</label><input type="date" name="coaching_date" required value="${new Date().toISOString().slice(0,10)}" /></div>
        <div class="form-group"><label>주차</label><input type="number" name="week_number" min="1" /></div>
        <div class="form-group"><label>현재 상태</label><textarea name="current_status" rows="2"></textarea></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" /></div>
        <div class="form-group"><label>당면 문제</label><textarea name="main_issue" rows="2"></textarea></div>
        <div class="form-group"><label>다음 액션</label><textarea name="next_action" rows="2"></textarea></div>
        <button type="submit" class="btn btn-primary">저장</button>
      </form>`, onDone);

    document.getElementById('create-note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        coaching_date: fd.get('coaching_date'),
        week_number: fd.get('week_number') ? parseInt(fd.get('week_number')) : null,
        current_status: fd.get('current_status') || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate')) : null,
        main_issue: fd.get('main_issue') || null,
        next_action: fd.get('next_action') || null,
      };
      await API.createNote(projectId, data);
      Modal.close();
      if (onDone) onDone();
    });
  },
};
