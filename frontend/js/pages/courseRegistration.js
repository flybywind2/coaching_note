/**
 * [feedback8] 수강신청 리스트/강의상세 화면을 분리 렌더링하는 모듈입니다.
 */

Pages.courseRegistration = {
  async render(el, params = {}) {
    const lectureId = Number.parseInt(params.lectureId || params.lecture_id, 10);
    if (Number.isInteger(lectureId)) {
      await this._renderDetail(el, { ...params, lecture_id: lectureId });
      return;
    }
    await this._renderList(el, params);
  },

  _buildListUrl(batchId = null) {
    const q = new URLSearchParams();
    if (batchId != null) q.set('batch_id', String(batchId));
    return `/course-registration${q.toString() ? `?${q.toString()}` : ''}`;
  },

  _buildDetailUrl(batchId, lectureId) {
    const q = new URLSearchParams();
    if (batchId != null) q.set('batch_id', String(batchId));
    return `/course-registration/lecture/${lectureId}${q.toString() ? `?${q.toString()}` : ''}`;
  },

  _resolveBatchId(params, batches) {
    const requestedBatchId = Number.parseInt(params.batch_id, 10);
    const stateBatchId = Number.parseInt(State.get('currentBatchId'), 10);
    return [requestedBatchId, stateBatchId, batches[0]?.batch_id]
      .find((id) => Number.isInteger(id) && batches.some((row) => row.batch_id === id));
  },

  _formatCapacity(value) {
    return value != null ? Fmt.escape(String(value)) : '제한 없음';
  },

  _isApplyOpen(lecture) {
    const today = new Date().toISOString().slice(0, 10);
    const start = String(lecture.apply_start_date || '');
    const end = String(lecture.apply_end_date || '');
    return !!(start && end && start <= today && today <= end);
  },

  _statusLabel(status) {
    const text = String(status || '').trim().toLowerCase();
    if (text === 'approved') return { label: '입과 승인', className: 'tag-done' };
    if (text === 'pending') return { label: '신청 완료', className: 'tag-pending' };
    if (text === 'rejected') return { label: '반려됨', className: 'tag-rejected' };
    if (text === 'cancelled') return { label: '신청 취소', className: 'tag-cancelled' };
    return null;
  },

  async _renderList(el, params = {}) {
    const user = Auth.getUser();
    if (!user) {
      el.innerHTML = '<div class="error-state">로그인이 필요합니다.</div>';
      return;
    }
    const isAdmin = user.role === 'admin';
    const isParticipant = user.role === 'participant';
    el.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }
      const selectedBatchId = this._resolveBatchId(params, batches);
      State.set('currentBatchId', selectedBatchId);

      const lectures = await API.getLectures({
        batch_id: selectedBatchId,
        include_hidden: isAdmin,
      });

      el.innerHTML = `
        <div class="page-container course-registration-page">
          <section class="card cr-intro">
            <h1>수강신청</h1>
            <p class="hint">SSP+ 커리큘럼 소개</p>
            <p>
              AI 프로젝트 실무를 위한 핵심 강의를 차수별로 제공합니다.
              강의별 신청 기간과 정원을 확인한 뒤 팀 단위로 수강 신청할 수 있습니다.
            </p>
          </section>

          <section class="card cr-list-page">
            <div class="page-header">
              <div class="inline-actions">
                <label class="hint" for="cr-batch-select">차수</label>
                <select id="cr-batch-select">
                  ${batches.map((batch) => `<option value="${batch.batch_id}"${batch.batch_id === selectedBatchId ? ' selected' : ''}>${Fmt.escape(batch.batch_name)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="cr-list-grid">
              ${lectures.length
                ? lectures.map((lecture) => {
                    const myStatus = this._statusLabel(lecture.my_registration_status);
                    return `
                      <button class="cr-lecture-card" data-lecture-id="${lecture.lecture_id}">
                        <div class="cr-lecture-card-head">
                          <strong>${Fmt.escape(lecture.title)}</strong>
                          <span>${Fmt.date(lecture.start_datetime)} · ${Fmt.escape(lecture.location || '장소 미정')}</span>
                        </div>
                        <dl class="cr-lecture-card-metrics">
                          <div><dt>총 정원</dt><dd>${this._formatCapacity(lecture.capacity_total)}</dd></div>
                          <div><dt>팀별 정원</dt><dd>${this._formatCapacity(lecture.capacity_team)}</dd></div>
                          <div><dt>신청 인원</dt><dd>${Fmt.escape(String(lecture.registered_count || 0))}</dd></div>
                        </dl>
                        <div class="cr-card-tags">
                          ${this._isApplyOpen(lecture) ? '<span class="tag">신청 중</span>' : '<span class="tag tag-muted">신청 마감</span>'}
                          ${isParticipant
                            ? `<span class="tag ${myStatus ? myStatus.className : 'tag-muted'}">내 상태: ${myStatus ? myStatus.label : '미신청'}</span>`
                            : ''}
                        </div>
                      </button>
                    `;
                  }).join('')
                : '<p class="empty-state">해당 차수 강의가 없습니다.</p>'}
            </div>
          </section>
        </div>
      `;

      document.getElementById('cr-batch-select')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(nextBatchId)) {
          State.set('currentBatchId', nextBatchId);
          Router.go(this._buildListUrl(nextBatchId));
        }
      });

      el.querySelectorAll('.cr-lecture-card').forEach((card) => card.addEventListener('click', () => {
        const lectureId = Number.parseInt(card.dataset.lectureId, 10);
        if (!Number.isNaN(lectureId)) {
          Router.go(this._buildDetailUrl(selectedBatchId, lectureId));
        }
      }));
    } catch (err) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(err.message || '페이지를 불러올 수 없습니다.')}</div>`;
    }
  },

  async _renderDetail(el, params = {}) {
    const user = Auth.getUser();
    if (!user) {
      el.innerHTML = '<div class="error-state">로그인이 필요합니다.</div>';
      return;
    }
    const isAdmin = user.role === 'admin';
    const lectureId = Number.parseInt(params.lecture_id, 10);
    if (!Number.isInteger(lectureId)) {
      Router.go(this._buildListUrl(params.batch_id));
      return;
    }
    el.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }
      const detail = await API.getLectureDetail(lectureId);
      const defaultBatchId = Number.parseInt(params.batch_id, 10);
      const selectedBatchId = [defaultBatchId, detail?.lecture?.batch_id, batches[0]?.batch_id]
        .find((id) => Number.isInteger(id) && batches.some((row) => row.batch_id === id));
      State.set('currentBatchId', selectedBatchId);
      const myApproved = detail?.my_registration?.approval_status === 'approved';

      el.innerHTML = `
        <div class="page-container course-registration-page">
          <section class="card cr-content">
            <div class="page-header">
              <div class="inline-actions">
                <button id="cr-back-list-btn" class="btn btn-secondary">목록으로</button>
                <label class="hint" for="cr-detail-batch-select">차수</label>
                <select id="cr-detail-batch-select">
                  ${batches.map((batch) => `<option value="${batch.batch_id}"${batch.batch_id === selectedBatchId ? ' selected' : ''}>${Fmt.escape(batch.batch_name)}</option>`).join('')}
                </select>
              </div>
            </div>

            <section class="cr-detail">
              <div class="cr-detail-head">
                <div>
                  <h3>${Fmt.escape(detail.lecture.title)}</h3>
                  <p class="hint">강사: ${Fmt.escape(detail.lecture.instructor || '-')} · 장소: ${Fmt.escape(detail.lecture.location || '-')}</p>
                  <p class="hint">강의일정: ${Fmt.datetime(detail.lecture.start_datetime)} ~ ${Fmt.datetime(detail.lecture.end_datetime)}</p>
                  <p class="hint">신청기간: ${Fmt.escape(String(detail.lecture.apply_start_date))} ~ ${Fmt.escape(String(detail.lecture.apply_end_date))}</p>
                </div>
                ${myApproved ? '<span class="tag tag-done">입과 승인</span>' : ''}
              </div>
              <div class="cr-summary-grid">
                <div class="cr-summary-item">
                  <label>총 정원</label>
                  <strong>${this._formatCapacity(detail.lecture.capacity_total)}</strong>
                </div>
                <div class="cr-summary-item">
                  <label>팀별 정원</label>
                  <strong>${this._formatCapacity(detail.lecture.capacity_team)}</strong>
                </div>
                <div class="cr-summary-item">
                  <label>신청 인원</label>
                  <strong>${Fmt.escape(String(detail.lecture.registered_count || 0))}</strong>
                </div>
                <div class="cr-summary-item">
                  <label>승인 인원</label>
                  <strong>${Fmt.escape(String(detail.lecture.approved_count || 0))}</strong>
                </div>
              </div>
              <div class="cr-body">
                <h4>강의 소개</h4>
                <p>${Fmt.escape(detail.lecture.summary || detail.lecture.description || '강의 소개가 없습니다.')}</p>
                ${detail.lecture.description && detail.lecture.summary ? `<p>${Fmt.escape(detail.lecture.description)}</p>` : ''}
              </div>
              <div class="inline-actions">
                ${user.role === 'participant' && detail.can_register
                  ? `<button id="cr-apply-btn" class="btn btn-primary">${detail.my_registration ? '신청 수정' : '신청하기'}</button>`
                  : ''}
                ${user.role === 'participant' && detail.can_register && detail.my_registration
                  ? '<button id="cr-cancel-btn" class="btn btn-secondary">신청 취소</button>'
                  : ''}
                ${user.role === 'participant' && !detail.can_register
                  ? '<span class="hint">현재 신청 가능한 상태가 아닙니다.</span>'
                  : ''}
                ${!detail.can_register && isAdmin ? '<span class="hint">관리자 모드: 신청/취소 버튼 비활성</span>' : ''}
              </div>
            </section>
          </section>
        </div>
      `;

      document.getElementById('cr-back-list-btn')?.addEventListener('click', () => {
        Router.go(this._buildListUrl(selectedBatchId));
      });

      document.getElementById('cr-detail-batch-select')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(nextBatchId)) {
          State.set('currentBatchId', nextBatchId);
          Router.go(this._buildListUrl(nextBatchId));
        }
      });

      document.getElementById('cr-apply-btn')?.addEventListener('click', async () => {
        await this._openApplyModal({
          lecture: detail.lecture,
          candidateProjects: detail.candidate_projects || [],
          currentRegistration: detail.my_registration,
          onSaved: async () => {
            Router.go(this._buildDetailUrl(detail.lecture.batch_id, detail.lecture.lecture_id));
          },
        });
      });

      document.getElementById('cr-cancel-btn')?.addEventListener('click', async () => {
        if (!detail?.my_registration) return;
        if (!confirm('수강신청을 취소하시겠습니까?')) return;
        try {
          await API.cancelLectureRegistration(detail.lecture.lecture_id, detail.my_registration.project_id);
          Router.go(this._buildDetailUrl(detail.lecture.batch_id, detail.lecture.lecture_id));
        } catch (err) {
          alert(err.message || '신청 취소 실패');
        }
      });
    } catch (err) {
      el.innerHTML = `
        <div class="error-state">
          <p>오류: ${Fmt.escape(err.message || '강의 정보를 불러올 수 없습니다.')}</p>
          <button id="cr-fallback-list-btn" class="btn btn-secondary">강의 목록으로</button>
        </div>
      `;
      document.getElementById('cr-fallback-list-btn')?.addEventListener('click', () => {
        Router.go(this._buildListUrl(params.batch_id));
      });
    }
  },

  _membersForProject(projectId, candidateProjects) {
    const project = (candidateProjects || []).find((row) => Number(row.project_id) === Number(projectId));
    return project?.members || [];
  },

  async _openApplyModal({ lecture, candidateProjects, currentRegistration, onSaved }) {
    if (!candidateProjects.length) {
      alert('신청 가능한 과제가 없습니다.');
      return;
    }
    const initialProjectId = Number(currentRegistration?.project_id || candidateProjects[0].project_id);
    const initialMemberSet = new Set(currentRegistration?.member_user_ids || []);
    Modal.open(`
      <h2>수강신청</h2>
      <form id="cr-apply-form">
        <div class="form-group">
          <label>강의</label>
          <input value="${Fmt.escape(lecture.title)}" disabled />
        </div>
        <div class="form-group">
          <label>신청 과제 *</label>
          <select name="project_id" id="cr-apply-project">
            ${candidateProjects.map((project) => `<option value="${project.project_id}"${project.project_id === initialProjectId ? ' selected' : ''}>${Fmt.escape(project.project_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>팀원 선택 *</label>
          <div id="cr-member-list" class="cr-member-list"></div>
        </div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p id="cr-apply-err" class="form-error" style="display:none;"></p>
      </form>
    `);

    const memberListEl = document.getElementById('cr-member-list');
    const projectSelectEl = document.getElementById('cr-apply-project');
    const renderMembers = () => {
      const projectId = Number.parseInt(projectSelectEl?.value || '', 10);
      const members = this._membersForProject(projectId, candidateProjects);
      memberListEl.innerHTML = members.length
        ? members.map((member) => {
            const checked = currentRegistration && Number(currentRegistration.project_id) === projectId
              ? initialMemberSet.has(member.user_id)
              : false;
            return `
              <label class="cr-member-item">
                <input type="checkbox" name="member_user_ids" value="${member.user_id}"${checked ? ' checked' : ''} />
                <span>${Fmt.escape(member.user_name)}</span>
              </label>
            `;
          }).join('')
        : '<p class="empty-state compact">선택 가능한 팀원이 없습니다.</p>';
    };
    projectSelectEl?.addEventListener('change', renderMembers);
    renderMembers();

    document.getElementById('cr-apply-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const projectId = Number.parseInt(String(fd.get('project_id') || ''), 10);
      const memberUserIds = fd.getAll('member_user_ids')
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => !Number.isNaN(value));
      const errEl = document.getElementById('cr-apply-err');
      if (Number.isNaN(projectId)) {
        errEl.textContent = '신청 과제를 선택하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        await API.registerLecture(lecture.lecture_id, {
          project_id: projectId,
          member_user_ids: memberUserIds,
        });
        Modal.close();
        if (onSaved) await onSaved();
      } catch (err) {
        errEl.textContent = err.message || '수강신청 저장 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
