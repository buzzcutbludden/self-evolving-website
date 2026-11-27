const { runAgentCycle, response } = require('./_lib.js');

// Scheduled by netlify.toml. Runs without a visitor token (internal only).
exports.handler = async () => {
  try {
    const result = await runAgentCycle();
    console.log('Scheduled agent cycle:', JSON.stringify(result));
    return response(200, { success: true, ...result });
  } catch (err) {
    console.error('Scheduled agent cycle failed:', err.message);
    return response(500, { success: false, error: err.message });
  }
};
