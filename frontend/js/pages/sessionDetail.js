/**
 * SessionDetail 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

Pages.sessionDetail = {
  async render(el, params) {
    const sessionId = parseInt(params.id);
    el.innerHTML = '<div class="loading">로딩 중...</div>';
    try {
      const user = Auth.getUser();
      const s = await API.getSession(sessionId);
      const isCoachAdmin = user.role === 'admin' || user.role === 'coach';

      el.innerHTML = `
        <div class="page-container">
          <div class="page-header">
            <a href="#/projects" class="back-link">← 과제 목록</a>
            <h1>코칭 세션 상세</h1>
            <div class="session-meta">
              <span>${Fmt.date(s.session_date)}</span>
              <span>${s.start_time} ~ ${s.end_time}</span>
              ${s.location ? `<span>${Fmt.escape(s.location)}</span>` : ''}
              <span class="tag tag-${s.session_status}">${Fmt.status(s.session_status)}</span>
            </div>
          </div>

          <div class="session-actions card">
            <h3>출결 체크</h3>
            <div id="checkin-area"></div>
          </div>

          ${isCoachAdmin ? `
          <div class="session-actions card">
            <h3>코칭 시간 관리</h3>
            <div id="coaching-area"></div>
          </div>
          <div class="card">
            <h3>출결 현황</h3>
            <div id="attendance-table"></div>
          </div>
          <div class="card">
            <h3>코칭 로그</h3>
            <div id="coaching-log-table"></div>
          </div>
          ` : ''}
        </div>`;

      await this._renderCheckinArea(sessionId, user);
      if (isCoachAdmin) {
        await this._renderCoachingArea(sessionId);
        await this._renderAttendanceTable(sessionId);
        await this._renderCoachingLogTable(sessionId);
      }
    } catch (e) {
      el.innerHTML = `<div class="error-state">오류: ${Fmt.escape(e.message)}</div>`;
    }
  },

  async _renderCheckinArea(sessionId, user) {
    const el = document.getElementById('checkin-area');
    if (!el) return;
    try {
      const status = await API.getMyAttendanceStatus(sessionId);
      const myLog = status.attendance_log;
      const canUseAttendance = ['admin', 'coach', 'participant'].includes(user.role);

      if (!canUseAttendance) {
        el.innerHTML = '<p class="empty-state">출결 기능은 참여자/코치/관리자에게만 제공됩니다.</p>';
        return;
      }

      if (!myLog) {
        if (!status.can_checkin) {
          el.innerHTML = '<p class="empty-state">허용된 네트워크(IP)에서 접속하면 입실 버튼이 표시됩니다.</p>';
          return;
        }
        el.innerHTML = `<button id="checkin-btn" class="btn btn-primary">입실 체크</button>`;
        document.getElementById('checkin-btn').addEventListener('click', async () => {
          try {
            await API.checkIn(sessionId);
            await this._renderCheckinArea(sessionId, user);
          } catch (e) {
            el.innerHTML += `<div class="error-state mt">${Fmt.escape(e.message)}</div>`;
          }
        });
      } else if (!myLog.check_out_time) {
        el.innerHTML = `
          <p class="success-state">입실: ${Fmt.datetime(myLog.check_in_time)}</p>
          ${status.can_checkout ? '<button id="checkout-btn" class="btn btn-secondary">퇴실 체크</button>' : '<p class="empty-state mt">허용된 네트워크(IP)에서 접속하면 퇴실 버튼이 표시됩니다.</p>'}`;
        if (status.can_checkout) {
          document.getElementById('checkout-btn').addEventListener('click', async () => {
            try {
              await API.checkOut(sessionId);
              await this._renderCheckinArea(sessionId, user);
            } catch (e) {
              el.innerHTML += `<div class="error-state mt">${Fmt.escape(e.message)}</div>`;
            }
          });
        }
      } else {
        el.innerHTML = `
          <p class="success-state">입실: ${Fmt.datetime(myLog.check_in_time)}</p>
          <p class="success-state">퇴실: ${Fmt.datetime(myLog.check_out_time)}</p>`;
      }
    } catch (e) {
      el.innerHTML = `<div class="error-state">${Fmt.escape(e.message)}</div>`;
    }
  },

  async _renderCoachingArea(sessionId) {
    const el = document.getElementById('coaching-area');
    if (!el) return;
    const logs = await API.getCoachingLog(sessionId).catch(() => []);
    const user = Auth.getUser();
    const myActive = logs.find(l => l.coach_user_id === user.user_id && !l.ended_at);
    if (!myActive) {
      el.innerHTML = `<button id="coaching-start-btn" class="btn btn-primary">코칭 시작</button>`;
      document.getElementById('coaching-start-btn').addEventListener('click', async () => {
        try {
          await API.coachingStart(sessionId);
          await this._renderCoachingArea(sessionId);
        } catch (e) {
          el.innerHTML += `<div class="error-state mt">${Fmt.escape(e.message)}</div>`;
        }
      });
    } else {
      el.innerHTML = `
        <p class="success-state">코칭 시작: ${Fmt.datetime(myActive.started_at)}</p>
        <button id="coaching-end-btn" class="btn btn-secondary">코칭 종료</button>`;
      document.getElementById('coaching-end-btn').addEventListener('click', async () => {
        try {
          await API.coachingEnd(sessionId);
          await this._renderCoachingArea(sessionId);
          await this._renderCoachingLogTable(sessionId);
        } catch (e) {
          el.innerHTML += `<div class="error-state mt">${Fmt.escape(e.message)}</div>`;
        }
      });
    }
  },

  async _renderAttendanceTable(sessionId) {
    const el = document.getElementById('attendance-table');
    if (!el) return;
    const logs = await API.getAttendance(sessionId).catch(() => []);
    if (!logs.length) {
      el.innerHTML = '<p class="empty-state">출결 기록이 없습니다.</p>';
      return;
    }
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>사용자 ID</th><th>입실 시간</th><th>입실 IP</th><th>퇴실 시간</th><th>퇴실 IP</th></tr></thead>
      <tbody>${logs.map(l => `<tr>
        <td>${l.user_id}</td>
        <td>${Fmt.datetime(l.check_in_time)}</td>
        <td>${Fmt.escape(l.check_in_ip)}</td>
        <td>${l.check_out_time ? Fmt.datetime(l.check_out_time) : '-'}</td>
        <td>${l.check_out_ip ? Fmt.escape(l.check_out_ip) : '-'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  },

  async _renderCoachingLogTable(sessionId) {
    const el = document.getElementById('coaching-log-table');
    if (!el) return;
    const logs = await API.getCoachingLog(sessionId).catch(() => []);
    if (!logs.length) {
      el.innerHTML = '<p class="empty-state">코칭 로그가 없습니다.</p>';
      return;
    }
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>코치 ID</th><th>시작</th><th>종료</th><th>시간(분)</th></tr></thead>
      <tbody>${logs.map(l => `<tr>
        <td>${l.coach_user_id}</td>
        <td>${Fmt.datetime(l.started_at)}</td>
        <td>${l.ended_at ? Fmt.datetime(l.ended_at) : '진행 중'}</td>
        <td>${l.duration_minutes != null ? l.duration_minutes : '-'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  },
};


