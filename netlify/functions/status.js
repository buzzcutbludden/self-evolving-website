const { getJSON, response, requireAdmin } = require('./_lib.js');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  try {
    const [history, feedback, state] = await Promise.all([
      getJSON('data/history.json', []),
      getJSON('data/feedback.json', []),
      getJSON('data/agent-state.json', { currentTask: 'Idle', lastRun: null })
    ]);
    return response(200, {
      running: /analyzing|consulting|testing|deploying/i.test(state.currentTask || ''),
      lastRun: state.lastRun || null,
      currentTask: state.currentTask || 'Idle',
      totalImprovements: history.filter(h => h.action === 'improve').length,
      unprocessedFeedback: feedback.filter(f => f.status === 'new').length,
      version: state.version || null
    });
  } catch (err) {
    return response(500, { error: err.message });
  }
};
