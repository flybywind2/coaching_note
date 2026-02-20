/**
 * 공유 클라이언트 상태 저장소와 상태 변경 헬퍼입니다.
 */

const State = {
  currentBatchId: null,
  currentProjectId: null,
  batches: [],

  set(key, val) { this[key] = val; },
  get(key) { return this[key]; },
};


