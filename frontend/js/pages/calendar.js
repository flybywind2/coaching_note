Pages.calendar = {
  currentDate: new Date(),

  async render(el, params) {
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const batches = await API.getBatches();
      if (!batches.length) { el.innerHTML = '<div class="empty-state">차수가 없습니다.</div>'; return; }
      const batchId = State.get('currentBatchId') || batches[0].batch_id;

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <h1>캘린더</h1>
            <div class="cal-controls">
              <select id="cal-batch">${batches.map(b => `<option value="${b.batch_id}"${b.batch_id===batchId?' selected':''}>${Fmt.escape(b.batch_name)}</option>`).join('')}</select>
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

      document.getElementById('cal-prev').addEventListener('click', () => { this.currentDate.setMonth(this.currentDate.getMonth()-1); this._renderMonth(batchId); });
      document.getElementById('cal-next').addEventListener('click', () => { this.currentDate.setMonth(this.currentDate.getMonth()+1); this._renderMonth(batchId); });
      document.getElementById('cal-batch').addEventListener('change', (e) => { State.set('currentBatchId', parseInt(e.target.value)); this._renderMonth(parseInt(e.target.value)); });

      this._renderMonth(batchId);
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async _renderMonth(batchId) {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    document.getElementById('cal-month-label').textContent = `${year}년 ${month+1}월`;

    const start = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month+1, 0).getDate();
    const end = `${year}-${String(month+1).padStart(2,'0')}-${lastDay}`;

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '<div class="loading">로딩 중...</div>';

    try {
      const { events } = await API.getCalendar(batchId, start, end);
      const eventsByDate = {};
      events.forEach(ev => {
        const d = ev.start.slice(0, 10);
        if (!eventsByDate[d]) eventsByDate[d] = [];
        eventsByDate[d].push(ev);
      });

      const firstDay = new Date(year, month, 1).getDay();
      const days = ['일','월','화','수','목','금','토'];

      let html = '<div class="cal-week-header">' + days.map(d=>`<div>${d}</div>`).join('') + '</div>';
      html += '<div class="cal-days">';
      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayEvents = eventsByDate[dateStr] || [];
        const isToday = dateStr === new Date().toISOString().slice(0,10);
        html += `<div class="cal-day${isToday?' today':''}">
          <span class="cal-day-num">${d}</span>
          ${dayEvents.slice(0,3).map(ev => `<div class="cal-event" style="background:${ev.color}" title="${Fmt.escape(ev.title)}">${Fmt.escape(ev.title.slice(0,12))}</div>`).join('')}
          ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length-3}</div>` : ''}
        </div>`;
      }
      html += '</div>';
      grid.innerHTML = html;
    } catch(e) {
      grid.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`;
    }
  },
};
