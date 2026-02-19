const State = {
  currentBatchId: null,
  currentProjectId: null,
  batches: [],

  set(key, val) { this[key] = val; },
  get(key) { return this[key]; },
};
