const { gh, REPO, BRANCH, getJSON, response, requireAdmin } = require('./_lib.js');

exports.handler = async (event) => {
  if (!requireAdmin(event)) return response(403, { error: 'Forbidden' });
  try {
    const tree = await gh(`/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
    const versions = [...new Set(tree.tree
      .filter(t => t.path.startsWith('versions/') && t.type === 'blob')
      .map(t => t.path.split('/')[1]))].sort().reverse();
    return response(200, versions);
  } catch (err) {
    return response(500, { error: err.message });
  }
};
