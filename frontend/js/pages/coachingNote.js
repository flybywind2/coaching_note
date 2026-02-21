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
      const canComment = user.role !== 'observer';
      const resolveCommentType = (comment) => {
        if (comment.comment_type) return comment.comment_type;
        return comment.author_role === 'participant' ? 'participant_memo' : 'coaching_feedback';
      };
      const coachingFeedbacks = comments.filter((c) => resolveCommentType(c) === 'coaching_feedback');
      const participantMemos = comments.filter((c) => resolveCommentType(c) === 'participant_memo');
      const commentFormTitle = canWrite ? '코칭 의견 작성' : '메모 작성';
      const commentPlaceholder = canWrite
        ? '코칭 의견을 입력하세요. 이미지/표 삽입이 가능합니다.'
        : '메모를 입력하세요. 이미지/표 삽입이 가능합니다.';
      const renderCommentCard = (comment) => {
        const commentType = resolveCommentType(comment);
        const typeBadge = commentType === 'participant_memo'
          ? '<span class="comment-type-badge memo">참여자 메모</span>'
          : '<span class="comment-type-badge feedback">코칭 의견</span>';
        return `
          <div class="comment-card ${comment.is_coach_only ? 'coach-only' : ''}">
            <div class="comment-head">
              ${typeBadge}
              ${comment.is_coach_only ? '<span class="coach-only-badge">코치들에게만 공유</span>' : ''}
            </div>
            <div class="comment-content rich-content">${Fmt.rich(comment.content, '-')}</div>
            ${comment.code_snippet ? `<pre class="code-snippet">${Fmt.escape(comment.code_snippet)}</pre>` : ''}
            <div class="comment-meta">
              <span>${Fmt.datetime(comment.created_at)}</span>
              ${(comment.author_id === user.user_id || user.role === 'admin')
                ? `<button class="btn btn-sm btn-danger delete-comment-btn" data-comment-id="${comment.comment_id}" data-comment-type="${commentType}">삭제</button>`
                : ''}
            </div>
          </div>`;
      };

      el.innerHTML = `
        <div class="page-container">
          <a href="#/project/${projectId}?tab=notes" class="back-link">← 코칭노트 목록으로</a>
          <div class="note-detail">
            <div class="note-detail-header">
              <h2>코칭노트</h2>
              <div class="note-meta">
                <span>${Fmt.date(note.coaching_date)}</span>
                ${note.week_number ? `<span>${note.week_number}주차</span>` : ''}
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
            <div class="comment-group">
              <h3>코칭 의견 (${coachingFeedbacks.length})</h3>
              <div id="feedback-comment-list">
                ${coachingFeedbacks.map((c) => renderCommentCard(c)).join('') || '<p class="empty-state">코칭 의견이 없습니다.</p>'}
              </div>
            </div>
            <div class="comment-group">
              <h3>참여자 메모 (${participantMemos.length})</h3>
              <div id="memo-comment-list">
                ${participantMemos.map((c) => renderCommentCard(c)).join('') || '<p class="empty-state">참여자 메모가 없습니다.</p>'}
              </div>
            </div>
            <div class="comment-form">
              ${canComment ? `
                <h4>${commentFormTitle}</h4>
                <form id="comment-form">
                  <div id="comment-editor-wrap"></div>
                  <p class="form-hint">멘션은 @사번 또는 @이름(등록된 값과 정확히 일치) 형태로 작성하세요. 저장 시 멘션 대상에게 알림이 발송됩니다.</p>
                  ${canWrite ? `<label><input type="checkbox" name="is_coach_only" /> 코치들에게만 공유(참여자 비공개)</label>` : ''}
                  <button type="submit" class="btn btn-primary">등록</button>
                </form>
              ` : '<p class="empty-state">참관자는 의견/메모를 작성할 수 없습니다.</p>'}
            </div>
          </div>
        </div>`;

      if (canComment) {
        const commentEditor = RichEditor.create(document.getElementById('comment-editor-wrap'), {
          compact: true,
          placeholder: commentPlaceholder,
          onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'comment', projectId: +projectId }),
          onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'comment', projectId: +projectId }),
        });

        document.getElementById('comment-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const content = commentEditor.getSanitizedHTML();
          if (commentEditor.isEmpty()) {
            alert(canWrite ? '코칭 의견 내용을 입력하세요.' : '메모 내용을 입력하세요.');
            return;
          }
          await API.createComment(noteId, {
            content,
            is_coach_only: fd.has('is_coach_only'),
          });
          await this.render(el, params);
        });
      }

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
        const commentType = btn.dataset.commentType;
        const targetLabel = commentType === 'participant_memo' ? '메모' : '코칭 의견';
        if (!confirm(`${targetLabel}을(를) 삭제하시겠습니까?`)) return;
        try {
          await API.deleteComment(commentId);
          await this.render(el, params);
        } catch (err) {
          alert(err.message || `${targetLabel} 삭제 실패`);
        }
      }));
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  showCreateModal(projectId, onDone, options = {}) {
    const autoDate = this._todayString();
    const baselineDate = options.coachingStartDate || autoDate;
    const autoWeek = this._weekNumberFromBaseline(autoDate, baselineDate);
    const projectName = options.projectName || `과제 #${projectId}`;
    const rawDefaultProgress = Number(options.projectProgressRate);
    const defaultProgressRate = Number.isFinite(rawDefaultProgress)
      ? Math.max(0, Math.min(100, Math.round(rawDefaultProgress)))
      : null;
    Modal.open(`<h2>코칭노트 작성</h2>
      <form id="create-note-form">
        <div class="note-modal-head">
          <div class="note-modal-project">${Fmt.escape(projectName)}</div>
          <div class="note-progress-inline">
            <label>진행률 (%)</label>
            <input type="number" name="progress_rate" min="0" max="100" value="${defaultProgressRate ?? ''}" />
          </div>
        </div>
        <div class="note-meta-row">
          <span>${Fmt.date(autoDate)}</span>
          <span>${autoWeek}주차</span>
        </div>
        <div class="form-group"><label>현재 상태</label><div id="note-current-editor"></div></div>
        <div class="form-group note-issue-toggle-row">
          <label><input type="checkbox" name="use_main_issue" /> 주요 문제 작성</label>
        </div>
        <div class="form-group" id="create-main-issue-wrap" style="display:none;"><label>주요 문제</label><div id="note-issue-editor"></div></div>
        <div class="form-group"><label>다음 작업</label><div id="note-action-editor"></div></div>
        <button type="submit" class="btn btn-primary">저장</button>
      </form>`, null, { className: 'modal-box-xl' });

    const currentEditor = RichEditor.create(document.getElementById('note-current-editor'), {
      placeholder: '현재 상태를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'note', projectId: +projectId }),
    });
    const issueEditor = RichEditor.create(document.getElementById('note-issue-editor'), {
      placeholder: '주요 문제를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'note', projectId: +projectId }),
    });
    const actionEditor = RichEditor.create(document.getElementById('note-action-editor'), {
      placeholder: '다음 작업을 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'note', projectId: +projectId }),
    });
    const createForm = document.getElementById('create-note-form');
    const useMainIssueInput = createForm.querySelector('[name="use_main_issue"]');
    const mainIssueWrap = document.getElementById('create-main-issue-wrap');
    const syncMainIssueVisibility = () => {
      const enabled = !!useMainIssueInput?.checked;
      if (mainIssueWrap) {
        mainIssueWrap.style.display = enabled ? 'block' : 'none';
      }
    };
    useMainIssueInput?.addEventListener('change', syncMainIssueVisibility);
    syncMainIssueVisibility();

    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        coaching_date: autoDate,
        week_number: autoWeek,
        current_status: currentEditor.getSanitizedHTML() || null,
        progress_rate: fd.get('progress_rate') ? parseInt(fd.get('progress_rate'), 10) : null,
        main_issue: fd.has('use_main_issue') ? (issueEditor.getSanitizedHTML() || null) : null,
        next_action: actionEditor.getSanitizedHTML() || null,
      };
      await API.createNote(projectId, data);
      Modal.close();
      if (onDone) onDone();
    });
  },

  showEditModal(projectId, note, onDone, options = {}) {
    const fixedDate = note.coaching_date || this._todayString();
    const baselineDate = options.coachingStartDate || fixedDate;
    const fixedWeek = note.week_number || this._weekNumberFromBaseline(fixedDate, baselineDate);
    const projectName = options.projectName || `과제 #${projectId}`;
    Modal.open(`<h2>코칭노트 편집</h2>
      <form id="edit-note-form">
        <div class="note-modal-head">
          <div class="note-modal-project">${Fmt.escape(projectName)}</div>
          <div class="note-progress-inline">
            <label>진행률 (%)</label>
            <input type="number" name="progress_rate" min="0" max="100" value="${note.progress_rate ?? ''}" />
          </div>
        </div>
        <div class="note-meta-row">
          <span>${Fmt.date(fixedDate)}</span>
          <span>${fixedWeek}주차</span>
        </div>
        <div class="form-group"><label>현재 상태</label><div id="edit-note-current-editor"></div></div>
        <div class="form-group note-issue-toggle-row">
          <label><input type="checkbox" name="use_main_issue"${Fmt.excerpt(note.main_issue || '', 1) ? ' checked' : ''} /> 주요 문제 작성</label>
        </div>
        <div class="form-group" id="edit-main-issue-wrap" style="display:${Fmt.excerpt(note.main_issue || '', 1) ? 'block' : 'none'};"><label>주요 문제</label><div id="edit-note-issue-editor"></div></div>
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
        <p class="form-error" id="edit-note-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const currentEditor = RichEditor.create(document.getElementById('edit-note-current-editor'), {
      initialHTML: note.current_status || '',
      placeholder: '현재 상태를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'note', projectId: +projectId }),
    });
    const issueEditor = RichEditor.create(document.getElementById('edit-note-issue-editor'), {
      initialHTML: note.main_issue || '',
      placeholder: '주요 문제를 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'note', projectId: +projectId }),
    });
    const actionEditor = RichEditor.create(document.getElementById('edit-note-action-editor'), {
      initialHTML: note.next_action || '',
      placeholder: '다음 작업을 입력하세요.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'note', projectId: +projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'note', projectId: +projectId }),
    });
    const editForm = document.getElementById('edit-note-form');
    const useMainIssueInput = editForm.querySelector('[name="use_main_issue"]');
    const mainIssueWrap = document.getElementById('edit-main-issue-wrap');
    const isMainIssueEnabled = () => !!useMainIssueInput?.checked;
    const syncMainIssueVisibility = () => {
      if (mainIssueWrap) {
        mainIssueWrap.style.display = isMainIssueEnabled() ? 'block' : 'none';
      }
    };
    useMainIssueInput?.addEventListener('change', syncMainIssueVisibility);
    syncMainIssueVisibility();
    const aiBtn = document.getElementById('enhance-note-ai-btn');
    const errEl = document.getElementById('edit-note-err');

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
          main_issue: isMainIssueEnabled() ? (issueEditor.getSanitizedHTML() || null) : null,
          next_action: actionEditor.getSanitizedHTML() || null,
          instruction: instruction || null,
        });
        currentEditor.setHTML(enhanced.current_status || '');
        if (isMainIssueEnabled()) {
          issueEditor.setHTML(enhanced.main_issue || '');
        }
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
        main_issue: fd.has('use_main_issue') ? (issueEditor.getSanitizedHTML() || null) : null,
        next_action: actionEditor.getSanitizedHTML() || null,
      };
      try {
        await API.updateNote(note.note_id, data);
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

  _weekNumberFromBaseline(targetDateString, baselineDateString) {
    if (!targetDateString || !baselineDateString) return this._isoWeekNumber(targetDateString);
    const target = new Date(`${targetDateString}T00:00:00`);
    const baseline = new Date(`${baselineDateString}T00:00:00`);
    if (Number.isNaN(target.getTime()) || Number.isNaN(baseline.getTime())) {
      return this._isoWeekNumber(targetDateString);
    }
    const deltaDays = Math.floor((target - baseline) / 86400000);
    return deltaDays >= 0 ? Math.floor(deltaDays / 7) + 1 : 1;
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


