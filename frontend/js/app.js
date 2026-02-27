// Register all routes
Router.register('/home', (el, p) => Pages.home.render(el, p));
Router.register('/search', (el, p) => Pages.search.render(el, p));
Router.register('/about', (el, p) => Pages.about.render(el, p));
Router.register('/coaching-plan', (el, p) => Pages.coachingPlan.render(el, p));
Router.register('/coaching-plan/coach/:id', (el, p) => Pages.coachingCoach.render(el, p));
Router.register('/projects', (el, p) => Pages.projectList.render(el, p));
Router.register('/projects/:batchId', (el, p) => Pages.projectList.render(el, p));
Router.register('/project/:id', (el, p) => Pages.projectDetail.render(el, p));
Router.register('/project/:id/notes/:noteId', (el, p) => Pages.coachingNote.render(el, p));
Router.register('/calendar', (el, p) => Pages.calendar.render(el, p));
Router.register('/dashboard', (el, p) => Pages.dashboard.render(el, p));
Router.register('/dashboard/project/:id', (el, p) => Pages.dashboardProject.render(el, p));
Router.register('/board', (el, p) => Pages.board.render(el, p));
Router.register('/board/:boardId', (el, p) => Pages.board.render(el, p));
Router.register('/board/post/:postId', (el, p) => Pages.board.renderPost(el, p));
Router.register('/board/:boardId/post/:postId', (el, p) => Pages.board.renderPost(el, p));
// [FEEDBACK7] 기능 3~5 라우트 등록
Router.register('/project-research', (el, p) => Pages.projectResearch.render(el, p));
Router.register('/survey', (el, p) => Pages.survey.render(el, p));
Router.register('/course-registration', (el, p) => Pages.courseRegistration.render(el, p));
Router.register('/admin', (el, p) => Pages.admin.render(el, p));
Router.register('/session/:id', (el, p) => Pages.sessionDetail.render(el, p));

// Logout handler
document.getElementById('logout-btn').addEventListener('click', async () => {
  await Auth.logout();
  Router.go('/login');
});

// Notification panel
document.getElementById('notif-btn').addEventListener('click', () => Notifications.togglePanel());
document.getElementById('notif-read-all').addEventListener('click', async () => {
  await API.markAllRead();
  Notifications.refresh();
});
document.getElementById('notif-settings-btn').addEventListener('click', () => Notifications.openSettingsModal());

// [chatbot] 챗봇 위젯 초기화
if (window.ChatbotWidget) ChatbotWidget.init();

// Start routing
Router.init();
