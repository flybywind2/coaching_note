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
              ${isAdmin ? '<button id="about-edit-btn" class="btn btn-secondary">현재 탭 편집</button>' : ''}
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
};
