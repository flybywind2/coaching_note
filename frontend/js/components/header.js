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
  },
};


