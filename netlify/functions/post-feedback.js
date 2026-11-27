const { getJSON, commitFiles, response } = require('./_lib.js');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(200, {});
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    if (!body.message || !String(body.message).trim()) return response(400, { error: 'Message required' });

    const feedback = await getJSON('data/feedback.json', []);
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(body.name || 'Anonymous').slice(0, 80),
      email: String(body.email || '').slice(0, 120),
      category: String(body.category || 'general').slice(0, 40),
      message: String(body.message).slice(0, 4000),
      timestamp: new Date().toISOString(),
      status: 'new'
    };
    feedback.push(item);
    await commitFiles({ 'data/feedback.json': JSON.stringify(feedback, null, 2) }, `feedback: ${item.category} from ${item.name}`);
    return response(200, { success: true, id: item.id });
  } catch (err) {
    return response(500, { error: err.message });
  }
};
