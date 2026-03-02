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

    // [FEEDBACK7] 관리자 탭에 강의 관리 탭을 포함합니다.
    el.innerHTML = `
      <div class="page-container">
        <h1>관리자 메뉴</h1>
        <div class="admin-tabs">
          <button class="admin-tab active" data-tab="users">사용자 관리</button>
          <button class="admin-tab" data-tab="batches">차수 관리</button>
          <button class="admin-tab" data-tab="lectures">강의 관리</button>
          <button class="admin-tab" data-tab="ip-ranges">IP 대역 관리</button>
        </div>
        <div id="admin-content"></div>
      </div>`;

    const content = document.getElementById('admin-content');
    const renderTab = async (tab) => {
      el.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      if (tab === 'batches') await this._renderBatches(content);
      if (tab === 'users') await this._renderUsers(content);
      if (tab === 'lectures') await this._renderLectures(content);
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

  _toDateTimeLocalValue(value) {
    if (!value) return '';
    return String(value).slice(0, 16);
  },

  _isTenMinuteDateTimeLocal(value) {
    // [feedback8] 강의 시간 입력은 10분 단위만 허용합니다.
    const text = String(value || '');
    const match = text.match(/T(\d{2}):(\d{2})/);
    if (!match) return false;
    const minute = Number.parseInt(match[2], 10);
    return !Number.isNaN(minute) && minute % 10 === 0;
  },

  async _renderLectures(el) {
    const batches = await API.getBatches().catch(() => []);
    if (!batches.length) {
      el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
      return;
    }
    const storedBatchId = Number.parseInt(State.get('adminLectureBatchId'), 10);
    const selectedBatchId = batches.some((b) => b.batch_id === storedBatchId) ? storedBatchId : batches[0].batch_id;
    State.set('adminLectureBatchId', selectedBatchId);
    const lectures = await API.getLectures({ batch_id: selectedBatchId, include_hidden: true }).catch(() => []);

    el.innerHTML = `
      <div class="admin-section">
        <div class="section-header">
          <h3>강의 관리</h3>
          <div class="inline-actions">
            <select id="admin-lecture-batch">
              ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === selectedBatchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
            </select>
            <button id="admin-lecture-bulk-btn" class="btn btn-secondary">선택 일괄수정</button>
            <button id="admin-lecture-add-btn" class="btn btn-primary">+ 강의 추가</button>
          </div>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="admin-lecture-select-all" /></th>
              <th>ID</th>
              <th>강의명</th>
              <th>강사</th>
              <th>강의일정</th>
              <th>신청기간</th>
              <th>정원(총/팀)</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${lectures.map((lecture) => `
              <tr>
                <td><input type="checkbox" class="admin-lecture-row-chk" value="${lecture.lecture_id}" /></td>
                <td>${lecture.lecture_id}</td>
                <td>${Fmt.escape(lecture.title)}</td>
                <td>${Fmt.escape(lecture.instructor || '-')}</td>
                <td>${Fmt.datetime(lecture.start_datetime)} ~ ${Fmt.datetime(lecture.end_datetime)}</td>
                <td>${Fmt.date(lecture.apply_start_date)} ~ ${Fmt.date(lecture.apply_end_date)}</td>
                <td>${lecture.capacity_total != null ? lecture.capacity_total : '∞'} / ${lecture.capacity_team != null ? lecture.capacity_team : '∞'}</td>
                <td>${lecture.is_visible ? '공개' : '비공개'}</td>
                <td>
                  <div class="inline-actions">
                    <button class="btn btn-sm btn-secondary admin-lecture-reg-btn" data-id="${lecture.lecture_id}">신청현황</button>
                    <button class="btn btn-sm btn-secondary admin-lecture-edit-btn" data-id="${lecture.lecture_id}">수정</button>
                    <button class="btn btn-sm btn-danger admin-lecture-del-btn" data-id="${lecture.lecture_id}">삭제</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="empty-state">등록된 강의가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    const getSelectedLectureIds = () => (
      Array.from(el.querySelectorAll('.admin-lecture-row-chk:checked'))
        .map((chk) => Number.parseInt(chk.value, 10))
        .filter((v) => !Number.isNaN(v))
    );

    document.getElementById('admin-lecture-batch')?.addEventListener('change', async (e) => {
      const nextBatchId = Number.parseInt(e.target.value, 10);
      State.set('adminLectureBatchId', nextBatchId);
      await this._renderLectures(el);
    });
    document.getElementById('admin-lecture-select-all')?.addEventListener('change', (e) => {
      const checked = !!e.target.checked;
      el.querySelectorAll('.admin-lecture-row-chk').forEach((chk) => { chk.checked = checked; });
    });
    document.getElementById('admin-lecture-add-btn')?.addEventListener('click', async () => {
      await this._openLectureModal({
        batchId: selectedBatchId,
        onSaved: async () => this._renderLectures(el),
      });
    });
    document.getElementById('admin-lecture-bulk-btn')?.addEventListener('click', async () => {
      const lectureIds = getSelectedLectureIds();
      if (!lectureIds.length) {
        alert('일괄수정할 강의를 선택하세요.');
        return;
      }
      await this._openLectureBulkModal({
        lectureIds,
        onSaved: async () => this._renderLectures(el),
      });
    });

    el.querySelectorAll('.admin-lecture-edit-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const lectureId = Number.parseInt(btn.dataset.id, 10);
      const lecture = lectures.find((row) => row.lecture_id === lectureId);
      if (!lecture) return;
      await this._openLectureModal({
        lecture,
        batchId: selectedBatchId,
        onSaved: async () => this._renderLectures(el),
      });
    }));
    el.querySelectorAll('.admin-lecture-del-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const lectureId = Number.parseInt(btn.dataset.id, 10);
      if (Number.isNaN(lectureId)) return;
      if (!confirm('강의를 삭제하시겠습니까?')) return;
      await API.deleteLecture(lectureId);
      await this._renderLectures(el);
    }));
    el.querySelectorAll('.admin-lecture-reg-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const lectureId = Number.parseInt(btn.dataset.id, 10);
      if (Number.isNaN(lectureId)) return;
      await this._openLectureRegistrationsModal({
        lectureId,
        lectureTitle: lectures.find((row) => row.lecture_id === lectureId)?.title || '강의',
      });
    }));
  },

  async _openLectureModal({ lecture = null, batchId, onSaved }) {
    const isEdit = !!lecture;
    const nowIso = new Date().toISOString().slice(0, 16);
    const todayIso = new Date().toISOString().slice(0, 10);
    Modal.open(`
      <h2>${isEdit ? '강의 수정' : '강의 추가'}</h2>
      <form id="admin-lecture-form">
        <div class="form-group"><label>강의명 *</label><input name="title" required value="${Fmt.escape(lecture?.title || '')}" /></div>
        <div class="form-group"><label>강의 요약</label><textarea name="summary" rows="3">${Fmt.escape(lecture?.summary || '')}</textarea></div>
        <div class="form-group"><label>강의 상세</label><textarea name="description" rows="4">${Fmt.escape(lecture?.description || '')}</textarea></div>
        <div class="form-group"><label>강사</label><input name="instructor" value="${Fmt.escape(lecture?.instructor || '')}" /></div>
        <div class="form-group"><label>장소</label><input name="location" value="${Fmt.escape(lecture?.location || '')}" /></div>
        <div class="form-group"><label>강의 시작 *</label><input type="datetime-local" step="600" name="start_datetime" required value="${Fmt.escape(this._toDateTimeLocalValue(lecture?.start_datetime || nowIso))}" /></div>
        <div class="form-group"><label>강의 종료 *</label><input type="datetime-local" step="600" name="end_datetime" required value="${Fmt.escape(this._toDateTimeLocalValue(lecture?.end_datetime || nowIso))}" /></div>
        <div class="form-group"><label>신청 시작일 *</label><input type="date" name="apply_start_date" required value="${Fmt.escape(String(lecture?.apply_start_date || todayIso))}" /></div>
        <div class="form-group"><label>신청 종료일 *</label><input type="date" name="apply_end_date" required value="${Fmt.escape(String(lecture?.apply_end_date || todayIso))}" /></div>
        <div class="form-group"><label>총 정원</label><input type="number" min="1" name="capacity_total" value="${Fmt.escape(String(lecture?.capacity_total || ''))}" /></div>
        <div class="form-group"><label>팀별 정원</label><input type="number" min="1" name="capacity_team" value="${Fmt.escape(String(lecture?.capacity_team || ''))}" /></div>
        <div class="form-group"><label><input type="checkbox" name="is_visible" ${lecture?.is_visible !== false ? 'checked' : ''} /> 공개</label></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '생성'}</button>
        <p id="admin-lecture-form-err" class="form-error" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-xl' });

    document.getElementById('admin-lecture-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        batch_id: batchId,
        title: String(fd.get('title') || '').trim(),
        summary: String(fd.get('summary') || '').trim() || null,
        description: String(fd.get('description') || '').trim() || null,
        instructor: String(fd.get('instructor') || '').trim() || null,
        location: String(fd.get('location') || '').trim() || null,
        start_datetime: String(fd.get('start_datetime') || ''),
        end_datetime: String(fd.get('end_datetime') || ''),
        apply_start_date: String(fd.get('apply_start_date') || ''),
        apply_end_date: String(fd.get('apply_end_date') || ''),
        capacity_total: fd.get('capacity_total') ? Number.parseInt(String(fd.get('capacity_total')), 10) : null,
        capacity_team: fd.get('capacity_team') ? Number.parseInt(String(fd.get('capacity_team')), 10) : null,
        is_visible: fd.get('is_visible') === 'on',
      };
      const errEl = document.getElementById('admin-lecture-form-err');
      if (!payload.title || !payload.start_datetime || !payload.end_datetime || !payload.apply_start_date || !payload.apply_end_date) {
        errEl.textContent = '필수 값을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      if (!this._isTenMinuteDateTimeLocal(payload.start_datetime) || !this._isTenMinuteDateTimeLocal(payload.end_datetime)) {
        errEl.textContent = '강의 시작/종료 시각은 10분 단위로 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        if (isEdit) await API.updateLecture(lecture.lecture_id, payload);
        else await API.createLecture(payload);
        Modal.close();
        if (onSaved) await onSaved();
      } catch (err) {
        errEl.textContent = err.message || '강의 저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openLectureBulkModal({ lectureIds, onSaved }) {
    Modal.open(`
      <h2>강의 일괄수정</h2>
      <form id="admin-lecture-bulk-form">
        <p class="hint">선택한 ${lectureIds.length}개 강의에 입력한 항목만 반영됩니다.</p>
        <div class="form-group"><label>장소</label><input name="location" placeholder="입력 시 반영" /></div>
        <div class="form-group"><label>강의 시작</label><input type="datetime-local" step="600" name="start_datetime" /></div>
        <div class="form-group"><label>강의 종료</label><input type="datetime-local" step="600" name="end_datetime" /></div>
        <div class="form-group"><label>신청 시작일</label><input type="date" name="apply_start_date" /></div>
        <div class="form-group"><label>신청 종료일</label><input type="date" name="apply_end_date" /></div>
        <div class="form-group"><label>총 정원</label><input type="number" min="1" name="capacity_total" /></div>
        <div class="form-group"><label>팀별 정원</label><input type="number" min="1" name="capacity_team" /></div>
        <div class="form-group">
          <label>공개 상태</label>
          <select name="is_visible">
            <option value="">변경 안함</option>
            <option value="true">공개</option>
            <option value="false">비공개</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">일괄 반영</button>
        <p id="admin-lecture-bulk-err" class="form-error" style="display:none;"></p>
      </form>
    `);

    document.getElementById('admin-lecture-bulk-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = { lecture_ids: lectureIds };
      const location = String(fd.get('location') || '').trim();
      if (location) payload.location = location;
      const startDateTime = String(fd.get('start_datetime') || '').trim();
      if (startDateTime) payload.start_datetime = startDateTime;
      const endDateTime = String(fd.get('end_datetime') || '').trim();
      if (endDateTime) payload.end_datetime = endDateTime;
      const applyStartDate = String(fd.get('apply_start_date') || '').trim();
      if (applyStartDate) payload.apply_start_date = applyStartDate;
      const applyEndDate = String(fd.get('apply_end_date') || '').trim();
      if (applyEndDate) payload.apply_end_date = applyEndDate;
      const capacityTotal = String(fd.get('capacity_total') || '').trim();
      if (capacityTotal) payload.capacity_total = Number.parseInt(capacityTotal, 10);
      const capacityTeam = String(fd.get('capacity_team') || '').trim();
      if (capacityTeam) payload.capacity_team = Number.parseInt(capacityTeam, 10);
      const isVisibleRaw = String(fd.get('is_visible') || '').trim();
      if (isVisibleRaw === 'true') payload.is_visible = true;
      if (isVisibleRaw === 'false') payload.is_visible = false;
      const errEl = document.getElementById('admin-lecture-bulk-err');
      if (startDateTime && !this._isTenMinuteDateTimeLocal(startDateTime)) {
        errEl.textContent = '강의 시작 시각은 10분 단위로 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      if (endDateTime && !this._isTenMinuteDateTimeLocal(endDateTime)) {
        errEl.textContent = '강의 종료 시각은 10분 단위로 입력하세요.';
        errEl.style.display = 'block';
        return;
      }

      if (Object.keys(payload).length === 1) {
        errEl.textContent = '변경할 항목을 1개 이상 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        await API.bulkUpdateLectures(payload);
        Modal.close();
        if (onSaved) await onSaved();
      } catch (err) {
        errEl.textContent = err.message || '일괄수정 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openLectureRegistrationsModal({ lectureId, lectureTitle }) {
    const registrations = await API.listLectureRegistrations(lectureId).catch(() => []);
    const renderRows = (rows) => (
      rows.map((row) => `
        <tr>
          <td>${Fmt.escape(row.project_name || `과제#${row.project_id}`)}</td>
          <td>${(row.member_user_ids || []).join(', ') || '-'}</td>
          <td>${row.member_count}</td>
          <td>${Fmt.escape(row.approval_status)}</td>
          <td>
            <div class="inline-actions">
              <button class="btn btn-xs btn-secondary admin-lecture-approve-btn" data-id="${row.registration_id}" data-status="approved">승인</button>
              <button class="btn btn-xs btn-danger admin-lecture-approve-btn" data-id="${row.registration_id}" data-status="rejected">반려</button>
            </div>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state">신청 내역이 없습니다.</td></tr>'
    );

    Modal.open(`
      <h2>신청 현황 · ${Fmt.escape(lectureTitle)}</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>과제</th>
            <th>신청 팀원 ID</th>
            <th>인원</th>
            <th>상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="admin-lecture-reg-rows">
          ${renderRows(registrations)}
        </tbody>
      </table>
    `, null, { className: 'modal-box-xl' });

    document.querySelectorAll('.admin-lecture-approve-btn').forEach((btn) => btn.addEventListener('click', async () => {
      const registrationId = Number.parseInt(btn.dataset.id, 10);
      const status = String(btn.dataset.status || 'approved');
      if (Number.isNaN(registrationId)) return;
      try {
        await API.setLectureApproval(registrationId, { approval_status: status });
        await this._openLectureRegistrationsModal({ lectureId, lectureTitle });
      } catch (err) {
        alert(err.message || '승인 상태 변경 실패');
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


