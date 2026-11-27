const { getJSON, response, requireAdmin } = require('./_lib.js');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  try {
    const history = await getJSON('data/history.json', []);
    return response(200, history.reverse());
  } catch (err) {
    return response(500, { error: err.message });
  }
};
