Pages.projectDetail = {
  async render(el, params) {
    const projectId = parseInt(params.id);
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const [project, notes, tasks] = await Promise.all([
        API.getProject(projectId),
        API.getNotes(projectId),
        API.getTasks(projectId),
      ]);
      const user = Auth.getUser();
      const canWrite = user.role === 'admin' || user.role === 'coach';

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <a href="#/projects" class="back-link">← 과제 목록</a>
            <h1>${Fmt.escape(project.project_name)}</h1>
            <div class="project-meta">
              <span class="tag tag-${project.status}">${Fmt.status(project.status)}</span>
              <span>${Fmt.escape(project.organization)}</span>
            </div>
            ${Fmt.progress(project.progress_rate)}
          </div>
          <div class="tabs">
            <button class="tab-btn active" data-tab="info">기본정보</button>
            <button class="tab-btn" data-tab="docs">문서</button>
            <button class="tab-btn" data-tab="notes">코칭노트 (${notes.length})</button>
            <button class="tab-btn" data-tab="tasks">Task (${tasks.length})</button>
            <button class="tab-btn" data-tab="sessions">세션</button>
            ${canWrite ? '<button class="tab-btn" data-tab="ai">AI 분석</button>' : ''}
          </div>
          <div id="tab-content"></div>
        </div>`;

      const tabContent = document.getElementById('tab-content');
      const renderTab = (tab) => {
        el.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        switch (tab) {
          case 'info': this._renderInfo(tabContent, project); break;
          case 'docs': this._renderDocs(tabContent, projectId, canWrite); break;
          case 'notes': this._renderNotes(tabContent, notes, projectId, canWrite); break;
          case 'tasks': this._renderTasks(tabContent, tasks, projectId, user); break;
          case 'sessions': this._renderSessions(tabContent, projectId, project, canWrite); break;
          case 'ai': this._renderAI(tabContent, projectId); break;
        }
      };
      el.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => renderTab(btn.dataset.tab));
      });
      renderTab('info');
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderInfo(el, p) {
    el.innerHTML = `<div class="info-grid">
      <div class="info-item"><label>과제명</label><span>${Fmt.escape(p.project_name)}</span></div>
      <div class="info-item"><label>조직</label><span>${Fmt.escape(p.organization)}</span></div>
      <div class="info-item"><label>대표자</label><span>${Fmt.escape(p.representative || '-')}</span></div>
      <div class="info-item"><label>분류</label><span>${Fmt.escape(p.category || '-')}</span></div>
      <div class="info-item"><label>상태</label><span>${Fmt.status(p.status)}</span></div>
      <div class="info-item"><label>공개여부</label><span>${p.visibility === 'public' ? '공개' : '비공개'}</span></div>
      <div class="info-item"><label>생성일</label><span>${Fmt.date(p.created_at)}</span></div>
      ${p.ai_summary ? `<div class="info-item full"><label>AI 요약</label><div class="ai-summary">${Fmt.escape(p.ai_summary)}</div></div>` : ''}
    </div>`;
  },

  async _renderDocs(el, projectId, canWrite) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    const docs = await API.getDocuments(projectId);
    const types = { application: '지원서', basic_consulting: '기초컨설팅', workshop_result: '워크샵결과', mid_presentation: '중간발표', final_presentation: '최종발표' };
    el.innerHTML = `<div class="docs-section">${Object.entries(types).map(([t, label]) => {
      const doc = docs.find(d => d.doc_type === t);
      const statusBadge = doc ? `<span class="tag tag-done">등록됨</span>` : `<span class="empty-doc">미등록</span>`;
      const attachment = doc?.attachments ? JSON.parse(doc.attachments)[0] : null;
      const downloadBtn = attachment ? `<a href="${Fmt.escape(attachment.url)}" target="_blank" class="btn btn-sm">다운로드</a>` : '';
      const uploadBtn = canWrite ? `<button class="btn btn-sm btn-secondary upload-doc-btn" data-type="${t}" data-label="${label}">업로드</button>` : '';
      return `<div class="doc-type-row">
        <span class="doc-type-label">${label}</span>
        ${statusBadge}
        ${downloadBtn}
        ${uploadBtn}
      </div>`;
    }).join('')}</div>`;

    if (canWrite) {
      el.querySelectorAll('.upload-doc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const docType = btn.dataset.type;
          const docLabel = btn.dataset.label;
          Modal.open(`<h2>${docLabel} 업로드</h2>
            <form id="upload-doc-form">
              <div class="form-group"><label>제목</label><input name="title" placeholder="${docLabel}" /></div>
              <div class="form-group"><label>파일 *</label><input type="file" name="file" required /></div>
              <button type="submit" class="btn btn-primary">업로드</button>
            </form>`);
          document.getElementById('upload-doc-form').addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(e.target);
            fd.append('doc_type', docType);
            try {
              await API.uploadDocument(projectId, fd);
              Modal.close();
              this._renderDocs(el, projectId, canWrite);
            } catch (err) {
              alert(err.message);
            }
          });
        });
      });
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
          <p>${Fmt.escape(n.current_status || '')}</p>
          <a href="#/project/${projectId}/notes/${n.note_id}" class="btn btn-sm">상세 보기</a>
        </div>`).join('')}
    </div>`;
    if (canWrite) {
      document.getElementById('add-note-btn')?.addEventListener('click', () => {
        Pages.coachingNote.showCreateModal(projectId, async () => {
          const updated = await API.getNotes(projectId);
          this._renderNotes(el, updated, projectId, canWrite);
        });
      });
    }
  },

  _renderTasks(el, tasks, projectId, user) {
    const milestones = tasks.filter(t => t.is_milestone).sort((a, b) => (a.milestone_order||0)-(b.milestone_order||0));
    const regular = tasks.filter(t => !t.is_milestone);
    el.innerHTML = `<div class="tasks-section">
      <button id="add-task-btn" class="btn btn-primary mb">+ Task 추가</button>
      ${milestones.length ? `<h3>마일스톤</h3><div class="milestone-list">${milestones.map(t => `
        <div class="milestone-item">
          <span class="milestone-order">${t.milestone_order||'-'}</span>
          <span>${Fmt.escape(t.title)}</span>
          <span class="tag tag-${t.status}">${Fmt.status(t.status)}</span>
          <span>${Fmt.date(t.due_date)}</span>
          <select class="status-sel" data-tid="${t.task_id}">
            ${['todo','in_progress','completed'].map(s=>`<option value="${s}"${t.status===s?' selected':''}>${Fmt.status(s)}</option>`).join('')}
          </select>
        </div>`).join('')}</div>` : ''}
      ${regular.length ? `<h3>일반 Task</h3><div class="task-list">${regular.map(t => `
        <div class="task-item">
          <input type="checkbox" class="task-chk" data-tid="${t.task_id}" ${t.status==='completed'?'checked':''} />
          <span class="${t.status==='completed'?'strike':''}">${Fmt.escape(t.title)}</span>
          <span class="due">${Fmt.date(t.due_date)}</span>
        </div>`).join('')}</div>` : ''}
    </div>`;

    el.querySelectorAll('.status-sel').forEach(s => s.addEventListener('change', async () => {
      await API.updateTask(+s.dataset.tid, {status: s.value});
      const t = await API.getTasks(projectId); this._renderTasks(el, t, projectId, user);
    }));
    el.querySelectorAll('.task-chk').forEach(cb => cb.addEventListener('change', async () => {
      await API.updateTask(+cb.dataset.tid, {status: cb.checked ? 'completed' : 'todo'});
    }));
    document.getElementById('add-task-btn')?.addEventListener('click', () => {
      Modal.open(`<h2>Task 추가</h2><form id="atf">
        <div class="form-group"><label>제목 *</label><input name="title" required /></div>
        <div class="form-group"><label>마감일</label><input type="date" name="due_date" /></div>
        <div class="form-group"><label>우선순위</label><select name="priority"><option value="high">높음</option><option value="medium" selected>보통</option><option value="low">낮음</option></select></div>
        <div class="form-group"><label><input type="checkbox" name="is_milestone" /> 마일스톤</label></div>
        <button type="submit" class="btn btn-primary">추가</button></form>`);
      document.getElementById('atf').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.createTask(projectId, {title: fd.get('title'), due_date: fd.get('due_date')||null, priority: fd.get('priority'), is_milestone: fd.has('is_milestone')});
        Modal.close();
        const t = await API.getTasks(projectId); this._renderTasks(el, t, projectId, user);
      });
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
