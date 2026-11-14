// Leave one slot available for a small view/preview request while a detailed
// 150 km horizon is running. Never launch an unbounded set of Python workers.
const waiting = [];
let running = 0, heavy = 0;
function drain() {
  while (running < 2) {
    const index = waiting.findIndex(job => !job.heavy || heavy === 0);
    if (index < 0) return;
    const job = waiting.splice(index, 1)[0];
    running++; if (job.heavy) heavy++;
    Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => {
      running--; if (job.heavy) heavy--; drain();
    });
  }
}
export function runTerrainWork(work, { priority = 0, heavy = false } = {}) {
  if (waiting.length >= 64) return Promise.reject(new Error("Terrain is busy. Retry shortly."));
  return new Promise((resolve, reject) => {
    waiting.push({ work, priority, heavy, resolve, reject });
    waiting.sort((a, b) => b.priority - a.priority);
    drain();
  });
}
