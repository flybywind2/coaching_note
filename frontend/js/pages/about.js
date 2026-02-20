/**
 * SSP+ 소개 페이지 렌더링과 콘텐츠 편집을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.about = {
  async render(el, params = {}) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const isAdmin = user.role === 'admin';
      const initialTab = params.tab === 'coach' ? 'coach' : 'intro';

      const [introContent, coachContent, coaches] = await Promise.all([
        API.getAboutContent('ssp_intro'),
        API.getAboutContent('coach_intro'),
        API.getCoachProfiles(),
      ]);

      const state = {
        tab: initialTab,
        intro: introContent,
        coach: coachContent,
        coaches: Array.isArray(coaches) ? coaches : [],
      };
      const reloadCoachProfiles = async () => {
        state.coaches = await API.getCoachProfiles();
      };

      const draw = () => {
        const isIntroTab = state.tab === 'intro';
        const current = isIntroTab ? state.intro : state.coach;
        el.innerHTML = `
          <div class="page-container about-page">
            <div class="page-header">
              <h1>SSP+ 소개</h1>
              <p class="search-sub">프로그램 개요와 코치진 정보를 확인할 수 있습니다.</p>
              <div class="tabs">
                <button class="tab-btn${isIntroTab ? ' active' : ''}" data-tab="intro">SSP+ 소개</button>
                <button class="tab-btn${!isIntroTab ? ' active' : ''}" data-tab="coach">코치 소개</button>
              </div>
              ${isAdmin ? `
                <div class="inline-actions">
                  <button id="about-edit-btn" class="btn btn-secondary">현재 탭 편집</button>
                  ${isIntroTab ? '' : '<button id="coach-add-btn" class="btn btn-primary">+ 코치 추가</button>'}
                </div>
              ` : ''}
            </div>

            <section class="card about-content-card">
              <div class="rich-content">${Fmt.rich(current.content, '<p class="empty-state">콘텐츠가 없습니다.</p>')}</div>
              ${current.updated_at ? `<p class="hint mt">최종 수정: ${Fmt.datetime(current.updated_at)}</p>` : ''}
            </section>

            ${isIntroTab ? '' : `
              <section class="about-coach-grid">
                ${state.coaches.length ? state.coaches.map((coach) => `
                  <article class="about-coach-card">
                    <header class="about-coach-head">
                      <h3>${Fmt.escape(coach.name)}</h3>
                      <span class="tag">${Fmt.escape(coach.coach_type || 'internal')}</span>
                    </header>
                    <p><strong>소속:</strong> ${Fmt.escape(coach.affiliation || coach.department || '-')}</p>
                    <p><strong>전문분야:</strong> ${Fmt.escape(coach.specialty || '-')}</p>
                    <p><strong>경력:</strong> ${Fmt.escape(coach.career || '-')}</p>
                    ${isAdmin ? `
                      <div class="page-actions">
                        <button class="btn btn-sm btn-secondary edit-coach-btn" data-coach-id="${coach.coach_id || ''}">편집</button>
                        ${coach.coach_id ? `<button class="btn btn-sm btn-danger delete-coach-btn" data-coach-id="${coach.coach_id}" data-coach-name="${Fmt.escape(coach.name)}">삭제</button>` : ''}
                      </div>
                    ` : ''}
                  </article>
                `).join('') : '<p class="empty-state">등록된 코치 정보가 없습니다.</p>'}
              </section>
            `}
          </div>
        `;

        el.querySelectorAll('.tab-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            state.tab = btn.dataset.tab;
            draw();
          });
        });

        document.getElementById('about-edit-btn')?.addEventListener('click', async () => {
          await this._openEditModal({
            key: state.tab === 'intro' ? 'ssp_intro' : 'coach_intro',
            content: state.tab === 'intro' ? state.intro : state.coach,
            onSaved: async () => {
              if (state.tab === 'intro') {
                state.intro = await API.getAboutContent('ssp_intro');
              } else {
                state.coach = await API.getAboutContent('coach_intro');
              }
              draw();
            },
          });
        });

        document.getElementById('coach-add-btn')?.addEventListener('click', async () => {
          await this._openCoachModal({
            mode: 'create',
            onSaved: async () => {
              await reloadCoachProfiles();
              draw();
            },
          });
        });

        el.querySelectorAll('.edit-coach-btn').forEach((btn) => btn.addEventListener('click', async () => {
          const coachIdRaw = (btn.dataset.coachId || '').trim();
          const coachId = coachIdRaw ? parseInt(coachIdRaw, 10) : null;
          if (!coachId) {
            alert('기본 코치 사용자(프로필 미등록)는 편집 전에 코치 추가로 등록해주세요.');
            return;
          }
          const coach = state.coaches.find((row) => row.coach_id === coachId);
          if (!coach) return;
          await this._openCoachModal({
            mode: 'edit',
            coach,
            onSaved: async () => {
              await reloadCoachProfiles();
              draw();
            },
          });
        }));

        el.querySelectorAll('.delete-coach-btn').forEach((btn) => btn.addEventListener('click', async () => {
          const coachId = parseInt(btn.dataset.coachId, 10);
          const coachName = btn.dataset.coachName || '선택한 코치';
          if (!coachId) return;
          if (!confirm(`${coachName} 코치 프로필을 삭제하시겠습니까?`)) return;
          try {
            await API.deleteCoachProfile(coachId);
            await reloadCoachProfiles();
            draw();
          } catch (err) {
            alert(err.message || '코치 프로필 삭제 실패');
          }
        }));
      };

      draw();
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async _openEditModal({ key, content, onSaved }) {
    Modal.open(`<h2>소개 콘텐츠 편집</h2>
      <form id="about-edit-form">
        <div id="about-editor-wrap"></div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">저장</button>
        </div>
        <p class="form-error" id="about-edit-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const editor = RichEditor.create(document.getElementById('about-editor-wrap'), {
      initialHTML: content.content || '',
      placeholder: '소개 콘텐츠를 입력하세요. 이미지/표 삽입이 가능합니다.',
      onImageUpload: (file) => API.uploadEditorImage(file, { scope: 'about' }),
    });

    document.getElementById('about-edit-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (editor.isEmpty()) {
        const errEl = document.getElementById('about-edit-err');
        errEl.textContent = '내용을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        await API.updateAboutContent(key, { content: editor.getSanitizedHTML() });
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('about-edit-err');
        errEl.textContent = err.message || '저장에 실패했습니다.';
        errEl.style.display = 'block';
      }
    });
  },

  async _openCoachModal({ mode, coach = null, onSaved }) {
    const isEdit = mode === 'edit';
    Modal.open(`<h2>${isEdit ? '코치 프로필 편집' : '코치 프로필 추가'}</h2>
      <form id="coach-profile-form">
        <div class="form-group"><label>이름 *</label><input name="name" required value="${Fmt.escape(coach?.name || '')}" /></div>
        <div class="form-group">
          <label>코치 타입</label>
          <select name="coach_type">
            <option value="internal"${(coach?.coach_type || 'internal') === 'internal' ? ' selected' : ''}>internal</option>
            <option value="external"${(coach?.coach_type || 'internal') === 'external' ? ' selected' : ''}>external</option>
          </select>
        </div>
        <div class="form-group"><label>부서</label><input name="department" value="${Fmt.escape(coach?.department || '')}" /></div>
        <div class="form-group"><label>소속</label><input name="affiliation" value="${Fmt.escape(coach?.affiliation || '')}" /></div>
        <div class="form-group"><label>전문분야</label><input name="specialty" value="${Fmt.escape(coach?.specialty || '')}" /></div>
        <div class="form-group"><label>경력</label><textarea name="career" rows="4">${Fmt.escape(coach?.career || '')}</textarea></div>
        <div class="form-group"><label>사진 URL</label><input name="photo_url" value="${Fmt.escape(coach?.photo_url || '')}" /></div>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '추가'}</button>
        </div>
        <p class="form-error" id="coach-profile-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    document.getElementById('coach-profile-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: (fd.get('name') || '').toString().trim() || null,
        coach_type: (fd.get('coach_type') || 'internal').toString(),
        department: (fd.get('department') || '').toString().trim() || null,
        affiliation: (fd.get('affiliation') || '').toString().trim() || null,
        specialty: (fd.get('specialty') || '').toString().trim() || null,
        career: (fd.get('career') || '').toString().trim() || null,
        photo_url: (fd.get('photo_url') || '').toString().trim() || null,
      };

      try {
        if (isEdit) {
          await API.updateCoachProfile(coach.coach_id, payload);
        } else {
          await API.createCoachProfile(payload);
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('coach-profile-err');
        errEl.textContent = err.message || `코치 프로필 ${isEdit ? '저장' : '추가'} 실패`;
        errEl.style.display = 'block';
      }
    });
  },
};
