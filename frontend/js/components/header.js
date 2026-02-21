/**
 * Header 재사용 UI 컴포넌트 모듈입니다.
 */

const Header = {
  render() {
    const user = Auth.getUser();
    if (!user) return;

    document.getElementById('user-info').textContent = `${user.name} (${user.role})`;

    const nav = document.getElementById('main-nav');
    const links = [
      { path: '/about', label: 'SSP+ 소개', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/projects', label: '과제 목록', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/calendar', label: '캘린더', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/coaching-plan', label: '코칭 계획/실적', roles: ['admin', 'coach'] },
      { path: '/board', label: '게시판', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/dashboard', label: '대시보드', roles: ['admin', 'coach'] },
      { path: '/admin', label: '관리자', roles: ['admin'] },
    ];

    nav.innerHTML = links
      .filter(l => l.roles.includes(user.role))
      .map((l) => {
        const isActive = Router.currentPath === l.path || Router.currentPath?.startsWith(`${l.path}/`);
        return `<a href="#${l.path}" class="nav-link${isActive ? ' active' : ''}">${l.label}</a>`;
      })
      .join('');

    this._ensureAttendanceQuickArea();
    this._renderAttendanceQuick(user);
  },

  _ensureAttendanceQuickArea() {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return null;
    let el = document.getElementById('attendance-quick');
    if (!el) {
      el = document.createElement('span');
      el.id = 'attendance-quick';
      el.className = 'attendance-quick';
      const userInfo = document.getElementById('user-info');
      if (userInfo) headerRight.insertBefore(el, userInfo);
      else headerRight.appendChild(el);
    }
    return el;
  },

  async _renderAttendanceQuick(user) {
    const box = document.getElementById('attendance-quick');
    if (!box) return;
    if (!(user.role === 'coach' || user.role === 'participant')) {
      box.innerHTML = '';
      return;
    }

    try {
      const status = await API.getMyDailyAttendanceStatus();
      const log = status.attendance_log;
      if (!status.ip_allowed && !log) {
        box.innerHTML = '<span class="attendance-hint">허용 IP에서 입실 가능</span>';
        return;
      }
      if (!log) {
        box.innerHTML = `<button id="attendance-checkin-btn" class="btn btn-xs btn-primary">입실</button>`;
        document.getElementById('attendance-checkin-btn')?.addEventListener('click', async () => {
          try {
            await API.checkInToday();
            await this._renderAttendanceQuick(user);
          } catch (err) {
            alert(err.message || '입실 처리 실패');
          }
        });
        return;
      }
      if (!log.check_out_time) {
        box.innerHTML = `
          <span class="attendance-time">입실 ${Fmt.datetime(log.check_in_time)}</span>
          ${status.can_checkout
            ? '<button id="attendance-checkout-btn" class="btn btn-xs btn-secondary">퇴실</button>'
            : '<span class="attendance-hint">허용 IP에서 퇴실 가능</span>'}
        `;
        document.getElementById('attendance-checkout-btn')?.addEventListener('click', async () => {
          try {
            await API.checkOutToday();
            await this._renderAttendanceQuick(user);
          } catch (err) {
            alert(err.message || '퇴실 처리 실패');
          }
        });
        return;
      }
      box.innerHTML = `
        <span class="attendance-time">입실 ${Fmt.datetime(log.check_in_time)}</span>
        <span class="attendance-time">퇴실 ${Fmt.datetime(log.check_out_time)}</span>
      `;
    } catch (_) {
      box.innerHTML = '';
    }
  },
};


