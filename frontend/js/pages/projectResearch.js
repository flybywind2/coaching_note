/**
 * [FEEDBACK7] 과제 조사 페이지 렌더링/상호작용 모듈입니다.
 */

Pages.projectResearch = {
  async render(el, params = {}) {
    const user = Auth.getUser();
    if (!user || user.role === 'observer') {
      el.innerHTML = '<div class="error-state">과제 조사 페이지 접근 권한이 없습니다.</div>';
      return;
    }
    const isAdmin = user.role === 'admin';
    const canManage = isAdmin;
    el.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const batches = await API.getProjectResearchBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">접근 가능한 차수가 없습니다.</div>';
        return;
      }
      const requestedBatchId = Number.parseInt(params.batch_id, 10);
      const stateBatchId = Number.parseInt(State.get('currentBatchId'), 10);
      const selectedBatchId = [requestedBatchId, stateBatchId, batches[0].batch_id]
        .find((id) => Number.isInteger(id) && batches.some((b) => b.batch_id === id));
      State.set('currentBatchId', selectedBatchId);

      const items = await API.getProjectResearchItems({
        batch_id: selectedBatchId,
        include_hidden: isAdmin,
      });
      const requestedItemId = Number.parseInt(params.item_id, 10);
      const selectedItem = [requestedItemId]
        .filter((v) => Number.isInteger(v))
        .map((v) => items.find((row) => row.item_id === v))
        .find(Boolean) || items[0] || null;
      const detail = selectedItem ? await API.getProjectResearchDetail(selectedItem.item_id) : null;

      const buildUrl = (batchId, itemId = null) => {
        const q = new URLSearchParams();
        if (batchId != null) q.set('batch_id', String(batchId));
        if (itemId != null) q.set('item_id', String(itemId));
        return `/project-research${q.toString() ? `?${q.toString()}` : ''}`;
      };

      const renderQuestionCell = (question, row) => {
        const value = row.answers?.[String(question.question_id)] || '';
        const editable = !!row.can_edit;
        if (!editable) return `<span>${Fmt.escape(value || '-')}</span>`;
        if (question.question_type === 'objective') {
          return `
            <select class="research-answer-input" data-question-id="${question.question_id}">
              <option value="">선택</option>
              ${(question.options || []).map((opt) => `<option value="${Fmt.escape(opt)}"${value === opt ? ' selected' : ''}>${Fmt.escape(opt)}</option>`).join('')}
            </select>
          `;
        }
        return `<input class="research-answer-input" data-question-id="${question.question_id}" value="${Fmt.escape(value)}" placeholder="답변 입력" />`;
      };

      el.innerHTML = `
        <div class="page-container research-page">
          <div class="page-header">
            <h1>과제 조사</h1>
            <div class="inline-actions">
              <label class="hint" for="research-batch-select">차수</label>
              <select id="research-batch-select">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === selectedBatchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
              ${canManage ? '<button id="research-add-item-btn" class="btn btn-secondary">조사 아이템 추가</button>' : ''}
            </div>
          </div>
          <div class="card research-board">
            <aside class="research-item-list">
              ${items.length
                ? items.map((item) => `
                    <button class="research-item-btn${selectedItem && item.item_id === selectedItem.item_id ? ' active' : ''}" data-item-id="${item.item_id}">
                      <strong>${Fmt.escape(item.title)}</strong>
                      <span>${Fmt.date(item.created_at)} ${item.is_visible ? '· 공개' : '· 비공개'}</span>
                    </button>
                  `).join('')
                : '<p class="empty-state">조사 아이템이 없습니다.</p>'}
            </aside>
            <section class="research-detail">
              ${detail ? `
                <div class="research-detail-head">
                  <div>
                    <h3>${Fmt.escape(detail.item.title)}</h3>
                    <p class="hint">조사기간: ${Fmt.escape(String(detail.item.start_date))} ~ ${Fmt.escape(String(detail.item.end_date))}</p>
                    <p>${Fmt.escape(detail.item.purpose || '조사 목적이 없습니다.')}</p>
                  </div>
                  ${canManage ? `
                    <div class="inline-actions">
                      <button id="research-edit-item-btn" class="btn btn-sm btn-secondary">수정</button>
                      <button id="research-toggle-item-btn" class="btn btn-sm btn-secondary">${detail.item.is_visible ? '비공개' : '공개'}</button>
                      <button id="research-delete-item-btn" class="btn btn-sm btn-danger">삭제</button>
                    </div>
                  ` : ''}
                </div>
                <div class="inline-actions mb">
                  ${canManage ? '<button id="research-add-question-btn" class="btn btn-sm btn-secondary">세부 항목 추가</button>' : ''}
                  ${detail.can_answer ? '<span class="hint">본인 과제 행에서 조사 항목을 입력한 뒤 저장하세요.</span>' : '<span class="hint">현재 응답 가능한 상태가 아닙니다.</span>'}
                </div>
                <div class="research-table-wrap">
                  <table class="data-table research-table">
                    <thead>
                      <tr>
                        <th style="width:210px;">과제명</th>
                        <th style="width:140px;">대표자</th>
                        ${(detail.questions || []).map((q) => `
                          <th>
                            <div class="research-q-head">
                              <span>${Fmt.escape(q.question_text)}</span>
                              <em>${q.question_type === 'objective' ? '객관식' : '주관식'}</em>
                            </div>
                            ${canManage
                              ? `<div class="inline-actions">
                                  <button class="btn btn-xs btn-secondary research-edit-question-btn" data-question-id="${q.question_id}">수정</button>
                                  <button class="btn btn-xs btn-danger research-del-question-btn" data-question-id="${q.question_id}">삭제</button>
                                </div>`
                              : ''}
                          </th>
                        `).join('')}
                        ${detail.can_answer ? '<th style="width:90px;">저장</th>' : ''}
                      </tr>
                    </thead>
                    <tbody>
                      ${(detail.rows || []).map((row) => `
                        <tr data-project-id="${row.project_id}" class="${row.is_my_project ? 'my-row' : ''}">
                          <td>${Fmt.escape(row.project_name)} ${row.is_my_project ? '<span class="tag">내 과제</span>' : ''}</td>
                          <td>${Fmt.escape(row.representative || '-')}</td>
                          ${(detail.questions || []).map((q) => `<td>${renderQuestionCell(q, row)}</td>`).join('')}
                          ${detail.can_answer
                            ? `<td>${row.can_edit ? '<button class="btn btn-xs btn-primary research-save-row-btn">저장</button>' : ''}</td>`
                            : ''}
                        </tr>
                      `).join('') || '<tr><td colspan="99" class="empty-state">표시할 과제가 없습니다.</td></tr>'}
                    </tbody>
                  </table>
                </div>
              ` : '<p class="empty-state">좌측에서 조사 아이템을 선택하세요.</p>'}
            </section>
          </div>
        </div>
      `;

      document.getElementById('research-batch-select')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(nextBatchId)) {
          State.set('currentBatchId', nextBatchId);
          Router.go(buildUrl(nextBatchId));
        }
      });

      el.querySelectorAll('.research-item-btn').forEach((btn) => btn.addEventListener('click', () => {
        const itemId = Number.parseInt(btn.dataset.itemId, 10);
        if (!Number.isNaN(itemId)) Router.go(buildUrl(selectedBatchId, itemId));
      }));

      document.getElementById('research-add-item-btn')?.addEventListener('click', async () => {
        await this._openItemModal({ batchId: selectedBatchId, onSaved: () => this.render(el, params) });
      });

      document.getElementById('research-edit-item-btn')?.addEventListener('click', async () => {
        if (!detail?.item) return;
        await this._openItemModal({ item: detail.item, batchId: selectedBatchId, onSaved: () => this.render(el, { ...params, item_id: detail.item.item_id }) });
      });

      document.getElementById('research-toggle-item-btn')?.addEventListener('click', async () => {
        if (!detail?.item) return;
        await API.updateProjectResearchItem(detail.item.item_id, { is_visible: !detail.item.is_visible });
        await this.render(el, { ...params, item_id: detail.item.item_id });
      });

      document.getElementById('research-delete-item-btn')?.addEventListener('click', async () => {
        if (!detail?.item) return;
        if (!confirm('조사 아이템을 삭제하시겠습니까?')) return;
        await API.deleteProjectResearchItem(detail.item.item_id);
        await this.render(el, { ...params, item_id: null });
      });

      document.getElementById('research-add-question-btn')?.addEventListener('click', async () => {
        if (!detail?.item) return;
        await this._openQuestionModal({
          itemId: detail.item.item_id,
          onSaved: () => this.render(el, { ...params, item_id: detail.item.item_id }),
        });
      });

      el.querySelectorAll('.research-edit-question-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const qid = Number.parseInt(btn.dataset.questionId, 10);
        const question = (detail?.questions || []).find((q) => q.question_id === qid);
        if (!question || !detail?.item) return;
        await this._openQuestionModal({
          itemId: detail.item.item_id,
          question,
          onSaved: () => this.render(el, { ...params, item_id: detail.item.item_id }),
        });
      }));

      el.querySelectorAll('.research-del-question-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const qid = Number.parseInt(btn.dataset.questionId, 10);
        if (Number.isNaN(qid) || !detail?.item) return;
        if (!confirm('문항을 삭제하시겠습니까?')) return;
        await API.deleteProjectResearchQuestion(qid);
        await this.render(el, { ...params, item_id: detail.item.item_id });
      }));

      el.querySelectorAll('.research-save-row-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const tr = btn.closest('tr[data-project-id]');
        const projectId = Number.parseInt(tr?.dataset.projectId || '', 10);
        if (Number.isNaN(projectId) || !detail?.item) return;
        const answers = Array.from(tr.querySelectorAll('.research-answer-input')).map((input) => ({
          question_id: Number.parseInt(input.dataset.questionId, 10),
          answer_text: String(input.value || '').trim(),
        })).filter((row) => Number.isInteger(row.question_id));
        try {
          await API.upsertProjectResearchResponses(detail.item.item_id, { project_id: projectId, answers });
          await this.render(el, { ...params, item_id: detail.item.item_id });
        } catch (err) {
          alert(err.message || '응답 저장 실패');
        }
      }));
    } catch (err) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(err.message || '페이지를 불러올 수 없습니다.')}</div>`;
    }
  },

  async _openItemModal({ item = null, batchId, onSaved }) {
    const isEdit = !!item;
    const todayIso = new Date().toISOString().slice(0, 10);
    Modal.open(`
      <h2>${isEdit ? '조사 아이템 수정' : '조사 아이템 추가'}</h2>
      <form id="research-item-form">
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(item?.title || '')}" /></div>
        <div class="form-group"><label>조사 목적</label><textarea name="purpose" rows="4">${Fmt.escape(item?.purpose || '')}</textarea></div>
        <div class="form-group"><label>시작일 *</label><input type="date" name="start_date" required value="${Fmt.escape(String(item?.start_date || todayIso))}" /></div>
        <div class="form-group"><label>종료일 *</label><input type="date" name="end_date" required value="${Fmt.escape(String(item?.end_date || todayIso))}" /></div>
        <div class="form-group">
          <label><input type="checkbox" name="is_visible" ${item?.is_visible ? 'checked' : ''} /> 공개</label>
        </div>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '생성'}</button>
        <p id="research-item-err" class="form-error" style="display:none;"></p>
      </form>
    `);

    document.getElementById('research-item-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        batch_id: batchId,
        title: String(fd.get('title') || '').trim(),
        purpose: String(fd.get('purpose') || '').trim(),
        start_date: String(fd.get('start_date') || ''),
        end_date: String(fd.get('end_date') || ''),
        is_visible: fd.get('is_visible') === 'on',
      };
      const errEl = document.getElementById('research-item-err');
      if (!payload.title || !payload.start_date || !payload.end_date) {
        errEl.textContent = '필수 값을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        if (isEdit) await API.updateProjectResearchItem(item.item_id, payload);
        else await API.createProjectResearchItem(payload);
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        errEl.textContent = err.message || '저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openQuestionModal({ itemId, question = null, onSaved }) {
    const isEdit = !!question;
    Modal.open(`
      <h2>${isEdit ? '세부 항목 수정' : '세부 항목 추가'}</h2>
      <form id="research-question-form">
        <div class="form-group"><label>항목명 *</label><input name="question_text" required value="${Fmt.escape(question?.question_text || '')}" /></div>
        <div class="form-group">
          <label>형태 *</label>
          <select name="question_type">
            <option value="subjective"${question?.question_type === 'subjective' ? ' selected' : ''}>주관식</option>
            <option value="objective"${question?.question_type === 'objective' ? ' selected' : ''}>객관식</option>
          </select>
        </div>
        <div class="form-group"><label>객관식 선택지(쉼표 구분)</label><input name="options_raw" value="${Fmt.escape((question?.options || []).join(', '))}" /></div>
        <div class="form-group"><label>정렬 순서</label><input type="number" min="1" name="display_order" value="${Fmt.escape(String(question?.display_order || 1))}" /></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '추가'}</button>
        <p id="research-question-err" class="form-error" style="display:none;"></p>
      </form>
    `);

    document.getElementById('research-question-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        question_text: String(fd.get('question_text') || '').trim(),
        question_type: String(fd.get('question_type') || 'subjective'),
        options: String(fd.get('options_raw') || '').split(',').map((v) => v.trim()).filter(Boolean),
        display_order: Number.parseInt(String(fd.get('display_order') || '1'), 10) || 1,
      };
      const errEl = document.getElementById('research-question-err');
      if (!payload.question_text) {
        errEl.textContent = '항목명을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        if (isEdit) await API.updateProjectResearchQuestion(question.question_id, payload);
        else await API.createProjectResearchQuestion(itemId, payload);
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        errEl.textContent = err.message || '저장 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
