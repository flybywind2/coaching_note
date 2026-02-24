/**
 * ProjectDetail 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.projectDetail = {
  async render(el, params) {
    const projectId = parseInt(params.id);
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [project, notes, members] = await Promise.all([
        API.getProject(projectId),
        API.getNotes(projectId),
        API.getMembers(projectId),
      ]);
      const batch = await API.getBatch(project.batch_id).catch(() => null);
      const sortedNotes = [...notes].sort((a, b) => new Date(b.coaching_date) - new Date(a.coaching_date));
      const latestNote = sortedNotes[0] || null;
      const latestComments = latestNote ? await API.getComments(latestNote.note_id).catch(() => []) : [];
      const user = Auth.getUser();
      const canWrite = user.role === 'admin' || Auth.isCoach();
      const isAdmin = user.role === 'admin';
      const canEditInfo = isAdmin || !!project.is_my_project;
      const canEditProgress = canEditInfo || Auth.isCoach();
      const noteCount = sortedNotes.length;
      const initialTab = ['info', 'records', 'notes'].includes(params.tab) ? params.tab : 'info';
      const refreshView = async (tab = 'info') => {
        await this.render(el, { ...params, tab });
      };

      el.innerHTML = `
        <div class="page-container project-detail-page">
          <a href="#/projects" class="back-link">← 과제 목록</a>
          <div class="project-tab-shell">
            <div class="tabs project-tabs">
              <button class="tab-btn active" data-tab="info">기본정보</button>
              <button class="tab-btn" data-tab="records">과제기록</button>
              <button class="tab-btn" data-tab="notes">코칭노트 (${noteCount})</button>
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
              canEditInfo,
              canEditProgress,
              isAdmin,
              members,
              projectId,
              batchId: project.batch_id,
              latestNote,
              latestComments,
              onSave: async (payload) => {
                await API.updateProject(projectId, payload);
                await refreshView('info');
              },
              onMemberChanged: async () => {
                await refreshView('info');
              },
            });
            break;
          case 'records': this._renderDocs(tabContent, projectId, canWrite); break;
          case 'notes':
            this._renderNotes(tabContent, sortedNotes, projectId, canWrite, user, project, {
              batch,
              onChanged: async () => refreshView('notes'),
            });
            break;
        }
      };
      el.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => Router.go(`/project/${projectId}?tab=${btn.dataset.tab}`));
      });
      renderTab(initialTab);
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderInfo(el, p, options) {
    const {
      canWrite,
      canEditInfo,
      canEditProgress = false,
      isAdmin,
      members,
      projectId,
      latestNote,
      latestComments,
      onSave,
      onMemberChanged,
    } = options;
    const repos = Array.isArray(p.github_repos) ? p.github_repos : [];
    const progressValue = Math.max(0, Math.min(100, Number(p.progress_rate) || 0));
    const noteLink = `#/project/${projectId}?tab=notes`;
    const resolveCommentType = (comment) => {
      if (comment.comment_type) return comment.comment_type;
      return comment.author_role === 'participant' ? 'participant_memo' : 'coaching_feedback';
    };
    const hasText = (value) => Fmt.excerpt(value || '', 1).length > 0;
    const hasCommentText = (comment) => hasText(comment?.content || '');
    const coachingFeedbacks = (latestComments || []).filter((c) => resolveCommentType(c) === 'coaching_feedback' && hasCommentText(c));
    const participantMemos = (latestComments || []).filter((c) => resolveCommentType(c) === 'participant_memo' && hasCommentText(c));

    const user = Auth.getUser();
    const canManageMembers = isAdmin || !!p.is_my_project;
    if (!this._memberPanelState) this._memberPanelState = {};
    if (!Object.prototype.hasOwnProperty.call(this._memberPanelState, projectId)) {
      this._memberPanelState[projectId] = false;
    }
    const memberExpanded = !!this._memberPanelState[projectId];

    const renderInfoItem = ({ label, value, field, full = false }) => `
      <div class="info-item${full ? ' full' : ''}">
        <div class="info-item-label-row">
          <label>${label}</label>
          ${canEditInfo && field ? `<button class="btn btn-xs btn-secondary info-edit-btn" data-field="${field}">edit</button>` : ''}
        </div>
        ${value}
      </div>
    `;
    const renderMetaChip = ({ label, value, field, canEdit = canEditInfo }) => `
      <div class="project-meta-chip">
        <div class="project-meta-chip-head">
          <label>${label}</label>
          ${canEdit && field ? `<button class="btn btn-xs btn-secondary info-edit-btn" data-field="${field}">edit</button>` : ''}
        </div>
        <div class="project-meta-chip-body">${value}</div>
      </div>
    `;

    el.innerHTML = `<div class="project-info-layout project-info-layout-wide">
      <div class="project-info-main">
        <div class="project-title-hero">
          <h2>${Fmt.escape(p.project_name)}</h2>
        </div>
        <div class="project-top-meta-strip">
          ${renderMetaChip({ label: '부서명', field: 'organization', value: `<span>${Fmt.escape(p.organization)}</span>` })}
          ${renderMetaChip({ label: '과제 대표자', value: `<span>${Fmt.escape(p.representative || '-')}</span>` })}
          ${renderMetaChip({
            label: '과제 진행률',
            field: canEditProgress ? 'progress_rate' : null,
            canEdit: canEditProgress,
            value: `<span>${progressValue}%</span>${Fmt.progress(progressValue)}`,
          })}
        </div>

        <div class="project-info-panel">
          <div class="project-info-panel-head">
            <h3>팀원</h3>
            <p>기본은 접힌 상태이며 필요 시 펼쳐서 확인합니다.</p>
            <div class="inline-actions">
              <button id="toggle-member-list-btn" class="btn btn-sm btn-secondary">${memberExpanded ? '팀원 접기' : '팀원 펼치기'}</button>
              ${canManageMembers ? '<button id="add-member-btn" class="btn btn-sm btn-secondary">팀원 추가</button>' : ''}
            </div>
          </div>
          <div id="project-member-list-wrap" style="display:${memberExpanded ? 'block' : 'none'};">
            <div class="project-member-list">
              ${members.length ? members.map((m) => `
                <div class="project-member-item">
                  <div class="project-member-main">
                    <strong>${Fmt.escape(m.user_name || `사용자#${m.user_id}`)}</strong>
                    <span>${Fmt.escape(m.user_emp_id || '-')}</span>
                    <span class="tag${String(m.role || '').toLowerCase() === 'leader' ? ' tag-done' : ''}">${Fmt.escape(m.role || 'member')}</span>
                  </div>
                  ${canManageMembers ? `
                    <div class="inline-actions">
                      ${!m.is_representative ? `<button class="btn btn-sm btn-secondary set-representative-btn" data-user-id="${m.user_id}" data-user-name="${Fmt.escape(m.user_name || '')}">대표로 지정</button>` : ''}
                      <button class="btn btn-sm btn-danger remove-member-btn" data-user-id="${m.user_id}" data-user-name="${Fmt.escape(m.user_name || '')}">제거</button>
                    </div>
                  ` : ''}
                </div>
              `).join('') : '<p class="empty-state">등록된 팀원이 없습니다.</p>'}
            </div>
          </div>
        </div>

        <div class="project-info-panel">
          <div class="project-info-panel-head">
            <h3>AI 기술 정보</h3>
          </div>
          <div class="info-grid project-info-grid">
            ${renderInfoItem({ label: 'AI기술 분류', field: 'ai_tech_category', value: `<span>${Fmt.escape(p.ai_tech_category || p.category || '-')}</span>` })}
            ${renderInfoItem({ label: '사용된 AI기술', field: 'ai_tech_used', value: `<span>${Fmt.escape(p.ai_tech_used || '-')}</span>` })}
          </div>
        </div>

        <div class="project-info-panel">
          <div class="project-info-panel-head">
            <h3>Github Repository</h3>
          </div>
          <div class="info-grid project-info-grid">
            ${renderInfoItem({
              label: 'Github Repository',
              field: 'github_repos',
              full: true,
              value: repos.length ? `
                <div class="repo-list">
                  ${repos.map((url) => `<a href="${Fmt.escape(url)}" target="_blank" rel="noopener noreferrer">${Fmt.escape(url)}</a>`).join('')}
                </div>
              ` : '<span>-</span>',
            })}
          </div>
        </div>

        <div class="project-info-panel">
          <div class="project-info-panel-head">
            <h3>과제 요약</h3>
          </div>
          <div class="info-grid project-info-grid">
            ${renderInfoItem({ label: '과제 요약', field: 'project_summary', full: true, value: `<div class="ai-summary">${Fmt.escape(p.project_summary || '-')}</div>` })}
          </div>
        </div>
      </div>
      <div class="project-info-side">
        <div class="project-info-panel">
          <div class="project-info-panel-head">
            <h3>최근 코칭노트</h3>
            <p>최신 코칭노트 전체 내용과 코칭 의견/메모를 확인합니다.</p>
          </div>
          ${latestNote ? `
            <a href="${noteLink}" class="recent-note-card recent-note-card-full" data-role="recent-note-link">
              <strong>${Fmt.date(latestNote.coaching_date)}${latestNote.week_number ? ` · ${latestNote.week_number}주차` : ''}</strong>
              ${hasText(latestNote.current_status) ? `<div class="note-field compact"><label>현재 상태</label><div class="field-val rich-content">${Fmt.rich(latestNote.current_status)}</div></div>` : ''}
              ${hasText(latestNote.main_issue) ? `<div class="note-field compact"><label>주요 문제</label><div class="field-val rich-content">${Fmt.rich(latestNote.main_issue)}</div></div>` : ''}
              ${hasText(latestNote.next_action) ? `<div class="note-field compact"><label>다음 작업</label><div class="field-val rich-content">${Fmt.rich(latestNote.next_action)}</div></div>` : ''}
              ${(!hasText(latestNote.current_status) && !hasText(latestNote.main_issue) && !hasText(latestNote.next_action)) ? '<p class="hint">입력된 본문이 없습니다.</p>' : ''}
              <div class="recent-comment-wrap">
                ${coachingFeedbacks.length ? `
                  <h4>코칭 의견 (${coachingFeedbacks.length})</h4>
                  <div class="comment-list compact">
                    ${coachingFeedbacks.map((c) => `
                      <div class="comment-card">
                        <div class="comment-head">
                          <span class="comment-author-badge">${Fmt.escape(c.author_name || '-')}</span>
                          ${c.is_coach_only ? '<span class="coach-only-badge">코치들에게만 공유</span>' : ''}
                        </div>
                        <div class="comment-content rich-content">${Fmt.rich(c.content)}</div>
                        <div class="comment-meta"><span>${Fmt.datetime(c.created_at)}</span></div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
                ${participantMemos.length ? `
                  <h4>참여자 메모 (${participantMemos.length})</h4>
                  <div class="comment-list compact">
                    ${participantMemos.map((c) => `
                      <div class="comment-card">
                        <div class="comment-head">
                          <span class="comment-author-badge">${Fmt.escape(c.author_name || '-')}</span>
                          ${c.is_coach_only ? '<span class="coach-only-badge">코치들에게만 공유</span>' : ''}
                        </div>
                        <div class="comment-content rich-content">${Fmt.rich(c.content)}</div>
                        <div class="comment-meta"><span>${Fmt.datetime(c.created_at)}</span></div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            </a>
          ` : '<p class="empty-state">코칭노트가 없습니다.</p>'}
        </div>
      </div>
    </div>`;

    const openFieldEditor = (field) => {
      const openSimpleEditor = ({ title, inputHtml, parsePayload, className = '' }) => {
        Modal.open(`<h2>${title}</h2>
          <form id="edit-project-field-form">
            ${inputHtml}
            <button type="submit" class="btn btn-primary">저장</button>
            <p class="form-error" id="edit-project-field-err" style="display:none;"></p>
          </form>`, null, { className: className || undefined });
        document.getElementById('edit-project-field-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            await onSave(parsePayload(new FormData(e.target)));
            Modal.close();
          } catch (err) {
            const errEl = document.getElementById('edit-project-field-err');
            if (!errEl) return;
            errEl.textContent = err.message || '저장 실패';
            errEl.style.display = 'block';
          }
        });
      };

      if (field === 'github_repos') {
        openSimpleEditor({
          title: 'Github Repository 편집',
          className: 'modal-box-xl',
          inputHtml: `<div class="form-group"><label>Repository URL (줄바꿈으로 복수 입력)</label><textarea name="github_repos" rows="8">${Fmt.escape(repos.join('\n'))}</textarea></div>`,
          parsePayload: (fd) => ({
            github_repos: (fd.get('github_repos') || '').toString().split('\n').map((v) => v.trim()).filter(Boolean),
          }),
        });
        return;
      }
      if (field === 'project_summary') {
        openSimpleEditor({
          title: '과제 요약 편집',
          className: 'modal-box-xl',
          inputHtml: `<div class="form-group"><label>과제 요약</label><textarea name="project_summary" rows="8">${Fmt.escape(p.project_summary || '')}</textarea></div>`,
          parsePayload: (fd) => ({ project_summary: (fd.get('project_summary') || '').toString().trim() || null }),
        });
        return;
      }
      const defaultValues = {
        project_name: p.project_name || '',
        organization: p.organization || '',
        representative: p.representative || '',
        ai_tech_category: p.ai_tech_category || p.category || '',
        ai_tech_used: p.ai_tech_used || '',
        progress_rate: String(progressValue),
      };
      const labels = {
        project_name: '과제명',
        organization: '부서명',
        representative: '과제 대표자',
        ai_tech_category: 'AI기술 분류',
        ai_tech_used: '사용된 AI기술',
        progress_rate: '전체 진행률 (%)',
      };
      const isNumber = field === 'progress_rate';
      openSimpleEditor({
        title: `${labels[field] || '항목'} 편집`,
        inputHtml: `<div class="form-group"><label>${labels[field] || field}</label><input ${isNumber ? 'type="number" min="0" max="100"' : ''} name="value" value="${Fmt.escape(defaultValues[field] || '')}" /></div>`,
        parsePayload: (fd) => {
          if (field === 'progress_rate') {
            const value = parseInt((fd.get('value') || '').toString(), 10);
            return { progress_rate: Number.isNaN(value) ? null : Math.max(0, Math.min(100, value)) };
          }
          return { [field]: (fd.get('value') || '').toString().trim() || null };
        },
      });
    };

    el.querySelectorAll('.info-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openFieldEditor(btn.dataset.field));
    });

    document.getElementById('toggle-member-list-btn')?.addEventListener('click', () => {
      this._memberPanelState[projectId] = !this._memberPanelState[projectId];
      this._renderInfo(el, p, options);
    });

    el.querySelectorAll('[data-role="recent-note-link"]').forEach((linkEl) => {
      linkEl.addEventListener('click', (evt) => {
        evt.preventDefault();
        const nextPath = noteLink.replace(/^#/, '');
        if (window.location.hash.slice(1) === nextPath) {
          Router.resolve();
          return;
        }
        Router.go(nextPath);
      });
    });

    if (canManageMembers) {
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

      el.querySelectorAll('.set-representative-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const userId = +btn.dataset.userId;
        const userName = btn.dataset.userName || '해당 사용자';
        if (!confirm(`${userName}님을 과제 대표자로 지정하시겠습니까?`)) return;
        try {
          await API.setMemberRepresentative(projectId, userId);
          if (onMemberChanged) onMemberChanged();
        } catch (err) {
          alert(err.message || '대표자 지정 실패');
        }
      }));
    }
  },

  async _openAddMemberModal({ projectId, currentMembers, onSaved }) {
    let users = [];
    try {
      users = await API.getProjectMemberCandidates(projectId);
    } catch (err) {
      alert(err.message || '사용자 목록을 불러오지 못했습니다.');
      return;
    }

    const memberUserIds = new Set((currentMembers || []).map((m) => m.user_id));
    const candidates = users.filter((u) => !memberUserIds.has(u.user_id));

    let sortBy = 'name';
    const sortCandidates = (rows) => {
      const copied = [...rows];
      copied.sort((a, b) => {
        if (sortBy === 'department') {
          const ad = (a.department || '').toLowerCase();
          const bd = (b.department || '').toLowerCase();
          if (ad !== bd) return ad > bd ? 1 : -1;
        }
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        return an > bn ? 1 : -1;
      });
      return copied;
    };

    Modal.open(`<h2>과제 팀원 추가</h2>
      <form id="add-member-form">
        <div class="form-group">
          <label>정렬 기준</label>
          <select name="sort_by" id="member-sort-select">
            <option value="name">이름순</option>
            <option value="department">부서명순</option>
          </select>
        </div>
        <div class="form-group">
          <label>사용자 (복수 선택)</label>
          <select id="member-candidate-select" class="member-candidate-select" name="user_ids" multiple size="12"></select>
          <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
        </div>
        <div class="form-group">
          <label>역할</label>
          <select name="role">
            <option value="member" selected>member</option>
            <option value="leader">leader</option>
          </select>
          <p class="hint">leader는 과제 대표자로 자동 연동됩니다.</p>
        </div>
        <button type="submit" class="btn btn-primary">추가</button>
        <p class="form-error" id="add-member-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const candidateSelect = document.getElementById('member-candidate-select');
    const renderCandidates = () => {
      const rows = sortCandidates(candidates);
      if (!candidateSelect) return;
      candidateSelect.innerHTML = rows.length
        ? rows.map((u) => `<option value="${u.user_id}">${Fmt.escape(u.name)} (${Fmt.escape(u.emp_id)}) · ${Fmt.escape(u.department || '부서 미등록')}</option>`).join('')
        : '';
      candidateSelect.disabled = rows.length === 0;
    };
    renderCandidates();
    document.getElementById('member-sort-select')?.addEventListener('change', (e) => {
      sortBy = e.target.value === 'department' ? 'department' : 'name';
      renderCandidates();
    });

    document.getElementById('add-member-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const userIds = (candidateSelect ? Array.from(candidateSelect.selectedOptions).map((opt) => opt.value) : [])
        .map((v) => Number.parseInt(String(v), 10))
        .filter((v) => !Number.isNaN(v));
      if (!userIds.length) {
        const errEl = document.getElementById('add-member-err');
        if (!errEl) return;
        errEl.textContent = '추가할 사용자를 선택하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        const role = (fd.get('role') || 'member').toString();
        for (let i = 0; i < userIds.length; i += 1) {
          const isLeaderSlot = role === 'leader' && i === 0;
          await API.addMember(projectId, {
            user_id: userIds[i],
            role: isLeaderSlot ? 'leader' : 'member',
            is_representative: isLeaderSlot,
          });
        }
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
    const types = [
      ['application', '지원서'],
      ['basic_consulting', '기초컨설팅 산출물'],
      ['workshop_result', '공동워크샵 산출물'],
      ['mid_presentation', '중간 발표 자료'],
      ['final_presentation', '최종 발표 자료'],
      ['other_material', '기타 자료'],
    ];
    let selectedType = types[0][0];

    const draw = () => {
      const current = docs.find((d) => d.doc_type === selectedType) || null;
      const currentLabel = types.find(([t]) => t === selectedType)?.[1] || '과제기록';
      const preview = current?.content ? Fmt.excerpt(current.content, 200) : '';

      el.innerHTML = `<div class="records-tab-layout">
        <aside class="records-tab-nav">
          ${types.map(([t, label]) => {
            const doc = docs.find((d) => d.doc_type === t);
            return `<button class="records-tab-btn${selectedType === t ? ' active' : ''}" data-doc-type="${t}">
              <span>${label}</span>
              <span>${doc ? '등록됨' : '미등록'}</span>
            </button>`;
          }).join('')}
        </aside>
        <section class="records-tab-panel">
          <h3>${Fmt.escape(currentLabel)}</h3>
          <div class="record-actions">
            ${current ? `<button class="btn btn-sm view-doc-btn" data-doc-id="${current.doc_id}" data-label="${Fmt.escape(currentLabel)}">보기</button>` : ''}
            ${canWrite ? `<button class="btn btn-sm btn-secondary edit-doc-btn" data-doc-id="${current?.doc_id || ''}" data-type="${selectedType}" data-label="${Fmt.escape(currentLabel)}">${current ? '편집' : '작성'}</button>` : ''}
            ${(canWrite && current) ? `<button class="btn btn-sm btn-danger delete-doc-btn" data-doc-id="${current.doc_id}" data-label="${Fmt.escape(currentLabel)}">삭제</button>` : ''}
          </div>
          ${preview ? `<div class="doc-content-preview"><div class="preview-title">${currentLabel} 미리보기</div><div class="preview-text">${Fmt.escape(preview)}</div></div>` : '<p class="empty-state">저장된 내용이 없습니다.</p>'}
        </section>
      </div>`;

      el.querySelectorAll('.records-tab-btn').forEach((btn) => btn.addEventListener('click', () => {
        selectedType = btn.dataset.docType;
        draw();
      }));

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

      el.querySelectorAll('.delete-doc-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const docId = +btn.dataset.docId;
        const label = btn.dataset.label || '과제기록';
        if (!confirm(`${label} 내용을 삭제하시겠습니까?`)) return;
        try {
          await API.deleteDocument(docId);
          await this._renderDocs(el, projectId, canWrite);
        } catch (err) {
          alert(err.message || '과제기록 삭제 실패');
        }
      }));
    };

    draw();
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
          <label>과제기록 본문</label>
          <div id="doc-editor-wrap"></div>
          <p id="doc-editor-draft-status" class="draft-status"></p>
        </div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p class="form-error" id="doc-editor-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const editor = RichEditor.create(document.getElementById('doc-editor-wrap'), {
      initialHTML: content,
      placeholder: '과제기록을 작성하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'document', projectId }),
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'document', projectId }),
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

  _renderNotes(el, notes, projectId, canWrite, user, project, options = {}) {
    if (!this._noteFeedState) this._noteFeedState = {};
    if (!this._noteFeedState[projectId]) {
      this._noteFeedState[projectId] = {
        visible: 3,
        expandedIds: new Set(notes[0] ? [notes[0].note_id] : []),
        expandAll: false,
      };
    }
    const state = this._noteFeedState[projectId];
    state.visible = 3;
    state.expandAll = false;
    state.expandedIds = new Set(notes[0] ? [notes[0].note_id] : []);
    const canComment = user.role !== 'observer';
    const onChanged = options.onChanged || (async () => {});
    const batch = options.batch || null;

    const hasText = (value) => Fmt.excerpt(value || '', 1).length > 0;
    const renderField = (label, value) => {
      if (!hasText(value)) return '';
      return `<div class="note-field"><label>${label}</label><div class="field-val rich-content">${Fmt.rich(value)}</div></div>`;
    };
    const runAIGeneration = async ({ type, force = false }) => {
      const isSummary = type === 'summary';
      const label = isSummary ? 'AI 요약' : 'AI Q&A';
      Modal.open(
        `<h2>${label}</h2><div class="loading">${label} ${force ? '재생성' : '생성'} 중입니다. 잠시만 기다려주세요...</div>`
      );
      try {
        const data = isSummary
          ? await API.generateSummary(projectId, force)
          : await API.generateQASet(projectId, force);
        Modal.open(`
          <h2>${label}</h2>
          <div class="ai-content">
            <h4>${Fmt.escape(data.title || (isSummary ? '요약' : 'Q&A'))}</h4>
            <pre>${Fmt.escape(data.content || '')}</pre>
          </div>
          <div class="page-actions" style="margin-top:12px;">
            <button id="ai-regenerate-btn" class="btn btn-secondary">재생성</button>
            <button id="ai-close-btn" class="btn btn-primary">닫기</button>
          </div>
        `, null, { className: 'modal-box-xxl' });
        document.getElementById('ai-regenerate-btn')?.addEventListener('click', () => {
          runAIGeneration({ type, force: true });
        });
        document.getElementById('ai-close-btn')?.addEventListener('click', () => Modal.close());
      } catch (err) {
        Modal.open(`
          <h2>${label}</h2>
          <p class="form-error" style="display:block;">${Fmt.escape(err.message || `${label} 생성 실패`)}</p>
          <div class="page-actions" style="margin-top:12px;">
            <button id="ai-retry-btn" class="btn btn-secondary">재시도</button>
            <button id="ai-error-close-btn" class="btn btn-primary">닫기</button>
          </div>
        `, null, { className: 'modal-box-xxl' });
        document.getElementById('ai-retry-btn')?.addEventListener('click', () => {
          runAIGeneration({ type, force });
        });
        document.getElementById('ai-error-close-btn')?.addEventListener('click', () => Modal.close());
      }
    };

    const draw = async () => {
      const shown = notes.slice(0, state.visible);
      const commentBundles = await Promise.all(shown.map((n) => API.getComments(n.note_id).catch(() => [])));

      const resolveCommentType = (comment) => {
        if (comment.comment_type) return comment.comment_type;
        return comment.author_role === 'participant' ? 'participant_memo' : 'coaching_feedback';
      };

      el.innerHTML = `<div class="notes-section">
        <div class="page-actions">
          ${canWrite ? `<button id="add-note-btn" class="btn btn-primary">+ 코칭노트 작성</button>` : ''}
          ${canWrite ? `<button id="note-ai-summary-btn" class="btn btn-secondary">AI 요약</button>` : ''}
          ${canWrite ? `<button id="note-ai-summary-regen-btn" class="btn btn-secondary">AI 요약 재생성</button>` : ''}
          ${canWrite ? `<button id="note-ai-qa-btn" class="btn btn-secondary">AI Q&A</button>` : ''}
          ${canWrite ? `<button id="note-ai-qa-regen-btn" class="btn btn-secondary">AI Q&A 재생성</button>` : ''}
          ${shown.length > 1 ? `<button id="toggle-all-notes-btn" class="btn btn-secondary">${state.expandAll ? '모두 접기' : '모두 펼치기'}</button>` : ''}
        </div>
        ${shown.length === 0 ? '<p class="empty-state">코칭노트가 없습니다.</p>' : shown.map((n, i) => {
          const comments = commentBundles[i] || [];
          const hasCommentText = (comment) => hasText(comment?.content || '');
          const coachingFeedbacks = comments.filter((c) => resolveCommentType(c) === 'coaching_feedback' && hasCommentText(c));
          const participantMemos = comments.filter((c) => resolveCommentType(c) === 'participant_memo' && hasCommentText(c));
          const writerTitle = canWrite ? '코칭 의견 작성' : '메모 작성';
          const writerPlaceholder = canWrite ? '코칭 의견을 입력하세요' : '메모를 입력하세요';
          const expanded = state.expandAll || state.expandedIds.has(n.note_id);
          const fieldsHtml = [
            renderField('현재 상태', n.current_status),
            renderField('주요 문제', n.main_issue),
            renderField('다음 작업', n.next_action),
          ].join('');
          return `
            <div class="note-card note-feed-card">
              <div class="note-header">
                <span class="note-date">${Fmt.date(n.coaching_date)}${n.week_number ? ` · ${n.week_number}주차` : ''}</span>
                <button class="btn btn-sm btn-secondary toggle-note-btn" data-note-id="${n.note_id}">${expanded ? '접기' : '펼치기'}</button>
                ${canWrite ? `<button class="btn btn-sm btn-secondary edit-note-btn" data-note-id="${n.note_id}">수정</button>` : ''}
                ${canWrite ? `<button class="btn btn-sm btn-danger delete-note-btn" data-note-id="${n.note_id}">삭제</button>` : ''}
              </div>
              <div class="note-collapsible" style="display:${expanded ? 'block' : 'none'};">
                <div class="note-fields">
                  ${fieldsHtml || '<p class="hint">입력된 본문 항목이 없습니다.</p>'}
                </div>
                <div class="comments-section">
                  ${coachingFeedbacks.length ? `
                    <div class="comment-group">
                      <h4>코칭 의견 (${coachingFeedbacks.length})</h4>
                      <div class="comment-list">
                        ${coachingFeedbacks.map((c) => `
                          <div class="comment-card ${c.is_coach_only ? 'coach-only' : ''}">
                            <div class="comment-head">
                              <span class="comment-author-badge">${Fmt.escape(c.author_name || '-')}</span>
                              ${c.is_coach_only ? '<span class="coach-only-badge">코치들에게만 공유</span>' : ''}
                            </div>
                            <div class="comment-content rich-content">${Fmt.rich(c.content, '-')}</div>
                            <div class="comment-meta">
                              <span>${Fmt.datetime(c.created_at)}</span>
                              ${(c.author_id === user.user_id || user.role === 'admin')
                                ? `<button class="btn btn-sm btn-danger delete-comment-btn" data-comment-id="${c.comment_id}" data-comment-type="coaching_feedback">삭제</button>`
                                : ''}
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}
                  ${participantMemos.length ? `
                    <div class="comment-group">
                      <h4>참여자 메모 (${participantMemos.length})</h4>
                      <div class="comment-list">
                        ${participantMemos.map((c) => `
                          <div class="comment-card ${c.is_coach_only ? 'coach-only' : ''}">
                            <div class="comment-head">
                              <span class="comment-author-badge">${Fmt.escape(c.author_name || '-')}</span>
                              ${c.is_coach_only ? '<span class="coach-only-badge">코치들에게만 공유</span>' : ''}
                            </div>
                            <div class="comment-content rich-content">${Fmt.rich(c.content, '-')}</div>
                            <div class="comment-meta">
                              <span>${Fmt.datetime(c.created_at)}</span>
                              ${(c.author_id === user.user_id || user.role === 'admin')
                                ? `<button class="btn btn-sm btn-danger delete-comment-btn" data-comment-id="${c.comment_id}" data-comment-type="participant_memo">삭제</button>`
                                : ''}
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}
                  ${canComment ? `
                    <form class="inline-comment-form" data-note-id="${n.note_id}">
                      <label class="inline-comment-title">${writerTitle}</label>
                      <textarea name="content" rows="3" placeholder="${writerPlaceholder}"></textarea>
                      <div class="page-actions">
                        ${canWrite ? `<label><input type="checkbox" name="is_coach_only" /> 코치들에게만 공유(참여자 비공개)</label>` : ''}
                        <button type="submit" class="btn btn-primary btn-sm">등록</button>
                      </div>
                    </form>
                  ` : '<p class="empty-state">참관자는 의견을 작성할 수 없습니다.</p>'}
                </div>
              </div>
            </div>
          `;
        }).join('')}
        ${state.visible < notes.length ? `<div class="page-actions"><button id="load-more-notes-btn" class="btn btn-secondary">이전 코칭노트 더 보기</button></div>` : ''}
      </div>`;

      document.getElementById('toggle-all-notes-btn')?.addEventListener('click', () => {
        state.expandAll = !state.expandAll;
        if (!state.expandAll && notes[0]) {
          state.expandedIds = new Set([notes[0].note_id]);
        }
        draw();
      });

      document.getElementById('add-note-btn')?.addEventListener('click', () => {
        Pages.coachingNote.showCreateModal(projectId, async () => {
          await onChanged();
        }, {
          projectName: project?.project_name,
          projectProgressRate: project?.progress_rate,
          coachingStartDate: batch?.coaching_start_date || batch?.start_date || null,
        });
      });

      document.getElementById('note-ai-summary-btn')?.addEventListener('click', async () => {
        await runAIGeneration({ type: 'summary', force: false });
      });

      document.getElementById('note-ai-summary-regen-btn')?.addEventListener('click', async () => {
        await runAIGeneration({ type: 'summary', force: true });
      });

      document.getElementById('note-ai-qa-btn')?.addEventListener('click', async () => {
        await runAIGeneration({ type: 'qa', force: false });
      });

      document.getElementById('note-ai-qa-regen-btn')?.addEventListener('click', async () => {
        await runAIGeneration({ type: 'qa', force: true });
      });

      document.getElementById('load-more-notes-btn')?.addEventListener('click', () => {
        state.visible += 3;
        draw();
      });

      el.querySelectorAll('.toggle-note-btn').forEach((btn) => btn.addEventListener('click', () => {
        const noteId = Number.parseInt(btn.dataset.noteId, 10);
        if (Number.isNaN(noteId)) return;
        if (state.expandedIds.has(noteId)) state.expandedIds.delete(noteId);
        else state.expandedIds.add(noteId);
        state.expandAll = false;
        draw();
      }));

      el.querySelectorAll('.edit-note-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const noteId = +btn.dataset.noteId;
        const note = notes.find((item) => item.note_id === noteId);
        if (!note) return;
        Pages.coachingNote.showEditModal(projectId, note, async () => {
          await onChanged();
        }, {
          projectName: project?.project_name,
          coachingStartDate: batch?.coaching_start_date || batch?.start_date || null,
        });
      }));

      el.querySelectorAll('.delete-note-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const noteId = +btn.dataset.noteId;
        if (!confirm('코칭노트를 삭제하시겠습니까?')) return;
        try {
          await API.deleteNote(noteId);
          await onChanged();
        } catch (err) {
          alert(err.message || '코칭노트 삭제 실패');
        }
      }));

      el.querySelectorAll('.delete-comment-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const commentId = +btn.dataset.commentId;
        const commentType = btn.dataset.commentType;
        const targetLabel = commentType === 'participant_memo' ? '메모' : '코칭 의견';
        if (!confirm(`${targetLabel}을(를) 삭제하시겠습니까?`)) return;
        try {
          await API.deleteComment(commentId);
          await onChanged();
        } catch (err) {
          alert(err.message || `${targetLabel} 삭제 실패`);
        }
      }));

      el.querySelectorAll('.inline-comment-form').forEach((form) => form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const content = (fd.get('content') || '').toString().trim();
        if (!content) {
          alert(canWrite ? '코칭 의견 내용을 입력하세요.' : '메모 내용을 입력하세요.');
          return;
        }
        try {
          await API.createComment(+form.dataset.noteId, {
            content,
            is_coach_only: fd.has('is_coach_only'),
          });
          await onChanged();
        } catch (err) {
          alert(err.message || '의견 등록 실패');
        }
      }));
    };

    draw();
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
            <div class="form-group"><label>시작 시간 *</label><input type="time" step="600" name="start_time" required value="09:00" /></div>
            <div class="form-group"><label>종료 시간 *</label><input type="time" step="600" name="end_time" required value="11:00" /></div>
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


