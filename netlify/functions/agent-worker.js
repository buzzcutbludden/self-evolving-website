const { runAgentCycle, response, requireAdmin } = require('./_lib.js');

// Long-running work: background functions get up to 15 minutes.
exports.config = { background: true };

exports.handler = async (event) => {
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  try {
    const result = await runAgentCycle();
    console.log('Background agent cycle:', JSON.stringify(result));
    return response(200, { success: true, ...result });
  } catch (err) {
    console.error('Background agent cycle failed:', err.message);
    return response(500, { success: false, error: err.message });
  }
};
