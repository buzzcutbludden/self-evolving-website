// Thin cron: dispatches the background worker and returns immediately.
// Server-side schedule — no browser, visitor, or open tab is involved.
exports.config = { schedule: '*/5 * * * *' };

exports.handler = async () => {
  const site = (process.env.SITE_URL || 'https://self-evolving-website.netlify.app').replace(/\/$/, '');
  try {
    const res = await fetch(`${site}/.netlify/functions/agent-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': process.env.ADMIN_TOKEN || '' },
      body: '{}'
    });
    console.log('Dispatched agent worker:', res.status);
  } catch (err) {
    console.error('Dispatch failed:', err.message);
  }
  return { statusCode: 200, body: 'agent worker dispatched' };
};
