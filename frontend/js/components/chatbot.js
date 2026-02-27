/**
 * [chatbot] 우하단 플로팅 챗봇 위젯 컴포넌트입니다.
 */

const ChatbotWidget = {
  _initialized: false,
  _featureEnabled: false,
  _featureLoaded: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._mount();
    this._loadFeatureFlag();
    this.syncVisibility();
  },

  async _loadFeatureFlag() {
    try {
      const config = await API.getChatbotConfig();
      this._featureEnabled = !!(config && config.enabled);
    } catch (err) {
      this._featureEnabled = false;
    } finally {
      this._featureLoaded = true;
      this.syncVisibility();
    }
  },

  _mount() {
    if (document.getElementById('chatbot-widget')) return;
    const host = document.createElement('div');
    host.id = 'chatbot-widget';
    host.className = 'chatbot-widget';
    host.innerHTML = `
      <button id="chatbot-fab" class="chatbot-fab" type="button" title="챗봇 열기">AI</button>
      <section id="chatbot-modal" class="chatbot-modal" style="display:none;">
        <header class="chatbot-modal-head">
          <strong>SSP+ 챗봇</strong>
          <button id="chatbot-close" class="btn btn-xs btn-secondary" type="button">닫기</button>
        </header>
        <div id="chatbot-messages" class="chatbot-messages">
          <article class="chatbot-msg chatbot-msg-assistant">무엇이 궁금한가요? RAG 기반으로 답변해드릴게요.</article>
        </div>
        <form id="chatbot-form" class="chatbot-form">
          <textarea id="chatbot-input" rows="2" placeholder="질문을 입력하세요"></textarea>
          <button id="chatbot-send" class="btn btn-primary" type="submit">전송</button>
        </form>
      </section>
    `;
    document.body.appendChild(host);

    document.getElementById('chatbot-fab')?.addEventListener('click', () => this.toggleModal());
    document.getElementById('chatbot-close')?.addEventListener('click', () => this.closeModal());
    document.getElementById('chatbot-form')?.addEventListener('submit', (e) => this._onSubmit(e));
    document.getElementById('chatbot-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._onSubmit(e);
      }
    });
  },

  syncVisibility() {
    const root = document.getElementById('chatbot-widget');
    if (!root) return;
    const { path } = Router.getCurrentParams();
    // [chatbot] .env(CHATBOT_ENABLED)가 false면 UI 버튼 자체를 숨김
    const visible = this._featureLoaded && this._featureEnabled && Auth.isLoggedIn() && path !== '/login';
    root.style.display = visible ? '' : 'none';
    if (!visible) this.closeModal();
  },

  toggleModal() {
    if (!this._featureEnabled) return;
    const modal = document.getElementById('chatbot-modal');
    if (!modal) return;
    const opened = modal.style.display !== 'none';
    modal.style.display = opened ? 'none' : 'grid';
    if (!opened) document.getElementById('chatbot-input')?.focus();
  },

  closeModal() {
    const modal = document.getElementById('chatbot-modal');
    if (!modal) return;
    modal.style.display = 'none';
  },

  _appendMessage(role, html) {
    const wrap = document.getElementById('chatbot-messages');
    if (!wrap) return;
    const article = document.createElement('article');
    article.className = `chatbot-msg ${role === 'user' ? 'chatbot-msg-user' : 'chatbot-msg-assistant'}`;
    article.innerHTML = html;
    wrap.appendChild(article);
    wrap.scrollTop = wrap.scrollHeight;
  },

  _renderReferences(refs) {
    if (!Array.isArray(refs) || !refs.length) return '';
    const lines = refs
      .filter((row) => row && row.title)
      .map((row) => `• ${Fmt.escape(row.title)}`)
      .join('<br/>');
    if (!lines) return '';
    return `<div class="chatbot-refs"><strong>참고 문서</strong><br/>${lines}</div>`;
  },

  async _onSubmit(e) {
    e?.preventDefault();
    const input = document.getElementById('chatbot-input');
    const sendBtn = document.getElementById('chatbot-send');
    if (!input || !sendBtn) return;
    const question = String(input.value || '').trim();
    if (!question) return;

    this._appendMessage('user', Fmt.escape(question));
    input.value = '';
    sendBtn.disabled = true;
    this._appendMessage('assistant', '답변 생성 중...');

    try {
      const result = await API.askChatbot(question, 5);
      const messages = document.getElementById('chatbot-messages');
      if (messages?.lastElementChild) messages.lastElementChild.remove();
      const body = `${Fmt.escape(result?.answer || '답변을 생성하지 못했습니다.')}${this._renderReferences(result?.references)}`;
      this._appendMessage('assistant', body);
    } catch (err) {
      const messages = document.getElementById('chatbot-messages');
      if (messages?.lastElementChild) messages.lastElementChild.remove();
      this._appendMessage('assistant', `오류: ${Fmt.escape(err.message || '챗봇 호출 실패')}`);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  },
};

// [chatbot] 전역 라우터/앱에서 접근 가능하도록 window에 노출
window.ChatbotWidget = ChatbotWidget;
