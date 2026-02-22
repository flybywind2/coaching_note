/**
 * 로그인 상태와 권한 체크를 담당하는 인증/세션 헬퍼입니다.
 */

const Auth = {
  _key: 'ssp_token',
  _userKey: 'ssp_user',
  _coachRoles: ['coach', 'internal_coach', 'external_coach'],

  getToken() { return localStorage.getItem(this._key); },
  getUser() {
    const u = localStorage.getItem(this._userKey);
    return u ? JSON.parse(u) : null;
  },
  isLoggedIn() { return !!this.getToken(); },
  isRole(...roles) {
    const u = this.getUser();
    return u && roles.includes(u.role);
  },
  isCoach() {
    const u = this.getUser();
    return !!(u && this._coachRoles.includes(u.role));
  },
  isInternalCoach() { return this.isRole('coach', 'internal_coach'); },
  isExternalCoach() { return this.isRole('external_coach'); },
  isAdminOrCoach() {
    const u = this.getUser();
    return !!(u && (u.role === 'admin' || this._coachRoles.includes(u.role)));
  },
  isAdminOrInternalCoach() {
    const u = this.getUser();
    return !!(u && (u.role === 'admin' || u.role === 'coach' || u.role === 'internal_coach'));
  },
  isAdmin() { return this.isRole('admin'); },

  async login(emp_id) {
    const data = await API.login(emp_id);
    localStorage.setItem(this._key, data.access_token);
    localStorage.setItem(this._userKey, JSON.stringify(data.user));
    if ((data.user && this._coachRoles.includes(data.user.role)) || data.user?.role === 'participant') {
      API.autoCheckInToday().catch(() => {});
    }
    return data.user;
  },

  async logout() {
    try { await API.logout(); } catch (e) { /* ignore */ }
    this.clear();
  },

  clear() {
    localStorage.removeItem(this._key);
    localStorage.removeItem(this._userKey);
  },
};


