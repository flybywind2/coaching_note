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
          <button class="admin-tab active" data-tab="batches">차수 관리</button>
          <button class="admin-tab" data-tab="users">사용자 안내</button>
          <button class="admin-tab" data-tab="ip-ranges">IP 대역 관리</button>
        </div>
        <div id="admin-content"></div>
      </div>`;

    const content = document.getElementById('admin-content');
    const renderTab = async (tab) => {
      el.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      if (tab === 'batches') await this._renderBatches(content);
      if (tab === 'users') this._renderUsers(content);
      if (tab === 'ip-ranges') await this._renderIPRanges(content);
    };

    el.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => renderTab(btn.dataset.tab)));
    renderTab('batches');
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
          <thead><tr><th>ID</th><th>차수명</th><th>시작일</th><th>종료일</th><th>상태</th></tr></thead>
          <tbody>
            ${batches.map(b => `<tr>
              <td>${b.batch_id}</td>
              <td>${Fmt.escape(b.batch_name)}</td>
              <td>${Fmt.date(b.start_date)}</td>
              <td>${Fmt.date(b.end_date)}</td>
              <td><span class="tag">${Fmt.status(b.status)}</span></td>
            </tr>`).join('') || '<tr><td colspan="5" class="empty-state">차수가 없습니다.</td></tr>'}
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

  _renderUsers(el) {
    el.innerHTML = `<div class="admin-section">
      <h3>테스트 계정 안내</h3>
      <table class="data-table">
        <thead><tr><th>사번</th><th>역할</th><th>설명</th></tr></thead>
        <tbody>
          <tr><td>admin001</td><td>관리자</td><td>전체 관리 권한</td></tr>
          <tr><td>coach001</td><td>코치</td><td>코칭노트 작성, 피드백</td></tr>
          <tr><td>coach002</td><td>코치</td><td>코칭노트 작성, 피드백</td></tr>
          <tr><td>user001</td><td>참여자</td><td>본인 과제 조회, Task 관리</td></tr>
          <tr><td>user002</td><td>참여자</td><td>본인 과제 조회, Task 관리</td></tr>
          <tr><td>obs001</td><td>참관자</td><td>공개 과제 열람만 가능</td></tr>
        </tbody>
      </table>
    </div>`;
  },
};
