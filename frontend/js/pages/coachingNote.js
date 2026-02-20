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
                  <button id="note-version-btn" class="btn btn-sm btn-secondary">이력</button>
                  <button id="ai-enhance-note-btn" class="btn btn-sm">AI 보완</button>
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
                <p class="form-hint">멘션은 @사번 또는 @이름 형태로 작성하세요.</p>
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
        document.getElementById('note-version-btn')?.addEventListener('click', () => {
          this.showVersionModal(note, async () => {
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
    const draftKey = DraftStore.buildKey('note-create', projectId);
    Modal.open(`<h2>코칭노트 작성</h2>
      <form id="create-note-form">
        <div class="form-group">
          <label>템플릿</label>
          <div class="inline-actions">
            <select id="create-note-template-select"><option value="">템플릿 선택</option></select>
            <button type="button" id="apply-create-note-template-btn" class="btn btn-sm btn-secondary">불러오기</button>
            <button type="button" id="save-create-note-template-btn" class="btn btn-sm">템플릿 저장</button>
          </div>
        </div>
        <div class="form-group"><label>코칭 날짜 *</label><input type="date" name="coaching_date" required value="${new Date().toISOString().slice(0,10)}" /></div>
        <div class="form-group"><label>주차</label><input type="number" name="week_number" min="1" /></div>
        <div class="form-group"><label>현재 상태</label><div id="note-current-editor"></div></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" /></div>
        <div class="form-group"><label>당면 문제</label><div id="note-issue-editor"></div></div>
        <div class="form-group"><label>다음 액션</label><div id="note-action-editor"></div></div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p id="create-note-draft-status" class="draft-status"></p>
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
    const createForm = document.getElementById('create-note-form');
    this.bindTemplateControls({
      selectEl: document.getElementById('create-note-template-select'),
      applyBtn: document.getElementById('apply-create-note-template-btn'),
      saveBtn: document.getElementById('save-create-note-template-btn'),
      collect: () => ({
        week_number: createForm.querySelector('[name="week_number"]').value || null,
        progress_rate: createForm.querySelector('[name="progress_rate"]').value || null,
        current_status: currentEditor.getSanitizedHTML() || null,
        main_issue: issueEditor.getSanitizedHTML() || null,
        next_action: actionEditor.getSanitizedHTML() || null,
      }),
      apply: (tpl) => {
        createForm.querySelector('[name="week_number"]').value = tpl.week_number ?? '';
        createForm.querySelector('[name="progress_rate"]').value = tpl.progress_rate ?? '';
        currentEditor.setHTML(tpl.current_status || '');
        issueEditor.setHTML(tpl.main_issue || '');
        actionEditor.setHTML(tpl.next_action || '');
      },
    });
    const createBinding = DraftStore.bindForm({
      form: createForm,
      key: draftKey,
      collect: () => ({
        coaching_date: createForm.querySelector('[name="coaching_date"]').value,
        week_number: createForm.querySelector('[name="week_number"]').value,
        progress_rate: createForm.querySelector('[name="progress_rate"]').value,
        current_status: currentEditor.getHTML(),
        main_issue: issueEditor.getHTML(),
        next_action: actionEditor.getHTML(),
      }),
      apply: (payload) => {
        if (!payload || typeof payload !== 'object') return;
        if (payload.coaching_date !== undefined) createForm.querySelector('[name="coaching_date"]').value = payload.coaching_date || '';
        if (payload.week_number !== undefined) createForm.querySelector('[name="week_number"]').value = payload.week_number || '';
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
        coaching_date: fd.get('coaching_date'),
        week_number: fd.get('week_number') ? parseInt(fd.get('week_number')) : null,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate')) : null,
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
    Modal.open(`<h2>코칭노트 편집</h2>
      <form id="edit-note-form">
        <div class="form-group">
          <label>템플릿</label>
          <div class="inline-actions">
            <select id="edit-note-template-select"><option value="">템플릿 선택</option></select>
            <button type="button" id="apply-edit-note-template-btn" class="btn btn-sm btn-secondary">불러오기</button>
            <button type="button" id="save-edit-note-template-btn" class="btn btn-sm">템플릿 저장</button>
          </div>
        </div>
        <div class="form-group"><label>코칭 날짜 *</label><input type="date" name="coaching_date" required value="${note.coaching_date}" /></div>
        <div class="form-group"><label>주차</label><input type="number" name="week_number" min="1" value="${note.week_number || ''}" /></div>
        <div class="form-group"><label>현재 상태</label><div id="edit-note-current-editor"></div></div>
        <div class="form-group"><label>진행률 (%)</label><input type="number" name="progress_rate" min="0" max="100" value="${note.progress_rate ?? ''}" /></div>
        <div class="form-group"><label>당면 문제</label><div id="edit-note-issue-editor"></div></div>
        <div class="form-group"><label>다음 액션</label><div id="edit-note-action-editor"></div></div>
        <div class="form-group">
          <label>AI 보완 지시사항 (선택)</label>
          <input type="text" name="ai_instruction" placeholder="예: 다음 액션을 더 구체적인 일정/담당으로 정리" />
          <p class="form-hint">현재 편집 중인 내용으로 AI 보완 제안을 생성합니다.</p>
        </div>
        <div class="page-actions">
          <button type="button" id="enhance-note-ai-btn" class="btn btn-secondary">AI 보완</button>
          <button type="submit" class="btn btn-primary">저장</button>
        </div>
        <p id="edit-note-draft-status" class="draft-status"></p>
        <p class="form-error" id="edit-note-err" style="display:none;"></p>
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
    const editForm = document.getElementById('edit-note-form');
    this.bindTemplateControls({
      selectEl: document.getElementById('edit-note-template-select'),
      applyBtn: document.getElementById('apply-edit-note-template-btn'),
      saveBtn: document.getElementById('save-edit-note-template-btn'),
      collect: () => ({
        week_number: editForm.querySelector('[name="week_number"]').value || null,
        progress_rate: editForm.querySelector('[name="progress_rate"]').value || null,
        current_status: currentEditor.getSanitizedHTML() || null,
        main_issue: issueEditor.getSanitizedHTML() || null,
        next_action: actionEditor.getSanitizedHTML() || null,
      }),
      apply: (tpl) => {
        editForm.querySelector('[name="week_number"]').value = tpl.week_number ?? '';
        editForm.querySelector('[name="progress_rate"]').value = tpl.progress_rate ?? '';
        currentEditor.setHTML(tpl.current_status || '');
        issueEditor.setHTML(tpl.main_issue || '');
        actionEditor.setHTML(tpl.next_action || '');
      },
    });
    const aiBtn = document.getElementById('enhance-note-ai-btn');
    const errEl = document.getElementById('edit-note-err');
    const editBinding = DraftStore.bindForm({
      form: editForm,
      key: draftKey,
      collect: () => ({
        coaching_date: editForm.querySelector('[name="coaching_date"]').value,
        week_number: editForm.querySelector('[name="week_number"]').value,
        progress_rate: editForm.querySelector('[name="progress_rate"]').value,
        ai_instruction: editForm.querySelector('[name="ai_instruction"]').value,
        current_status: currentEditor.getHTML(),
        main_issue: issueEditor.getHTML(),
        next_action: actionEditor.getHTML(),
      }),
      apply: (payload) => {
        if (!payload || typeof payload !== 'object') return;
        if (payload.coaching_date !== undefined) editForm.querySelector('[name="coaching_date"]').value = payload.coaching_date || '';
        if (payload.week_number !== undefined) editForm.querySelector('[name="week_number"]').value = payload.week_number || '';
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
        coaching_date: fd.get('coaching_date'),
        week_number: fd.get('week_number') ? parseInt(fd.get('week_number')) : null,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate')) : null,
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

  async bindTemplateControls({ selectEl, applyBtn, saveBtn, collect, apply }) {
    if (!selectEl || !applyBtn || !saveBtn) return;
    const templateMap = new Map();
    const loadTemplates = async () => {
      try {
        const templates = await API.getNoteTemplates();
        templateMap.clear();
        selectEl.innerHTML = '<option value="">템플릿 선택</option>' + templates.map((t) =>
          `<option value="${t.template_id}">${Fmt.escape(t.template_name)}${t.is_shared ? ' (공유)' : ''}</option>`
        ).join('');
        templates.forEach((tpl) => templateMap.set(String(tpl.template_id), tpl));
      } catch (_) {
        selectEl.innerHTML = '<option value="">템플릿 로드 실패</option>';
      }
    };

    await loadTemplates();

    applyBtn.addEventListener('click', () => {
      const tpl = templateMap.get(selectEl.value);
      if (!tpl) {
        alert('적용할 템플릿을 선택하세요.');
        return;
      }
      apply(tpl);
    });

    saveBtn.addEventListener('click', async () => {
      const templateName = prompt('템플릿 이름을 입력하세요.');
      if (!templateName || !templateName.trim()) return;
      try {
        const payload = collect();
        await API.createNoteTemplate({
          template_name: templateName.trim(),
          week_number: payload.week_number ? parseInt(payload.week_number, 10) : null,
          progress_rate: payload.progress_rate ? parseInt(payload.progress_rate, 10) : null,
          current_status: payload.current_status || null,
          main_issue: payload.main_issue || null,
          next_action: payload.next_action || null,
          is_shared: false,
        });
        await loadTemplates();
      } catch (err) {
        alert(err.message || '템플릿 저장 실패');
      }
    });
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


