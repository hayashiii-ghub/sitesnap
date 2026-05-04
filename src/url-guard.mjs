const PRIVATE_NAMES = new Set(['localhost', '::1']);

export function isPrivateHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (PRIVATE_NAMES.has(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function assertPublicUrl(url, { allowPrivate = false } = {}) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`Unsupported protocol: ${u.protocol} (only http/https are allowed)`);
  }
  if (allowPrivate) return;
  if (isPrivateHost(u.hostname)) {
    throw new Error(`Refusing to fetch private/loopback host: ${u.hostname} (use --allow-private to override)`);
  }
}
