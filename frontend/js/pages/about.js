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

      const [introContent, coachContent, batches] = await Promise.all([
        API.getAboutContent('ssp_intro'),
        API.getAboutContent('coach_intro'),
        API.getBatches(),
      ]);

      const initialBatchId = params.batchId
        ? Number.parseInt(String(params.batchId), 10)
        : (batches[0]?.batch_id || null);

      const state = {
        tab: initialTab,
        intro: introContent,
        coach: coachContent,
        batches: Array.isArray(batches) ? batches : [],
        selectedBatchId: Number.isNaN(initialBatchId) ? (batches[0]?.batch_id || null) : initialBatchId,
        coaches: [],
      };

      const ensureCoachProfilesForOrdering = async () => {
        if (!isAdmin || !state.selectedBatchId) return;
        const missingProfiles = state.coaches.filter((coach) => !coach.coach_id && coach.user_id);
        if (!missingProfiles.length) return;

        let hasChanges = false;
        for (const coach of missingProfiles) {
          try {
            await API.createCoachProfile({
              user_id: coach.user_id,
              batch_id: state.selectedBatchId,
              name: coach.name,
              coach_type: coach.coach_type || 'internal',
              department: coach.department || null,
              affiliation: coach.affiliation || null,
              specialty: coach.specialty || null,
              career: coach.career || null,
              photo_url: coach.photo_url || null,
              is_visible: coach.is_visible !== false,
            });
            hasChanges = true;
          } catch (err) {
            const message = (err?.message || '').toString();
            if (message.includes('이미') || message.includes('duplicate')) continue;
            throw err;
          }
        }
        if (!hasChanges) return;
        state.coaches = await API.getCoachProfiles({
          batch_id: state.selectedBatchId,
          include_hidden: isAdmin,
        });
      };

      const loadCoachProfiles = async () => {
        if (!state.selectedBatchId) {
          state.coaches = [];
          return;
        }
        state.coaches = await API.getCoachProfiles({
          batch_id: state.selectedBatchId,
          include_hidden: isAdmin,
        });
        await ensureCoachProfilesForOrdering();
      };

      const renderCoachField = (label, value) => {
        const text = (value || '').toString().trim();
        if (!text) return '';
        return `<p><strong>${label}</strong> ${Fmt.escape(text)}</p>`;
      };

      const draw = () => {
        const isIntroTab = state.tab === 'intro';
        const current = isIntroTab ? state.intro : state.coach;
        const selectedBatchName = state.batches.find((b) => b.batch_id === state.selectedBatchId)?.batch_name || '';

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
                </div>
              ` : ''}
            </div>

            <section class="card about-content-card">
              <div class="rich-content">${Fmt.rich(current.content, '<p class="empty-state">콘텐츠가 없습니다.</p>')}</div>
              ${current.updated_at ? `<p class="hint mt">최종 수정: ${Fmt.datetime(current.updated_at)}</p>` : ''}
            </section>

            ${isIntroTab ? '' : `
              <section class="card about-coach-board">
                ${state.batches.length ? `
                  <div class="about-batch-tabs">
                    ${state.batches.map((b) => `<button class="about-batch-tab${b.batch_id === state.selectedBatchId ? ' active' : ''}" data-batch-id="${b.batch_id}">${Fmt.escape(b.batch_name)}</button>`).join('')}
                  </div>
                ` : '<p class="empty-state">차수 정보가 없습니다.</p>'}

                ${state.selectedBatchId ? `
                  <div class="about-coach-grid" id="about-coach-grid">
                    ${state.coaches.length ? state.coaches.map((coach) => {
                      const hasProfile = !!coach.coach_id;
                      const hiddenBadge = isAdmin && !coach.is_visible ? '<span class="tag tag-danger">숨김</span>' : '';
                      const dragHint = isAdmin && hasProfile ? '<span class="about-drag-hint">드래그 정렬</span>' : '';
                      return `
                        <article
                          class="about-coach-card${isAdmin && !coach.is_visible ? ' is-hidden' : ''}"
                          data-coach-id="${coach.coach_id || ''}"
                          draggable="${isAdmin && hasProfile ? 'true' : 'false'}"
                        >
                          <header class="about-coach-head">
                            <div>
                              <h3>${Fmt.escape(coach.name || '-')}</h3>
                              <div class="inline-actions">
                                <span class="tag">${Fmt.escape(coach.coach_type || 'internal')}</span>
                                ${hiddenBadge}
                                ${dragHint}
                              </div>
                            </div>
                            ${coach.photo_url ? `<img class="about-coach-photo" src="${Fmt.escape(coach.photo_url)}" alt="${Fmt.escape(coach.name || 'coach')}" />` : '<div class="about-coach-photo placeholder">사진</div>'}
                          </header>
                          <div class="about-coach-body">
                            ${renderCoachField('소속:', coach.affiliation || coach.department)}
                            ${renderCoachField('코칭 분야:', coach.specialty)}
                            ${renderCoachField('경력:', coach.career)}
                            ${!coach.affiliation && !coach.department && !coach.specialty && !coach.career ? '<p class="hint">등록된 상세 정보가 없습니다.</p>' : ''}
                          </div>
                          ${isAdmin ? `
                            <div class="page-actions">
                              <button class="btn btn-sm btn-secondary edit-coach-btn" data-coach-id="${coach.coach_id || ''}" data-user-id="${coach.user_id || ''}">편집</button>
                              <button class="btn btn-sm ${coach.is_visible ? 'btn-danger' : 'btn-secondary'} toggle-coach-btn" data-coach-id="${coach.coach_id || ''}" data-user-id="${coach.user_id || ''}" data-visible="${coach.is_visible ? '1' : '0'}">${coach.is_visible ? '숨김' : '표시'}</button>
                              ${coach.coach_id && !coach.user_id ? `<button class="btn btn-sm btn-danger delete-coach-btn" data-coach-id="${coach.coach_id}" data-coach-name="${Fmt.escape(coach.name || '')}">삭제</button>` : ''}
                            </div>
                          ` : ''}
                        </article>
                      `;
                    }).join('') : '<p class="empty-state">선택한 차수의 코치가 없습니다.</p>'}
                  </div>
                ` : '<p class="empty-state">차수를 선택하세요.</p>'}
                ${selectedBatchName ? `<p class="hint mt">현재 차수: ${Fmt.escape(selectedBatchName)}</p>` : ''}
              </section>
            `}
          </div>
        `;

        el.querySelectorAll('.tab-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            state.tab = btn.dataset.tab;
            if (state.tab === 'coach') {
              await loadCoachProfiles();
            }
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

        el.querySelectorAll('.about-batch-tab').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const batchId = Number.parseInt(btn.dataset.batchId, 10);
            if (Number.isNaN(batchId)) return;
            state.selectedBatchId = batchId;
            await loadCoachProfiles();
            draw();
          });
        });

        el.querySelectorAll('.edit-coach-btn').forEach((btn) => btn.addEventListener('click', async () => {
          const coachIdRaw = (btn.dataset.coachId || '').trim();
          const userIdRaw = (btn.dataset.userId || '').trim();
          const coachId = coachIdRaw ? Number.parseInt(coachIdRaw, 10) : null;
          const userId = userIdRaw ? Number.parseInt(userIdRaw, 10) : null;
          const coach = state.coaches.find((row) => {
            if (coachId) return row.coach_id === coachId;
            return userId && row.user_id === userId;
          });
          if (!coach) return;

          await this._openCoachModal({
            mode: coachId ? 'edit' : 'create',
            batchId: state.selectedBatchId,
            coach,
            onSaved: async () => {
              await loadCoachProfiles();
              draw();
            },
          });
        }));

        el.querySelectorAll('.toggle-coach-btn').forEach((btn) => btn.addEventListener('click', async () => {
          const coachIdRaw = (btn.dataset.coachId || '').trim();
          const userIdRaw = (btn.dataset.userId || '').trim();
          const coachId = coachIdRaw ? Number.parseInt(coachIdRaw, 10) : null;
          const userId = userIdRaw ? Number.parseInt(userIdRaw, 10) : null;
          const isVisible = btn.dataset.visible === '1';

          try {
            if (coachId) {
              await API.updateCoachProfile(coachId, { is_visible: !isVisible });
            } else {
              const base = state.coaches.find((row) => userId && row.user_id === userId);
              if (!base) return;
              await API.createCoachProfile({
                user_id: base.user_id,
                batch_id: state.selectedBatchId,
                name: base.name,
                coach_type: base.coach_type || 'internal',
                department: base.department || null,
                affiliation: base.affiliation || null,
                specialty: base.specialty || null,
                career: base.career || null,
                photo_url: base.photo_url || null,
                is_visible: !isVisible,
              });
            }
            await loadCoachProfiles();
            draw();
          } catch (err) {
            alert(err.message || '코치 표시 상태 변경 실패');
          }
        }));

        el.querySelectorAll('.delete-coach-btn').forEach((btn) => btn.addEventListener('click', async () => {
          const coachId = Number.parseInt(btn.dataset.coachId, 10);
          const coachName = btn.dataset.coachName || '선택한 코치';
          if (!coachId) return;
          if (!confirm(`${coachName} 코치 프로필을 삭제하시겠습니까?`)) return;
          try {
            await API.deleteCoachProfile(coachId);
            await loadCoachProfiles();
            draw();
          } catch (err) {
            alert(err.message || '코치 프로필 삭제 실패');
          }
        }));

        if (isAdmin) {
          const grid = document.getElementById('about-coach-grid');
          if (grid) {
            let draggedCoachId = null;

            const getOrderedCoachIds = () => (
              Array.from(grid.querySelectorAll('.about-coach-card[data-coach-id]'))
                .map((row) => Number.parseInt(row.dataset.coachId, 10))
                .filter((v) => !Number.isNaN(v))
            );

            grid.querySelectorAll('.about-coach-card[draggable="true"]').forEach((card) => {
              card.addEventListener('dragstart', (e) => {
                draggedCoachId = Number.parseInt(card.dataset.coachId, 10);
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(draggedCoachId || ''));
              });
              card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
              });
              card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
              });
              card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
              });
              card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const targetCoachId = Number.parseInt(card.dataset.coachId, 10);
                if (!draggedCoachId || !targetCoachId || draggedCoachId === targetCoachId) return;

                const order = getOrderedCoachIds();
                const from = order.indexOf(draggedCoachId);
                const to = order.indexOf(targetCoachId);
                if (from < 0 || to < 0) return;
                order.splice(to, 0, order.splice(from, 1)[0]);

                try {
                  await API.reorderCoachProfiles({
                    batch_id: state.selectedBatchId,
                    coach_ids: order,
                  });
                  await loadCoachProfiles();
                  draw();
                } catch (err) {
                  alert(err.message || '코치 순서 저장 실패');
                }
              });
            });
          }
        }
      };

      if (state.tab === 'coach') {
        await loadCoachProfiles();
      }
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
      onFileUpload: (file) => API.uploadEditorFile(file, { scope: 'about' }),
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

  async _openCoachModal({ mode, batchId, coach = null, onSaved }) {
    const isEdit = mode === 'edit';
    Modal.open(`<h2>${isEdit ? '코치 프로필 편집' : '코치 프로필 등록'}</h2>
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
        <div class="form-group"><label>코칭 분야</label><input name="specialty" value="${Fmt.escape(coach?.specialty || '')}" /></div>
        <div class="form-group"><label>경력</label><textarea name="career" rows="4">${Fmt.escape(coach?.career || '')}</textarea></div>
        <div class="form-group">
          <label>코치 사진</label>
          <div class="coach-photo-upload-tools">
            <input id="coach-photo-file" type="file" accept="image/*" />
            <button type="button" class="btn btn-sm btn-secondary" id="coach-photo-remove-btn">사진 제거</button>
          </div>
          <div class="coach-photo-paste-zone" id="coach-photo-paste-zone" tabindex="0">
            이미지를 붙여넣기(Ctrl+V) 하거나 파일 선택으로 업로드하세요.
          </div>
          <p class="hint" id="coach-photo-status"></p>
          <input type="hidden" name="photo_url" value="${Fmt.escape(coach?.photo_url || '')}" />
          <div class="coach-photo-preview-wrap">
            ${coach?.photo_url
              ? `<img id="coach-photo-preview" class="coach-photo-preview" src="${Fmt.escape(coach.photo_url)}" alt="${Fmt.escape(coach?.name || 'coach')}" />`
              : '<div id="coach-photo-empty" class="coach-photo-preview-empty">사진 미리보기 없음</div>'}
          </div>
        </div>
        <div class="form-group"><label><input type="checkbox" name="is_visible"${coach?.is_visible !== false ? ' checked' : ''} /> 공개 상태</label></div>
        <p class="hint">차수 ID: ${Fmt.escape(String(batchId || '-'))}</p>
        <div class="page-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '등록'}</button>
        </div>
        <p class="form-error" id="coach-profile-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const formEl = document.getElementById('coach-profile-form');
    const fileInput = document.getElementById('coach-photo-file');
    const removePhotoBtn = document.getElementById('coach-photo-remove-btn');
    const pasteZone = document.getElementById('coach-photo-paste-zone');
    const statusEl = document.getElementById('coach-photo-status');
    const photoUrlInput = formEl?.querySelector('input[name="photo_url"]');
    let previewEl = document.getElementById('coach-photo-preview');
    let emptyPreviewEl = document.getElementById('coach-photo-empty');

    const setPhotoStatus = (message, isError = false) => {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.style.color = isError ? '#b12030' : '';
    };
    const renderPhotoPreview = (url) => {
      const previewWrap = formEl?.querySelector('.coach-photo-preview-wrap');
      if (!previewWrap) return;
      const safeUrl = (url || '').toString().trim();
      if (!safeUrl) {
        previewWrap.innerHTML = '<div id="coach-photo-empty" class="coach-photo-preview-empty">사진 미리보기 없음</div>';
        previewEl = null;
        emptyPreviewEl = document.getElementById('coach-photo-empty');
        return;
      }
      previewWrap.innerHTML = `<img id="coach-photo-preview" class="coach-photo-preview" src="${Fmt.escape(safeUrl)}" alt="${Fmt.escape((coach?.name || 'coach').toString())}" />`;
      previewEl = document.getElementById('coach-photo-preview');
      emptyPreviewEl = null;
    };
    const uploadCoachPhoto = async (file) => {
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        setPhotoStatus('이미지 파일만 업로드할 수 있습니다.', true);
        return;
      }
      setPhotoStatus('사진 업로드 중...');
      try {
        const uploaded = await API.uploadEditorImage(file, { scope: 'about' });
        if (!uploaded?.url) throw new Error('사진 업로드 응답이 올바르지 않습니다.');
        if (photoUrlInput) photoUrlInput.value = uploaded.url;
        renderPhotoPreview(uploaded.url);
        setPhotoStatus('사진 업로드가 완료되었습니다.');
      } catch (err) {
        setPhotoStatus(err.message || '사진 업로드 실패', true);
      }
    };

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      await uploadCoachPhoto(file);
      fileInput.value = '';
    });
    removePhotoBtn?.addEventListener('click', () => {
      if (photoUrlInput) photoUrlInput.value = '';
      renderPhotoPreview('');
      setPhotoStatus('사진을 제거했습니다.');
    });
    pasteZone?.addEventListener('paste', async (e) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type && item.type.startsWith('image/'));
      if (!imageItem) return;
      e.preventDefault();
      const file = imageItem.getAsFile();
      await uploadCoachPhoto(file);
    });
    pasteZone?.addEventListener('click', () => fileInput?.click());
    pasteZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      pasteZone.classList.add('drag-over');
    });
    pasteZone?.addEventListener('dragleave', () => {
      pasteZone.classList.remove('drag-over');
    });
    pasteZone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      pasteZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      await uploadCoachPhoto(file);
    });
    if (previewEl || emptyPreviewEl) {
      setPhotoStatus('이미지 파일 선택 또는 붙여넣기로 사진을 등록하세요.');
    }

    document.getElementById('coach-profile-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        user_id: coach?.user_id || null,
        batch_id: batchId,
        name: (fd.get('name') || '').toString().trim() || null,
        coach_type: (fd.get('coach_type') || 'internal').toString(),
        department: (fd.get('department') || '').toString().trim() || null,
        affiliation: (fd.get('affiliation') || '').toString().trim() || null,
        specialty: (fd.get('specialty') || '').toString().trim() || null,
        career: (fd.get('career') || '').toString().trim() || null,
        photo_url: (fd.get('photo_url') || '').toString().trim() || null,
        is_visible: fd.has('is_visible'),
      };

      try {
        if (isEdit && coach?.coach_id) {
          await API.updateCoachProfile(coach.coach_id, payload);
        } else {
          await API.createCoachProfile(payload);
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        const errEl = document.getElementById('coach-profile-err');
        errEl.textContent = err.message || `코치 프로필 ${isEdit ? '저장' : '등록'} 실패`;
        errEl.style.display = 'block';
      }
    });
  },
};
