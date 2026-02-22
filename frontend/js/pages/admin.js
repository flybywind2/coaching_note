/**
 * Admin 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.admin = {
  _ROLE_OPTIONS: [
    { value: 'participant', label: '참여자' },
    { value: 'observer', label: '참관자' },
    { value: 'internal_coach', label: '사내코치' },
    { value: 'external_coach', label: '외부코치' },
    { value: 'admin', label: '관리자' },
  ],

  _renderRoleOptions(selectedRole = '') {
    const normalized = this._normalizeRole(selectedRole || '');
    return this._ROLE_OPTIONS
      .map((opt) => `<option value="${opt.value}"${normalized === opt.value ? ' selected' : ''}>${opt.label}</option>`)
      .join('');
  },

  _getRoleScopePolicy(roleText) {
    const role = this._normalizeRole(roleText);
    return {
      canSelectBatch: ['participant', 'internal_coach', 'external_coach'].includes(role),
      canSelectProject: ['participant', 'external_coach'].includes(role),
    };
  },

  _mergeRoleScopePolicy(roleTexts = []) {
    const policies = roleTexts.map((role) => this._getRoleScopePolicy(role));
    if (!policies.length) {
      return { canSelectBatch: false, canSelectProject: false };
    }
    return {
      canSelectBatch: policies.every((policy) => policy.canSelectBatch),
      canSelectProject: policies.every((policy) => policy.canSelectProject),
    };
  },

  _parseMultiSelectIds(formData, fieldName) {
    return formData.getAll(fieldName)
      .map((v) => Number.parseInt(String(v), 10))
      .filter((v) => !Number.isNaN(v));
  },

  _buildPermissionPayloadFromForm(formData, scopePolicy) {
    return {
      batch_ids: scopePolicy.canSelectBatch ? this._parseMultiSelectIds(formData, 'batch_ids') : [],
      project_ids: scopePolicy.canSelectProject ? this._parseMultiSelectIds(formData, 'project_ids') : [],
    };
  },

  async _loadBatchesAndProjects() {
    const batches = await API.getBatches().catch(() => []);
    const mapped = await Promise.all(
      batches.map(async (b) => ({
        batch: b,
        projects: await API.getProjects(b.batch_id).catch(() => []),
      }))
    );
    const allProjects = mapped.flatMap((row) => row.projects.map((p) => ({
      ...p,
      batch_name: row.batch.batch_name,
    })));
    return { batches, allProjects };
  },

  async render(el, params) {
    const user = Auth.getUser();
    if (user.role !== 'admin') {
      el.innerHTML = '<div class="error-state">관리자만 접근 가능합니다.</div>';
      return;
    }

    el.innerHTML = `
      <div class="page-container">
        <div class="section-header" style="align-items:flex-end; gap:12px;">
          <h1>관리자 메뉴</h1>
          <div class="inline-actions" style="margin-left:auto;">
            <label for="new-ui-theme-select" class="hint">New UI 테마</label>
            <select id="new-ui-theme-select" class="form-select">
              <option value="ocean">Ocean</option>
              <option value="emerald">Emerald</option>
              <option value="amber">Amber</option>
              <option value="slate">Slate</option>
              <option value="glass">Glassmorphism</option>
              <option value="retro">Retro</option>
            </select>
            <button id="open-new-ui-btn" class="btn btn-primary">새 UI 열기</button>
          </div>
        </div>
        <div class="admin-tabs">
          <button class="admin-tab active" data-tab="users">사용자 관리</button>
          <button class="admin-tab" data-tab="batches">차수 관리</button>
          <button class="admin-tab" data-tab="ip-ranges">IP 대역 관리</button>
        </div>
        <div id="admin-content"></div>
      </div>`;

    const content = document.getElementById('admin-content');
    const newUiThemeSelect = document.getElementById('new-ui-theme-select');
    const openNewUiBtn = document.getElementById('open-new-ui-btn');
    const savedTheme = localStorage.getItem('new_ui_theme');
    if (newUiThemeSelect && savedTheme) {
      newUiThemeSelect.value = savedTheme;
    }
    newUiThemeSelect?.addEventListener('change', () => {
      localStorage.setItem('new_ui_theme', newUiThemeSelect.value);
    });
    openNewUiBtn?.addEventListener('click', () => {
      const theme = newUiThemeSelect?.value || 'ocean';
      localStorage.setItem('new_ui_theme', theme);
      window.location.href = '/new-ui/';
    });

    const renderTab = async (tab) => {
      el.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      if (tab === 'batches') await this._renderBatches(content);
      if (tab === 'users') await this._renderUsers(content);
      if (tab === 'ip-ranges') await this._renderIPRanges(content);
    };

    el.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => renderTab(btn.dataset.tab)));
    renderTab('users');
  },

  async _renderBatches(el) {
    const batches = await API.getBatches();
    el.innerHTML = `
      <div class="admin-section">
        <div class="section-header">
          <h3>차수 목록</h3>
          <button id="add-batch-btn" class="btn btn-primary">+ 차수 추가</button>
        </div>
        <table class="data-table">
          <thead><tr><th>ID</th><th>차수명</th><th>시작일</th><th>코칭 시작일</th><th>종료일</th><th>상태</th><th></th></tr></thead>
          <tbody>
            ${batches.map(b => `<tr>
              <td>${b.batch_id}</td>
              <td>${Fmt.escape(b.batch_name)}</td>
              <td>${Fmt.date(b.start_date)}</td>
              <td>${Fmt.date(b.coaching_start_date || b.start_date)}</td>
              <td>${Fmt.date(b.end_date)}</td>
              <td><span class="tag">${Fmt.status(b.status)}</span></td>
              <td>
                <button class="btn btn-sm btn-secondary edit-batch-btn" data-id="${b.batch_id}">수정</button>
                <button class="btn btn-sm btn-danger del-batch-btn" data-id="${b.batch_id}">삭제</button>
              </td>
            </tr>`).join('') || '<tr><td colspan="7" class="empty-state">차수가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    document.getElementById('add-batch-btn').addEventListener('click', () => {
      Modal.open(`<h2>차수 추가</h2>
        <form id="add-batch-form">
          <div class="form-group"><label>차수명 *</label><input name="batch_name" required placeholder="2026년 1차" /></div>
          <div class="form-group"><label>시작일 *</label><input type="date" name="start_date" required /></div>
          <div class="form-group"><label>코칭 시작일</label><input type="date" name="coaching_start_date" /></div>
          <div class="form-group"><label>종료일 *</label><input type="date" name="end_date" required /></div>
          <div class="form-group"><label>상태</label><select name="status"><option value="planned">예정</option><option value="ongoing">진행중</option><option value="completed">완료</option></select></div>
          <button type="submit" class="btn btn-primary">생성</button>
        </form>`);
      document.getElementById('add-batch-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = Object.fromEntries(fd.entries());
        if (!payload.coaching_start_date) payload.coaching_start_date = null;
        await API.createBatch(payload);
        Modal.close();
        this._renderBatches(el);
      });
    });

    el.querySelectorAll('.edit-batch-btn').forEach(btn => btn.addEventListener('click', async () => {
      const batchId = +btn.dataset.id;
      const current = batches.find((b) => b.batch_id === batchId);
      if (!current) return;
      Modal.open(`<h2>차수 수정</h2>
        <form id="edit-batch-form">
          <div class="form-group"><label>차수명 *</label><input name="batch_name" required value="${Fmt.escape(current.batch_name)}" /></div>
          <div class="form-group"><label>시작일 *</label><input type="date" name="start_date" required value="${current.start_date}" /></div>
          <div class="form-group"><label>코칭 시작일</label><input type="date" name="coaching_start_date" value="${current.coaching_start_date || current.start_date}" /></div>
          <div class="form-group"><label>종료일 *</label><input type="date" name="end_date" required value="${current.end_date}" /></div>
          <div class="form-group"><label>상태</label><select name="status">
            <option value="planned"${current.status === 'planned' ? ' selected' : ''}>예정</option>
            <option value="ongoing"${current.status === 'ongoing' ? ' selected' : ''}>진행중</option>
            <option value="completed"${current.status === 'completed' ? ' selected' : ''}>완료</option>
          </select></div>
          <button type="submit" class="btn btn-primary">저장</button>
        </form>`);
      document.getElementById('edit-batch-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = Object.fromEntries(fd.entries());
        if (!payload.coaching_start_date) payload.coaching_start_date = null;
        await API.updateBatch(batchId, payload);
        Modal.close();
        this._renderBatches(el);
      });
    }));

    el.querySelectorAll('.del-batch-btn').forEach(btn => btn.addEventListener('click', async () => {
      const batchId = +btn.dataset.id;
      if (!confirm('차수를 삭제하시겠습니까? 하위 과제/일정/세션 데이터도 함께 삭제될 수 있습니다.')) return;
      try {
        await API.deleteBatch(batchId);
        await this._renderBatches(el);
      } catch (err) {
        alert(err.message || '차수 삭제 실패');
      }
    }));
  },

  async _renderIPRanges(el) {
    const ranges = await API.getIPRanges().catch(() => []);
    el.innerHTML = `
      <div class="admin-section">
        <div class="section-header">
          <h3>허용 IP 대역 목록</h3>
          <button id="add-ip-btn" class="btn btn-primary">+ IP 대역 추가</button>
        </div>
        <p class="hint">설정된 대역이 없으면 모든 IP에서 출결 체크가 허용됩니다.</p>
        <table class="data-table">
          <thead><tr><th>CIDR</th><th>설명</th><th>활성</th><th>생성일</th><th></th></tr></thead>
          <tbody>
            ${ranges.map(r => `<tr>
              <td>${Fmt.escape(r.cidr)}</td>
              <td>${Fmt.escape(r.description || '-')}</td>
              <td>${r.is_active ? '✓' : '-'}</td>
              <td>${Fmt.date(r.created_at)}</td>
              <td><button class="btn btn-sm btn-danger del-ip-btn" data-id="${r.id}">삭제</button></td>
            </tr>`).join('') || '<tr><td colspan="5" class="empty-state">등록된 IP 대역이 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    document.getElementById('add-ip-btn').addEventListener('click', () => {
      Modal.open(`<h2>IP 대역 추가</h2>
        <form id="add-ip-form">
          <div class="form-group"><label>CIDR *</label><input name="cidr" required placeholder="192.168.1.0/24 또는 0.0.0.0/0" /></div>
          <div class="form-group"><label>설명</label><input name="description" placeholder="사무실 내부망" /></div>
          <button type="submit" class="btn btn-primary">추가</button>
        </form>`);
      document.getElementById('add-ip-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await API.createIPRange({ cidr: fd.get('cidr'), description: fd.get('description') || null });
          Modal.close();
          await this._renderIPRanges(el);
        } catch (err) {
          alert(err.message);
        }
      });
    });

    el.querySelectorAll('.del-ip-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      try {
        await API.deleteIPRange(+btn.dataset.id);
        await this._renderIPRanges(el);
      } catch (err) {
        alert(err.message);
      }
    }));
  },

  async _renderUsers(el) {
    const users = await API.getUsers(true).catch(() => []);
    const me = Auth.getUser();

    el.innerHTML = `<div class="admin-section">
      <div class="section-header">
        <h3>사용자 목록</h3>
        <div class="inline-actions">
          <button id="bulk-user-btn" class="btn btn-secondary">일괄 등록</button>
          <button id="bulk-user-update-btn" class="btn btn-secondary">일괄 수정</button>
          <button id="bulk-user-delete-btn" class="btn btn-danger">선택 삭제</button>
          <button id="add-user-btn" class="btn btn-primary">+ 사용자 추가</button>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th><input type="checkbox" id="select-all-users" /></th><th>ID</th><th>Knox ID</th><th>이름</th><th>부서</th><th>역할</th><th>상태</th><th>이메일</th><th>생성일</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => `<tr data-user-id="${u.user_id}">
            <td><input type="checkbox" class="user-select-chk" value="${u.user_id}"${u.user_id === me.user_id ? ' disabled' : ''} /></td>
            <td>${u.user_id}</td>
            <td>${Fmt.escape(u.emp_id)}</td>
            <td>${Fmt.escape(u.name)}</td>
            <td>${Fmt.escape(u.department || '-')}</td>
            <td>${Fmt.role(u.role)}</td>
            <td>${u.is_active ? '활성' : '비활성'}</td>
            <td>${Fmt.escape(u.email || '-')}</td>
            <td>${Fmt.date(u.created_at)}</td>
            <td>${this._renderUserActionButton(u, me)}</td>
          </tr>`).join('') || '<tr><td colspan="10" class="empty-state">사용자가 없습니다.</td></tr>'}
        </tbody>
      </table>
    </div>`;

    const getSelectedUserIds = () => (
      Array.from(el.querySelectorAll('.user-select-chk:checked'))
        .map((chk) => Number.parseInt(chk.value, 10))
        .filter((v) => !Number.isNaN(v))
    );
    const selectAll = document.getElementById('select-all-users');
    selectAll?.addEventListener('change', (e) => {
      const checked = !!e.target.checked;
      el.querySelectorAll('.user-select-chk:not(:disabled)').forEach((chk) => {
        chk.checked = checked;
      });
    });

    document.getElementById('add-user-btn').addEventListener('click', async () => {
      const { batches, allProjects } = await this._loadBatchesAndProjects();
      Modal.open(`<h2>사용자 추가</h2>
        <form id="add-user-form">
          <div class="form-group"><label>Knox ID(emp_id) *</label><input name="emp_id" required placeholder="knox001" /></div>
          <div class="form-group"><label>이름 *</label><input name="name" required placeholder="홍길동" /></div>
          <div class="form-group"><label>부서</label><input name="department" placeholder="개발팀" /></div>
          <div class="form-group"><label>역할 *</label>
            <select name="role" required>
              ${this._renderRoleOptions('participant')}
            </select>
          </div>
          <div class="form-group" id="add-user-batch-scope-group">
            <label>차수 (복수 선택)</label>
            <p class="hint">참여자/사내코치/외부코치 역할에서 저장됩니다.</p>
            <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
            ${batches.length
              ? `<select name="batch_ids" class="perm-multi-select" multiple size="8">
                  ${batches.map((b) => `<option value="${b.batch_id}">${Fmt.escape(b.batch_name)}</option>`).join('')}
                </select>`
              : '<p class="empty-state">차수가 없습니다.</p>'}
          </div>
          <div class="form-group" id="add-user-project-scope-group">
            <label>과제 권한 (복수 선택)</label>
            <p class="hint">참여자/외부코치 역할에서 저장됩니다.</p>
            <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
            ${allProjects.length
              ? `<select name="project_ids" class="perm-multi-select" multiple size="10">
                  ${allProjects.map((p) => `<option value="${p.project_id}">[${Fmt.escape(p.batch_name)}] ${Fmt.escape(p.project_name)}</option>`).join('')}
                </select>`
              : '<p class="empty-state">과제가 없습니다.</p>'}
          </div>
          <div class="form-group"><label>이메일</label><input type="email" name="email" placeholder="미입력 시 Knox ID@samsung.com 자동 생성" /></div>
          <button type="submit" class="btn btn-primary">생성</button>
          <p class="form-error" id="add-user-err" style="display:none;"></p>
        </form>`, null, { className: 'modal-box-xl' });
      const addForm = document.getElementById('add-user-form');
      const addRoleEl = addForm?.querySelector('select[name="role"]');
      const addBatchScopeGroup = document.getElementById('add-user-batch-scope-group');
      const addProjectScopeGroup = document.getElementById('add-user-project-scope-group');
      const syncAddScopeVisibility = () => {
        const scopePolicy = this._getRoleScopePolicy(addRoleEl?.value || '');
        if (addBatchScopeGroup) addBatchScopeGroup.style.display = scopePolicy.canSelectBatch ? '' : 'none';
        if (addProjectScopeGroup) addProjectScopeGroup.style.display = scopePolicy.canSelectProject ? '' : 'none';
        if (!addForm) return;
        if (!scopePolicy.canSelectBatch) {
          addForm.querySelectorAll('select[name="batch_ids"] option').forEach((opt) => { opt.selected = false; });
        }
        if (!scopePolicy.canSelectProject) {
          addForm.querySelectorAll('select[name="project_ids"] option').forEach((opt) => { opt.selected = false; });
        }
      };
      addRoleEl?.addEventListener('change', syncAddScopeVisibility);
      syncAddScopeVisibility();

      document.getElementById('add-user-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const normalizedRole = this._normalizeRole(fd.get('role'));
        const data = {
          emp_id: fd.get('emp_id').trim(),
          name: fd.get('name').trim(),
          department: fd.get('department')?.trim() || null,
          role: normalizedRole,
          email: fd.get('email')?.trim() || null,
        };
        try {
          const created = await API.createUser(data);
          const scopePolicy = this._getRoleScopePolicy(normalizedRole);
          if (created?.user_id && (scopePolicy.canSelectBatch || scopePolicy.canSelectProject)) {
            const permissionPayload = this._buildPermissionPayloadFromForm(fd, scopePolicy);
            await API.updateUserPermissions(created.user_id, permissionPayload);
          }
          Modal.close();
          await this._renderUsers(el);
        } catch (err) {
          const errEl = document.getElementById('add-user-err');
          errEl.textContent = err.message || '사용자 생성 실패';
          errEl.style.display = 'block';
        }
      });
    });

    document.getElementById('bulk-user-btn').addEventListener('click', () => {
      Modal.open(`<h2>사용자 일괄 등록</h2>
        <form id="bulk-user-form">
          <div class="form-group">
            <label>입력 포맷</label>
            <p class="hint">한 줄에 한 명씩 입력하세요. 구분자는 탭 또는 콤마를 사용할 수 있습니다.</p>
            <p class="hint"><code>Knox ID, 이름, 부서, 역할</code></p>
            <p class="hint">이메일은 <code>Knox ID@samsung.com</code> 형식으로 자동 생성됩니다.</p>
            <p class="hint">역할 값: <code>participant(참여자)</code>, <code>observer(참관자)</code>, <code>internal_coach(사내코치)</code>, <code>external_coach(외부코치)</code>, <code>admin(관리자)</code></p>
          </div>
          <div class="form-group">
            <textarea name="rows" rows="10" placeholder="예시: knox001, 홍길동, 개발팀, participant"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">일괄 반영</button>
          <p class="form-error" id="bulk-user-err" style="display:none;"></p>
        </form>`);

      document.getElementById('bulk-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('bulk-user-err');
        errEl.style.display = 'none';

        const text = String(new FormData(e.target).get('rows') || '').trim();
        if (!text) {
          errEl.textContent = '입력된 데이터가 없습니다.';
          errEl.style.display = 'block';
          return;
        }

        const rows = text.split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const cells = line.includes('\t')
              ? line.split('\t').map((v) => v.trim())
              : line.split(',').map((v) => v.trim());
            return {
              emp_id: cells[0] || '',
              name: cells[1] || '',
              department: cells[2] || null,
              role: this._normalizeRole(cells[3] || ''),
            };
          });

        try {
          const result = await API.bulkUpsertUsers({ rows, reactivate_inactive: true });
          const summary = `생성 ${result.created}건 / 수정 ${result.updated}건 / 재활성화 ${result.reactivated}건 / 실패 ${result.failed}건`;
          if (result.failed > 0) {
            errEl.textContent = `${summary}\n${(result.errors || []).slice(0, 5).join(' / ')}`;
            errEl.style.display = 'block';
            await this._renderUsers(el);
            return;
          }
          alert(summary);
          Modal.close();
          await this._renderUsers(el);
        } catch (err) {
          errEl.textContent = err.message || '일괄 등록 실패';
          errEl.style.display = 'block';
        }
      });
    });

    document.getElementById('bulk-user-delete-btn').addEventListener('click', async () => {
      const userIds = getSelectedUserIds();
      if (!userIds.length) {
        alert('삭제할 사용자를 선택하세요.');
        return;
      }
      if (!confirm(`선택한 ${userIds.length}명을 완전 삭제하시겠습니까?`)) return;
      try {
        const result = await API.bulkDeleteUsers({ user_ids: userIds });
        const summary = `삭제 ${result.deleted}건 / 실패 ${result.failed}건`;
        if (result.failed > 0) {
          alert(`${summary}\n${(result.errors || []).slice(0, 5).join('\n')}`);
        } else {
          alert(summary);
        }
        await this._renderUsers(el);
      } catch (err) {
        alert(err.message || '일괄 삭제 실패');
      }
    });

    document.getElementById('bulk-user-update-btn').addEventListener('click', async () => {
      const userIds = getSelectedUserIds();
      if (!userIds.length) {
        alert('수정할 사용자를 선택하세요.');
        return;
      }
      const { batches, allProjects } = await this._loadBatchesAndProjects();
      Modal.open(`<h2>사용자 일괄 수정</h2>
        <form id="bulk-update-user-form">
          <p class="hint">선택한 ${userIds.length}명에게 입력한 항목만 일괄 반영됩니다. 비워둔 항목은 변경하지 않습니다.</p>
          <div class="form-group">
            <label>부서 변경</label>
            <input name="department" placeholder="예: AI혁신팀 (입력 시에만 반영)" />
          </div>
          <div class="form-group">
            <label>역할 변경</label>
            <select name="role">
              <option value="">선택</option>
              ${this._renderRoleOptions()}
            </select>
          </div>
          <div class="form-group" id="bulk-batch-scope-group">
            <label>차수 변경 (복수 선택)</label>
            <p class="hint">참여자/사내코치/외부코치 역할에서 반영됩니다.</p>
            <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
            ${batches.length
              ? `<select name="batch_ids" class="perm-multi-select" multiple size="8">
                  ${batches.map((b) => `<option value="${b.batch_id}">${Fmt.escape(b.batch_name)}</option>`).join('')}
                </select>`
              : '<p class="empty-state">차수가 없습니다.</p>'}
          </div>
          <div class="form-group" id="bulk-project-scope-group">
            <label>과제 권한 변경 (복수 선택)</label>
            <p class="hint">참여자/외부코치 역할에서 반영됩니다.</p>
            <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
            ${allProjects.length
              ? `<select name="project_ids" class="perm-multi-select" multiple size="10">
                  ${allProjects.map((p) => `<option value="${p.project_id}">[${Fmt.escape(p.batch_name)}] ${Fmt.escape(p.project_name)}</option>`).join('')}
                </select>`
              : '<p class="empty-state">과제가 없습니다.</p>'}
          </div>
          <p class="hint">Knox ID/이름/이메일은 일괄 수정 대상이 아닙니다.</p>
          <button type="submit" class="btn btn-primary">일괄 반영</button>
          <p class="form-error" id="bulk-update-user-err" style="display:none;"></p>
        </form>`, null, { className: 'modal-box-xl' });
      const selectedUsers = users.filter((u) => userIds.includes(u.user_id));
      const selectedScopePolicy = this._mergeRoleScopePolicy(selectedUsers.map((u) => u.role));
      const bulkForm = document.getElementById('bulk-update-user-form');
      const roleSelectEl = bulkForm?.querySelector('select[name="role"]');
      const batchScopeGroup = document.getElementById('bulk-batch-scope-group');
      const projectScopeGroup = document.getElementById('bulk-project-scope-group');
      const syncBulkScopeVisibility = () => {
        const nextRole = this._normalizeRole(roleSelectEl?.value || '');
        const scopePolicy = nextRole ? this._getRoleScopePolicy(nextRole) : selectedScopePolicy;
        if (batchScopeGroup) batchScopeGroup.style.display = scopePolicy.canSelectBatch ? '' : 'none';
        if (projectScopeGroup) projectScopeGroup.style.display = scopePolicy.canSelectProject ? '' : 'none';
        if (bulkForm && !scopePolicy.canSelectBatch) {
          bulkForm.querySelectorAll('select[name="batch_ids"] option').forEach((el) => { el.selected = false; });
        }
        if (bulkForm && !scopePolicy.canSelectProject) {
          bulkForm.querySelectorAll('select[name="project_ids"] option').forEach((el) => { el.selected = false; });
        }
      };
      roleSelectEl?.addEventListener('change', syncBulkScopeVisibility);
      syncBulkScopeVisibility();

      document.getElementById('bulk-update-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('bulk-update-user-err');
        errEl.style.display = 'none';
        const fd = new FormData(e.target);
        const payload = { user_ids: userIds };
        const department = (fd.get('department') || '').toString().trim();
        if (department) payload.department = department;
        const normalizedRole = this._normalizeRole((fd.get('role') || '').toString());
        if (normalizedRole) payload.role = normalizedRole;
        const effectiveScopePolicy = normalizedRole
          ? this._getRoleScopePolicy(normalizedRole)
          : selectedScopePolicy;
        const permissionPayload = this._buildPermissionPayloadFromForm(fd, effectiveScopePolicy);
        if (effectiveScopePolicy.canSelectBatch && permissionPayload.batch_ids.length) {
          payload.batch_ids = permissionPayload.batch_ids;
        }
        if (effectiveScopePolicy.canSelectProject && permissionPayload.project_ids.length) {
          payload.project_ids = permissionPayload.project_ids;
        }
        if (Object.keys(payload).length <= 1) {
          errEl.textContent = '반영할 값을 최소 1개 이상 입력하세요.';
          errEl.style.display = 'block';
          return;
        }
        try {
          const result = await API.bulkUpdateUsers(payload);
          const summary = `수정 ${result.updated}건 / 실패 ${result.failed}건`;
          if (result.failed > 0) {
            errEl.textContent = `${summary}\n${(result.errors || []).slice(0, 5).join('\n')}`;
            errEl.style.display = 'block';
          } else {
            alert(summary);
            Modal.close();
            await this._renderUsers(el);
          }
        } catch (err) {
          errEl.textContent = err.message || '일괄 수정 실패';
          errEl.style.display = 'block';
        }
      });
    });

    el.querySelectorAll('.edit-user-btn').forEach(btn => btn.addEventListener('click', async () => {
      const userId = +btn.dataset.id;
      const current = users.find((u) => u.user_id === userId);
      if (!current) return;
      const [{ batches, allProjects }, permission] = await Promise.all([
        this._loadBatchesAndProjects(),
        API.getUserPermissions(userId).catch(() => ({ batch_ids: [], project_ids: [] })),
      ]);
      const currentRole = this._normalizeRole(current.role);
      const batchIds = new Set((permission.batch_ids || []).map((v) => Number(v)));
      const projectIds = new Set((permission.project_ids || []).map((v) => Number(v)));

      Modal.open(`<h2>사용자 수정</h2>
        <form id="edit-user-form">
          <div class="form-group"><label>Knox ID(emp_id) *</label><input name="emp_id" required value="${Fmt.escape(current.emp_id)}" /></div>
          <div class="form-group"><label>이름 *</label><input name="name" required value="${Fmt.escape(current.name)}" /></div>
          <div class="form-group"><label>부서</label><input name="department" value="${Fmt.escape(current.department || '')}" /></div>
          <div class="form-group"><label>역할 *</label>
            <select name="role" required>
              ${this._renderRoleOptions(currentRole)}
            </select>
          </div>
          <div class="form-group"><label>이메일</label><input type="email" name="email" value="${Fmt.escape(current.email || '')}" /></div>
          <div class="form-group" id="user-batch-scope-group">
            <label>차수 (복수 선택)</label>
            <p class="hint">참여자/사내코치/외부코치 역할에서 저장됩니다.</p>
            <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
            ${batches.length
              ? `<select name="batch_ids" class="perm-multi-select" multiple size="8">
                  ${batches.map((b) => `<option value="${b.batch_id}"${batchIds.has(Number(b.batch_id)) ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
                </select>`
              : '<p class="empty-state">차수가 없습니다.</p>'}
          </div>
          <div class="form-group" id="user-project-scope-group">
            <label>과제 권한 (복수 선택)</label>
            <p class="hint">참여자/외부코치 역할에서 저장됩니다.</p>
            <p class="hint">여러 항목 선택: Ctrl(또는 Cmd)+클릭, 연속 선택: Shift+클릭</p>
            ${allProjects.length
              ? `<select name="project_ids" class="perm-multi-select" multiple size="10">
                  ${allProjects.map((p) => `<option value="${p.project_id}"${projectIds.has(Number(p.project_id)) ? ' selected' : ''}>[${Fmt.escape(p.batch_name)}] ${Fmt.escape(p.project_name)}</option>`).join('')}
                </select>`
              : '<p class="empty-state">과제가 없습니다.</p>'}
          </div>
          <button type="submit" class="btn btn-primary">저장</button>
          <p class="form-error" id="edit-user-err" style="display:none;"></p>
        </form>`);
      const editForm = document.getElementById('edit-user-form');
      const editRoleEl = editForm?.querySelector('select[name="role"]');
      const editBatchScopeGroup = document.getElementById('user-batch-scope-group');
      const editProjectScopeGroup = document.getElementById('user-project-scope-group');
      const syncEditScopeVisibility = () => {
        const scopePolicy = this._getRoleScopePolicy(editRoleEl?.value || '');
        if (editBatchScopeGroup) editBatchScopeGroup.style.display = scopePolicy.canSelectBatch ? '' : 'none';
        if (editProjectScopeGroup) editProjectScopeGroup.style.display = scopePolicy.canSelectProject ? '' : 'none';
        if (editForm && !scopePolicy.canSelectBatch) {
          editForm.querySelectorAll('select[name="batch_ids"] option').forEach((el) => { el.selected = false; });
        }
        if (editForm && !scopePolicy.canSelectProject) {
          editForm.querySelectorAll('select[name="project_ids"] option').forEach((el) => { el.selected = false; });
        }
      };
      editRoleEl?.addEventListener('change', syncEditScopeVisibility);
      syncEditScopeVisibility();

      document.getElementById('edit-user-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          emp_id: fd.get('emp_id').trim(),
          name: fd.get('name').trim(),
          department: fd.get('department')?.trim() || null,
          role: this._normalizeRole(fd.get('role')),
          email: fd.get('email')?.trim() || null,
        };
        const scopePolicy = this._getRoleScopePolicy(data.role);
        const permissionPayload = this._buildPermissionPayloadFromForm(fd, scopePolicy);
        try {
          await API.updateUser(userId, data);
          await API.updateUserPermissions(userId, permissionPayload);
          Modal.close();
          await this._renderUsers(el);
        } catch (err) {
          const errEl = document.getElementById('edit-user-err');
          errEl.textContent = err.message || '사용자 수정 실패';
          errEl.style.display = 'block';
        }
      });
    }));

    el.querySelectorAll('.del-user-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('사용자를 완전 삭제하시겠습니까?')) return;
      try {
        await API.deleteUser(+btn.dataset.id);
        await this._renderUsers(el);
      } catch (err) {
        alert(err.message || '삭제 실패');
      }
    }));
  },

  _renderUserActionButton(user, me) {
    if (user.user_id === me.user_id) return '-';
    if (!user.is_active) return '<span class="hint">비활성</span>';
    return `<div class="inline-actions">
      <button class="btn btn-sm btn-secondary edit-user-btn" data-id="${user.user_id}">수정</button>
      <button class="btn btn-sm btn-danger del-user-btn" data-id="${user.user_id}">삭제</button>
    </div>`;
  },

  _normalizeRole(roleText) {
    const raw = String(roleText || '').trim().toLowerCase();
    const roleMap = {
      admin: 'admin',
      관리자: 'admin',
      coach: 'internal_coach',
      코치: 'internal_coach',
      internal_coach: 'internal_coach',
      사내코치: 'internal_coach',
      external_coach: 'external_coach',
      외부코치: 'external_coach',
      participant: 'participant',
      참여자: 'participant',
      observer: 'observer',
      참관자: 'observer',
    };
    return roleMap[raw] || raw;
  },
};


