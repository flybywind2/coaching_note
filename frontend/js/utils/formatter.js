/**
 * Formatter 관련 프론트엔드 유틸리티 헬퍼입니다.
 */

const Fmt = {
  KST_TIMEZONE: 'Asia/Seoul',
  parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-').map((v) => Number.parseInt(v, 10));
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    }
    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
    const normalized = hasTimezone ? raw : `${raw}Z`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(raw);
    if (!Number.isNaN(fallback.getTime())) return fallback;
    return null;
  },
  date(str) {
    if (!str) return '-';
    const dateValue = this.parseDate(str);
    if (!dateValue) return '-';
    return dateValue.toLocaleDateString('ko-KR', { timeZone: this.KST_TIMEZONE });
  },
  datetime(str) {
    if (!str) return '-';
    const dateValue = this.parseDate(str);
    if (!dateValue) return '-';
    return dateValue.toLocaleString('ko-KR', { timeZone: this.KST_TIMEZONE });
  },
  progress(val) {
    return `<div class="progress-bar"><div class="progress-fill" style="width:${val}%"></div><span>${val}%</span></div>`;
  },
  role(r) {
    const map = {
      admin: '관리자',
      coach: '코치(구)',
      internal_coach: '사내코치',
      external_coach: '외부코치',
      participant: '참여자',
      observer: '참관자',
    };
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

  rich(str, fallback = '-') {
    if (!str) return fallback;
    const value = String(str);
    const hasHtml = /<\/?[a-z][\s\S]*>/i.test(value);
    if (!hasHtml) return this.escape(value).replace(/\n/g, '<br>');
    return this.sanitizeHtml(value);
  },

  excerpt(str, limit = 100) {
    if (!str) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(str), 'text/html');
    const text = (doc.body.textContent || '').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
  },

  sanitizeHtml(html) {
    const allowedTags = new Set([
      'p', 'br', 'div', 'span',
      'strong', 'b', 'em', 'i', 'u', 's',
      'font',
      'h1', 'h2', 'h3', 'h4',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img', 'hr',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ]);
    const allowedAttrs = {
      a: new Set(['href', 'target', 'rel']),
      img: new Set(['src', 'alt', 'title', 'width', 'height']),
      font: new Set(['size', 'color']),
      th: new Set(['colspan', 'rowspan', 'align', 'style']),
      td: new Set(['colspan', 'rowspan', 'align', 'style']),
      div: new Set(['align', 'style']),
      p: new Set(['align', 'style']),
      span: new Set(['style']),
      h1: new Set(['align', 'style']),
      h2: new Set(['align', 'style']),
      h3: new Set(['align', 'style']),
      h4: new Set(['align', 'style']),
    };
    const allowedStyleProps = new Set([
      'color',
      'background-color',
      'text-align',
      'font-size',
      'width',
      'height',
      'min-width',
      'min-height',
    ]);

    const isSafeUrl = (url, forImage = false) => {
      if (!url) return false;
      const v = String(url).trim().toLowerCase();
      if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/') || v.startsWith('#')) return true;
      if (!forImage && v.startsWith('mailto:')) return true;
      if (forImage && v.startsWith('data:image/')) return true;
      return false;
    };

    const tpl = document.createElement('template');
    tpl.innerHTML = html;

    const sanitizeStyle = (style) => {
      if (!style) return '';
      return style
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [rawProp, ...rest] = part.split(':');
          const prop = (rawProp || '').trim().toLowerCase();
          const value = (rest.join(':') || '').trim();
          if (!allowedStyleProps.has(prop)) return null;
          if (!/^[#(),.%\s\-\w]+$/i.test(value)) return null;
          return `${prop}: ${value}`;
        })
        .filter(Boolean)
        .join('; ');
    };

    const sanitizeNode = (node) => {
      [...node.children].forEach((el) => {
        const tag = el.tagName.toLowerCase();
        if (!allowedTags.has(tag)) {
          const text = document.createTextNode(el.textContent || '');
          el.replaceWith(text);
          return;
        }

        [...el.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            return;
          }
          const tagAllowed = allowedAttrs[tag] || new Set();
          if (!tagAllowed.has(name)) {
            el.removeAttribute(attr.name);
            return;
          }
          if (name === 'style') {
            const safeStyle = sanitizeStyle(value);
            if (!safeStyle) el.removeAttribute('style');
            else el.setAttribute('style', safeStyle);
          }
          if (tag === 'a' && name === 'href' && !isSafeUrl(value, false)) el.removeAttribute('href');
          if (tag === 'img' && name === 'src' && !isSafeUrl(value, true)) el.removeAttribute('src');
        });

        if (tag === 'a') {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
        sanitizeNode(el);
      });
    };

    sanitizeNode(tpl.content);
    return tpl.innerHTML;
  },
};


