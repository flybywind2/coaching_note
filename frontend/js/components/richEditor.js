/**
 * RichEditor 재사용 UI 컴포넌트 모듈입니다.
 */

const RichEditor = {
  create(container, options = {}) {
    const initialHTML = options.initialHTML || '';
    const placeholder = options.placeholder || '내용을 입력하세요...';
    const compact = options.compact === true;
    const onImageUpload = options.onImageUpload || null;
    const id = `rte-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    container.innerHTML = `
      <div class="rte ${compact ? 'compact' : ''}">
        <div class="rte-toolbar">
          <button type="button" data-cmd="undo" title="실행 취소">↶</button>
          <button type="button" data-cmd="redo" title="다시 실행">↷</button>
          <span class="sep"></span>
          <button type="button" data-cmd="bold" title="굵게"><b>B</b></button>
          <button type="button" data-cmd="italic" title="기울임"><i>I</i></button>
          <button type="button" data-cmd="underline" title="밑줄"><u>U</u></button>
          <button type="button" data-cmd="strikeThrough" title="취소선"><s>S</s></button>
          <button type="button" data-cmd="superscript" title="윗첨자">X²</button>
          <button type="button" data-cmd="subscript" title="아래첨자">X₂</button>
          <span class="sep"></span>
          <select data-action="format-block" title="문단 형식">
            <option value="P">본문</option>
            <option value="H1">제목1</option>
            <option value="H2">제목2</option>
            <option value="H3">제목3</option>
            <option value="PRE">코드블록</option>
          </select>
          <select data-action="font-size" title="글자 크기">
            <option value="">크기</option>
            <option value="2">작게</option>
            <option value="3">보통</option>
            <option value="4">중간</option>
            <option value="5">크게</option>
            <option value="6">아주 크게</option>
          </select>
          <input type="color" data-action="fore-color" title="글자색" value="#111111" />
          <input type="color" data-action="back-color" title="배경색" value="#fff59d" />
          <span class="sep"></span>
          <button type="button" data-cmd="insertUnorderedList" title="글머리표">• 목록</button>
          <button type="button" data-cmd="insertOrderedList" title="번호 목록">1. 목록</button>
          <button type="button" data-cmd="indent" title="들여쓰기">들여+</button>
          <button type="button" data-cmd="outdent" title="내어쓰기">들여-</button>
          <button type="button" data-cmd="formatBlock" data-value="BLOCKQUOTE" title="인용">인용</button>
          <button type="button" data-cmd="insertHorizontalRule" title="구분선">선</button>
          <span class="sep"></span>
          <button type="button" data-cmd="justifyLeft" title="왼쪽 정렬">좌</button>
          <button type="button" data-cmd="justifyCenter" title="가운데 정렬">중</button>
          <button type="button" data-cmd="justifyRight" title="오른쪽 정렬">우</button>
          <span class="sep"></span>
          <button type="button" data-action="link" title="링크">링크</button>
          <button type="button" data-cmd="unlink" title="링크 해제">링크해제</button>
          <button type="button" data-action="image-url" title="이미지 URL">이미지URL</button>
          <button type="button" data-action="image-file" title="이미지 파일">이미지파일</button>
          <button type="button" data-action="table-insert" title="표 삽입">표+</button>
          <button type="button" data-action="table-row-add" title="행 추가">행+</button>
          <button type="button" data-action="table-col-add" title="열 추가">열+</button>
          <button type="button" data-action="table-row-del" title="행 삭제">행-</button>
          <button type="button" data-action="table-col-del" title="열 삭제">열-</button>
          <button type="button" data-cmd="removeFormat" title="서식 제거">서식해제</button>
          <button type="button" data-action="toggle-source" title="HTML 편집">HTML</button>
        </div>
        <div id="${id}" class="rte-editor" contenteditable="true" data-placeholder="${Fmt.escape(placeholder)}"></div>
        <textarea class="rte-source" style="display:none;"></textarea>
        <input type="file" class="rte-image-input" accept="image/*" style="display:none;" />
      </div>
    `;

    const root = container.querySelector('.rte');
    const editor = root.querySelector('.rte-editor');
    const sourceArea = root.querySelector('.rte-source');
    const imageInput = root.querySelector('.rte-image-input');
    editor.innerHTML = initialHTML;
    sourceArea.value = initialHTML;
    let sourceMode = false;
    document.execCommand('styleWithCSS', false, true);

    const focusEditor = () => editor.focus();
    const getCurrentHTML = () => (sourceMode ? sourceArea.value : editor.innerHTML).trim();
    const hasVisualContent = (html) => /<img|<table|<hr/i.test(html);

    const exec = (cmd, value = null) => {
      if (sourceMode) return;
      focusEditor();
      document.execCommand(cmd, false, value);
    };

    const insertHTML = (html) => {
      if (sourceMode) return;
      focusEditor();
      document.execCommand('insertHTML', false, html);
    };

    root.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        const value = btn.dataset.value || null;
        exec(cmd, value);
      });
    });

    root.querySelector('[data-action="format-block"]').addEventListener('change', (e) => {
      if (!e.target.value) return;
      exec('formatBlock', e.target.value);
      e.target.value = 'P';
    });

    root.querySelector('[data-action="font-size"]').addEventListener('change', (e) => {
      if (!e.target.value) return;
      exec('fontSize', e.target.value);
      e.target.value = '';
    });

    root.querySelector('[data-action="fore-color"]').addEventListener('input', (e) => {
      exec('foreColor', e.target.value);
    });

    root.querySelector('[data-action="back-color"]').addEventListener('input', (e) => {
      exec('hiliteColor', e.target.value);
    });

    root.querySelector('[data-action="link"]').addEventListener('click', () => {
      const url = prompt('링크 URL을 입력하세요', 'https://');
      if (!url) return;
      exec('createLink', url);
    });

    root.querySelector('[data-action="image-url"]').addEventListener('click', () => {
      const url = prompt('이미지 URL을 입력하세요', 'https://');
      if (!url) return;
      insertHTML(`<img src="${Fmt.escape(url)}" alt="image" />`);
    });

    root.querySelector('[data-action="image-file"]').addEventListener('click', () => {
      imageInput.click();
    });

    const insertImageFromFile = async (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 삽입 가능합니다.');
        return;
      }
      try {
        if (onImageUpload) {
          const uploaded = await onImageUpload(file);
          insertHTML(`<img src="${Fmt.escape(uploaded.url)}" alt="${Fmt.escape(uploaded.filename || file.name)}" />`);
          return;
        }
      } catch (err) {
        alert(err.message || '이미지 업로드 실패');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        insertHTML(`<img src="${reader.result}" alt="${Fmt.escape(file.name)}" />`);
      };
      reader.readAsDataURL(file);
    };

    imageInput.addEventListener('change', async () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      await insertImageFromFile(file);
      imageInput.value = '';
    });

    editor.addEventListener('paste', async (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items || sourceMode) return;
      const imageItem = [...items].find((it) => it.type && it.type.startsWith('image/'));
      if (!imageItem) return;
      e.preventDefault();
      const file = imageItem.getAsFile();
      await insertImageFromFile(file);
    });

    editor.addEventListener('drop', async (e) => {
      if (sourceMode) return;
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;
      const image = [...files].find((f) => f.type && f.type.startsWith('image/'));
      if (!image) return;
      e.preventDefault();
      await insertImageFromFile(image);
    });

    root.querySelector('[data-action="table-insert"]').addEventListener('click', () => {
      const rows = parseInt(prompt('행 수를 입력하세요', '3') || '', 10);
      const cols = parseInt(prompt('열 수를 입력하세요', '3') || '', 10);
      if (!rows || !cols || rows < 1 || cols < 1) return;
      let tableHTML = '<table border="1"><tbody>';
      for (let r = 0; r < rows; r++) {
        tableHTML += '<tr>';
        for (let c = 0; c < cols; c++) {
          tableHTML += '<td>&nbsp;</td>';
        }
        tableHTML += '</tr>';
      }
      tableHTML += '</tbody></table><p></p>';
      insertHTML(tableHTML);
    });

    const currentCell = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.getRangeAt(0).startContainer;
      return (node.nodeType === 1 ? node : node.parentElement).closest('td,th');
    };

    root.querySelector('[data-action="table-row-add"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) return alert('표 안의 셀을 선택하세요.');
      const row = cell.parentElement;
      const tbody = row.parentElement;
      const newRow = row.cloneNode(true);
      newRow.querySelectorAll('td,th').forEach((c) => { c.innerHTML = '&nbsp;'; });
      row.after(newRow);
      tbody.normalize();
    });

    root.querySelector('[data-action="table-col-add"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) return alert('표 안의 셀을 선택하세요.');
      const colIndex = [...cell.parentElement.children].indexOf(cell);
      const table = cell.closest('table');
      table.querySelectorAll('tr').forEach((tr) => {
        const ref = tr.children[colIndex];
        const tag = ref ? ref.tagName.toLowerCase() : 'td';
        const n = document.createElement(tag);
        n.innerHTML = '&nbsp;';
        if (ref) ref.after(n);
        else tr.appendChild(n);
      });
    });

    root.querySelector('[data-action="table-row-del"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) return alert('표 안의 셀을 선택하세요.');
      const row = cell.parentElement;
      const table = row.closest('table');
      if (table.querySelectorAll('tr').length <= 1) return alert('마지막 행은 삭제할 수 없습니다.');
      row.remove();
    });

    root.querySelector('[data-action="table-col-del"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) return alert('표 안의 셀을 선택하세요.');
      const colIndex = [...cell.parentElement.children].indexOf(cell);
      const table = cell.closest('table');
      const firstRowCells = table.querySelector('tr').children.length;
      if (firstRowCells <= 1) return alert('마지막 열은 삭제할 수 없습니다.');
      table.querySelectorAll('tr').forEach((tr) => {
        if (tr.children[colIndex]) tr.children[colIndex].remove();
      });
    });

    const toggleSourceButton = root.querySelector('[data-action="toggle-source"]');
    const toggleSourceMode = () => {
      sourceMode = !sourceMode;
      if (sourceMode) {
        sourceArea.value = editor.innerHTML;
        editor.style.display = 'none';
        sourceArea.style.display = 'block';
        toggleSourceButton.classList.add('active');
      } else {
        editor.innerHTML = sourceArea.value;
        sourceArea.style.display = 'none';
        editor.style.display = 'block';
        toggleSourceButton.classList.remove('active');
      }
    };
    toggleSourceButton.addEventListener('click', toggleSourceMode);

    return {
      getHTML() {
        return getCurrentHTML();
      },
      getSanitizedHTML() {
        return Fmt.sanitizeHtml(getCurrentHTML());
      },
      isEmpty() {
        const html = getCurrentHTML();
        return !Fmt.excerpt(html, 1) && !hasVisualContent(html);
      },
      setHTML(html) {
        if (sourceMode) sourceArea.value = html || '';
        editor.innerHTML = html || '';
      },
      focus() {
        if (sourceMode) sourceArea.focus();
        else focusEditor();
      },
    };
  },
};


