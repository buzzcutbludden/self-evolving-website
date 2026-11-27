const { runAgentCycle, response, requireAdmin } = require('./_lib.js');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  try {
    const result = await runAgentCycle();
    return response(200, { success: true, ...result });
  } catch (err) {
    return response(500, { success: false, error: err.message });
  }
};
