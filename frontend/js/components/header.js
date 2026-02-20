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
      { path: '/home', label: '홈', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/projects', label: '과제 목록', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/search', label: '통합 검색', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/calendar', label: '캘린더', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/board/1', label: '게시판', roles: ['admin', 'coach', 'participant', 'observer'] },
      { path: '/dashboard', label: '대시보드', roles: ['admin', 'coach'] },
      { path: '/admin', label: '관리자', roles: ['admin'] },
    ];

    nav.innerHTML = links
      .filter(l => l.roles.includes(user.role))
      .map(l => `<a href="#${l.path}" class="nav-link${Router.currentPath === l.path ? ' active' : ''}">${l.label}</a>`)
      .join('');
  },
};


