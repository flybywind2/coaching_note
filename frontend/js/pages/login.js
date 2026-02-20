/**
 * Login 페이지 렌더링과 사용자 상호작용을 담당하는 SPA 페이지 모듈입니다.
 */

const Pages = window.Pages || {};

Pages.login = {
  render(el) {
    el.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <h1 class="login-title">SSP+ Space</h1>
          <p class="login-sub">사번으로 로그인하세요</p>
          <form id="login-form">
            <div class="form-group">
              <label>사번 (emp_id)</label>
              <input type="text" id="emp_id" placeholder="예: admin001" autocomplete="username" required />
            </div>
            <button type="submit" class="btn btn-primary btn-full">로그인</button>
            <p id="login-err" class="form-error" style="display:none;"></p>
          </form>
          <div class="login-hint">
            <b>테스트 계정:</b><br>
            admin001 (관리자) / coach001 (코치) / user001 (참여자) / obs001 (참관자)
          </div>
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const emp_id = document.getElementById('emp_id').value.trim();
      const errEl = document.getElementById('login-err');
      try {
        await Auth.login(emp_id);
        Router.go('/projects');
      } catch (err) {
        errEl.textContent = err.message || '로그인 실패';
        errEl.style.display = 'block';
      }
    });
  },
};


