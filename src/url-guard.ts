const PRIVATE_NAMES = new Set(['localhost', '::1']);

export function isPrivateHost(host) {
  if (!host) return false;
  // URL.hostname wraps IPv6 addresses in brackets; strip them for matching.
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
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
  // IPv6 link-local: fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true;
  // IPv6 unique-local: fc00::/7
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  // IPv4-mapped IPv6: ::ffff:wwxx:yyzz → recurse with the dotted-quad form
  const mapped = h.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateHost(ipv4);
  }
  return false;
}

export function assertPublicUrl(url, { allowPrivate = false } = {}) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`サポートされていないプロトコル: ${u.protocol} (http/https のみ対応)`);
  }
  if (allowPrivate) return;
  if (isPrivateHost(u.hostname)) {
    throw new Error(`プライベート/ループバックホストへのアクセスは拒否されます: ${u.hostname} (--allow-private で上書き可)`);
  }
}
