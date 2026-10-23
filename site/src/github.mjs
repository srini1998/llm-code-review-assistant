// Public pull request -> unified diff, browser-side, one unauthenticated request, no token, no proxy.
export function parsePrUrl(input) {
  const m = /^\s*https:\/\/github\.com\/([A-Za-z0-9_.-]{1,39})\/([A-Za-z0-9_.-]{1,100})\/pull\/(\d{1,7})(?:[/?#].*)?\s*$/.exec(String(input));
  if (!m) throw new Error('Use a public pull request URL like https://github.com/owner/repo/pull/123.');
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export async function fetchPrDiff(input, fetchImpl = fetch) {
  const { owner, repo, number } = parsePrUrl(input);
  let r;
  try {
    r = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, { headers: { Accept: 'application/vnd.github.v3.diff' } });
  } catch { throw new Error('Could not reach GitHub from this browser. Paste the diff instead.'); }
  if (r.status === 403 || r.status === 429) throw new Error('GitHub’s free unauthenticated limit (60 requests an hour per IP) is used up. Paste the diff instead.');
  if (r.status === 404) throw new Error('Pull request not found, or the repository is private.');
  if (r.status === 406 || r.status === 422) throw new Error('GitHub will not render this diff (it is too large). Paste a smaller one.');
  if (!r.ok) throw new Error('GitHub returned an error (' + r.status + '). Paste the diff instead.');
  const text = await r.text();
  return { owner, repo, number, text };
}
