/**
 * 백엔드 HTTP 엔드포인트를 호출하고 요청/응답을 정규화하는 API 클라이언트 래퍼입니다.
 */

const API_BASE = '';

async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });

  if (res.status === 401) {
    Auth.clear();
    Router.go('/login');
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API Error');
  }
  if (res.status === 204) return null;
  return res.json();
}

const API = {
  // Auth
  login: (emp_id) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ emp_id }) }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/api/auth/me'),

  // Users (admin)
  getUsers: (includeInactive = false) => apiFetch(`/api/users${includeInactive ? '?include_inactive=true' : ''}`),
  createUser: (data) => apiFetch('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  bulkUpsertUsers: (data) => apiFetch('/api/users/bulk-upsert', { method: 'POST', body: JSON.stringify(data) }),
  bulkDeleteUsers: (data) => apiFetch('/api/users/bulk-delete', { method: 'POST', body: JSON.stringify(data) }),
  bulkUpdateUsers: (data) => apiFetch('/api/users/bulk-update', { method: 'POST', body: JSON.stringify(data) }),
  getUserPermissions: (id) => apiFetch(`/api/users/${id}/permissions`),
  updateUserPermissions: (id, data) => apiFetch(`/api/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => apiFetch(`/api/users/${id}`, { method: 'DELETE' }),
  restoreUser: (id) => apiFetch(`/api/users/${id}/restore`, { method: 'PATCH' }),
  uploadEditorImage: (file, options = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('scope', options.scope || 'general');
    if (options.projectId) fd.append('project_id', String(options.projectId));
    if (options.boardId) fd.append('board_id', String(options.boardId));
    return apiFetch('/api/uploads/images', { method: 'POST', body: fd });
  },
  uploadEditorFile: (file, options = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('scope', options.scope || 'general');
    if (options.projectId) fd.append('project_id', String(options.projectId));
    if (options.boardId) fd.append('board_id', String(options.boardId));
    return apiFetch('/api/uploads/files', { method: 'POST', body: fd });
  },

  // Batches
  getBatches: () => apiFetch('/api/batches'),
  getBatch: (id) => apiFetch(`/api/batches/${id}`),
  createBatch: (data) => apiFetch('/api/batches', { method: 'POST', body: JSON.stringify(data) }),
  updateBatch: (id, data) => apiFetch(`/api/batches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBatch: (id) => apiFetch(`/api/batches/${id}`, { method: 'DELETE' }),

  // Projects
  getProjects: (batchId) => apiFetch(`/api/batches/${batchId}/projects`),
  getProject: (id) => apiFetch(`/api/projects/${id}`),
  createProject: (batchId, data) => apiFetch(`/api/batches/${batchId}/projects`, { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id, data) => apiFetch(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProject: (id) => apiFetch(`/api/projects/${id}`, { method: 'DELETE' }),
  getMembers: (id) => apiFetch(`/api/projects/${id}/members`),
  getProjectMemberCandidates: (id) => apiFetch(`/api/projects/${id}/member-candidates`),
  addMember: (id, data) => apiFetch(`/api/projects/${id}/members`, { method: 'POST', body: JSON.stringify(data) }),
  removeMember: (id, userId) => apiFetch(`/api/projects/${id}/members/${userId}`, { method: 'DELETE' }),
  setMemberRepresentative: (id, userId) => apiFetch(`/api/projects/${id}/members/${userId}/representative`, { method: 'PUT' }),

  // Documents
  getDocuments: (projectId, type) => apiFetch(`/api/projects/${projectId}/documents${type ? '?doc_type=' + type : ''}`),
  getDocument: (id) => apiFetch(`/api/documents/${id}`),
  updateDocument: (id, data) => apiFetch(`/api/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDocument: (id) => apiFetch(`/api/documents/${id}`, { method: 'DELETE' }),
  getDocumentVersions: (id) => apiFetch(`/api/documents/${id}/versions`),
  restoreDocumentVersion: (id, versionId) => apiFetch(`/api/documents/${id}/restore/${versionId}`, { method: 'POST' }),
  createDocument: (projectId, formData) => apiFetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: formData }),
  uploadDocument: (projectId, formData) => {
    const token = Auth.getToken();
    return fetch(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    }).then(async res => {
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: res.statusText })); throw new Error(e.detail || 'Upload failed'); }
      return res.json();
    });
  },

  // Coaching Notes
  getNotes: (projectId) => apiFetch(`/api/projects/${projectId}/notes`),
  getNote: (id) => apiFetch(`/api/notes/${id}`),
  createNote: (projectId, data) => apiFetch(`/api/projects/${projectId}/notes`, { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id, data) => apiFetch(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id) => apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),
  getNoteVersions: (id) => apiFetch(`/api/notes/${id}/versions`),
  restoreNoteVersion: (id, versionId) => apiFetch(`/api/notes/${id}/restore/${versionId}`, { method: 'POST' }),
  getNoteTemplates: () => apiFetch('/api/note-templates'),
  createNoteTemplate: (data) => apiFetch('/api/note-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateNoteTemplate: (id, data) => apiFetch(`/api/note-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNoteTemplate: (id) => apiFetch(`/api/note-templates/${id}`, { method: 'DELETE' }),

  // Comments
  getComments: (noteId) => apiFetch(`/api/notes/${noteId}/comments`),
  createComment: (noteId, data) => apiFetch(`/api/notes/${noteId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteComment: (id) => apiFetch(`/api/comments/${id}`, { method: 'DELETE' }),

  // Sessions
  getSessions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/api/sessions${q ? '?' + q : ''}`);
  },
  createSession: (data) => apiFetch('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id, data) => apiFetch(`/api/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSession: (id) => apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }),
  getSessionAttendees: (sessionId) => apiFetch(`/api/sessions/${sessionId}/attendees`),
  addSessionAttendee: (sessionId, data) => apiFetch(`/api/sessions/${sessionId}/attendees`, { method: 'POST', body: JSON.stringify(data) }),

  // Schedules
  getSchedules: (batchId) => apiFetch(`/api/schedules?batch_id=${batchId}`),
  createSchedule: (data) => apiFetch('/api/schedules', { method: 'POST', body: JSON.stringify(data) }),
  updateSchedule: (id, data) => apiFetch(`/api/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateScheduleSeries: (id, data) => apiFetch(`/api/schedules/${id}/series`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSchedule: (id) => apiFetch(`/api/schedules/${id}`, { method: 'DELETE' }),
  deleteScheduleSeries: (id) => apiFetch(`/api/schedules/${id}/series`, { method: 'DELETE' }),

  // Tasks
  getTasks: (projectId) => apiFetch(`/api/projects/${projectId}/tasks`),
  createTask: (projectId, data) => apiFetch(`/api/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => apiFetch(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),

  // Boards
  getBoards: () => apiFetch('/api/boards'),
  getPosts: (boardId, skip = 0, limit = 20) => apiFetch(`/api/boards/${boardId}/posts?skip=${skip}&limit=${limit}`),
  getAllPosts: (params = {}) => {
    const q = new URLSearchParams();
    if (params.skip != null) q.set('skip', String(params.skip));
    if (params.limit != null) q.set('limit', String(params.limit));
    if (params.category) q.set('category', String(params.category));
    if (params.q) q.set('q', String(params.q));
    return apiFetch(`/api/boards/posts${q.toString() ? `?${q.toString()}` : ''}`);
  },
  getPost: (boardId, postId) => apiFetch(`/api/boards/posts/${postId}`),
  createPost: (boardId, data) => apiFetch(`/api/boards/${boardId}/posts`, { method: 'POST', body: JSON.stringify(data) }),
  updatePost: (postId, data) => apiFetch(`/api/boards/posts/${postId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePost: (postId) => apiFetch(`/api/boards/posts/${postId}`, { method: 'DELETE' }),
  getPostVersions: (postId) => apiFetch(`/api/boards/posts/${postId}/versions`),
  restorePostVersion: (postId, versionId) => apiFetch(`/api/boards/posts/${postId}/restore/${versionId}`, { method: 'POST' }),
  getPostComments: (postId) => apiFetch(`/api/boards/posts/${postId}/comments`),
  createPostComment: (postId, data) => apiFetch(`/api/boards/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  updatePostComment: (commentId, data) => apiFetch(`/api/boards/comments/${commentId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePostComment: (commentId) => apiFetch(`/api/boards/comments/${commentId}`, { method: 'DELETE' }),
  getBoardMentionCandidates: (q, limit = 8) => apiFetch(`/api/boards/mention-candidates?q=${encodeURIComponent(q)}&limit=${Math.max(1, Math.min(20, Number(limit) || 8))}`),

  // Notifications
  getNotifications: (unreadOnly = false) => apiFetch(`/api/notifications${unreadOnly ? '?unread_only=true' : ''}`),
  markRead: (id) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),
  getNotificationPreferences: () => apiFetch('/api/notifications/preferences'),
  updateNotificationPreferences: (data) => apiFetch('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify(data) }),

  // Calendar
  getCalendar: (batchId, start, end, projectId = null) =>
    apiFetch(`/api/calendar?batch_id=${batchId}&start=${start}&end=${end}${projectId ? `&project_id=${projectId}` : ''}`),

  // Dashboard
  getDashboard: (batchId) => apiFetch(`/api/dashboard${batchId ? '?batch_id=' + batchId : ''}`),
  getAboutContent: (key) => apiFetch(`/api/about/content?key=${encodeURIComponent(key)}`),
  updateAboutContent: (key, data) => apiFetch(`/api/about/content/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(data) }),
  // [FEEDBACK7] SSP+ 소식 메뉴 API
  getAboutNews: (params = {}) => {
    const q = new URLSearchParams();
    if (params.include_hidden != null) q.set('include_hidden', params.include_hidden ? 'true' : 'false');
    return apiFetch(`/api/about/news${q.toString() ? `?${q.toString()}` : ''}`);
  },
  createAboutNews: (data) => apiFetch('/api/about/news', { method: 'POST', body: JSON.stringify(data) }),
  updateAboutNews: (newsId, data) => apiFetch(`/api/about/news/${newsId}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCoachProfiles: (params = {}) => {
    const q = new URLSearchParams();
    if (params.batch_id != null) q.set('batch_id', String(params.batch_id));
    if (params.include_hidden != null) q.set('include_hidden', params.include_hidden ? 'true' : 'false');
    return apiFetch(`/api/about/coaches${q.toString() ? `?${q.toString()}` : ''}`);
  },
  createCoachProfile: (data) => apiFetch('/api/about/coaches', { method: 'POST', body: JSON.stringify(data) }),
  updateCoachProfile: (coachId, data) => apiFetch(`/api/about/coaches/${coachId}`, { method: 'PUT', body: JSON.stringify(data) }),
  reorderCoachProfiles: (data) => apiFetch('/api/about/coaches/reorder', { method: 'PUT', body: JSON.stringify(data) }),
  deleteCoachProfile: (coachId) => apiFetch(`/api/about/coaches/${coachId}`, { method: 'DELETE' }),
  getCoachingPlanGrid: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    return apiFetch(`/api/coaching-plan/grid${q.toString() ? `?${q.toString()}` : ''}`);
  },
  upsertCoachingPlan: (data) => apiFetch('/api/coaching-plan/plan', { method: 'PUT', body: JSON.stringify(data) }),
  deleteCoachingPlan: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    return apiFetch(`/api/coaching-plan/plan${q.toString() ? `?${q.toString()}` : ''}`, { method: 'DELETE' });
  },
  upsertCoachingActualOverride: (data) => apiFetch('/api/coaching-plan/actual-override', { method: 'PUT', body: JSON.stringify(data) }),
  deleteCoachingActualOverride: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    return apiFetch(`/api/coaching-plan/actual-override${q.toString() ? `?${q.toString()}` : ''}`, { method: 'DELETE' });
  },
  getHome: (batchId) => apiFetch(`/api/home${batchId ? '?batch_id=' + batchId : ''}`),
  searchWorkspace: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      qs.set(k, String(v));
    });
    return apiFetch(`/api/search${qs.toString() ? `?${qs.toString()}` : ''}`);
  },

  // AI
  generateSummary: (projectId, force = false, weekNumber = null) => apiFetch(
    `/api/projects/${projectId}/summary`,
    {
      method: 'POST',
      body: JSON.stringify({
        force_regenerate: force,
        week_number: weekNumber === null || weekNumber === undefined ? null : Number(weekNumber),
      }),
    }
  ),
  getSummary: (projectId, weekNumber = null) => apiFetch(
    `/api/projects/${projectId}/summary${weekNumber === null || weekNumber === undefined ? '' : `?week_number=${encodeURIComponent(String(weekNumber))}`}`
  ),
  generateQASet: (projectId, force = false, weekNumber = null) => apiFetch(
    `/api/projects/${projectId}/qa-set`,
    {
      method: 'POST',
      body: JSON.stringify({
        force_regenerate: force,
        week_number: weekNumber === null || weekNumber === undefined ? null : Number(weekNumber),
      }),
    }
  ),
  getQASets: (projectId, weekNumber = null) => apiFetch(
    `/api/projects/${projectId}/qa-sets${weekNumber === null || weekNumber === undefined ? '' : `?week_number=${encodeURIComponent(String(weekNumber))}`}`
  ),
  enhanceNote: (noteId, data) => apiFetch(`/api/notes/${noteId}/enhance`, { method: 'POST', body: JSON.stringify(data) }),

  // Sessions (single)
  getSession: (id) => apiFetch(`/api/sessions/${id}`),

  // Attendance / Coaching check
  checkIn: (sessionId) => apiFetch(`/api/sessions/${sessionId}/checkin`, { method: 'POST' }),
  checkOut: (sessionId) => apiFetch(`/api/sessions/${sessionId}/checkout`, { method: 'POST' }),
  getMyAttendanceStatus: (sessionId) => apiFetch(`/api/sessions/${sessionId}/my-attendance-status`),
  autoCheckInToday: () => apiFetch('/api/attendance/auto-checkin-today', { method: 'POST' }),
  getMyDailyAttendanceStatus: (workDate = null) =>
    apiFetch(`/api/attendance/my-status${workDate ? `?work_date=${encodeURIComponent(workDate)}` : ''}`),
  checkInToday: (workDate = null) =>
    apiFetch(`/api/attendance/checkin${workDate ? `?work_date=${encodeURIComponent(workDate)}` : ''}`, { method: 'POST' }),
  checkOutToday: (workDate = null) =>
    apiFetch(`/api/attendance/checkout${workDate ? `?work_date=${encodeURIComponent(workDate)}` : ''}`, { method: 'POST' }),
  cancelCheckOutToday: (workDate = null) =>
    apiFetch(`/api/attendance/checkout-cancel${workDate ? `?work_date=${encodeURIComponent(workDate)}` : ''}`, { method: 'POST' }),
  getDailyAttendance: (workDate) => apiFetch(`/api/attendance?work_date=${encodeURIComponent(workDate)}`),
  getAttendance: (sessionId) => apiFetch(`/api/sessions/${sessionId}/attendance`),
  coachingStart: (sessionId) => apiFetch(`/api/sessions/${sessionId}/coaching-start`, { method: 'POST' }),
  coachingEnd: (sessionId) => apiFetch(`/api/sessions/${sessionId}/coaching-end`, { method: 'POST' }),
  getCoachingLog: (sessionId) => apiFetch(`/api/sessions/${sessionId}/coaching-log`),

  // IP Ranges (admin)
  getIPRanges: () => apiFetch('/api/admin/ip-ranges'),
  createIPRange: (data) => apiFetch('/api/admin/ip-ranges', { method: 'POST', body: JSON.stringify(data) }),
  deleteIPRange: (id) => apiFetch(`/api/admin/ip-ranges/${id}`, { method: 'DELETE' }),
};


