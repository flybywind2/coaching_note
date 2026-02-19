const Fmt = {
  date(str) {
    if (!str) return '-';
    return new Date(str).toLocaleDateString('ko-KR');
  },
  datetime(str) {
    if (!str) return '-';
    return new Date(str).toLocaleString('ko-KR');
  },
  progress(val) {
    return `<div class="progress-bar"><div class="progress-fill" style="width:${val}%"></div><span>${val}%</span></div>`;
  },
  role(r) {
    const map = { admin: '관리자', coach: '코치', participant: '참여자', observer: '참관자' };
    return map[r] || r;
  },
  status(s) {
    const map = { preparing: '준비중', in_progress: '진행중', completed: '완료', planned: '예정',
                  ongoing: '진행중', todo: '할일', cancelled: '취소' };
    return map[s] || s;
  },
  escape(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};
