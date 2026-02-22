/**
 * RichEditor 재사용 UI 컴포넌트 모듈입니다.
 */

const RichEditor = {
  create(container, options = {}) {
    const TABLE_PICKER_MAX = 10;
    const TABLE_INSERT_MAX = 30;
    const TABLE_MIN_COL_WIDTH = 60;
    const TABLE_MIN_ROW_HEIGHT = 28;
    const TABLE_EDGE_THRESHOLD = 6;

    const initialHTML = options.initialHTML || '';
    const placeholder = options.placeholder || '내용을 입력하세요...';
    const compact = options.compact === true;
    const onImageUpload = options.onImageUpload || null;
    const onFileUpload = options.onFileUpload || null;
    const id = `rte-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    container.innerHTML = `
      <div class="rte ${compact ? 'compact' : ''}">
        <div class="rte-toolbar" role="toolbar" aria-label="텍스트 편집 도구">
          <div class="rte-group">
            <button type="button" data-cmd="undo" title="실행 취소">↶</button>
            <button type="button" data-cmd="redo" title="다시 실행">↷</button>
          </div>
          <div class="rte-group">
            <select data-action="format-block" title="문단 형식">
              <option value="P">본문</option>
              <option value="H1">제목 1</option>
              <option value="H2">제목 2</option>
              <option value="H3">제목 3</option>
              <option value="PRE">코드 블록</option>
            </select>
            <select data-action="font-size" title="글자 크기">
              <option value="">글자 크기</option>
              <option value="2">작게</option>
              <option value="3">보통</option>
              <option value="4">중간</option>
              <option value="5">크게</option>
              <option value="6">아주 크게</option>
            </select>
            <input type="color" data-action="fore-color" title="글자색" value="#111111" />
            <input type="color" data-action="back-color" title="배경색" value="#fff59d" />
          </div>
          <div class="rte-group">
            <button type="button" data-cmd="bold" title="굵게">굵게</button>
            <button type="button" data-cmd="italic" title="기울임">기울임</button>
            <button type="button" data-cmd="underline" title="밑줄">밑줄</button>
            <button type="button" data-cmd="strikeThrough" title="취소선">취소선</button>
            <button type="button" data-cmd="superscript" title="윗첨자">윗첨자</button>
            <button type="button" data-cmd="subscript" title="아래첨자">아래첨자</button>
          </div>
          <div class="rte-group">
            <button type="button" data-cmd="insertUnorderedList" title="글머리 기호">글머리표</button>
            <button type="button" data-cmd="insertOrderedList" title="번호 매기기">번호 매기기</button>
            <button type="button" data-cmd="indent" title="들여쓰기">들여쓰기</button>
            <button type="button" data-cmd="outdent" title="내어쓰기">내어쓰기</button>
            <button type="button" data-cmd="formatBlock" data-value="BLOCKQUOTE" title="인용">인용</button>
            <button type="button" data-cmd="insertHorizontalRule" title="구분선">구분선</button>
          </div>
          <div class="rte-group rte-group-align">
            <button type="button" data-cmd="justifyLeft" title="왼쪽 정렬">왼쪽</button>
            <button type="button" data-cmd="justifyCenter" title="가운데 정렬">가운데</button>
            <button type="button" data-cmd="justifyRight" title="오른쪽 정렬">오른쪽</button>
          </div>
          <div class="rte-group">
            <button type="button" data-action="link" title="링크 삽입">링크</button>
            <button type="button" data-cmd="unlink" title="링크 해제">링크 해제</button>
            <button type="button" data-action="image-url" title="이미지 URL 삽입">이미지 URL</button>
            <button type="button" data-action="image-file" title="이미지 파일 삽입">이미지 파일</button>
            <button type="button" data-action="file-attach" title="파일 첨부">파일 첨부</button>
          </div>
          <div class="rte-group">
            <button type="button" data-action="table-insert" title="표 삽입">표 삽입</button>
            <button type="button" data-action="table-row-add" title="행 추가">행 추가</button>
            <button type="button" data-action="table-col-add" title="열 추가">열 추가</button>
            <button type="button" data-action="table-row-del" title="행 삭제">행 삭제</button>
            <button type="button" data-action="table-col-del" title="열 삭제">열 삭제</button>
          </div>
          <div class="rte-group">
            <button type="button" data-cmd="removeFormat" title="모든 서식 지우기">서식 지우기</button>
            <button type="button" data-action="toggle-source" title="HTML 원본 편집">HTML</button>
          </div>
        </div>
        <div class="rte-table-picker" data-role="table-picker" hidden>
          <div class="rte-table-picker-head">표 크기 선택</div>
          <div class="rte-table-picker-grid" data-role="table-picker-grid"></div>
          <div class="rte-table-picker-status" data-role="table-picker-status">0 x 0</div>
          <button type="button" class="rte-table-picker-advanced-toggle" data-role="table-picker-advanced-toggle">직접 입력</button>
        </div>
        <div id="${id}" class="rte-editor" contenteditable="true" data-placeholder="${Fmt.escape(placeholder)}"></div>
        <textarea class="rte-source" style="display:none;"></textarea>
        <input type="file" class="rte-image-input" accept="image/*" style="display:none;" />
        <input type="file" class="rte-file-input" accept=".jpg,.jpeg,.png,.gif,.pdf,.ppt,.pptx,.xls,.xlsx,.csv,.doc,.docx,.hwp,.hwpx,.txt,.zip" style="display:none;" />
        <div class="rte-inline-modal-host" data-role="rte-inline-modal-host"></div>
      </div>
    `;

    const root = container.querySelector('.rte');
    const editor = root.querySelector('.rte-editor');
    const sourceArea = root.querySelector('.rte-source');
    const imageInput = root.querySelector('.rte-image-input');
    const fileInput = root.querySelector('.rte-file-input');
    const tableInsertButton = root.querySelector('[data-action="table-insert"]');
    const tablePicker = root.querySelector('[data-role="table-picker"]');
    const tablePickerGrid = root.querySelector('[data-role="table-picker-grid"]');
    const tablePickerStatus = root.querySelector('[data-role="table-picker-status"]');
    const tablePickerAdvancedToggle = root.querySelector('[data-role="table-picker-advanced-toggle"]');
    const inlineModalHost = root.querySelector('[data-role="rte-inline-modal-host"]');
    const formatBlockSelect = root.querySelector('[data-action="format-block"]');
    const fontSizeSelect = root.querySelector('[data-action="font-size"]');
    editor.innerHTML = initialHTML;
    sourceArea.value = initialHTML;
    let sourceMode = false;
    let tablePickerRows = 0;
    let tablePickerCols = 0;
    let resizeState = null;
    let resizeHoverCell = null;
    document.execCommand('styleWithCSS', false, true);

    const focusEditor = () => editor.focus();
    const getCurrentHTML = () => (sourceMode ? sourceArea.value : editor.innerHTML).trim();
    const hasVisualContent = (html) => /<img|<table|<hr/i.test(html);
    const normalizeFormatBlock = (value) => {
      const text = String(value || '')
        .replace(/[<>]/g, '')
        .trim()
        .toUpperCase();
      if (!text || text === 'DIV') return 'P';
      if (text.includes('H1')) return 'H1';
      if (text.includes('H2')) return 'H2';
      if (text.includes('H3')) return 'H3';
      if (text.includes('PRE')) return 'PRE';
      return 'P';
    };
    const statefulCommands = new Set([
      'bold',
      'italic',
      'underline',
      'strikeThrough',
      'superscript',
      'subscript',
      'insertUnorderedList',
      'insertOrderedList',
      'justifyLeft',
      'justifyCenter',
      'justifyRight',
    ]);
    const toolbarButtons = [...root.querySelectorAll('.rte-toolbar button')];
    const toolbarSelects = [...root.querySelectorAll('.rte-toolbar select')];
    const toolbarColorInputs = [...root.querySelectorAll('.rte-toolbar input[type="color"]')];
    const syncToolbarState = () => {
      if (sourceMode) return;
      toolbarButtons.forEach((button) => {
        const cmd = button.dataset.cmd;
        if (!cmd || !statefulCommands.has(cmd)) return;
        let active = false;
        try {
          active = document.queryCommandState(cmd);
        } catch (err) {
          active = false;
        }
        button.classList.toggle('active', !!active);
      });
      let blockValue = 'P';
      try {
        blockValue = normalizeFormatBlock(document.queryCommandValue('formatBlock'));
      } catch (err) {
        blockValue = 'P';
      }
      formatBlockSelect.value = blockValue;
    };

    const exec = (cmd, value = null) => {
      if (sourceMode) return;
      focusEditor();
      document.execCommand(cmd, false, value);
      syncToolbarState();
    };

    const insertHTML = (html) => {
      if (sourceMode) return;
      focusEditor();
      document.execCommand('insertHTML', false, html);
      syncToolbarState();
    };

    const clearResizeHover = () => {
      editor.classList.remove('rte-resize-col', 'rte-resize-row');
      if (resizeHoverCell) {
        resizeHoverCell.classList.remove('rte-cell-resize-col', 'rte-cell-resize-row');
        resizeHoverCell = null;
      }
    };

    const setResizeHover = (hit) => {
      clearResizeHover();
      if (!hit) return;
      resizeHoverCell = hit.cell;
      editor.classList.add(hit.mode === 'col' ? 'rte-resize-col' : 'rte-resize-row');
      resizeHoverCell.classList.add(hit.mode === 'col' ? 'rte-cell-resize-col' : 'rte-cell-resize-row');
    };

    const currentCell = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const node = sel.getRangeAt(0).startContainer;
      const base = node.nodeType === 1 ? node : node.parentElement;
      return base ? base.closest('td,th') : null;
    };

    const getResizeHit = (eventTarget, clientX, clientY) => {
      if (sourceMode) return null;
      const cell = eventTarget instanceof Element ? eventTarget.closest('td,th') : null;
      if (!cell || !editor.contains(cell)) return null;
      const rect = cell.getBoundingClientRect();
      const rightGap = rect.right - clientX;
      const bottomGap = rect.bottom - clientY;
      const nearRight = rightGap >= 0 && rightGap <= TABLE_EDGE_THRESHOLD;
      const nearBottom = bottomGap >= 0 && bottomGap <= TABLE_EDGE_THRESHOLD;
      if (!nearRight && !nearBottom) return null;
      const mode = nearRight && nearBottom
        ? (rightGap <= bottomGap ? 'col' : 'row')
        : (nearRight ? 'col' : 'row');
      return { mode, cell };
    };

    const stopResize = () => {
      resizeState = null;
      clearResizeHover();
      document.body.classList.remove('rte-resizing', 'rte-resizing-col', 'rte-resizing-row');
    };

    const closeInlineModal = () => {
      if (!inlineModalHost) return;
      inlineModalHost.innerHTML = '';
    };

    const openInlineModal = ({ title, bodyHtml, submitLabel = '확인', onSubmit = null, onCancel = null }) => {
      if (!inlineModalHost) return;
      closeInlineModal();
      inlineModalHost.innerHTML = `
        <div class="rte-inline-modal-overlay">
          <div class="rte-inline-modal-box">
            <h4>${Fmt.escape(title || '안내')}</h4>
            <div class="rte-inline-modal-form">
              <div class="rte-inline-modal-body">${bodyHtml || ''}</div>
              <div class="rte-inline-modal-actions">
                <button type="button" class="btn btn-sm btn-secondary" data-role="rte-inline-cancel">취소</button>
                <button type="button" class="btn btn-sm btn-primary" data-role="rte-inline-submit">${Fmt.escape(submitLabel)}</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const overlay = inlineModalHost.querySelector('.rte-inline-modal-overlay');
      const box = inlineModalHost.querySelector('.rte-inline-modal-box');
      const cancel = inlineModalHost.querySelector('[data-role="rte-inline-cancel"]');
      const submit = inlineModalHost.querySelector('[data-role="rte-inline-submit"]');
      const modalWrap = inlineModalHost.querySelector('.rte-inline-modal-form');
      const stopPropagation = (e) => e.stopPropagation();
      overlay?.addEventListener('mousedown', stopPropagation);
      overlay?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target !== overlay) return;
        closeInlineModal();
        if (onCancel) onCancel();
      });
      box?.addEventListener('mousedown', stopPropagation);
      box?.addEventListener('click', stopPropagation);

      const submitInlineModal = async (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const collectData = () => {
          const fd = new FormData();
          if (!modalWrap) return fd;
          modalWrap.querySelectorAll('[name]').forEach((field) => {
            if (!(field instanceof HTMLElement)) return;
            const name = field.getAttribute('name');
            if (!name) return;
            if (field instanceof HTMLInputElement) {
              if (field.disabled) return;
              if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
              fd.append(name, field.value ?? '');
              return;
            }
            if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
              if (field.disabled) return;
              fd.append(name, field.value ?? '');
            }
          });
          return fd;
        };
        if (!onSubmit) {
          closeInlineModal();
          return;
        }
        try {
          const formData = collectData();
          const keepOpen = await onSubmit(formData);
          if (!keepOpen) closeInlineModal();
        } catch (err) {
          openInlineMessage(err?.message || '처리 중 오류가 발생했습니다.');
        }
      };
      cancel?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeInlineModal();
        if (onCancel) onCancel();
      });
      submit?.addEventListener('click', submitInlineModal);
      modalWrap?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeInlineModal();
          if (onCancel) onCancel();
          return;
        }
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target instanceof HTMLElement ? e.target : null;
        if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        submitInlineModal(e);
      });
    };

    const openInlineMessage = (message, title = '안내') => {
      openInlineModal({
        title,
        bodyHtml: `<p class="rte-inline-modal-message">${Fmt.escape(message)}</p>`,
        submitLabel: '확인',
      });
      const cancel = inlineModalHost?.querySelector('[data-role="rte-inline-cancel"]');
      if (cancel) cancel.style.display = 'none';
      const submit = inlineModalHost?.querySelector('[data-role="rte-inline-submit"]');
      if (submit) submit.textContent = '확인';
    };

    const buildTableHTML = (rows, cols, options = {}) => {
      const safeRows = Math.max(1, Math.min(TABLE_INSERT_MAX, rows));
      const safeCols = Math.max(1, Math.min(TABLE_INSERT_MAX, cols));
      const colWidthPx = Number.parseInt(options.colWidth || '', 10);
      const rowHeightPx = Number.parseInt(options.rowHeight || '', 10);
      const useFixedColWidth = Number.isFinite(colWidthPx) && colWidthPx >= TABLE_MIN_COL_WIDTH;
      const safeRowHeight = Number.isFinite(rowHeightPx) && rowHeightPx >= TABLE_MIN_ROW_HEIGHT ? rowHeightPx : 36;
      const widthPercent = (100 / safeCols).toFixed(2);
      let html = '<table><tbody>';
      for (let r = 0; r < safeRows; r++) {
        html += '<tr>';
        for (let c = 0; c < safeCols; c++) {
          const widthRule = useFixedColWidth ? `${colWidthPx}px` : `${widthPercent}%`;
          html += `<td style="width:${widthRule};height:${safeRowHeight}px;">&nbsp;</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table><p></p>';
      return html;
    };

    const updateTablePickerPreview = (rows, cols) => {
      tablePickerRows = rows;
      tablePickerCols = cols;
      tablePickerStatus.textContent = `${rows} x ${cols}`;
      tablePickerGrid.querySelectorAll('.rte-table-picker-cell').forEach((cell) => {
        const cellRow = Number.parseInt(cell.dataset.row || '0', 10);
        const cellCol = Number.parseInt(cell.dataset.col || '0', 10);
        cell.classList.toggle('active', cellRow <= rows && cellCol <= cols);
      });
    };

    const closeTablePicker = () => {
      tablePicker.hidden = true;
      tableInsertButton.classList.remove('active');
      updateTablePickerPreview(0, 0);
    };

    const openTablePicker = () => {
      if (sourceMode) return;
      tablePicker.hidden = false;
      tableInsertButton.classList.add('active');
      updateTablePickerPreview(0, 0);
    };

    const insertTable = (rows, cols, options = {}) => {
      if (!rows || !cols) return;
      insertHTML(buildTableHTML(rows, cols, options));
      closeTablePicker();
    };

    for (let row = 1; row <= TABLE_PICKER_MAX; row++) {
      for (let col = 1; col <= TABLE_PICKER_MAX; col++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rte-table-picker-cell';
        btn.dataset.row = String(row);
        btn.dataset.col = String(col);
        btn.setAttribute('aria-label', `${row} x ${col}`);
        btn.addEventListener('mouseenter', () => updateTablePickerPreview(row, col));
        btn.addEventListener('focus', () => updateTablePickerPreview(row, col));
        btn.addEventListener('click', () => insertTable(row, col));
        tablePickerGrid.appendChild(btn);
      }
    }
    tablePickerGrid.addEventListener('mouseleave', () => {
      updateTablePickerPreview(tablePickerRows, tablePickerCols);
    });
    tablePickerAdvancedToggle.addEventListener('click', () => {
      openInlineModal({
        title: '표 삽입(직접 입력)',
        bodyHtml: `
          <div class="rte-inline-modal-grid">
            <label>행
              <input type="number" name="rows" min="1" max="${TABLE_INSERT_MAX}" step="1" value="3" />
            </label>
            <label>열
              <input type="number" name="cols" min="1" max="${TABLE_INSERT_MAX}" step="1" value="3" />
            </label>
            <label>기본 열 폭(px)
              <input type="number" name="col_width" min="${TABLE_MIN_COL_WIDTH}" max="360" step="1" placeholder="자동" />
            </label>
            <label>기본 행 높이(px)
              <input type="number" name="row_height" min="${TABLE_MIN_ROW_HEIGHT}" max="240" step="1" placeholder="36" />
            </label>
          </div>
          <p class="form-error rte-inline-modal-error" data-role="rte-inline-modal-error" style="display:none;"></p>
        `,
        submitLabel: '표 삽입',
        onSubmit: (fd) => {
          const rows = Number.parseInt((fd.get('rows') || '0').toString(), 10);
          const cols = Number.parseInt((fd.get('cols') || '0').toString(), 10);
          const errEl = inlineModalHost?.querySelector('[data-role="rte-inline-modal-error"]');
          if (!rows || !cols || rows < 1 || cols < 1) {
            if (errEl) {
              errEl.textContent = '행/열 값을 1 이상 입력하세요.';
              errEl.style.display = 'block';
            }
            return true;
          }
          insertTable(rows, cols, {
            colWidth: fd.get('col_width') ? String(fd.get('col_width')) : null,
            rowHeight: fd.get('row_height') ? String(fd.get('row_height')) : null,
          });
          return false;
        },
      });
    });

    root.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        const value = btn.dataset.value || null;
        exec(cmd, value);
      });
    });

    formatBlockSelect.addEventListener('change', (e) => {
      if (!e.target.value) return;
      const map = {
        P: '<p>',
        H1: '<h1>',
        H2: '<h2>',
        H3: '<h3>',
        PRE: '<pre>',
      };
      exec('formatBlock', map[e.target.value] || '<p>');
    });

    fontSizeSelect.addEventListener('change', (e) => {
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
    root.querySelector('[data-action="file-attach"]').addEventListener('click', () => {
      fileInput.click();
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

    const insertAttachmentFromFile = async (file) => {
      if (!file) return;
      if (!onFileUpload) {
        alert('파일 업로드 기능이 설정되지 않았습니다.');
        return;
      }
      try {
        const uploaded = await onFileUpload(file);
        if (!uploaded || !uploaded.url) throw new Error('파일 업로드 응답이 올바르지 않습니다.');
        const filename = Fmt.escape(uploaded.filename || file.name || '첨부파일');
        const url = Fmt.escape(uploaded.url);
        insertHTML(`<p><a href="${url}" target="_blank" rel="noopener noreferrer">${filename}</a></p>`);
      } catch (err) {
        alert(err.message || '파일 업로드 실패');
      }
    };

    imageInput.addEventListener('change', async () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      await insertImageFromFile(file);
      imageInput.value = '';
    });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      await insertAttachmentFromFile(file);
      fileInput.value = '';
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
      const firstFile = files[0];
      if (!image && !firstFile) return;
      e.preventDefault();
      if (image) {
        await insertImageFromFile(image);
        return;
      }
      await insertAttachmentFromFile(firstFile);
    });

    editor.addEventListener('keydown', (e) => {
      if (sourceMode) return;
      if (e.key !== 'Tab') return;
      e.preventDefault();
      focusEditor();
      if (e.shiftKey) {
        document.execCommand('outdent', false, null);
      } else {
        document.execCommand('indent', false, null);
      }
      syncToolbarState();
    });
    editor.addEventListener('keyup', syncToolbarState);
    editor.addEventListener('mouseup', syncToolbarState);
    editor.addEventListener('focus', syncToolbarState);
    document.addEventListener('selectionchange', () => {
      if (sourceMode) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const anchor = selection.anchorNode;
      if (!anchor) return;
      const base = anchor.nodeType === 1 ? anchor : anchor.parentElement;
      if (!base || !editor.contains(base)) return;
      syncToolbarState();
    });

    tableInsertButton.addEventListener('click', () => {
      if (tablePicker.hidden) openTablePicker();
      else closeTablePicker();
    });

    root.querySelector('[data-action="table-row-add"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) {
        openInlineMessage('표 안의 셀을 선택하세요.');
        return;
      }
      const row = cell.parentElement;
      const tbody = row.parentElement;
      openInlineModal({
        title: '행 추가',
        bodyHtml: `
          <label>추가할 행 수
            <input type="number" name="count" min="1" max="20" step="1" value="1" />
          </label>
          <p class="form-error rte-inline-modal-error" data-role="rte-inline-modal-error" style="display:none;"></p>
        `,
        submitLabel: '추가',
        onSubmit: (fd) => {
          const count = Number.parseInt((fd.get('count') || '0').toString(), 10);
          const errEl = inlineModalHost?.querySelector('[data-role="rte-inline-modal-error"]');
          if (!count || count < 1 || count > 20) {
            if (errEl) {
              errEl.textContent = '1~20 범위의 숫자를 입력하세요.';
              errEl.style.display = 'block';
            }
            return true;
          }
          let anchor = row;
          for (let i = 0; i < count; i += 1) {
            const newRow = row.cloneNode(true);
            newRow.querySelectorAll('td,th').forEach((c) => { c.innerHTML = '&nbsp;'; });
            anchor.after(newRow);
            anchor = newRow;
          }
          tbody.normalize();
          return false;
        },
      });
    });

    root.querySelector('[data-action="table-col-add"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) {
        openInlineMessage('표 안의 셀을 선택하세요.');
        return;
      }
      const colIndex = [...cell.parentElement.children].indexOf(cell);
      const table = cell.closest('table');
      openInlineModal({
        title: '열 추가',
        bodyHtml: `
          <label>추가할 열 수
            <input type="number" name="count" min="1" max="20" step="1" value="1" />
          </label>
          <p class="form-error rte-inline-modal-error" data-role="rte-inline-modal-error" style="display:none;"></p>
        `,
        submitLabel: '추가',
        onSubmit: (fd) => {
          const count = Number.parseInt((fd.get('count') || '0').toString(), 10);
          const errEl = inlineModalHost?.querySelector('[data-role="rte-inline-modal-error"]');
          if (!count || count < 1 || count > 20) {
            if (errEl) {
              errEl.textContent = '1~20 범위의 숫자를 입력하세요.';
              errEl.style.display = 'block';
            }
            return true;
          }
          table.querySelectorAll('tr').forEach((tr) => {
            let ref = tr.children[colIndex];
            for (let i = 0; i < count; i += 1) {
              const tag = ref ? ref.tagName.toLowerCase() : 'td';
              const n = document.createElement(tag);
              n.innerHTML = '&nbsp;';
              if (ref && ref.style.width) n.style.width = ref.style.width;
              if (ref && ref.style.height) n.style.height = ref.style.height;
              if (ref) {
                ref.after(n);
                ref = n;
              } else {
                tr.appendChild(n);
                ref = n;
              }
            }
          });
          return false;
        },
      });
    });

    root.querySelector('[data-action="table-row-del"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) {
        openInlineMessage('표 안의 셀을 선택하세요.');
        return;
      }
      const row = cell.parentElement;
      const table = row.closest('table');
      if (table.querySelectorAll('tr').length <= 1) {
        openInlineMessage('마지막 행은 삭제할 수 없습니다.');
        return;
      }
      openInlineModal({
        title: '행 삭제',
        bodyHtml: '<p class="rte-inline-modal-message">현재 선택된 행을 삭제하시겠습니까?</p>',
        submitLabel: '삭제',
        onSubmit: () => {
          row.remove();
          return false;
        },
      });
    });

    root.querySelector('[data-action="table-col-del"]').addEventListener('click', () => {
      const cell = currentCell();
      if (!cell) {
        openInlineMessage('표 안의 셀을 선택하세요.');
        return;
      }
      const colIndex = [...cell.parentElement.children].indexOf(cell);
      const table = cell.closest('table');
      const firstRowCells = table.querySelector('tr').children.length;
      if (firstRowCells <= 1) {
        openInlineMessage('마지막 열은 삭제할 수 없습니다.');
        return;
      }
      openInlineModal({
        title: '열 삭제',
        bodyHtml: '<p class="rte-inline-modal-message">현재 선택된 열을 삭제하시겠습니까?</p>',
        submitLabel: '삭제',
        onSubmit: () => {
          table.querySelectorAll('tr').forEach((tr) => {
            if (tr.children[colIndex]) tr.children[colIndex].remove();
          });
          return false;
        },
      });
    });

    editor.addEventListener('mousemove', (e) => {
      if (resizeState || sourceMode) return;
      const hit = getResizeHit(e.target, e.clientX, e.clientY);
      setResizeHover(hit);
    });

    editor.addEventListener('mouseleave', () => {
      if (!resizeState) clearResizeHover();
    });

    editor.addEventListener('mousedown', (e) => {
      const hit = getResizeHit(e.target, e.clientX, e.clientY);
      if (!hit) return;
      e.preventDefault();
      const cell = hit.cell;
      if (hit.mode === 'col') {
        const row = cell.parentElement;
        const colIndex = row ? [...row.children].indexOf(cell) : -1;
        const table = cell.closest('table');
        if (!table || colIndex < 0) return;
        const colCells = [...table.querySelectorAll('tr')]
          .map((tr) => tr.children[colIndex])
          .filter((it) => !!it);
        resizeState = {
          mode: 'col',
          startX: e.clientX,
          colCells,
          startSizes: colCells.map((it) => it.getBoundingClientRect().width),
        };
      } else {
        const row = cell.parentElement;
        if (!row) return;
        const rowCells = [...row.children];
        resizeState = {
          mode: 'row',
          startY: e.clientY,
          rowCells,
          startSizes: rowCells.map((it) => it.getBoundingClientRect().height),
        };
      }
      document.body.classList.add('rte-resizing', `rte-resizing-${hit.mode}`);
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizeState) return;
      e.preventDefault();
      if (resizeState.mode === 'col') {
        const deltaX = e.clientX - resizeState.startX;
        resizeState.colCells.forEach((cell, idx) => {
          const size = Math.max(TABLE_MIN_COL_WIDTH, Math.round(resizeState.startSizes[idx] + deltaX));
          cell.style.width = `${size}px`;
        });
      } else {
        const deltaY = e.clientY - resizeState.startY;
        resizeState.rowCells.forEach((cell, idx) => {
          const size = Math.max(TABLE_MIN_ROW_HEIGHT, Math.round(resizeState.startSizes[idx] + deltaY));
          cell.style.height = `${size}px`;
        });
      }
    });

    document.addEventListener('mouseup', () => {
      if (resizeState) stopResize();
    });

    document.addEventListener('mousedown', (e) => {
      if (inlineModalHost && inlineModalHost.contains(e.target)) return;
      closeInlineModal();
      if (tablePicker.hidden) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest('[data-role="table-picker"]') || target.closest('[data-action="table-insert"]')) return;
      closeTablePicker();
    });

    const toggleSourceButton = root.querySelector('[data-action="toggle-source"]');
    const setToolbarDisabled = (disabled) => {
      toolbarButtons.forEach((button) => {
        if (button === toggleSourceButton) return;
        button.disabled = disabled;
      });
      toolbarSelects.forEach((select) => { select.disabled = disabled; });
      toolbarColorInputs.forEach((input) => { input.disabled = disabled; });
    };
    const toggleSourceMode = () => {
      sourceMode = !sourceMode;
      closeTablePicker();
      closeInlineModal();
      stopResize();
      if (sourceMode) {
        sourceArea.value = editor.innerHTML;
        editor.style.display = 'none';
        sourceArea.style.display = 'block';
        toggleSourceButton.classList.add('active');
        setToolbarDisabled(true);
      } else {
        editor.innerHTML = sourceArea.value;
        sourceArea.style.display = 'none';
        editor.style.display = 'block';
        toggleSourceButton.classList.remove('active');
        setToolbarDisabled(false);
        syncToolbarState();
      }
    };
    toggleSourceButton.addEventListener('click', toggleSourceMode);
    setToolbarDisabled(false);
    syncToolbarState();

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


