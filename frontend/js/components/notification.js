/**
 * Notification 재사용 UI 컴포넌트 모듈입니다.
 */

const Notifications = {
  _items: [],
  _prefs: null,

  async refresh() {
    try {
      this._items = await API.getNotifications();
      if (!this._prefs) {
        this._prefs = await API.getNotificationPreferences();
      }
      this._render();
      this.refreshBadge();
    } catch (e) { /* silent */ }
  },

  async refreshBadge() {
    try {
      const all = await API.getNotifications(true);
      const badge = document.getElementById('notif-badge');
      if (all.length > 0) {
        badge.textContent = all.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    } catch (e) { /* silent */ }
  },

  togglePanel() {
    const panel = document.getElementById('notif-panel');
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    if (!visible) this.refresh();
  },

  async openSettingsModal() {
    let prefs = this._prefs;
    try {
      prefs = prefs || await API.getNotificationPreferences();
      this._prefs = prefs;
    } catch (e) {
      alert('알림 설정 정보를 불러오지 못했습니다.');
      return;
    }

    Modal.open(`
      <h2>알림 설정</h2>
      <form id="notif-settings-form">
        <div class="form-group notif-pref-checks">
          <label><input type="checkbox" name="mention_enabled" ${prefs.mention_enabled ? 'checked' : ''}> 멘션 알림</label>
          <label><input type="checkbox" name="board_enabled" ${prefs.board_enabled ? 'checked' : ''}> 게시글 알림</label>
          <label><input type="checkbox" name="deadline_enabled" ${prefs.deadline_enabled ? 'checked' : ''}> 마감 임박 알림</label>
        </div>
        <div class="form-group">
          <label for="notif-frequency">알림 빈도</label>
          <select id="notif-frequency" name="frequency">
            <option value="realtime" ${prefs.frequency === 'realtime' ? 'selected' : ''}>즉시</option>
            <option value="daily" ${prefs.frequency === 'daily' ? 'selected' : ''}>일 1회 묶음</option>
          </select>
        </div>
        <p class="form-hint">일 1회 묶음은 같은 유형 알림을 당일 1건으로 합쳐서 표시합니다.</p>
        <div class="inline-actions">
          <button type="submit" class="btn btn-primary">저장</button>
          <button type="button" class="btn btn-secondary" id="notif-settings-cancel">취소</button>
        </div>
      </form>
    `);

    const form = document.getElementById('notif-settings-form');
    const cancelBtn = document.getElementById('notif-settings-cancel');
    cancelBtn.addEventListener('click', () => Modal.close());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        mention_enabled: form.mention_enabled.checked,
        board_enabled: form.board_enabled.checked,
        deadline_enabled: form.deadline_enabled.checked,
        frequency: form.frequency.value,
      };
      try {
        this._prefs = await API.updateNotificationPreferences(payload);
        Modal.close();
        this.refresh();
      } catch (err) {
        alert(err.message || '알림 설정 저장에 실패했습니다.');
      }
    });
  },

  _render() {
    const list = document.getElementById('notif-list');
    if (!this._items.length) {
      list.innerHTML = '<p class="notif-empty">알림이 없습니다.</p>';
      return;
    }
    list.innerHTML = this._items.map(n => `
      <div class="notif-item${n.is_read ? '' : ' unread'}" data-id="${n.noti_id}">
        <div class="notif-title">${n.title}</div>
        <div class="notif-msg">${n.message || ''}</div>
        <div class="notif-time">${Fmt.datetime(n.created_at)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = parseInt(el.dataset.id, 10);
        const item = this._items.find((n) => n.noti_id === id);
        if (!item) return;
        if (!item.is_read) {
          await API.markRead(id);
        }
        if (item.link_url && item.link_url.startsWith('#/')) {
          document.getElementById('notif-panel').style.display = 'none';
          Router.go(item.link_url.replace(/^#/, ''));
        } else {
          this.refresh();
        }
      });
    });
  },
};

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const triggerBtn = document.getElementById('notif-btn');
  if (!panel || panel.style.display === 'none') return;
  if (panel.contains(e.target) || triggerBtn.contains(e.target)) return;
  panel.style.display = 'none';
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const panel = document.getElementById('notif-panel');
  if (!panel || panel.style.display === 'none') return;
  panel.style.display = 'none';
});


