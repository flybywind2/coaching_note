/**
 * Calendar 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.calendar = {
  currentDate: new Date(),
  viewMode: 'month',
  projectWise: false,

  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const isAdmin = user.role === 'admin';
      const batches = await API.getBatches();
      if (!batches.length) {
        el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>';
        return;
      }
      const batchId = State.get('currentBatchId') || batches[0].batch_id;

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>캘린더</h1>
            <div class="cal-controls">
              <select id="cal-batch">${batches.map((b) => `<option value="${b.batch_id}"${b.batch_id === batchId ? ' selected' : ''}>${Fmt.escape(b.batch_name)}</option>`).join('')}</select>
              <select id="cal-view-mode">
                <option value="month"${this.viewMode === 'month' ? ' selected' : ''}>월간</option>
                <option value="tenweeks"${this.viewMode === 'tenweeks' ? ' selected' : ''}>10주 마일스톤</option>
              </select>
              ${isAdmin ? `<label class="cal-project-wise"><input id="cal-project-wise" type="checkbox"${this.projectWise ? ' checked' : ''} /> 과제별 캘린더</label>` : ''}
              ${isAdmin ? '<button id="cal-add-event-btn" class="btn btn-sm btn-primary">+ 일정 추가</button>' : ''}
              <button id="cal-prev" class="btn btn-sm">◀</button>
              <span id="cal-month-label" class="cal-month"></span>
              <button id="cal-next" class="btn btn-sm">▶</button>
            </div>
          </div>
          <div id="cal-grid" class="cal-grid"></div>
          <div class="cal-legend">
            <span class="legend-item"><span class="dot" style="background:#4CAF50"></span>전체 일정</span>
            <span class="legend-item"><span class="dot" style="background:#2196F3"></span>코칭/과제 일정</span>
            <span class="legend-item"><span class="dot" style="background:#9C27B0"></span>마일스톤</span>
          </div>
        </div>`;

      const getBatchId = () => parseInt(document.getElementById('cal-batch').value, 10);

      document.getElementById('cal-prev').addEventListener('click', async () => {
        this._shiftWindow(-1);
        await this._renderView(getBatchId(), isAdmin);
      });
      document.getElementById('cal-next').addEventListener('click', async () => {
        this._shiftWindow(1);
        await this._renderView(getBatchId(), isAdmin);
      });
      document.getElementById('cal-batch').addEventListener('change', async (e) => {
        State.set('currentBatchId', parseInt(e.target.value, 10));
        await this._renderView(getBatchId(), isAdmin);
      });
      document.getElementById('cal-view-mode').addEventListener('change', async (e) => {
        this.viewMode = e.target.value;
        await this._renderView(getBatchId(), isAdmin);
      });
      document.getElementById('cal-project-wise')?.addEventListener('change', async (e) => {
        this.projectWise = e.target.checked;
        await this._renderView(getBatchId(), isAdmin);
      });
      document.getElementById('cal-add-event-btn')?.addEventListener('click', async () => {
        await this._openEventCreateModal(getBatchId());
      });

      await this._renderView(batchId, isAdmin);
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  _shiftWindow(step) {
    if (this.viewMode === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() + step);
      return;
    }
    this.currentDate.setDate(this.currentDate.getDate() + (step * 70));
  },

  _toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _parseDate(value) {
    const text = String(value).slice(0, 10);
    const [y, m, d] = text.split('-').map((v) => parseInt(v, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  },

  _startOfWeek(dateObj) {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const day = d.getDay();
    const diff = (day + 6) % 7; // Monday start
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  _formatRangeDate(d) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },

  _escapeAttr(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  },

  _eventChip(ev, maxLen = 18) {
    const payload = encodeURIComponent(JSON.stringify(ev));
    const title = Fmt.escape(ev.title || '이벤트');
    let label = (ev.title || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    if (ev.time_label) {
      label = `${ev.time_label} ${label}`;
    }
    if (!label) label = ev.title || '이벤트';
    return `<button type="button" class="cal-event cal-event-btn" data-event="${this._escapeAttr(payload)}" style="background:${ev.color}" title="${title}">${Fmt.escape(label.slice(0, maxLen))}</button>`;
  },

  async _renderView(batchId, isAdmin) {
    if (this.viewMode === 'tenweeks') {
      await this._renderTenWeeks(batchId);
      return;
    }
    await this._renderMonth(batchId, isAdmin);
  },

  async _renderMonth(batchId, isAdmin) {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    document.getElementById('cal-month-label').textContent = `${year}년 ${month + 1}월`;

    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const [calendarData, projects] = await Promise.all([
        API.getCalendar(batchId, start, end),
        API.getProjects(batchId).catch(() => []),
      ]);
      const events = calendarData.events || [];

      if (isAdmin && this.projectWise) {
        grid.innerHTML = this._renderProjectMonthCalendars(year, month, projects, events);
      } else {
        grid.innerHTML = this._renderMonthGrid(year, month, events);
      }
      this._bindEventDetailButtons(batchId, isAdmin);
    } catch (e) {
      grid.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`;
    }
  },

  _renderMonthGrid(year, month, events) {
    const eventsByDate = {};
    events.forEach((ev) => {
      const key = String(ev.start).slice(0, 10);
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push(ev);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const todayKey = this._toDateKey(new Date());

    let html = '<div class="cal-week-header">' + days.map((d) => `<div>${d}</div>`).join('') + '</div>';
    html += '<div class="cal-days">';
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = eventsByDate[dateStr] || [];
      const isToday = dateStr === todayKey;

      html += `<div class="cal-day${isToday ? ' today' : ''}">
        <span class="cal-day-num">${d}</span>
        ${dayEvents.slice(0, 3).map((ev) => this._eventChip(ev, 22)).join('')}
        ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3}</div>` : ''}
      </div>`;
    }
    html += '</div>';
    return html;
  },

  _renderProjectMonthCalendars(year, month, projects, events) {
    const projectEvents = events.filter((ev) => ev.project_id && ['milestone', 'session'].includes(ev.event_type));
    if (!projects.length) {
      return '<div class="empty-state">이 차수에 과제가 없습니다.</div>';
    }

    const byProjectDate = {};
    projectEvents.forEach((ev) => {
      const key = `${ev.project_id}|${String(ev.start).slice(0, 10)}`;
      if (!byProjectDate[key]) byProjectDate[key] = [];
      byProjectDate[key].push(ev);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const days = ['일', '월', '화', '수', '목', '금', '토'];

    return `<div class="project-cal-list">
      ${projects.map((p) => {
        let section = `<section class="project-cal-card">
          <header class="project-cal-header"><h3>${Fmt.escape(p.project_name)}</h3><span class="tag">${Fmt.escape(p.status || '-')}</span></header>
          <div class="cal-week-header mini">${days.map((d) => `<div>${d}</div>`).join('')}</div>
          <div class="cal-days mini">`;

        for (let i = 0; i < firstDay; i++) section += '<div class="cal-day mini empty"></div>';
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dayEvents = byProjectDate[`${p.project_id}|${dateStr}`] || [];
          section += `<div class="cal-day mini">
            <span class="cal-day-num">${d}</span>
            ${dayEvents.slice(0, 2).map((ev) => this._eventChip(ev, 16)).join('')}
            ${dayEvents.length > 2 ? `<div class="cal-more">+${dayEvents.length - 2}</div>` : ''}
          </div>`;
        }
        section += '</div></section>';
        return section;
      }).join('')}
    </div>`;
  },

  async _renderTenWeeks(batchId) {
    const startDate = this._startOfWeek(this.currentDate);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    endDate.setDate(endDate.getDate() + 69);
    document.getElementById('cal-month-label').textContent = `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')} ~ ${endDate.getFullYear()}.${String(endDate.getMonth() + 1).padStart(2, '0')}.${String(endDate.getDate()).padStart(2, '0')} (10주)`;

    const start = this._toDateKey(startDate);
    const end = this._toDateKey(endDate);
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const [calendarData, projects] = await Promise.all([
        API.getCalendar(batchId, start, end),
        API.getProjects(batchId).catch(() => []),
      ]);
      const milestones = (calendarData.events || []).filter((ev) => ev.event_type === 'milestone');

      const projectMap = {};
      const orderedProjectIds = [];
      projects.forEach((p) => {
        projectMap[p.project_id] = p.project_name;
        orderedProjectIds.push(p.project_id);
      });
      milestones.forEach((ev) => {
        if (!projectMap[ev.project_id]) {
          projectMap[ev.project_id] = ev.project_name || `프로젝트 ${ev.project_id}`;
          orderedProjectIds.push(ev.project_id);
        }
      });

      const weekStarts = Array.from({ length: 10 }, (_, i) => {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        d.setDate(d.getDate() + (i * 7));
        return d;
      });

      const cellMap = {};
      milestones.forEach((ev) => {
        const due = this._parseDate(ev.start);
        if (!due) return;
        const diffDays = Math.floor((due.getTime() - startDate.getTime()) / 86400000);
        const idx = Math.floor(diffDays / 7);
        if (idx < 0 || idx > 9) return;
        const key = `${ev.project_id}|${idx}`;
        if (!cellMap[key]) cellMap[key] = [];
        cellMap[key].push(ev);
      });

      if (!orderedProjectIds.length) {
        grid.innerHTML = '<div class="empty-state">표시할 과제가 없습니다.</div>';
        return;
      }

      grid.innerHTML = `<div class="tenweek-wrap">
        <table class="tenweek-table">
          <thead>
            <tr>
              <th class="project-col">과제</th>
              ${weekStarts.map((d, idx) => `<th>${idx + 1}주차<br><small>${this._formatRangeDate(d)}</small></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${orderedProjectIds.map((pid) => `<tr>
              <th class="project-col">${Fmt.escape(projectMap[pid] || `프로젝트 ${pid}`)}</th>
              ${weekStarts.map((_, idx) => {
                const items = cellMap[`${pid}|${idx}`] || [];
                return `<td>
                  ${items.slice(0, 3).map((ev) => `<div class="milestone-chip" title="${Fmt.escape(ev.title)}">${Fmt.escape(ev.title.replace(/^\[[^\]]+\]\s*/, '').slice(0, 24))}</div>`).join('')}
                  ${items.length > 3 ? `<div class="cal-more">+${items.length - 3}</div>` : ''}
                </td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    } catch (e) {
      grid.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`;
    }
  },

  _bindEventDetailButtons(batchId, isAdmin) {
    document.querySelectorAll('.cal-event-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        try {
          const raw = decodeURIComponent(btn.dataset.event || '');
          const event = JSON.parse(raw);
          this._openEventDetailModal(event, batchId, isAdmin);
        } catch (_) {
          // ignore malformed payload
        }
      });
    });
  },

  _buildRepeatingDates(baseDateStr, repeatType, repeatCount) {
    const count = Math.max(1, Math.min(30, Number.parseInt(repeatCount, 10) || 1));
    const base = new Date(`${baseDateStr}T00:00:00`);
    if (Number.isNaN(base.getTime())) return [];
    const dayStepMap = { none: 0, daily: 1, weekly: 7, biweekly: 14, monthly: 0 };
    const rows = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(base.getTime());
      if (repeatType === 'monthly') {
        d.setMonth(d.getMonth() + i);
      } else {
        d.setDate(d.getDate() + ((dayStepMap[repeatType] || 0) * i));
      }
      rows.push(this._toDateKey(d));
    }
    return rows;
  },

  _toDateTimeString(dateStr, timeStr) {
    if (!dateStr) return null;
    const safeTime = (timeStr || '00:00').slice(0, 5);
    return `${dateStr}T${safeTime}:00`;
  },

  _formatDateTimeValue(value) {
    if (!value) return '-';
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) {
      return direct.toLocaleString('ko-KR');
    }
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}T\d{4}$/.test(raw)) {
      const normalized = `${raw.slice(0, 10)}T${raw.slice(11, 13)}:${raw.slice(13, 15)}:00`;
      const normalizedDate = new Date(normalized);
      if (!Number.isNaN(normalizedDate.getTime())) {
        return normalizedDate.toLocaleString('ko-KR');
      }
      return normalized.replace('T', ' ');
    }
    return raw;
  },

  async _openEventCreateModal(batchId) {
    const [projects, users] = await Promise.all([
      API.getProjects(batchId).catch(() => []),
      API.getUsers().catch(() => []),
    ]);
    const coaches = users.filter((u) => u.role === 'coach' || u.role === 'admin');

    Modal.open(`<h2>일정 추가</h2>
      <form id="calendar-event-form">
        <div class="form-group">
          <label>일정 유형 *</label>
          <select name="scope" id="cal-event-scope">
            <option value="global">전체 일정 (모든 사용자 공개)</option>
            <option value="project">과제 특수 일정 (과제 단위 공개)</option>
          </select>
        </div>
        <div class="form-group">
          <label>제목 *</label>
          <input name="title" required placeholder="예: 중간 발표 리허설" />
        </div>
        <div class="form-group">
          <label>설명</label>
          <textarea name="description" rows="3" placeholder="필요 시 일정 설명을 입력하세요"></textarea>
        </div>
        <div class="form-group" id="cal-project-row" style="display:none;">
          <label>대상 과제 *</label>
          <select name="project_id">
            <option value="">선택</option>
            ${projects.map((p) => `<option value="${p.project_id}">${Fmt.escape(p.project_name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="cal-coach-row" style="display:none;">
          <label>참석 코치 (복수 선택)</label>
          <div class="cal-coach-grid">
            ${coaches.map((coach) => `<label><input type="checkbox" name="coach_ids" value="${coach.user_id}" /> ${Fmt.escape(coach.name)} (${Fmt.escape(coach.emp_id)})</label>`).join('') || '<p class="empty-state">선택 가능한 코치가 없습니다.</p>'}
          </div>
        </div>
        <div class="form-group">
          <label>일정 카테고리</label>
          <select name="schedule_type">
            <option value="orientation">오리엔테이션</option>
            <option value="workshop">워크샵</option>
            <option value="mid_presentation">중간발표</option>
            <option value="final_presentation">최종발표</option>
            <option value="networking">네트워킹</option>
            <option value="other" selected>기타</option>
          </select>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="is_all_day" /> 종일 일정</label>
        </div>
        <div class="form-group cal-time-row">
          <div>
            <label>날짜 *</label>
            <input type="date" name="event_date" required />
          </div>
          <div>
            <label>시작 시간 *</label>
            <input type="time" name="start_time" value="10:00" required />
          </div>
          <div>
            <label>종료 시간 *</label>
            <input type="time" name="end_time" value="11:00" required />
          </div>
        </div>
        <div class="form-group">
          <label>장소</label>
          <input name="location" placeholder="예: 회의실 A / 온라인" />
        </div>
        <div class="form-group cal-repeat-row">
          <div>
            <label>반복</label>
            <select name="repeat_type">
              <option value="none" selected>반복 없음</option>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="biweekly">격주</option>
              <option value="monthly">매월</option>
            </select>
          </div>
          <div>
            <label>반복 횟수</label>
            <input type="number" min="1" max="30" name="repeat_count" value="1" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">저장</button>
        <p class="form-error" id="calendar-event-err" style="display:none;"></p>
      </form>`, null, { className: 'modal-box-xl' });

    const scopeEl = document.getElementById('cal-event-scope');
    const projectRow = document.getElementById('cal-project-row');
    const coachRow = document.getElementById('cal-coach-row');
    const syncScope = () => {
      const isProject = scopeEl.value === 'project';
      projectRow.style.display = isProject ? '' : 'none';
      coachRow.style.display = isProject ? '' : 'none';
    };
    scopeEl.addEventListener('change', syncScope);
    syncScope();

    document.getElementById('calendar-event-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const scope = (fd.get('scope') || 'global').toString();
      const title = (fd.get('title') || '').toString().trim();
      const description = (fd.get('description') || '').toString().trim();
      const date = (fd.get('event_date') || '').toString();
      const startTime = (fd.get('start_time') || '').toString() || '00:00';
      const endTime = (fd.get('end_time') || '').toString() || startTime;
      const location = (fd.get('location') || '').toString().trim();
      const scheduleType = (fd.get('schedule_type') || 'other').toString();
      const repeatType = (fd.get('repeat_type') || 'none').toString();
      const repeatCount = (fd.get('repeat_count') || '1').toString();
      const isAllDay = fd.has('is_all_day');
      const projectId = Number.parseInt((fd.get('project_id') || '').toString(), 10);
      const coachIds = fd.getAll('coach_ids').map((v) => Number.parseInt(String(v), 10)).filter((v) => !Number.isNaN(v));

      const errEl = document.getElementById('calendar-event-err');
      errEl.style.display = 'none';

      if (!title || !date) {
        errEl.textContent = '제목과 날짜를 입력하세요.';
        errEl.style.display = 'block';
        return;
      }
      if (scope === 'project' && Number.isNaN(projectId)) {
        errEl.textContent = '대상 과제를 선택하세요.';
        errEl.style.display = 'block';
        return;
      }

      const dates = this._buildRepeatingDates(date, repeatType, repeatCount);
      if (!dates.length) {
        errEl.textContent = '반복 일정 계산에 실패했습니다.';
        errEl.style.display = 'block';
        return;
      }

      try {
        for (const dateStr of dates) {
          if (scope === 'global') {
            await API.createSchedule({
              batch_id: batchId,
              title,
              description: description || null,
              schedule_type: scheduleType,
              start_datetime: this._toDateTimeString(dateStr, isAllDay ? '00:00' : startTime),
              end_datetime: this._toDateTimeString(dateStr, isAllDay ? '23:59' : endTime),
              location: location || null,
              is_all_day: isAllDay,
            });
          } else {
            const createdSession = await API.createSession({
              batch_id: batchId,
              project_id: projectId,
              session_date: dateStr,
              start_time: isAllDay ? '00:00' : startTime,
              end_time: isAllDay ? '23:59' : endTime,
              location: location || null,
              note: title,
            });
            for (const coachId of coachIds) {
              await API.addSessionAttendee(createdSession.session_id, {
                user_id: coachId,
                attendee_role: 'coach',
              });
            }
          }
        }

        Modal.close();
        await this._renderView(batchId, true);
      } catch (err) {
        errEl.textContent = err.message || '일정 저장 실패';
        errEl.style.display = 'block';
      }
    });
  },

  _openEventDetailModal(event, batchId, isAdmin) {
    const coachLine = event.coach_names && event.coach_names.length
      ? event.coach_names.join(', ')
      : '-';
    const canDelete = isAdmin && (event.manage_type === 'schedule' || event.manage_type === 'session');

    Modal.open(`<h2>일정 상세</h2>
      <div class="info-grid">
        <div class="info-item full"><label>제목</label><span>${Fmt.escape(event.title || '-')}</span></div>
        <div class="info-item"><label>유형</label><span>${Fmt.escape(event.event_type || '-')}</span></div>
        <div class="info-item"><label>공개 범위</label><span>${Fmt.escape(event.scope || '-')}</span></div>
        <div class="info-item"><label>시작</label><span>${Fmt.escape(this._formatDateTimeValue(event.start))}</span></div>
        <div class="info-item"><label>종료</label><span>${Fmt.escape(this._formatDateTimeValue(event.end))}</span></div>
        <div class="info-item"><label>장소</label><span>${Fmt.escape(event.location || '-')}</span></div>
        <div class="info-item"><label>과제</label><span>${Fmt.escape(event.project_name || '-')}</span></div>
        <div class="info-item"><label>코치 배정</label><span>${Fmt.escape(coachLine)}</span></div>
        <div class="info-item full"><label>설명</label><span>${Fmt.escape(event.description || '-')}</span></div>
      </div>
      ${canDelete ? `<div class="page-actions"><button id="cal-delete-event-btn" class="btn btn-danger">일정 삭제</button></div>` : ''}`);

    document.getElementById('cal-delete-event-btn')?.addEventListener('click', async () => {
      if (!confirm('이 일정을 삭제하시겠습니까?')) return;
      try {
        if (event.manage_type === 'schedule') {
          await API.deleteSchedule(event.id);
        } else if (event.manage_type === 'session') {
          await API.deleteSession(event.id);
        }
        Modal.close();
        await this._renderView(batchId, isAdmin);
      } catch (err) {
        alert(err.message || '일정 삭제 실패');
      }
    });
  },
};
