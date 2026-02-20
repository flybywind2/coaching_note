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
  addMember: (id, data) => apiFetch(`/api/projects/${id}/members`, { method: 'POST', body: JSON.stringify(data) }),
  removeMember: (id, userId) => apiFetch(`/api/projects/${id}/members/${userId}`, { method: 'DELETE' }),

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
  deleteSchedule: (id) => apiFetch(`/api/schedules/${id}`, { method: 'DELETE' }),

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

  // Notifications
  getNotifications: (unreadOnly = false) => apiFetch(`/api/notifications${unreadOnly ? '?unread_only=true' : ''}`),
  markRead: (id) => apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => apiFetch('/api/notifications/read-all', { method: 'POST' }),

  // Calendar
  getCalendar: (batchId, start, end, projectId = null) =>
    apiFetch(`/api/calendar?batch_id=${batchId}&start=${start}&end=${end}${projectId ? `&project_id=${projectId}` : ''}`),

  // Dashboard
  getDashboard: (batchId) => apiFetch(`/api/dashboard${batchId ? '?batch_id=' + batchId : ''}`),
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
  generateSummary: (projectId, force = false) => apiFetch(`/api/projects/${projectId}/summary`, { method: 'POST', body: JSON.stringify({ force_regenerate: force }) }),
  getSummary: (projectId) => apiFetch(`/api/projects/${projectId}/summary`),
  generateQASet: (projectId, force = false) => apiFetch(`/api/projects/${projectId}/qa-set`, { method: 'POST', body: JSON.stringify({ force_regenerate: force }) }),
  getQASets: (projectId) => apiFetch(`/api/projects/${projectId}/qa-sets`),
  enhanceNote: (noteId, data) => apiFetch(`/api/notes/${noteId}/enhance`, { method: 'POST', body: JSON.stringify(data) }),

  // Sessions (single)
  getSession: (id) => apiFetch(`/api/sessions/${id}`),

  // Attendance / Coaching check
  checkIn: (sessionId) => apiFetch(`/api/sessions/${sessionId}/checkin`, { method: 'POST' }),
  checkOut: (sessionId) => apiFetch(`/api/sessions/${sessionId}/checkout`, { method: 'POST' }),
  getMyAttendanceStatus: (sessionId) => apiFetch(`/api/sessions/${sessionId}/my-attendance-status`),
  autoCheckInToday: () => apiFetch('/api/sessions/auto-checkin-today', { method: 'POST' }),
  getAttendance: (sessionId) => apiFetch(`/api/sessions/${sessionId}/attendance`),
  coachingStart: (sessionId) => apiFetch(`/api/sessions/${sessionId}/coaching-start`, { method: 'POST' }),
  coachingEnd: (sessionId) => apiFetch(`/api/sessions/${sessionId}/coaching-end`, { method: 'POST' }),
  getCoachingLog: (sessionId) => apiFetch(`/api/sessions/${sessionId}/coaching-log`),

  // IP Ranges (admin)
  getIPRanges: () => apiFetch('/api/admin/ip-ranges'),
  createIPRange: (data) => apiFetch('/api/admin/ip-ranges', { method: 'POST', body: JSON.stringify(data) }),
  deleteIPRange: (id) => apiFetch(`/api/admin/ip-ranges/${id}`, { method: 'DELETE' }),
};


