/**
 * Admin 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.admin = {
  async render(el, params) {
    const user = Auth.getUser();
    if (user.role !== 'admin') {
      el.innerHTML = '<div class="error-state">관리자만 접근 가능합니다.</div>';
      return;
    }

    el.innerHTML = `
      <div class="page-container">
        <h1>관리자 메뉴</h1>
        <div class="admin-tabs">
          <button class="admin-tab active" data-tab="users">사용자 관리</button>
          <button class="admin-tab" data-tab="batches">차수 관리</button>
          <button class="admin-tab" data-tab="ip-ranges">IP 대역 관리</button>
        </div>
        <div id="admin-content"></div>
      </div>`;

    const content = document.getElementById('admin-content');
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
          <thead><tr><th>ID</th><th>차수명</th><th>시작일</th><th>종료일</th><th>상태</th><th></th></tr></thead>
          <tbody>
            ${batches.map(b => `<tr>
              <td>${b.batch_id}</td>
              <td>${Fmt.escape(b.batch_name)}</td>
              <td>${Fmt.date(b.start_date)}</td>
              <td>${Fmt.date(b.end_date)}</td>
              <td><span class="tag">${Fmt.status(b.status)}</span></td>
              <td>
                <button class="btn btn-sm btn-secondary edit-batch-btn" data-id="${b.batch_id}">수정</button>
                <button class="btn btn-sm btn-danger del-batch-btn" data-id="${b.batch_id}">삭제</button>
              </td>
            </tr>`).join('') || '<tr><td colspan="6" class="empty-state">차수가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;

    document.getElementById('add-batch-btn').addEventListener('click', () => {
      Modal.open(`<h2>차수 추가</h2>
        <form id="add-batch-form">
          <div class="form-group"><label>차수명 *</label><input name="batch_name" required placeholder="2026년 1차" /></div>
          <div class="form-group"><label>시작일 *</label><input type="date" name="start_date" required /></div>
          <div class="form-group"><label>종료일 *</label><input type="date" name="end_date" required /></div>
          <div class="form-group"><label>상태</label><select name="status"><option value="planned">예정</option><option value="ongoing">진행중</option><option value="completed">완료</option></select></div>
          <button type="submit" class="btn btn-primary">생성</button>
        </form>`);
      document.getElementById('add-batch-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await API.createBatch(Object.fromEntries(fd.entries()));
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
        await API.updateBatch(batchId, Object.fromEntries(fd.entries()));
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
          <button id="add-user-btn" class="btn btn-primary">+ 사용자 추가</button>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>ID</th><th>Knox ID</th><th>이름</th><th>부서</th><th>역할</th><th>상태</th><th>이메일</th><th>생성일</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => `<tr>
            <td>${u.user_id}</td>
            <td>${Fmt.escape(u.emp_id)}</td>
            <td>${Fmt.escape(u.name)}</td>
            <td>${Fmt.escape(u.department || '-')}</td>
            <td>${Fmt.role(u.role)}</td>
            <td>${u.is_active ? '활성' : '비활성'}</td>
            <td>${Fmt.escape(u.email || '-')}</td>
            <td>${Fmt.date(u.created_at)}</td>
            <td>${this._renderUserActionButton(u, me)}</td>
          </tr>`).join('') || '<tr><td colspan="9" class="empty-state">사용자가 없습니다.</td></tr>'}
        </tbody>
      </table>
    </div>`;

    document.getElementById('add-user-btn').addEventListener('click', () => {
      Modal.open(`<h2>사용자 추가</h2>
        <form id="add-user-form">
          <div class="form-group"><label>Knox ID(emp_id) *</label><input name="emp_id" required placeholder="knox001" /></div>
          <div class="form-group"><label>이름 *</label><input name="name" required placeholder="홍길동" /></div>
          <div class="form-group"><label>부서</label><input name="department" placeholder="개발팀" /></div>
          <div class="form-group"><label>역할 *</label>
            <select name="role" required>
              <option value="participant">참여자</option>
              <option value="observer">참관자</option>
              <option value="coach">코치</option>
              <option value="admin">관리자</option>
            </select>
          </div>
          <div class="form-group"><label>이메일</label><input type="email" name="email" placeholder="user@company.com" /></div>
          <button type="submit" class="btn btn-primary">생성</button>
          <p class="form-error" id="add-user-err" style="display:none;"></p>
        </form>`);

      document.getElementById('add-user-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          emp_id: fd.get('emp_id').trim(),
          name: fd.get('name').trim(),
          department: fd.get('department')?.trim() || null,
          role: fd.get('role'),
          email: fd.get('email')?.trim() || null,
        };
        try {
          await API.createUser(data);
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
            <p class="hint"><code>Knox ID, 이름, 부서, 역할, 이메일(선택)</code></p>
          </div>
          <div class="form-group">
            <textarea name="rows" rows="10" placeholder="knox001, 홍길동, 개발팀, participant, hong@company.com"></textarea>
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
              email: cells[4] || null,
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

    el.querySelectorAll('.edit-user-btn').forEach(btn => btn.addEventListener('click', async () => {
      const userId = +btn.dataset.id;
      const current = users.find((u) => u.user_id === userId);
      if (!current) return;
      const [batches, permission] = await Promise.all([
        API.getBatches().catch(() => []),
        API.getUserPermissions(userId).catch(() => ({ batch_ids: [], project_ids: [] })),
      ]);
      const batchIds = new Set((permission.batch_ids || []).map((v) => Number(v)));
      const projectIds = new Set((permission.project_ids || []).map((v) => Number(v)));
      const batchProjects = await Promise.all(
        batches.map(async (b) => ({
          batch: b,
          projects: await API.getProjects(b.batch_id).catch(() => []),
        }))
      );
      const allProjects = batchProjects.flatMap((row) => row.projects.map((p) => ({
        ...p,
        batch_name: row.batch.batch_name,
      })));

      Modal.open(`<h2>사용자 수정</h2>
        <form id="edit-user-form">
          <div class="form-group"><label>Knox ID(emp_id) *</label><input name="emp_id" required value="${Fmt.escape(current.emp_id)}" /></div>
          <div class="form-group"><label>이름 *</label><input name="name" required value="${Fmt.escape(current.name)}" /></div>
          <div class="form-group"><label>부서</label><input name="department" value="${Fmt.escape(current.department || '')}" /></div>
          <div class="form-group"><label>역할 *</label>
            <select name="role" required>
              <option value="participant"${current.role === 'participant' ? ' selected' : ''}>참여자</option>
              <option value="observer"${current.role === 'observer' ? ' selected' : ''}>참관자</option>
              <option value="coach"${current.role === 'coach' ? ' selected' : ''}>코치</option>
              <option value="admin"${current.role === 'admin' ? ' selected' : ''}>관리자</option>
            </select>
          </div>
          <div class="form-group"><label>이메일</label><input type="email" name="email" value="${Fmt.escape(current.email || '')}" /></div>
          <div class="form-group">
            <label>차수 권한 (복수 선택)</label>
            <p class="hint">선택하지 않으면 전체 차수 접근 허용</p>
            <div class="cal-coach-grid">
              ${batches.map((b) => `<label><input type="checkbox" name="batch_ids" value="${b.batch_id}"${batchIds.has(Number(b.batch_id)) ? ' checked' : ''} /> ${Fmt.escape(b.batch_name)}</label>`).join('') || '<p class="empty-state">차수가 없습니다.</p>'}
            </div>
          </div>
          <div class="form-group">
            <label>과제 권한 (복수 선택)</label>
            <p class="hint">선택하지 않으면 차수 권한/기본 권한 규칙에 따름</p>
            <div class="cal-coach-grid">
              ${allProjects.map((p) => `<label><input type="checkbox" name="project_ids" value="${p.project_id}"${projectIds.has(Number(p.project_id)) ? ' checked' : ''} /> [${Fmt.escape(p.batch_name)}] ${Fmt.escape(p.project_name)}</label>`).join('') || '<p class="empty-state">과제가 없습니다.</p>'}
            </div>
          </div>
          <button type="submit" class="btn btn-primary">저장</button>
          <p class="form-error" id="edit-user-err" style="display:none;"></p>
        </form>`);

      document.getElementById('edit-user-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
          emp_id: fd.get('emp_id').trim(),
          name: fd.get('name').trim(),
          department: fd.get('department')?.trim() || null,
          role: fd.get('role'),
          email: fd.get('email')?.trim() || null,
        };
        const permissionPayload = {
          batch_ids: fd.getAll('batch_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v)),
          project_ids: fd.getAll('project_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v)),
        };
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
      if (!confirm('사용자를 삭제(비활성화)하시겠습니까?')) return;
      try {
        await API.deleteUser(+btn.dataset.id);
        await this._renderUsers(el);
      } catch (err) {
        alert(err.message || '삭제 실패');
      }
    }));

    el.querySelectorAll('.restore-user-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('사용자를 복구(재활성화)하시겠습니까?')) return;
      try {
        await API.restoreUser(+btn.dataset.id);
        await this._renderUsers(el);
      } catch (err) {
        alert(err.message || '복구 실패');
      }
    }));
  },

  _renderUserActionButton(user, me) {
    if (user.user_id === me.user_id) return '-';
    if (!user.is_active) return `<button class="btn btn-sm btn-secondary restore-user-btn" data-id="${user.user_id}">복구</button>`;
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
      coach: 'coach',
      코치: 'coach',
      participant: 'participant',
      참여자: 'participant',
      observer: 'observer',
      참관자: 'observer',
    };
    return roleMap[raw] || raw;
  },
};


