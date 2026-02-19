// Register all routes
Router.register('/projects', (el, p) => Pages.projectList.render(el, p));
Router.register('/projects/:batchId', (el, p) => Pages.projectList.render(el, p));
Router.register('/project/:id', (el, p) => Pages.projectDetail.render(el, p));
Router.register('/project/:id/notes/:noteId', (el, p) => Pages.coachingNote.render(el, p));
Router.register('/calendar', (el, p) => Pages.calendar.render(el, p));
Router.register('/dashboard', (el, p) => Pages.dashboard.render(el, p));
Router.register('/board/:boardId', (el, p) => Pages.board.render(el, p));
Router.register('/board/:boardId/post/:postId', (el, p) => Pages.board.renderPost(el, p));
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

// Start routing
Router.init();
