/**
 * Modal 재사용 UI 컴포넌트 모듈입니다.
 */

const Modal = {
  open(html, onClose = null, options = null) {
    if (typeof onClose === 'object' && onClose !== null && options == null) {
      options = onClose;
      onClose = null;
    }
    const modalBox = document.getElementById('modal-box');
    modalBox.className = 'modal-box';
    if (options?.className) {
      options.className.split(' ').filter(Boolean).forEach((cls) => modalBox.classList.add(cls));
    }
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
    this._onClose = onClose;
  },
  close() {
    document.getElementById('modal-overlay').style.display = 'none';
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-box').className = 'modal-box';
    if (this._onClose) { this._onClose(); this._onClose = null; }
  },
};

document.getElementById('modal-close').addEventListener('click', () => Modal.close());
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') Modal.close();
});


