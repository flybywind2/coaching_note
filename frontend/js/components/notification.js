/**
 * Notification 재사용 UI 컴포넌트 모듈입니다.
 */

const Notifications = {
  _items: [],

  async refresh() {
    try {
      this._items = await API.getNotifications();
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


