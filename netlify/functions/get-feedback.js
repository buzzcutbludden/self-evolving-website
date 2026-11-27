const { getJSON, commitFiles, response, requireAdmin } = require('./_lib.js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(200, {});
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  try {
    return response(200, await getJSON('data/feedback.json', []));
  } catch (err) {
    return response(500, { error: err.message });
  }
};
