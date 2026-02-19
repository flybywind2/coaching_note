const Validator = {
  required(val, label) {
    if (!val || !String(val).trim()) throw new Error(`${label}은(는) 필수입니다.`);
  },
  minLength(val, min, label) {
    if (String(val).length < min) throw new Error(`${label}은(는) 최소 ${min}자 이상이어야 합니다.`);
  },
  dateRange(start, end) {
    if (start && end && new Date(start) > new Date(end))
      throw new Error('시작일이 종료일보다 늦을 수 없습니다.');
  },
};
