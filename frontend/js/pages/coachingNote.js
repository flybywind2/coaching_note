/**
 * CoachingNote 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

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
          <a href="#/project/${projectId}?tab=notes" class="back-link">← 코칭노트 목록으로</a>
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
                  <button id="ai-enhance-note-btn" class="btn btn-sm">AI 보완</button>
                  <button id="delete-note-btn" class="btn btn-sm btn-danger">삭제</button>
                </div>` : ''}
            </div>
            <div class="note-fields">
              <div class="note-field"><label>현재 상태</label><div class="field-val rich-content">${Fmt.rich(note.current_status, '-')}</div></div>
              <div class="note-field"><label>주요 문제</label><div class="field-val rich-content">${Fmt.rich(note.main_issue, '-')}</div></div>
              <div class="note-field"><label>다음 작업</label><div class="field-val rich-content">${Fmt.rich(note.next_action, '-')}</div></div>
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
                <p class="form-hint">멘션은 @사번 또는 @이름 형태로 작성하세요.</p>
                ${canWrite ? `<label><input type="checkbox" name="is_coach_only" /> 코치들에게만 공유(참여자 비공개)</label>` : ''}
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
        document.getElementById('ai-enhance-note-btn')?.addEventListener('click', () => {
          this.showEditModal(projectId, note, async () => {
            await this.render(el, params);
          }, { autoEnhance: true });
        });

        document.getElementById('delete-note-btn')?.addEventListener('click', async () => {
          if (!confirm('코칭노트를 삭제하시겠습니까?')) return;
          try {
            await API.deleteNote(note.note_id);
            Router.go(`/project/${projectId}?tab=notes`);
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
    const draftKey = DraftStore.buildKey('note-create', projectId);
    const autoDate = this._todayString();
    const autoWeek = this._isoWeekNumber(autoDate);
    Modal.open(`<h2>코칭노트 작성</h2>
      <form id="create-note-form">
        <div class="note-auto-meta">
          <span>코칭 날짜 자동입력: ${Fmt.date(autoDate)}</span>
          <span>주차 자동입력: ${autoWeek}주차</span>
        </div>
        <div class="form-group"><label>현재 상태</label><div id="note-current-editor"></div></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" /></div>
        <div class="form-group"><label>주요 문제</label><div id="note-issue-editor"></div></div>
        <div class="form-group"><label>다음 작업</label><div id="note-action-editor"></div></div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p id="create-note-draft-status" class="draft-status"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const currentEditor = RichEditor.create(document.getElementById('note-current-editor'), {
      placeholder: '현재 상태를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const issueEditor = RichEditor.create(document.getElementById('note-issue-editor'), {
      placeholder: '주요 문제를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const actionEditor = RichEditor.create(document.getElementById('note-action-editor'), {
      placeholder: '다음 작업을 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const createForm = document.getElementById('create-note-form');
    const createBinding = DraftStore.bindForm({
      form: createForm,
      key: draftKey,
      collect: () => ({
        progress_rate: createForm.querySelector('[name="progress_rate"]').value,
        current_status: currentEditor.getHTML(),
        main_issue: issueEditor.getHTML(),
        next_action: actionEditor.getHTML(),
      }),
      apply: (payload) => {
        if (!payload || typeof payload !== 'object') return;
        if (payload.progress_rate !== undefined) createForm.querySelector('[name="progress_rate"]').value = payload.progress_rate || '';
        if (payload.current_status !== undefined) currentEditor.setHTML(payload.current_status || '');
        if (payload.main_issue !== undefined) issueEditor.setHTML(payload.main_issue || '');
        if (payload.next_action !== undefined) actionEditor.setHTML(payload.next_action || '');
      },
      statusEl: document.getElementById('create-note-draft-status'),
      restoreMessage: '이전에 임시저장된 코칭노트 작성 내용이 있습니다. 복원하시겠습니까?',
    });

    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        coaching_date: autoDate,
        week_number: autoWeek,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate'), 10) : null,
        main_issue: issueEditor.getSanitizedHTML() || null,
        next_action: actionEditor.getSanitizedHTML() || null,
      };
      await API.createNote(projectId, data);
      createBinding.clear();
      createBinding.dispose();
      Modal.close();
      if (onDone) onDone();
    });
  },

  showEditModal(projectId, note, onDone, options = {}) {
    const draftKey = DraftStore.buildKey('note-edit', note.note_id);
    const fixedDate = note.coaching_date || this._todayString();
    const fixedWeek = note.week_number || this._isoWeekNumber(fixedDate);
    Modal.open(`<h2>코칭노트 편집</h2>
      <form id="edit-note-form">
        <div class="note-auto-meta">
          <span>코칭 날짜 자동입력: ${Fmt.date(fixedDate)}</span>
          <span>주차 자동입력: ${fixedWeek}주차</span>
        </div>
        <div class="form-group"><label>현재 상태</label><div id="edit-note-current-editor"></div></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" value="${note.progress_rate ?? ''}" /></div>
        <div class="form-group"><label>주요 문제</label><div id="edit-note-issue-editor"></div></div>
        <div class="form-group"><label>다음 작업</label><div id="edit-note-action-editor"></div></div>
        <div class="form-group">
          <label>AI 보완 지시사항 (선택)</label>
          <input type="text" name="ai_instruction" placeholder="예: 다음 작업을 더 구체적인 일정/담당으로 정리" />
          <p class="form-hint">현재 편집 중인 내용으로 AI 보완 제안을 생성합니다.</p>
        </div>
        <div class="page-actions">
          <button type="button" id="enhance-note-ai-btn" class="btn btn-secondary">AI 보완</button>
          <button type="submit" class="btn btn-primary">저장</button>
        </div>
        <p id="edit-note-draft-status" class="draft-status"></p>
        <p class="form-error" id="edit-note-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const currentEditor = RichEditor.create(document.getElementById('edit-note-current-editor'), {
      initialHTML: note.current_status || '',
      placeholder: '현재 상태를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const issueEditor = RichEditor.create(document.getElementById('edit-note-issue-editor'), {
      initialHTML: note.main_issue || '',
      placeholder: '주요 문제를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const actionEditor = RichEditor.create(document.getElementById('edit-note-action-editor'), {
      initialHTML: note.next_action || '',
      placeholder: '다음 작업을 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
    });
    const editForm = document.getElementById('edit-note-form');
    const aiBtn = document.getElementById('enhance-note-ai-btn');
    const errEl = document.getElementById('edit-note-err');
    const editBinding = DraftStore.bindForm({
      form: editForm,
      key: draftKey,
      collect: () => ({
        progress_rate: editForm.querySelector('[name="progress_rate"]').value,
        ai_instruction: editForm.querySelector('[name="ai_instruction"]').value,
        current_status: currentEditor.getHTML(),
        main_issue: issueEditor.getHTML(),
        next_action: actionEditor.getHTML(),
      }),
      apply: (payload) => {
        if (!payload || typeof payload !== 'object') return;
        if (payload.progress_rate !== undefined) editForm.querySelector('[name="progress_rate"]').value = payload.progress_rate || '';
        if (payload.ai_instruction !== undefined) editForm.querySelector('[name="ai_instruction"]').value = payload.ai_instruction || '';
        if (payload.current_status !== undefined) currentEditor.setHTML(payload.current_status || '');
        if (payload.main_issue !== undefined) issueEditor.setHTML(payload.main_issue || '');
        if (payload.next_action !== undefined) actionEditor.setHTML(payload.next_action || '');
      },
      statusEl: document.getElementById('edit-note-draft-status'),
      restoreMessage: '이전에 임시저장된 코칭노트 편집 내용이 있습니다. 복원하시겠습니까?',
    });

    const setFormError = (msg) => {
      if (!errEl) return;
      if (!msg) {
        errEl.style.display = 'none';
        errEl.textContent = '';
        return;
      }
      errEl.textContent = msg;
      errEl.style.display = 'block';
    };

    const runAiEnhance = async () => {
      if (!aiBtn) return;
      setFormError('');
      const original = aiBtn.textContent;
      aiBtn.disabled = true;
      aiBtn.textContent = 'AI 보완 중...';
      try {
        const instruction = (document.querySelector('#edit-note-form [name=\"ai_instruction\"]')?.value || '').trim();
        const enhanced = await API.enhanceNote(note.note_id, {
          current_status: currentEditor.getSanitizedHTML() || null,
          main_issue: issueEditor.getSanitizedHTML() || null,
          next_action: actionEditor.getSanitizedHTML() || null,
          instruction: instruction || null,
        });
        currentEditor.setHTML(enhanced.current_status || '');
        issueEditor.setHTML(enhanced.main_issue || '');
        actionEditor.setHTML(enhanced.next_action || '');
      } catch (err) {
        setFormError(err.message || 'AI 보완 실패');
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = original;
      }
    };

    aiBtn?.addEventListener('click', runAiEnhance);
    if (options.autoEnhance) {
      runAiEnhance();
    }

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setFormError('');
      const fd = new FormData(e.target);
      const data = {
        coaching_date: fixedDate,
        week_number: fixedWeek,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate'), 10) : null,
        main_issue: issueEditor.getSanitizedHTML() || null,
        next_action: actionEditor.getSanitizedHTML() || null,
      };
      try {
        await API.updateNote(note.note_id, data);
        editBinding.clear();
        editBinding.dispose();
        Modal.close();
        if (onDone) onDone();
      } catch (err) {
        setFormError(err.message || '코칭노트 저장 실패');
      }
    });
  },

  _todayString() {
    const now = new Date();
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localTime.toISOString().slice(0, 10);
  },

  _isoWeekNumber(dateString) {
    const baseDate = dateString ? new Date(`${dateString}T00:00:00`) : new Date();
    const date = new Date(baseDate.getTime());
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day + 3);
    const firstThursday = new Date(date.getFullYear(), 0, 4);
    const firstThursdayDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstThursdayDay + 3);
    return 1 + Math.round((date - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  },

  async showVersionModal(note, onRestored) {
    try {
      const versions = await API.getNoteVersions(note.note_id);
      Modal.open(`<h2>코칭노트 변경 이력</h2>
        <div class="version-list">
          ${versions.length ? versions.map((v) => `
            <div class="version-item">
              <div class="version-meta">
                <strong>v${v.version_no}</strong>
                <span>${Fmt.escape(v.change_type)}</span>
                <span>${Fmt.datetime(v.created_at)}</span>
              </div>
              <div class="version-preview rich-content">${Fmt.rich(v.snapshot.current_status || '-', '-')}</div>
              <div class="version-actions">
                <button class="btn btn-sm btn-secondary restore-note-version-btn" data-version-id="${v.version_id}">이 버전으로 복원</button>
              </div>
            </div>
          `).join('') : '<p class="empty-state">저장된 이력이 없습니다.</p>'}
        </div>`);

      document.querySelectorAll('.restore-note-version-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const versionId = +btn.dataset.versionId;
        if (!confirm('선택한 버전으로 복원하시겠습니까?')) return;
        try {
          await API.restoreNoteVersion(note.note_id, versionId);
          Modal.close();
          if (onRestored) onRestored();
        } catch (err) {
          alert(err.message || '코칭노트 복원 실패');
        }
      }));
    } catch (err) {
      alert(err.message || '변경 이력을 불러오지 못했습니다.');
    }
  },
};


