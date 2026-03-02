/**
 * [FEEDBACK7] 설문 페이지 렌더링/상호작용 모듈입니다.
 */

Pages.survey = {
  async render(el, params = {}) {
    const user = Auth.getUser();
    const isAdmin = user?.role === 'admin';
    const isCoach = !!(user && ['coach', 'internal_coach', 'external_coach'].includes(user.role));
    const isParticipant = user?.role === 'participant';
    if (!user || (!isAdmin && !isCoach && !isParticipant)) {
      el.innerHTML = '<div class="error-state">설문 페이지 접근 권한이 없습니다.</div>';
      return;
    }
    const mode = isAdmin
      ? (String(params.mode || '').toLowerCase() === 'result' ? 'result' : 'builder')
      : (isCoach ? 'result' : 'respond');
    el.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const batches = await API.getSurveyBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">접근 가능한 차수가 없습니다.</div>';
        return;
      }

      const requestedBatchId = Number.parseInt(params.batch_id, 10);
      const stateBatchId = Number.parseInt(State.get('currentBatchId'), 10);
      const selectedBatchId = [requestedBatchId, stateBatchId, batches[0].batch_id]
        .find((id) => Number.isInteger(id) && batches.some((b) => b.batch_id === id));
      State.set('currentBatchId', selectedBatchId);

      const surveys = await API.getSurveys({
        batch_id: selectedBatchId,
        include_hidden: isAdmin,
      });
      const requestedSurveyId = Number.parseInt(params.survey_id, 10);
      const selectedSurvey = [requestedSurveyId]
        .filter((v) => Number.isInteger(v))
        .map((v) => surveys.find((row) => row.survey_id === v))
        .find(Boolean) || surveys[0] || null;
      const detail = selectedSurvey ? await API.getSurveyDetail(selectedSurvey.survey_id) : null;

      const buildUrl = (batchId, surveyId = null, nextMode = mode) => {
        const q = new URLSearchParams();
        if (batchId != null) q.set('batch_id', String(batchId));
        if (surveyId != null) q.set('survey_id', String(surveyId));
        if (isAdmin) q.set('mode', nextMode === 'result' ? 'result' : 'builder');
        return `/survey${q.toString() ? `?${q.toString()}` : ''}`;
      };

      const showSurveyList = !isParticipant;
      const emptyText = (isAdmin || isCoach) ? '설문이 없습니다.' : '현재 진행중인 설문이 없습니다.';
      const stats = detail?.stats || null;
      const showManageActions = isAdmin && mode === 'builder';
      el.innerHTML = `
        <div class="page-container survey-page">
          <div class="page-header">
            <h1>설문</h1>
            <div class="inline-actions">
              <label class="hint" for="survey-batch-select">차수</label>
              <select id="survey-batch-select">
                ${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === selectedBatchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}
              </select>
              ${showManageActions ? '<button id="survey-add-btn" class="btn btn-secondary">설문 추가</button>' : ''}
            </div>
          </div>
          ${isAdmin ? `
            <div class="survey-mode-tabs">
              <button id="survey-mode-builder" class="btn btn-sm ${mode === 'builder' ? 'btn-primary' : 'btn-secondary'}">구성 화면</button>
              <button id="survey-mode-result" class="btn btn-sm ${mode === 'result' ? 'btn-primary' : 'btn-secondary'}">결과 화면</button>
            </div>
          ` : ''}
          <div class="card survey-board${showSurveyList ? '' : ' survey-board-respondent'}">
            ${showSurveyList ? `
              <aside class="survey-list">
                ${surveys.length
                  ? surveys.map((survey) => `
                      <button class="survey-item-btn${selectedSurvey && survey.survey_id === selectedSurvey.survey_id ? ' active' : ''}" data-survey-id="${survey.survey_id}">
                        <strong>${Fmt.escape(survey.title)}</strong>
                        <span>${Fmt.date(survey.created_at)} ${survey.is_visible ? '· 공개' : '· 비공개'}</span>
                      </button>
                    `).join('')
                  : `<p class="empty-state">${emptyText}</p>`}
              </aside>
            ` : ''}
            <section class="survey-detail">
              ${detail ? `
                <div class="survey-detail-head">
                  <div>
                    <h3>${Fmt.escape(detail.survey.title)}</h3>
                    <p class="hint">설문기간: ${Fmt.escape(String(detail.survey.start_date))} ~ ${Fmt.escape(String(detail.survey.end_date))}</p>
                    <p>${Fmt.escape(detail.survey.description || '설문 설명이 없습니다.')}</p>
                  </div>
                  ${showManageActions ? `
                    <div class="inline-actions">
                      <button id="survey-edit-btn" class="btn btn-sm btn-secondary">수정</button>
                      <button id="survey-toggle-btn" class="btn btn-sm btn-secondary">${detail.survey.is_visible ? '비공개' : '공개'}</button>
                      <button id="survey-delete-btn" class="btn btn-sm btn-danger">삭제</button>
                    </div>
                  ` : ''}
                </div>
                ${mode === 'builder' ? `
                  <div class="inline-actions mb">
                    <button id="survey-add-question-btn" class="btn btn-sm btn-secondary">질문 추가</button>
                    <button id="survey-reuse-question-btn" class="btn btn-sm btn-secondary">기존 질문 가져오기</button>
                  </div>
                  ${this._renderBuilderQuestionList(detail.questions || [], { isAdmin })}
                ` : ''}
                ${mode === 'result' ? `
                  <div class="inline-actions mb">
                    <button id="survey-export-btn" class="btn btn-sm btn-secondary">CSV 다운로드</button>
                    <span class="hint">제출완료(Summitted) 기준으로만 집계/표시됩니다.</span>
                  </div>
                  ${stats ? this._renderStats(stats) : ''}
                  ${this._renderResultTable(detail)}
                ` : ''}
                ${mode === 'respond' ? `
                  <div class="inline-actions mb">
                    ${detail.can_answer ? '<span class="hint">저장(초안) 후 제출하거나, 제출 후 취소할 수 있습니다.</span>' : '<span class="hint">현재 제출 가능한 설문이 아닙니다.</span>'}
                  </div>
                  ${this._renderRespondTable(detail, { isAdmin })}
                ` : ''}
              ` : `<p class="empty-state">${emptyText}</p>`}
            </section>
          </div>
        </div>
      `;

      document.getElementById('survey-batch-select')?.addEventListener('change', (e) => {
        const nextBatchId = Number.parseInt(e.target.value, 10);
        if (!Number.isNaN(nextBatchId)) {
          State.set('currentBatchId', nextBatchId);
          Router.go(buildUrl(nextBatchId, null, mode));
        }
      });

      document.getElementById('survey-mode-builder')?.addEventListener('click', () => {
        Router.go(buildUrl(selectedBatchId, detail?.survey?.survey_id || null, 'builder'));
      });
      document.getElementById('survey-mode-result')?.addEventListener('click', () => {
        Router.go(buildUrl(selectedBatchId, detail?.survey?.survey_id || null, 'result'));
      });

      el.querySelectorAll('.survey-item-btn').forEach((btn) => btn.addEventListener('click', () => {
        const surveyId = Number.parseInt(btn.dataset.surveyId, 10);
        if (!Number.isNaN(surveyId)) Router.go(buildUrl(selectedBatchId, surveyId, mode));
      }));

      document.getElementById('survey-add-btn')?.addEventListener('click', async () => {
        await this._openSurveyModal({
          batchId: selectedBatchId,
          onSaved: () => this.render(el, { ...params, mode }),
        });
      });
      document.getElementById('survey-edit-btn')?.addEventListener('click', async () => {
        if (!detail?.survey) return;
        await this._openSurveyModal({
          survey: detail.survey,
          batchId: selectedBatchId,
          onSaved: () => this.render(el, { ...params, mode, survey_id: detail.survey.survey_id }),
        });
      });
      document.getElementById('survey-toggle-btn')?.addEventListener('click', async () => {
        if (!detail?.survey) return;
        try {
          await API.updateSurvey(detail.survey.survey_id, { is_visible: !detail.survey.is_visible });
          await this.render(el, { ...params, mode, survey_id: detail.survey.survey_id });
        } catch (err) {
          alert(err.message || '공개 상태 변경 실패');
        }
      });
      document.getElementById('survey-delete-btn')?.addEventListener('click', async () => {
        if (!detail?.survey) return;
        if (!confirm('설문을 삭제하시겠습니까?')) return;
        await API.deleteSurvey(detail.survey.survey_id);
        await this.render(el, { ...params, mode, survey_id: null });
      });
      document.getElementById('survey-add-question-btn')?.addEventListener('click', async () => {
        if (!detail?.survey) return;
        await this._openQuestionModal({
          surveyId: detail.survey.survey_id,
          onSaved: () => this.render(el, { ...params, mode, survey_id: detail.survey.survey_id }),
        });
      });
      document.getElementById('survey-reuse-question-btn')?.addEventListener('click', async () => {
        if (!detail?.survey) return;
        await this._openQuestionReuseModal({
          batchId: selectedBatchId,
          surveyId: detail.survey.survey_id,
          existingQuestions: detail.questions || [],
          onSaved: () => this.render(el, { ...params, mode, survey_id: detail.survey.survey_id }),
        });
      });
      document.getElementById('survey-export-btn')?.addEventListener('click', async () => {
        if (!detail?.survey) return;
        await this._downloadCsv(detail.survey.survey_id);
      });

      el.querySelectorAll('.survey-edit-question-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const qid = Number.parseInt(btn.dataset.questionId, 10);
        const question = (detail?.questions || []).find((q) => q.question_id === qid);
        if (!question || !detail?.survey) return;
        await this._openQuestionModal({
          surveyId: detail.survey.survey_id,
          question,
          onSaved: () => this.render(el, { ...params, mode, survey_id: detail.survey.survey_id }),
        });
      }));

      el.querySelectorAll('.survey-del-question-btn').forEach((btn) => btn.addEventListener('click', async () => {
        const qid = Number.parseInt(btn.dataset.questionId, 10);
        if (Number.isNaN(qid) || !detail?.survey) return;
        if (!confirm('질문을 삭제하시겠습니까?')) return;
        await API.deleteSurveyQuestion(qid);
        await this.render(el, { ...params, mode, survey_id: detail.survey.survey_id });
      }));

      el.querySelectorAll('.survey-save-row-btn').forEach((btn) => btn.addEventListener('click', async () => {
        if (!detail?.survey) return;
        const tr = btn.closest('tr[data-project-id]');
        const projectId = Number.parseInt(tr?.dataset.projectId || '', 10);
        if (Number.isNaN(projectId) || !tr) return;
        const { answers } = this._collectRowAnswers(tr, detail.questions || []);
        this._highlightMissingQuestions(tr, []);
        try {
          await API.saveSurveyResponses(detail.survey.survey_id, { project_id: projectId, answers });
          await this.render(el, { ...params, mode, survey_id: detail.survey.survey_id });
        } catch (err) {
          alert(err.message || '설문 저장 실패');
        }
      }));

      el.querySelectorAll('.survey-submit-row-btn').forEach((btn) => btn.addEventListener('click', async () => {
        if (!detail?.survey) return;
        const tr = btn.closest('tr[data-project-id]');
        const projectId = Number.parseInt(tr?.dataset.projectId || '', 10);
        if (Number.isNaN(projectId) || !tr) return;
        const { answers, missingQuestionIds } = this._collectRowAnswers(tr, detail.questions || []);
        this._highlightMissingQuestions(tr, missingQuestionIds);
        if (missingQuestionIds.length) {
          alert('필수 문항을 모두 입력해야 제출할 수 있습니다.');
          return;
        }
        try {
          await API.submitSurveyResponses(detail.survey.survey_id, { project_id: projectId, answers });
          await this.render(el, { ...params, mode, survey_id: detail.survey.survey_id });
        } catch (err) {
          alert(err.message || '설문 제출 실패');
        }
      }));

      el.querySelectorAll('.survey-cancel-row-btn').forEach((btn) => btn.addEventListener('click', async () => {
        if (!detail?.survey) return;
        const tr = btn.closest('tr[data-project-id]');
        const projectId = Number.parseInt(tr?.dataset.projectId || '', 10);
        if (Number.isNaN(projectId)) return;
        if (!confirm('제출한 응답을 취소하시겠습니까?')) return;
        try {
          await API.cancelSurveyResponses(detail.survey.survey_id, projectId);
          await this.render(el, { ...params, mode, survey_id: detail.survey.survey_id });
        } catch (err) {
          alert(err.message || '제출 취소 실패');
        }
      }));
    } catch (err) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(err.message || '페이지를 불러올 수 없습니다.')}</div>`;
    }
  },

  _renderBuilderQuestionList(questions, { isAdmin = false } = {}) {
    if (!questions.length) return '<p class="empty-state">등록된 질문이 없습니다.</p>';
    return `
      <div class="survey-question-stack">
        ${questions.map((question) => `
          <div class="survey-question-item" data-question-id="${question.question_id}">
            <div class="survey-question-head">
              <div class="survey-q-head">
                <span>${Fmt.escape(question.question_text)}${question.is_required ? ' <em class="required-mark">*</em>' : ''}</span>
                <em>${this._questionTypeLabel(question)}</em>
              </div>
              ${isAdmin
                ? `<div class="inline-actions survey-question-tools">
                    <button class="btn btn-xs btn-secondary survey-edit-question-btn" data-question-id="${question.question_id}">수정</button>
                    <button class="btn btn-xs btn-danger survey-del-question-btn" data-question-id="${question.question_id}">삭제</button>
                  </div>`
                : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  _renderResultTable(detail) {
    return `
      <div class="survey-table-wrap">
        <table class="data-table survey-table">
          <thead>
            <tr>
              <th style="width:210px;">과제명</th>
              <th>질문 / 답변</th>
              <th style="width:120px;">상태</th>
            </tr>
          </thead>
          <tbody>
            ${(detail.rows || []).map((row) => `
              <tr data-project-id="${row.project_id}" class="${row.is_my_project ? 'my-row' : ''}">
                <td>${Fmt.escape(row.project_name)} ${row.is_my_project ? '<span class="tag">내 과제</span>' : ''}</td>
                <td class="survey-qa-col">${this._renderQuestionStack(detail.questions || [], row, { isAdmin: false })}</td>
                <td>${row.summitted ? '<span class="tag">제출완료</span>' : '<span class="hint">미제출</span>'}</td>
              </tr>
            `).join('') || '<tr><td colspan="99" class="empty-state">표시할 과제가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  _renderRespondTable(detail, { isAdmin = false } = {}) {
    return `
      <div class="survey-table-wrap">
        <table class="data-table survey-table">
          <thead>
            <tr>
              <th style="width:210px;">과제명</th>
              <th>질문 / 답변</th>
              <th style="width:180px;">상태/동작</th>
            </tr>
          </thead>
          <tbody>
            ${(detail.rows || []).map((row) => `
              <tr data-project-id="${row.project_id}" class="${row.is_my_project ? 'my-row' : ''}">
                <td>${Fmt.escape(row.project_name)} ${row.is_my_project ? '<span class="tag">내 과제</span>' : ''}</td>
                <td class="survey-qa-col">${this._renderQuestionStack(detail.questions || [], row, { isAdmin })}</td>
                <td>
                  <div class="survey-action-col">
                    ${row.summitted ? '<span class="tag">제출완료</span>' : '<span class="hint">저장중(미제출)</span>'}
                    ${row.can_edit ? '<button class="btn btn-xs btn-secondary survey-save-row-btn">저장</button>' : ''}
                    ${row.can_edit ? '<button class="btn btn-xs btn-primary survey-submit-row-btn">제출</button>' : ''}
                    ${row.can_cancel ? '<button class="btn btn-xs btn-secondary survey-cancel-row-btn">제출취소</button>' : ''}
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="99" class="empty-state">표시할 과제가 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  _questionTypeLabel(question) {
    if (question.question_type === 'subjective') return '주관식';
    if (question.question_type === 'objective_score') return '점수형';
    if (question.is_multi_select) return '항목형(복수)';
    return '항목형';
  },

  _renderQuestionStack(questions, row, { isAdmin = false } = {}) {
    if (!questions.length) return '<p class="empty-state compact">질문이 없습니다.</p>';
    return `
      <div class="survey-question-stack">
        ${questions.map((question) => `
          <div class="survey-question-item" data-question-id="${question.question_id}">
            <div class="survey-question-head">
              <div class="survey-q-head">
                <span>${Fmt.escape(question.question_text)}${question.is_required ? ' <em class="required-mark">*</em>' : ''}</span>
                <em>${this._questionTypeLabel(question)}</em>
              </div>
              ${isAdmin
                ? `<div class="inline-actions survey-question-tools">
                    <button class="btn btn-xs btn-secondary survey-edit-question-btn" data-question-id="${question.question_id}">수정</button>
                    <button class="btn btn-xs btn-danger survey-del-question-btn" data-question-id="${question.question_id}">삭제</button>
                  </div>`
                : ''}
            </div>
            <div class="survey-question-answer">
              ${this._renderAnswerField(question, row)}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  _renderAnswerField(question, row) {
    const qid = String(question.question_id);
    const editable = !!row.can_edit;
    const answerText = row.answers?.[qid] || '';
    const multiAnswers = row.multi_answers?.[qid] || [];
    if (!editable) {
      const viewText = question.is_multi_select
        ? (multiAnswers.length ? multiAnswers.join(', ') : '-')
        : (answerText || '-');
      return `<span class="survey-answer-view">${Fmt.escape(viewText)}</span>`;
    }
    if (question.question_type === 'subjective') {
      return `<input class="survey-answer-input" data-question-id="${qid}" value="${Fmt.escape(answerText)}" placeholder="답변 입력" />`;
    }
    if (question.is_multi_select) {
      return `
        <div class="survey-option-list">
          ${(question.options || []).map((opt) => `
            <label class="survey-option-item">
              <input type="checkbox" data-question-id="${qid}" data-option="${Fmt.escape(opt)}" value="${Fmt.escape(opt)}"${multiAnswers.includes(opt) ? ' checked' : ''} />
              <span>${Fmt.escape(opt)}</span>
            </label>
          `).join('')}
        </div>
      `;
    }
    return `
      <select class="survey-answer-input" data-question-id="${qid}">
        <option value="">선택</option>
        ${(question.options || []).map((opt) => `<option value="${Fmt.escape(opt)}"${answerText === opt ? ' selected' : ''}>${Fmt.escape(opt)}</option>`).join('')}
      </select>
    `;
  },

  _collectRowAnswers(tr, questions) {
    const answers = [];
    const missingQuestionIds = [];
    questions.forEach((question) => {
      const qid = Number.parseInt(question.question_id, 10);
      const item = tr.querySelector(`.survey-question-item[data-question-id="${qid}"]`);
      if (!item) return;
      const answer = { question_id: qid };
      let filled = false;
      if (question.question_type === 'subjective') {
        const input = item.querySelector('.survey-answer-input');
        const value = String(input?.value || '').trim();
        answer.answer_text = value;
        filled = !!value;
      } else if (question.is_multi_select) {
        const selectedOptions = Array.from(item.querySelectorAll('input[type="checkbox"]:checked'))
          .map((input) => String(input.value || '').trim())
          .filter(Boolean);
        answer.selected_options = selectedOptions;
        filled = selectedOptions.length > 0;
      } else {
        const select = item.querySelector('.survey-answer-input');
        const value = String(select?.value || '').trim();
        answer.answer_text = value;
        filled = !!value;
      }
      if (question.is_required && !filled) {
        missingQuestionIds.push(qid);
      }
      answers.push(answer);
    });
    return { answers, missingQuestionIds };
  },

  _highlightMissingQuestions(tr, questionIds) {
    tr.querySelectorAll('.survey-question-item[data-question-id]').forEach((item) => item.classList.remove('survey-required-missing'));
    questionIds.forEach((qid) => {
      tr.querySelector(`.survey-question-item[data-question-id="${qid}"]`)?.classList.add('survey-required-missing');
    });
  },

  _renderStats(stats) {
    return `
      <div class="survey-stats card">
        <h4>결과 요약</h4>
        <p class="hint">전체 점수형 평균: ${stats.overall_score_average == null ? '-' : Fmt.escape(String(stats.overall_score_average))}</p>
        <div class="survey-stats-table-wrap">
          <table class="data-table survey-stats-table">
            <thead>
              <tr>
                <th>과제명</th>
                <th>응답률(필수)</th>
                <th>점수형 평균</th>
              </tr>
            </thead>
            <tbody>
              ${stats.response_rates.map((rateRow) => {
                const avgRow = (stats.project_score_averages || []).find((r) => r.project_id === rateRow.project_id);
                const avgText = avgRow && avgRow.average_score != null ? String(avgRow.average_score) : '-';
                return `
                  <tr>
                    <td>${Fmt.escape(rateRow.project_name)}</td>
                    <td>${Fmt.escape(String(rateRow.response_rate))}% (${rateRow.answered_required}/${rateRow.required_question_count})</td>
                    <td>${Fmt.escape(avgText)}</td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="3" class="empty-state compact">집계 데이터가 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async _downloadCsv(surveyId) {
    try {
      const csvText = await API.downloadSurveyCsv(surveyId);
      const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `survey_${surveyId}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'CSV 다운로드 실패');
    }
  },

  async _openSurveyModal({ survey = null, batchId, onSaved }) {
    const isEdit = !!survey;
    const todayIso = new Date().toISOString().slice(0, 10);
    Modal.open(`
      <h2>${isEdit ? '설문 수정' : '설문 추가'}</h2>
      <form id="survey-form">
        <div class="form-group"><label>제목 *</label><input name="title" required value="${Fmt.escape(survey?.title || '')}" /></div>
        <div class="form-group"><label>설명</label><textarea name="description" rows="4">${Fmt.escape(survey?.description || '')}</textarea></div>
        <div class="form-group"><label>시작일 *</label><input type="date" name="start_date" required value="${Fmt.escape(String(survey?.start_date || todayIso))}" /></div>
        <div class="form-group"><label>종료일 *</label><input type="date" name="end_date" required value="${Fmt.escape(String(survey?.end_date || todayIso))}" /></div>
        <div class="form-group"><label><input type="checkbox" name="is_visible" ${survey?.is_visible ? 'checked' : ''} /> 공개</label></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '생성'}</button>
        <p id="survey-form-err" class="form-error" style="display:none;"></p>
      </form>
    `);
    document.getElementById('survey-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        batch_id: batchId,
        title: String(fd.get('title') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        start_date: String(fd.get('start_date') || ''),
        end_date: String(fd.get('end_date') || ''),
        is_visible: fd.get('is_visible') === 'on',
      };
      const errEl = document.getElementById('survey-form-err');
      if (!payload.title || !payload.start_date || !payload.end_date) {
        errEl.textContent = '필수 값을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        if (isEdit) await API.updateSurvey(survey.survey_id, payload);
        else await API.createSurvey(payload);
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        errEl.textContent = err.message || '저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openQuestionModal({ surveyId, question = null, onSaved }) {
    const isEdit = !!question;
    const typeValue = question?.question_type || 'subjective';
    Modal.open(`
      <h2>${isEdit ? '질문 수정' : '질문 추가'}</h2>
      <form id="survey-question-form">
        <div class="form-group"><label>질문 *</label><input name="question_text" required value="${Fmt.escape(question?.question_text || '')}" /></div>
        <div class="form-group">
          <label>질문 유형 *</label>
          <select name="question_type" id="survey-question-type">
            <option value="subjective"${typeValue === 'subjective' ? ' selected' : ''}>주관식</option>
            <option value="objective_choice"${typeValue === 'objective_choice' ? ' selected' : ''}>항목형</option>
            <option value="objective_score"${typeValue === 'objective_score' ? ' selected' : ''}>점수형</option>
          </select>
        </div>
        <div class="form-group"><label>선택지(쉼표 구분)</label><input name="options_raw" value="${Fmt.escape((question?.options || []).join(', '))}" /></div>
        <div class="form-group"><label><input type="checkbox" name="is_required" ${question?.is_required ? 'checked' : ''} /> 필수 문항</label></div>
        <div class="form-group"><label><input type="checkbox" name="is_multi_select" id="survey-question-multi" ${question?.is_multi_select ? 'checked' : ''} /> 항목형 복수 선택</label></div>
        <div class="form-group"><label>정렬 순서</label><input type="number" min="1" name="display_order" value="${Fmt.escape(String(question?.display_order || 1))}" /></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '저장' : '추가'}</button>
        <p id="survey-question-err" class="form-error" style="display:none;"></p>
      </form>
    `);
    const typeSelect = document.getElementById('survey-question-type');
    const multiCheckbox = document.getElementById('survey-question-multi');
    const syncMulti = () => {
      const isChoice = typeSelect?.value === 'objective_choice';
      if (!isChoice && multiCheckbox) {
        multiCheckbox.checked = false;
      }
      if (multiCheckbox) {
        multiCheckbox.disabled = !isChoice;
      }
    };
    syncMulti();
    typeSelect?.addEventListener('change', syncMulti);

    document.getElementById('survey-question-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        question_text: String(fd.get('question_text') || '').trim(),
        question_type: String(fd.get('question_type') || 'subjective'),
        is_required: fd.get('is_required') === 'on',
        is_multi_select: fd.get('is_multi_select') === 'on',
        options: String(fd.get('options_raw') || '').split(',').map((v) => v.trim()).filter(Boolean),
        display_order: Number.parseInt(String(fd.get('display_order') || '1'), 10) || 1,
      };
      const errEl = document.getElementById('survey-question-err');
      if (!payload.question_text) {
        errEl.textContent = '질문을 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      try {
        if (isEdit) await API.updateSurveyQuestion(question.question_id, payload);
        else await API.createSurveyQuestion(surveyId, payload);
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        errEl.textContent = err.message || '저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  async _openQuestionReuseModal({ batchId, surveyId, existingQuestions = [], onSaved }) {
    // [feedback8] 기존 질문 재활용 모달
    let bank = [];
    try {
      bank = await API.getSurveyQuestionBank(batchId);
    } catch (err) {
      alert(err.message || '질문 목록을 불러오지 못했습니다.');
      return;
    }
    const existingKeys = new Set(
      existingQuestions.map((q) => `${String(q.question_text || '').trim()}::${String(q.question_type || '').trim()}`)
    );
    const rows = (bank || []).filter((row) => {
      const key = `${String(row.question_text || '').trim()}::${String(row.question_type || '').trim()}`;
      return !existingKeys.has(key);
    });

    Modal.open(`
      <h2>기존 질문 가져오기</h2>
      <form id="survey-question-reuse-form">
        <div class="survey-reuse-list">
          ${rows.length
            ? rows.map((row) => `
                <label class="survey-reuse-item">
                  <input type="checkbox" name="question_ids" value="${row.question_id}" />
                  <div>
                    <strong>${Fmt.escape(row.question_text)}</strong>
                    <p class="hint">${Fmt.escape(row.survey_title)} · ${Fmt.escape(this._questionTypeLabel(row))}</p>
                  </div>
                </label>
              `).join('')
            : '<p class="empty-state">재활용 가능한 질문이 없습니다.</p>'}
        </div>
        <button type="submit" class="btn btn-primary">선택 질문 추가</button>
        <p id="survey-question-reuse-err" class="form-error" style="display:none;"></p>
      </form>
    `, null, { className: 'modal-box-xl' });

    document.getElementById('survey-question-reuse-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const selectedIds = fd.getAll('question_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));
      const errEl = document.getElementById('survey-question-reuse-err');
      if (!selectedIds.length) {
        errEl.textContent = '질문을 1개 이상 선택하세요.';
        errEl.style.display = 'block';
        return;
      }
      const selectedRows = rows.filter((row) => selectedIds.includes(Number.parseInt(String(row.question_id), 10)));
      let nextOrder = (existingQuestions || []).reduce((acc, row) => Math.max(acc, Number.parseInt(String(row.display_order || 0), 10) || 0), 0) + 1;
      try {
        for (const row of selectedRows) {
          await API.createSurveyQuestion(surveyId, {
            question_text: String(row.question_text || '').trim(),
            question_type: String(row.question_type || 'subjective'),
            is_required: !!row.is_required,
            is_multi_select: !!row.is_multi_select,
            options: Array.isArray(row.options) ? row.options : [],
            display_order: nextOrder,
          });
          nextOrder += 1;
        }
        Modal.close();
        if (onSaved) onSaved();
      } catch (err) {
        errEl.textContent = err.message || '질문 재활용 실패';
        errEl.style.display = 'block';
      }
    });
  },
};
