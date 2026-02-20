/**
 * 로그인 상태와 권한 체크를 담당하는 인증/세션 헬퍼입니다.
 */

const Auth = {
  _key: 'ssp_token',
  _userKey: 'ssp_user',

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
  isAdminOrCoach() { return this.isRole('admin', 'coach'); },
  isAdmin() { return this.isRole('admin'); },

  async login(emp_id) {
    const data = await API.login(emp_id);
    localStorage.setItem(this._key, data.access_token);
    localStorage.setItem(this._userKey, JSON.stringify(data.user));
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


