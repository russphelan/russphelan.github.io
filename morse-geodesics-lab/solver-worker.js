'use strict';
importScripts('./compact-collar.js?v=compact-collar-3', './surface.js?v=compact-collar-3', './solver.js?v=compact-collar-3');
let generation = 0;
self.onmessage = async event => {
  if (event.data?.type === 'cancel') { generation++; return; }
  if (event.data?.type !== 'search') return;
  const current = ++generation;
  try {
    let latestProgress = null;
    const curves = await self.GeodesicSolver.search(event.data.options || {},
      curve => { if (generation === current) self.postMessage({type: 'curve', curve}); },
      progress => { if (generation === current) { latestProgress = progress; self.postMessage({type: 'progress', progress}); } },
      () => generation !== current);
    // Curves have already been delivered individually. Sending the full array
    // again duplicates their geometry through structured clone for no consumer.
    if (generation === current) self.postMessage({type: 'done', progress: curves.searchProgress || latestProgress});
  } catch (error) {
    if (generation === current) self.postMessage({type: 'error', message: String(error.message || error)});
  }
};
