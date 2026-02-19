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
              <button id="cal-prev" class="btn btn-sm">◀</button>
              <span id="cal-month-label" class="cal-month"></span>
              <button id="cal-next" class="btn btn-sm">▶</button>
            </div>
          </div>
          <div id="cal-grid" class="cal-grid"></div>
          <div class="cal-legend">
            <span class="legend-item"><span class="dot" style="background:#4CAF50"></span>프로그램</span>
            <span class="legend-item"><span class="dot" style="background:#2196F3"></span>코칭 세션</span>
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
        return;
      }
      grid.innerHTML = this._renderMonthGrid(year, month, events);
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
        ${dayEvents.slice(0, 3).map((ev) => `<div class="cal-event" style="background:${ev.color}" title="${Fmt.escape(ev.title)}">${Fmt.escape(ev.title.slice(0, 18))}</div>`).join('')}
        ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3}</div>` : ''}
      </div>`;
    }
    html += '</div>';
    return html;
  },

  _renderProjectMonthCalendars(year, month, projects, events) {
    const milestones = events.filter((ev) => ev.event_type === 'milestone');
    if (!projects.length) {
      return '<div class="empty-state">이 차수에 과제가 없습니다.</div>';
    }

    const byProjectDate = {};
    milestones.forEach((ev) => {
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
            ${dayEvents.slice(0, 2).map((ev) => `<div class="cal-event" style="background:${ev.color}" title="${Fmt.escape(ev.title)}">${Fmt.escape(ev.title.slice(0, 14))}</div>`).join('')}
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
};
