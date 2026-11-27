const { rollbackTo, response, requireAdmin } = require('./_lib.js');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    if (!body.version) return response(400, { error: 'Version required' });
    const result = await rollbackTo(body.version);
    return response(200, { success: true, ...result });
  } catch (err) {
    return response(500, { error: err.message });
  }
};
