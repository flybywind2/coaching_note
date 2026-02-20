/**
 * ProjectDetail 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.projectDetail = {
  async render(el, params) {
    const projectId = parseInt(params.id);
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [project, notes, tasks, members] = await Promise.all([
        API.getProject(projectId),
        API.getNotes(projectId),
        API.getTasks(projectId),
        API.getMembers(projectId),
      ]);
      const user = Auth.getUser();
      const canWrite = user.role === 'admin' || user.role === 'coach';
      const isAdmin = user.role === 'admin';
      const progressValue = Math.max(0, Math.min(100, Number(project.progress_rate) || 0));
      const statusValue = project.status || 'preparing';
      const noteCount = notes.length;
      const taskCount = tasks.length;
      const milestoneCount = tasks.filter(t => t.is_milestone).length;
      const completedTaskCount = tasks.filter(t => t.status === 'completed').length;
      const memberCount = members.length;
      const visibilityLabel = project.visibility === 'public' ? '공개' : '비공개';
      const projectSignalParts = [];
      if (project.category) projectSignalParts.push(project.category);
      if (project.representative) projectSignalParts.push(`대표 ${project.representative}`);
      const projectSignalText = projectSignalParts.length ? Fmt.escape(projectSignalParts.join(' · ')) : '과제 운영 정보를 확인하세요.';

      el.innerHTML = `
        <div class="page-container project-detail-page">
          <div class="project-hero">
            <div class="project-hero-top">
              <a href="#/projects" class="back-link">← 과제 목록</a>
              ${isAdmin ? `<button id="delete-project-btn" class="btn btn-danger">과제 삭제</button>` : ''}
            </div>
            <div class="project-hero-main">
              <div class="project-hero-title-wrap">
                <h1 class="project-hero-title">${Fmt.escape(project.project_name)}</h1>
                <p class="project-hero-sub">${projectSignalText}</p>
                <div class="project-meta project-meta-row">
                  <span class="tag tag-${statusValue}">${Fmt.status(statusValue)}</span>
                  <span class="project-meta-text">${Fmt.escape(project.organization)}</span>
                  <span class="project-meta-sep">•</span>
                  <span class="project-meta-text">${visibilityLabel}</span>
                </div>
              </div>
              <div class="project-kpi-row">
                <div class="project-kpi">
                  <span class="project-kpi-label">코칭노트</span>
                  <strong class="project-kpi-value">${noteCount}</strong>
                </div>
                <div class="project-kpi">
                  <span class="project-kpi-label">Task</span>
                  <strong class="project-kpi-value">${taskCount}</strong>
                </div>
                <div class="project-kpi">
                  <span class="project-kpi-label">마일스톤</span>
                  <strong class="project-kpi-value">${milestoneCount}</strong>
                </div>
                <div class="project-kpi">
                  <span class="project-kpi-label">완료 Task</span>
                  <strong class="project-kpi-value">${completedTaskCount}/${taskCount}</strong>
                </div>
                <div class="project-kpi">
                  <span class="project-kpi-label">팀원</span>
                  <strong class="project-kpi-value">${memberCount}</strong>
                </div>
              </div>
            </div>
            <div class="project-progress-wrap">
              <div class="project-progress-head">
                <span>전체 진행률</span>
                <strong>${progressValue}%</strong>
              </div>
              ${Fmt.progress(progressValue)}
            </div>
          </div>
          <div class="project-tab-shell">
            <div class="tabs project-tabs">
              <button class="tab-btn active" data-tab="info">기본정보</button>
              <button class="tab-btn" data-tab="docs">문서</button>
              <button class="tab-btn" data-tab="notes">코칭노트 (${noteCount})</button>
              <button class="tab-btn" data-tab="tasks">Task (${taskCount})</button>
              <button class="tab-btn" data-tab="sessions">세션</button>
              ${canWrite ? '<button class="tab-btn" data-tab="ai">AI 분석</button>' : ''}
            </div>
            <div id="tab-content" class="project-tab-content"></div>
          </div>
        </div>`;

      const tabContent = document.getElementById('tab-content');
      const renderTab = (tab) => {
        el.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        switch (tab) {
          case 'info':
            this._renderInfo(tabContent, project, {
              canWrite,
              isAdmin,
              members,
              projectId,
              onSave: async (payload) => {
                await API.updateProject(projectId, payload);
                await this.render(el, params);
              },
              onMemberChanged: async () => {
                await this.render(el, params);
              },
            });
            break;
          case 'docs': this._renderDocs(tabContent, projectId, canWrite); break;
          case 'notes': this._renderNotes(tabContent, notes, projectId, canWrite); break;
          case 'tasks': this._renderTasks(tabContent, tasks, projectId, user, members); break;
          case 'sessions': this._renderSessions(tabContent, projectId, project, canWrite); break;
          case 'ai': this._renderAI(tabContent, projectId); break;
        }
      };
      el.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => renderTab(btn.dataset.tab));
      });
      if (isAdmin) {
        document.getElementById('delete-project-btn')?.addEventListener('click', async () => {
          if (!confirm(`과제를 삭제하시겠습니까?\n${project.project_name}`)) return;
          try {
            await API.deleteProject(projectId);
            Router.go(`/projects/${project.batch_id}`);
          } catch (err) {
            alert(err.message || '과제 삭제 실패');
          }
        });
      }
      renderTab('info');
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderInfo(el, p, options) {
    const { canWrite, isAdmin, members, projectId, onSave, onMemberChanged } = options;
    el.innerHTML = `<div class="project-info-layout">
      <div class="project-info-panel">
        <div class="project-info-panel-head">
          <h3>기본 정보</h3>
          <p>과제를 식별하는 핵심 항목입니다.</p>
        </div>
        <div class="info-grid project-info-grid">
          <div class="info-item"><label>과제명</label><span>${Fmt.escape(p.project_name)}</span></div>
          <div class="info-item"><label>조직</label><span>${Fmt.escape(p.organization)}</span></div>
          <div class="info-item"><label>대표자</label><span>${Fmt.escape(p.representative || '-')}</span></div>
          <div class="info-item"><label>분류</label><span>${Fmt.escape(p.category || '-')}</span></div>
        </div>
      </div>
      <div class="project-info-panel">
        <div class="project-info-panel-head">
          <h3>운영 정보</h3>
          <p>진행 상태와 공개 범위입니다.</p>
        </div>
        <div class="info-grid project-info-grid">
          <div class="info-item"><label>상태</label><span>${Fmt.status(p.status)}</span></div>
          <div class="info-item"><label>공개여부</label><span>${p.visibility === 'public' ? '공개' : '비공개'}</span></div>
          <div class="info-item"><label>생성일</label><span>${Fmt.date(p.created_at)}</span></div>
        </div>
      </div>
      ${p.ai_summary ? `<div class="project-info-panel project-summary-panel">
        <div class="project-info-panel-head">
          <h3>AI 요약</h3>
          <p>최근 코칭 데이터 기반 요약입니다.</p>
        </div>
        <div class="info-item full"><div class="ai-summary">${Fmt.escape(p.ai_summary)}</div></div>
      </div>` : ''}
      <div class="project-info-panel">
        <div class="project-info-panel-head">
          <h3>팀원</h3>
          <p>과제 팀원과 역할을 관리합니다.</p>
        </div>
        <div class="project-member-list">
          ${members.length ? members.map((m) => `
            <div class="project-member-item">
              <div class="project-member-main">
                <strong>${Fmt.escape(m.user_name || `사용자#${m.user_id}`)}</strong>
                <span>${Fmt.escape(m.user_emp_id || '-')}</span>
                <span class="tag">${Fmt.escape(m.role || 'member')}</span>
                ${m.is_representative ? '<span class="tag tag-done">대표</span>' : ''}
              </div>
              ${isAdmin ? `<button class="btn btn-sm btn-danger remove-member-btn" data-user-id="${m.user_id}" data-user-name="${Fmt.escape(m.user_name || '')}">제거</button>` : ''}
            </div>
          `).join('') : '<p class="empty-state">등록된 팀원이 없습니다.</p>'}
        </div>
        ${isAdmin ? `<div class="page-actions"><button id="add-member-btn" class="btn btn-secondary">팀원 추가</button></div>` : ''}
      </div>
    </div>
    ${canWrite ? `<div class="page-actions"><button id="edit-project-info-btn" class="btn btn-secondary">기본정보 편집</button></div>` : ''}`;

    if (canWrite) {
      document.getElementById('edit-project-info-btn')?.addEventListener('click', () => {
        Modal.open(`<h2>기본정보 편집</h2>
          <form id="edit-project-info-form">
            <div class="form-group"><label>과제명 *</label><input name="project_name" required value="${Fmt.escape(p.project_name)}" /></div>
            <div class="form-group"><label>조직 *</label><input name="organization" required value="${Fmt.escape(p.organization)}" /></div>
            <div class="form-group"><label>대표자</label><input name="representative" value="${Fmt.escape(p.representative || '')}" /></div>
            <div class="form-group"><label>분류</label><input name="category" value="${Fmt.escape(p.category || '')}" /></div>
            <div class="form-group"><label>상태</label>
              <select name="status">
                <option value="preparing"${p.status === 'preparing' ? ' selected' : ''}>${Fmt.status('preparing')}</option>
                <option value="in_progress"${p.status === 'in_progress' ? ' selected' : ''}>${Fmt.status('in_progress')}</option>
                <option value="completed"${p.status === 'completed' ? ' selected' : ''}>${Fmt.status('completed')}</option>
              </select>
            </div>
            <div class="form-group"><label>공개여부</label>
              <select name="visibility">
                <option value="public"${p.visibility === 'public' ? ' selected' : ''}>공개</option>
                <option value="restricted"${p.visibility === 'restricted' ? ' selected' : ''}>비공개</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary">저장</button>
            <p class="form-error" id="edit-project-info-err" style="display:none;"></p>
          </form>`);

        document.getElementById('edit-project-info-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            project_name: (fd.get('project_name') || '').toString().trim(),
            organization: (fd.get('organization') || '').toString().trim(),
            representative: ((fd.get('representative') || '').toString().trim() || null),
            category: ((fd.get('category') || '').toString().trim() || null),
            status: fd.get('status'),
            visibility: fd.get('visibility'),
          };

          try {
            await onSave(payload);
            Modal.close();
          } catch (err) {
            const errEl = document.getElementById('edit-project-info-err');
            if (!errEl) return;
            errEl.textContent = err.message || '기본정보 저장 실패';
            errEl.style.display = 'block';
          }
        });
      });
    }

    if (isAdmin) {
      document.getElementById('add-member-btn')?.addEventListener('click', () => {
        this._openAddMemberModal({
          projectId,
          currentMembers: members,
          onSaved: onMemberChanged,
        });
      });

      el.querySelectorAll('.remove-member-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const userId = +btn.dataset.userId;
        const userName = btn.dataset.userName || '해당 사용자';
        if (!confirm(`${userName}님을 팀원에서 제거하시겠습니까?`)) return;
        try {
          await API.removeMember(projectId, userId);
          if (onMemberChanged) onMemberChanged();
        } catch (err) {
          alert(err.message || '팀원 제거 실패');
        }
      }));
    }
  },

  async _openAddMemberModal({ projectId, currentMembers, onSaved }) {
    let users = [];
    try {
      users = await API.getUsers();
    } catch (err) {
      alert(err.message || '사용자 목록을 불러오지 못했습니다.');
      return;
    }

    const memberUserIds = new Set((currentMembers || []).map((m) => m.user_id));
    const candidates = users.filter((u) => !memberUserIds.has(u.user_id));

    Modal.open(`<h2>과제 팀원 추가</h2>
      <form id="add-member-form">
        <div class="form-group">
          <label>사용자 *</label>
          <select name="user_id" required>
            <option value="">선택</option>
            ${candidates.map((u) => `<option value="${u.user_id}">${Fmt.escape(u.name)} (${Fmt.escape(u.emp_id)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>역할</label>
          <select name="role">
            <option value="member" selected>member</option>
            <option value="leader">leader</option>
          </select>
        </div>
        <div class="form-group"><label><input type="checkbox" name="is_representative" /> 대표자 지정</label></div>
        <button type="submit" class="btn btn-primary">추가</button>
        <p class="form-error" id="add-member-err" style="display:none;"></p>
      </form>`);

    document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const userId = fd.get('user_id');
      if (!userId) return;
      try {
        await API.addMember(projectId, {
          user_id: parseInt(userId, 10),
          role: (fd.get('role') || 'member').toString(),
          is_representative: fd.has('is_representative'),
        });
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('add-member-err');
        if (!errEl) return;
        errEl.textContent = err.message || '팀원 추가 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _renderDocs(el, projectId, canWrite) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    const docs = await API.getDocuments(projectId);
    const types = { application: '지원서', basic_consulting: '기초컨설팅', workshop_result: '워크샵결과', mid_presentation: '중간발표', final_presentation: '최종발표' };
    el.innerHTML = `<div class="docs-section">${Object.entries(types).map(([t, label]) => {
      const doc = docs.find(d => d.doc_type === t);
      const statusBadge = doc ? `<span class="tag tag-done">등록됨</span>` : `<span class="empty-doc">미등록</span>`;
      const preview = doc?.content ? Fmt.excerpt(doc.content, 120) : '';
      const attachment = doc?.attachments ? (() => { try { return JSON.parse(doc.attachments)[0]; } catch { return null; } })() : null;
      const downloadBtn = attachment ? `<a href="${Fmt.escape(attachment.url)}" target="_blank" class="btn btn-sm">기존 첨부</a>` : '';
      const viewBtn = doc ? `<button class="btn btn-sm view-doc-btn" data-doc-id="${doc.doc_id}" data-label="${Fmt.escape(label)}">보기</button>` : '';
      const editBtn = canWrite ? `<button class="btn btn-sm btn-secondary edit-doc-btn" data-doc-id="${doc?.doc_id || ''}" data-type="${t}" data-label="${Fmt.escape(label)}">편집</button>` : '';
      const historyBtn = (canWrite && doc) ? `<button class="btn btn-sm btn-secondary doc-version-btn" data-doc-id="${doc.doc_id}" data-label="${Fmt.escape(label)}">이력</button>` : '';
      const deleteBtn = (canWrite && doc) ? `<button class="btn btn-sm btn-danger delete-doc-btn" data-doc-id="${doc.doc_id}" data-label="${Fmt.escape(label)}">삭제</button>` : '';
      return `<div class="doc-type-row">
        <span class="doc-type-label">${label}</span>
        <div class="doc-actions">
          ${statusBadge}
          ${downloadBtn}
          ${viewBtn}
          ${editBtn}
          ${historyBtn}
          ${deleteBtn}
        </div>
      </div>
      ${preview ? `<div class="doc-content-preview"><div class="preview-title">${label} 미리보기</div><div class="preview-text">${Fmt.escape(preview)}</div></div>` : ''}`;
    }).join('')}</div>`;

    el.querySelectorAll('.view-doc-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const doc = await API.getDocument(+btn.dataset.docId);
      this._openDocViewer(btn.dataset.label, doc);
    }));

    el.querySelectorAll('.edit-doc-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const docId = btn.dataset.docId ? +btn.dataset.docId : null;
      const doc = docId ? await API.getDocument(docId) : null;
      this._openDocEditor({
        projectId,
        docId,
        docType: btn.dataset.type,
        label: btn.dataset.label,
        current: doc,
        onSaved: async () => this._renderDocs(el, projectId, canWrite),
      });
    }));

    el.querySelectorAll('.doc-version-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const docId = +btn.dataset.docId;
      await this._openDocVersionModal({
        docId,
        onRestored: async () => this._renderDocs(el, projectId, canWrite),
      });
    }));

    el.querySelectorAll('.delete-doc-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const docId = +btn.dataset.docId;
      const label = btn.dataset.label || '문서';
      if (!confirm(`${label} 문서를 삭제하시겠습니까?`)) return;
      try {
        await API.deleteDocument(docId);
        await this._renderDocs(el, projectId, canWrite);
      } catch (err) {
        alert(err.message || '문서 삭제 실패');
      }
    }));
  },

  _openDocViewer(label, doc) {
    const title = doc.title || label;
    const content = doc.content ? Fmt.rich(doc.content) : '<p class="empty-state">저장된 본문이 없습니다.</p>';
    let attachmentHtml = '';
    if (doc.attachments) {
      try {
        const at = JSON.parse(doc.attachments);
        attachmentHtml = at.map((a) => `<a href="${Fmt.escape(a.url)}" target="_blank" class="btn btn-sm">첨부: ${Fmt.escape(a.filename || '파일')}</a>`).join(' ');
      } catch (_) {
        attachmentHtml = '';
      }
    }
    Modal.open(`<h2>${Fmt.escape(title)}</h2>
      <div class="rich-content">${content}</div>
      ${attachmentHtml ? `<div style="margin-top:12px;">${attachmentHtml}</div>` : ''}`);
  },

  _openDocEditor({ projectId, docId, docType, label, current, onSaved }) {
    const title = current?.title || label;
    const content = current?.content || '';
    const draftKey = DraftStore.buildKey('doc-editor', projectId, docId || `new-${docType}`);
    Modal.open(`<h2>${Fmt.escape(label)} 편집</h2>
      <form id="doc-editor-form">
        <div class="form-group"><label>제목</label><input name="title" value="${Fmt.escape(title)}" placeholder="${Fmt.escape(label)}" /></div>
        <div class="form-group">
          <label>문서 본문</label>
          <div id="doc-editor-wrap"></div>
          <p id="doc-editor-draft-status" class="draft-status"></p>
        </div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p class="form-error" id="doc-editor-err" style="display:none;"></p>
      </form>`);

    const editor = RichEditor.create(document.getElementById('doc-editor-wrap'), {
      initialHTML: content,
      placeholder: '문서를 작성하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'document', projectId }),
    });
    const formEl = document.getElementById('doc-editor-form');
    const titleEl = formEl.querySelector('input[name="title"]');
    const draftBinding = DraftStore.bindForm({
      form: formEl,
      key: draftKey,
      collect: () => ({
        title: titleEl.value,
        content: editor.getHTML(),
      }),
      apply: (payload) => {
        if (!payload || typeof payload !== 'object') return;
        if (payload.title !== undefined) titleEl.value = payload.title || '';
        if (payload.content !== undefined) editor.setHTML(payload.content || '');
      },
      statusEl: document.getElementById('doc-editor-draft-status'),
      restoreMessage: '이전에 임시저장된 문서 편집 내용이 있습니다. 복원하시겠습니까?',
    });

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const html = editor.getSanitizedHTML();
      try {
        if (docId) {
          await API.updateDocument(docId, { title: fd.get('title') || null, content: html || null });
        } else {
          const body = new FormData();
          body.append('doc_type', docType);
          body.append('title', fd.get('title') || '');
          body.append('content', html || '');
          await API.createDocument(projectId, body);
        }
        draftBinding.clear();
        draftBinding.dispose();
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('doc-editor-err');
        errEl.textContent = err.message || '문서 저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openDocVersionModal({ docId, onRestored }) {
    try {
      const versions = await API.getDocumentVersions(docId);
      Modal.open(`<h2>문서 변경 이력</h2>
        <div class="version-list">
          ${versions.length ? versions.map((v) => `
            <div class="version-item">
              <div class="version-meta">
                <strong>v${v.version_no}</strong>
                <span>${Fmt.escape(v.change_type)}</span>
                <span>${Fmt.datetime(v.created_at)}</span>
              </div>
              <div class="version-preview">${Fmt.escape(Fmt.excerpt(v.snapshot.content || '', 200) || '-')}</div>
              <div class="version-actions">
                <button class="btn btn-sm btn-secondary restore-doc-version-btn" data-version-id="${v.version_id}">이 버전으로 복원</button>
              </div>
            </div>
          `).join('') : '<p class="empty-state">저장된 이력이 없습니다.</p>'}
        </div>`);

      document.querySelectorAll('.restore-doc-version-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const versionId = +btn.dataset.versionId;
        if (!confirm('선택한 버전으로 복원하시겠습니까?')) return;
        try {
          await API.restoreDocumentVersion(docId, versionId);
          Modal.close();
          if (onRestored) onRestored();
        } catch (err) {
          alert(err.message || '문서 복원 실패');
        }
      }));
    } catch (err) {
      alert(err.message || '문서 이력을 불러오지 못했습니다.');
    }
  },

  _renderNotes(el, notes, projectId, canWrite) {
    el.innerHTML = `<div class="notes-section">
      ${canWrite ? `<button id="add-note-btn" class="btn btn-primary mb">+ 코칭노트 작성</button>` : ''}
      ${notes.length === 0 ? '<p class="empty-state">코칭노트가 없습니다.</p>' : notes.map(n => `
        <div class="note-card">
          <div class="note-header">
            <span class="note-date">${Fmt.date(n.coaching_date)}</span>
            ${n.week_number ? `<span class="tag">${n.week_number}주차</span>` : ''}
            ${n.progress_rate != null ? `<span class="tag">${n.progress_rate}%</span>` : ''}
          </div>
          <p>${Fmt.escape(Fmt.excerpt(n.current_status || '', 120))}</p>
          <div class="note-actions">
            <a href="#/project/${projectId}/notes/${n.note_id}" class="btn btn-sm">상세 보기</a>
            ${canWrite ? `<button class="btn btn-sm btn-danger delete-note-btn" data-note-id="${n.note_id}">삭제</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
    if (canWrite) {
      document.getElementById('add-note-btn')?.addEventListener('click', () => {
        Pages.coachingNote.showCreateModal(projectId, async () => {
          const updated = await API.getNotes(projectId);
          this._renderNotes(el, updated, projectId, canWrite);
        });
      });

      el.querySelectorAll('.delete-note-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const noteId = +btn.dataset.noteId;
        if (!confirm('코칭노트를 삭제하시겠습니까?')) return;
        try {
          await API.deleteNote(noteId);
          const updated = await API.getNotes(projectId);
          this._renderNotes(el, updated, projectId, canWrite);
        } catch (err) {
          alert(err.message || '코칭노트 삭제 실패');
        }
      }));
    }
  },

  _renderTasks(el, tasks, projectId, user, members = []) {
    const memberMap = new Map((members || []).map((m) => [m.user_id, m]));
    const assigneeLabel = (task) => {
      if (task.assignee_name) return task.assignee_name;
      const member = memberMap.get(task.assigned_to);
      return member?.user_name || '-';
    };
    const milestones = tasks.filter(t => t.is_milestone).sort((a, b) => (a.milestone_order||0)-(b.milestone_order||0));
    const regular = tasks.filter(t => !t.is_milestone);
    const totalCount = tasks.length;
    const todoCount = tasks.filter(t => t.status === 'todo').length;
    const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    el.innerHTML = `<div class="tasks-section">
      <div class="task-head-panel">
        <div class="task-stat-grid">
          <div class="task-stat-card"><span>전체</span><strong>${totalCount}</strong></div>
          <div class="task-stat-card"><span>할일</span><strong>${todoCount}</strong></div>
          <div class="task-stat-card"><span>진행중</span><strong>${inProgressCount}</strong></div>
          <div class="task-stat-card"><span>완료</span><strong>${completedCount}</strong></div>
        </div>
        <button id="add-task-btn" class="btn btn-primary">+ Task 추가</button>
      </div>
      ${milestones.length ? `<section class="task-block">
        <div class="task-block-head">
          <h3>마일스톤</h3>
          <span>${milestones.length}개</span>
        </div>
        <div class="milestone-list">${milestones.map(t => `
        <div class="milestone-item">
          <div class="milestone-main">
            <span class="milestone-order">${t.milestone_order||'-'}</span>
            <div class="milestone-body">
              <strong class="milestone-title">${Fmt.escape(t.title)}</strong>
              <div class="milestone-meta">
                <span class="tag tag-${t.status}">${Fmt.status(t.status)}</span>
                <span class="due">${Fmt.date(t.due_date)}</span>
                <span class="due">담당 ${Fmt.escape(assigneeLabel(t))}</span>
              </div>
            </div>
          </div>
          <div class="milestone-controls">
            <select class="status-sel" data-tid="${t.task_id}">
              ${['todo','in_progress','completed'].map(s=>`<option value="${s}"${t.status===s?' selected':''}>${Fmt.status(s)}</option>`).join('')}
            </select>
            ${user.role !== 'observer' ? `<button class="btn btn-sm btn-secondary edit-task-btn" data-tid="${t.task_id}">편집</button>` : ''}
            ${user.role !== 'observer' ? `<button class="btn btn-sm btn-danger del-task-btn" data-tid="${t.task_id}">삭제</button>` : ''}
          </div>
        </div>`).join('')}</div>
      </section>` : ''}
      ${regular.length ? `<section class="task-block">
        <div class="task-block-head">
          <h3>일반 Task</h3>
          <span>${regular.length}개</span>
        </div>
        <div class="task-list">${regular.map(t => `
        <div class="task-item">
          <label class="task-item-main">
            <input type="checkbox" class="task-chk" data-tid="${t.task_id}" ${t.status==='completed'?'checked':''} />
            <span class="task-title ${t.status==='completed'?'strike':''}">${Fmt.escape(t.title)}</span>
          </label>
          <div class="task-item-meta">
            <span class="due">${Fmt.date(t.due_date)}</span>
            <span class="due">담당 ${Fmt.escape(assigneeLabel(t))}</span>
            <span class="tag tag-${t.status}">${Fmt.status(t.status)}</span>
            ${user.role !== 'observer' ? `<button class="btn btn-sm btn-secondary edit-task-btn" data-tid="${t.task_id}">편집</button>` : ''}
            ${user.role !== 'observer' ? `<button class="btn btn-sm btn-danger del-task-btn" data-tid="${t.task_id}">삭제</button>` : ''}
          </div>
        </div>`).join('')}</div>
      </section>` : ''}
    </div>`;

    el.querySelectorAll('.status-sel').forEach(s => s.addEventListener('change', async () => {
      await API.updateTask(+s.dataset.tid, {status: s.value});
      const t = await API.getTasks(projectId); this._renderTasks(el, t, projectId, user, members);
    }));
    el.querySelectorAll('.task-chk').forEach(cb => cb.addEventListener('change', async () => {
      await API.updateTask(+cb.dataset.tid, {status: cb.checked ? 'completed' : 'todo'});
      const t = await API.getTasks(projectId);
      this._renderTasks(el, t, projectId, user, members);
    }));
    el.querySelectorAll('.edit-task-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const taskId = +btn.dataset.tid;
      const task = tasks.find((t) => t.task_id === taskId);
      if (!task) return;
      this._openTaskModal({
        projectId,
        members,
        task,
        onSaved: async () => {
          const t = await API.getTasks(projectId);
          this._renderTasks(el, t, projectId, user, members);
        },
      });
    }));
    el.querySelectorAll('.del-task-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const taskId = +btn.dataset.tid;
      if (!confirm('Task를 삭제하시겠습니까?')) return;
      try {
        await API.deleteTask(taskId);
        const t = await API.getTasks(projectId);
        this._renderTasks(el, t, projectId, user, members);
      } catch (err) {
        alert(err.message || 'Task 삭제 실패');
      }
    }));
    document.getElementById('add-task-btn')?.addEventListener('click', () => {
      this._openTaskModal({
        projectId,
        members,
        onSaved: async () => {
          const t = await API.getTasks(projectId);
          this._renderTasks(el, t, projectId, user, members);
        },
      });
    });
  },

  _openTaskModal({ projectId, members, task = null, onSaved }) {
    const isEdit = !!task;
    const memberOptions = (members || []).map((m) => `<option value="${m.user_id}"${task?.assigned_to === m.user_id ? ' selected' : ''}>${Fmt.escape(m.user_name || `사용자#${m.user_id}`)} (${Fmt.escape(m.user_emp_id || '-')})</option>`).join('');
    Modal.open(`<h2>${isEdit ? 'Task 편집' : 'Task 추가'}</h2>
      <form id="task-form">
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(task?.title || '')}" /></div>
        <div class="form-group"><label>설명</label><textarea name="description" rows="4">${Fmt.escape(task?.description || '')}</textarea></div>
        <div class="form-group"><label>담당자</label>
          <select name="assigned_to">
            <option value="">미배정</option>
            ${memberOptions}
          </select>
        </div>
        <div class="form-group"><label>마감일</label><input type="date" name="due_date" value="${task?.due_date || ''}" /></div>
        <div class="form-group"><label>우선순위</label>
          <select name="priority">
            <option value="high"${(task?.priority || 'medium') === 'high' ? ' selected' : ''}>높음</option>
            <option value="medium"${(task?.priority || 'medium') === 'medium' ? ' selected' : ''}>보통</option>
            <option value="low"${(task?.priority || 'medium') === 'low' ? ' selected' : ''}>낮음</option>
          </select>
        </div>
        <div class="form-group"><label>상태</label>
          <select name="status">
            <option value="todo"${(task?.status || 'todo') === 'todo' ? ' selected' : ''}>${Fmt.status('todo')}</option>
            <option value="in_progress"${(task?.status || 'todo') === 'in_progress' ? ' selected' : ''}>${Fmt.status('in_progress')}</option>
            <option value="completed"${(task?.status || 'todo') === 'completed' ? ' selected' : ''}>${Fmt.status('completed')}</option>
          </select>
        </div>
        <div class="form-group"><label><input type="checkbox" name="is_milestone"${task?.is_milestone ? ' checked' : ''} /> 마일스톤</label></div>
        <div class="form-group"><label>마일스톤 순서</label><input type="number" min="1" name="milestone_order" value="${task?.milestone_order ?? ''}" /></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '추가'}</button>
        <p class="form-error" id="task-form-err" style="display:none;"></p>
      </form>`);

    document.getElementById('task-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const assignedValue = (fd.get('assigned_to') || '').toString().trim();
      const payload = {
        title: (fd.get('title') || '').toString().trim(),
        description: (fd.get('description') || '').toString() || null,
        assigned_to: assignedValue ? parseInt(assignedValue, 10) : null,
        due_date: (fd.get('due_date') || '').toString() || null,
        priority: (fd.get('priority') || 'medium').toString(),
        status: (fd.get('status') || 'todo').toString(),
        is_milestone: fd.has('is_milestone'),
        milestone_order: (() => {
          const raw = (fd.get('milestone_order') || '').toString().trim();
          return raw ? parseInt(raw, 10) : null;
        })(),
      };

      try {
        if (isEdit) {
          await API.updateTask(task.task_id, payload);
        } else {
          await API.createTask(projectId, payload);
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('task-form-err');
        if (!errEl) return;
        errEl.textContent = err.message || `Task ${isEdit ? '저장' : '추가'} 실패`;
        errEl.style.display = 'block';
      }
    });
  },

  async _renderSessions(el, projectId, project, canWrite) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const sessions = await API.getSessions({ project_id: projectId });
      el.innerHTML = `<div class="sessions-section">
        ${canWrite ? `<button id="add-session-btn" class="btn btn-primary mb">+ 세션 추가</button>` : ''}
        ${sessions.length === 0 ? '<p class="empty-state">세션이 없습니다.</p>' : `
        <table class="data-table">
          <thead><tr><th>날짜</th><th>시간</th><th>장소</th><th>상태</th><th></th></tr></thead>
          <tbody>${sessions.map(s => `<tr>
            <td>${Fmt.date(s.session_date)}</td>
            <td>${s.start_time} ~ ${s.end_time}</td>
            <td>${Fmt.escape(s.location || '-')}</td>
            <td><span class="tag tag-${s.session_status}">${Fmt.status(s.session_status)}</span></td>
            <td><a href="#/session/${s.session_id}" class="btn btn-sm">상세</a></td>
          </tr>`).join('')}
          </tbody>
        </table>`}
      </div>`;

      document.getElementById('add-session-btn')?.addEventListener('click', () => {
        Modal.open(`<h2>세션 추가</h2>
          <form id="add-session-form">
            <div class="form-group"><label>날짜 *</label><input type="date" name="session_date" required /></div>
            <div class="form-group"><label>시작 시간 *</label><input name="start_time" required placeholder="09:00" /></div>
            <div class="form-group"><label>종료 시간 *</label><input name="end_time" required placeholder="11:00" /></div>
            <div class="form-group"><label>장소</label><input name="location" placeholder="회의실 A" /></div>
            <button type="submit" class="btn btn-primary">추가</button>
          </form>`);
        document.getElementById('add-session-form').addEventListener('submit', async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await API.createSession({
              batch_id: project.batch_id,
              project_id: projectId,
              session_date: fd.get('session_date'),
              start_time: fd.get('start_time'),
              end_time: fd.get('end_time'),
              location: fd.get('location') || null,
            });
            Modal.close();
            this._renderSessions(el, projectId, project, canWrite);
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async _renderAI(el, projectId) {
    el.innerHTML = `<div class="ai-section"><h3>AI 분석</h3>
      <div class="ai-actions">
        <button id="gen-sum" class="btn btn-primary">코칭노트 요약 생성</button>
        <button id="gen-qa" class="btn btn-secondary">Q&A Set 생성</button>
      </div><div id="ai-res" class="ai-result"></div></div>`;
    const res = document.getElementById('ai-res');
    document.getElementById('gen-sum').addEventListener('click', async () => {
      res.innerHTML = '<div class="loading">AI 요약 생성 중...</div>';
      try { const d = await API.generateSummary(projectId); res.innerHTML = `<div class="ai-content"><h4>${Fmt.escape(d.title)}</h4><pre>${Fmt.escape(d.content)}</pre><small>모델: ${d.model_used}</small></div>`; }
      catch(e) { res.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`; }
    });
    document.getElementById('gen-qa').addEventListener('click', async () => {
      res.innerHTML = '<div class="loading">Q&A Set 생성 중...</div>';
      try { const d = await API.generateQASet(projectId); res.innerHTML = `<div class="ai-content"><h4>${Fmt.escape(d.title)}</h4><pre>${Fmt.escape(d.content)}</pre></div>`; }
      catch(e) { res.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`; }
    });
  },
};


