/**
 * URL 해시를 페이지 렌더 모듈에 매핑하는 라우터입니다.
 */

const Router = {
  routes: {},
  currentPath: null,
  roleRestrictedRoots: {
    '/calendar': (user) => !!(user && (user.role === 'admin' || user.role === 'coach' || user.role === 'internal_coach' || user.role === 'participant' || user.role === 'observer')),
    '/coaching-plan': (user) => !!(user && (user.role === 'admin' || user.role === 'coach' || user.role === 'internal_coach')),
    // [FEEDBACK7] 과제 조사/설문 접근 제어
    '/project-research': (user) => !!(user && (user.role === 'admin' || user.role === 'coach' || user.role === 'internal_coach' || user.role === 'external_coach' || user.role === 'participant')),
    // [feedback8] 설문 결과 조회 권한을 코치까지 확장
    '/survey': (user) => !!(user && (user.role === 'admin' || user.role === 'coach' || user.role === 'internal_coach' || user.role === 'external_coach' || user.role === 'participant')),
    '/dashboard': (user) => !!(user && (user.role === 'admin' || user.role === 'coach' || user.role === 'internal_coach')),
  },

  register(path, handler) {
    this.routes[path] = handler;
  },

  go(path) {
    window.location.hash = path;
  },

  getCurrentParams() {
    const hash = window.location.hash.slice(1) || '/';
    const [path, ...rest] = hash.split('?');
    const params = {};
    if (rest.length) {
      rest[0].split('&').forEach(p => {
        const [k, v] = p.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { path, params };
  },

  resolve() {
    const { path, params } = this.getCurrentParams();
    if (path === '/home') {
      this.go('/projects');
      return;
    }
    if (path === '/') {
      this.go(Auth.isLoggedIn() ? '/projects' : '/login');
      return;
    }

    if (!Auth.isLoggedIn() && path !== '/login') {
      this.go('/login');
      return;
    }
    if (Auth.isLoggedIn() && path === '/login') {
      this.go('/projects');
      return;
    }

    const user = Auth.getUser();
    const restrictedEntry = Object.entries(this.roleRestrictedRoots).find(([rootPath]) => (
      path === rootPath || path.startsWith(`${rootPath}/`)
    ));
    if (restrictedEntry) {
      const [, checker] = restrictedEntry;
      if (!checker(user)) {
        this.go('/projects');
        return;
      }
    }

    this.currentPath = path;
    const content = document.getElementById('page-content');
    const header = document.getElementById('app-header');

    if (path === '/login') {
      header.style.display = 'none';
      // [chatbot] 로그인 화면에서는 챗봇 위젯 숨김
      if (window.ChatbotWidget) ChatbotWidget.syncVisibility();
      content.innerHTML = '';
      Pages.login.render(content);
      return;
    }

    header.style.display = '';
    Header.render();
    Notifications.refreshBadge();
    // [chatbot] 라우트 전환 시 챗봇 위젯 가시성 동기화
    if (window.ChatbotWidget) ChatbotWidget.syncVisibility();

    // Match dynamic routes
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const match = this._match(pattern, path);
      if (match) {
        content.innerHTML = '';
        handler(content, { ...match, ...params });
        return;
      }
    }

    content.innerHTML = '<div class="page-error"><h2>404 — 페이지를 찾을 수 없습니다</h2></div>';
  },

  _match(pattern, path) {
    const pParts = pattern.split('/');
    const uParts = path.split('/');
    if (pParts.length !== uParts.length) return null;
    const result = {};
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) {
        result[pParts[i].slice(1)] = uParts[i];
      } else if (pParts[i] !== uParts[i]) {
        return null;
      }
    }
    return result;
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  },
};


