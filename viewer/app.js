(async () => {
  const board = document.getElementById('board');
  const stage = document.getElementById('stage');
  const siteSelect = document.getElementById('siteSelect');
  const countEl = document.getElementById('count');
  const searchInput = document.getElementById('search');
  const zoomLabel = document.getElementById('zoom');

  let mode = 'both';
  let currentMeta = null;
  let currentDomain = null;

  // ---------- load site list ----------
  let sites = [];
  try {
    const res = await fetch('/sites/index.json');
    sites = await res.json();
  } catch {
    sites = [];
  }

  if (sites.length === 0) {
    board.innerHTML = '<div class="empty">まだサイトがキャプチャされていません。<br><br><code>node cli.mjs site &lt;sitemap-url&gt;</code> で取り込んでください。</div>';
    countEl.textContent = '';
    return;
  }

  for (const s of sites) {
    const opt = document.createElement('option');
    opt.value = s.domain;
    opt.textContent = `${s.domain} (${s.captured_pages}/${s.pages})`;
    siteSelect.appendChild(opt);
  }

  siteSelect.addEventListener('change', () => loadSite(siteSelect.value));
  await loadSite(sites[0].domain);

  async function loadSite(domain) {
    currentDomain = domain;
    const res = await fetch(`/sites/${domain}/meta.json`);
    currentMeta = await res.json();
    countEl.textContent = `— ${currentMeta.pages.length} pages`;
    render();
  }

  // ---------- grouping ----------
  function groupOf(url) {
    const u = new URL(url);
    const seg = u.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    return seg || 'home';
  }

  function buildGroups(pages) {
    const groups = new Map();
    for (const p of pages) {
      const g = groupOf(p.url);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const ordered = [...groups.keys()].sort((a, b) => {
      if (a === 'home') return -1;
      if (b === 'home') return 1;
      return a.localeCompare(b);
    });
    return { groups, ordered };
  }

  // ---------- render ----------
  function render() {
    board.innerHTML = '';
    if (!currentMeta || currentMeta.pages.length === 0) {
      board.innerHTML = '<div class="empty">このサイトにはページがありません。</div>';
      return;
    }
    const { groups, ordered } = buildGroups(currentMeta.pages);
    for (const g of ordered) {
      const items = groups.get(g);
      const sec = document.createElement('section');
      sec.className = 'section';
      const h2 = document.createElement('h2');
      h2.innerHTML = `${escapeHtml(g)} <span class="count">${items.length}</span>`;
      sec.appendChild(h2);
      const wrap = document.createElement('div');
      wrap.className = 'frames';
      for (const p of items) {
        const cell = document.createElement('div');
        cell.className = 'pair';
        cell.dataset.url = p.url;
        cell.dataset.title = p.title || '';
        if ((mode === 'desktop' || mode === 'both') && p.desktop) cell.appendChild(makeFrame(p, 'desktop'));
        if ((mode === 'mobile' || mode === 'both') && p.mobile) cell.appendChild(makeFrame(p, 'mobile'));
        if (cell.children.length > 0) wrap.appendChild(cell);
      }
      sec.appendChild(wrap);
      board.appendChild(sec);
    }
    requestAnimationFrame(fitToScreen);
  }

  function makeFrame(p, kind) {
    const f = document.createElement('a');
    f.className = `frame ${kind}`;
    f.href = p.url;
    f.target = '_blank';
    f.rel = 'noopener';
    const path = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
    const imgSrc = `/sites/${currentDomain}/${p[kind]}`;
    f.innerHTML = `
      <div class="label">
        <div class="title">${escapeHtml(p.title || '(no title)')}</div>
        <div class="url">${escapeHtml(decodeURIComponent(path))} <span style="color:#666">· ${kind}</span></div>
      </div>
      <div class="imgwrap"><img loading="lazy" src="${imgSrc}" alt="" /></div>
    `;
    f.addEventListener('click', (e) => { if (justDragged) e.preventDefault(); });
    return f;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- mode toggle ----------
  document.getElementById('modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    mode = b.dataset.mode;
    document.querySelectorAll('#modeSeg button').forEach(x => x.classList.toggle('active', x === b));
    render();
  });

  // ---------- search ----------
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('.pair').forEach(p => {
      const hay = (p.dataset.title + ' ' + p.dataset.url).toLowerCase();
      const match = !q || hay.includes(q);
      p.querySelectorAll('.frame').forEach(f => f.classList.toggle('dim', !match));
    });
  });

  // ---------- pan & zoom ----------
  let tx = 0, ty = 0, scale = 1;
  function applyTransform() {
    board.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }
  function fitToScreen() {
    const bw = board.scrollWidth, bh = board.scrollHeight;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (bw === 0 || bh === 0) return;
    const s = Math.min(sw / bw, sh / bh) * 0.96;
    scale = s;
    tx = (sw - bw * scale) / 2;
    ty = 24;
    applyTransform();
  }
  function reset() { scale = 1; tx = 24; ty = 24; applyTransform(); }

  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  let justDragged = false, dragDist = 0;
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true; dragDist = 0;
    sx = e.clientX; sy = e.clientY; ox = tx; oy = ty;
    stage.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx = ox + (e.clientX - sx);
    ty = oy + (e.clientY - sy);
    dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('dragging');
    justDragged = dragDist > 4;
    setTimeout(() => justDragged = false, 0);
  });

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018));
    const ns = Math.max(0.05, Math.min(4, scale * factor));
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns;
    applyTransform();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'f' || e.key === 'F') fitToScreen();
    else if (e.key === '0') reset();
    else if (e.key === '+' || e.key === '=') { scale = Math.min(4, scale * 1.2); applyTransform(); }
    else if (e.key === '-' || e.key === '_') { scale = Math.max(0.05, scale / 1.2); applyTransform(); }
  });

  document.getElementById('fit').addEventListener('click', fitToScreen);
  document.getElementById('reset').addEventListener('click', reset);
})();
