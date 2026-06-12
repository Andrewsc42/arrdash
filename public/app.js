// ─────────────────────────────────────────
//  ArrDash — Frontend App
// ─────────────────────────────────────────

const REFRESH_INTERVAL = 30_000; // 30 seconds

// ── API CLIENT ──────────────────────────
const api = {
  get: (path) => fetch(`/api${path}`).then(r => r.json()),
  post: (path, body) => fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()),
  delete: (path) => fetch(`/api${path}`, { method: 'DELETE' }).then(r => r.json()),
};

// ── UTILITIES ───────────────────────────
const fmt = {
  bytes: (b) => {
    if (!b || b === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
  },
  speed: (bps) => {
    if (!bps || bps === 0) return '0 B/s';
    return fmt.bytes(bps) + '/s';
  },
  eta: (seconds) => {
    if (!seconds || seconds <= 0 || seconds > 86400 * 7) return '∞';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  },
  pct: (n) => `${Math.round(n)}%`,
  date: (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
  ago: (d) => {
    if (!d) return '—';
    const diff = (Date.now() - new Date(d)) / 1000;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  },
  num: (n) => n?.toLocaleString() ?? '—',
};

const pill = (label, cls) => `<span class="pill ${cls}">${label}</span>`;

const torrentStatePill = (state) => {
  const s = state?.toLowerCase();
  if (s === 'downloading') return pill('DL', 'dl');
  if (s === 'seeding')     return pill('Seed', 'seed');
  if (s === 'paused')      return pill('Paused', 'pause');
  if (s === 'queued')      return pill('Queued', 'pend');
  if (s === 'checking')    return pill('Check', 'pend');
  if (s === 'error')       return pill('Error', 'miss');
  return pill(state || '?', 'pause');
};

const queueStatusPill = (status, trackedState) => {
  if (trackedState === 'importing') return pill('Importing', 'dl');
  if (status === 'downloading')     return pill('DL', 'dl');
  if (status === 'queued')          return pill('Queued', 'pend');
  if (status === 'warning')         return pill('Warning', 'pend');
  if (status === 'failed')          return pill('Failed', 'miss');
  return pill(status || '?', 'pause');
};

// Progress bar HTML
const progressBar = (pct, cls = '') =>
  `<div class="progress-wrap"><div class="progress-fill ${cls}" style="width:${Math.min(100, pct || 0)}%"></div></div>`;

// ── STATE ───────────────────────────────
let state = {
  overseerr: null,
  radarr: null,
  sonarr: null,
  prowlarr: null,
  deluge: null,
};

// ── OVERVIEW ────────────────────────────
async function loadOverview() {
  try {
    const [osStatus, rdStatus, snStatus, prStatus, dlStatus] = await Promise.all([
      api.get('/overseerr/status'),
      api.get('/radarr/status'),
      api.get('/sonarr/status'),
      api.get('/prowlarr/status'),
      api.get('/deluge/status'),
    ]);

    // Status cards
    setCard('ov-overseerr', osStatus.online, osStatus.pendingCount ?? '?', 'pending requests');
    setCard('ov-radarr',    rdStatus.online, rdStatus.movieCount ?? '?', 'movies in library');
    setCard('ov-sonarr',    snStatus.online, snStatus.seriesCount ?? '?', 'series tracked');
    setProwlarrCard('ov-prowlarr', prStatus);

    // Footer dots
    updateFooter({ overseerr: osStatus, radarr: rdStatus, sonarr: snStatus, prowlarr: prStatus, deluge: dlStatus });

    // Pulse bar
    if (dlStatus.online) {
      document.getElementById('dl-speed').textContent = fmt.speed(dlStatus.downloadSpeed);
      document.getElementById('ul-speed').textContent = fmt.speed(dlStatus.uploadSpeed);
    }
    if (osStatus.online) {
      document.querySelector('.pulse-stat:nth-child(3) .val').textContent = osStatus.pendingCount ?? 0;
    }
    if (prStatus.online) {
      document.querySelector('.pulse-stat:nth-child(4) .val').textContent =
        `${prStatus.healthyCount ?? '?'}/${prStatus.indexerCount ?? '?'}`;
    }

    // Load overview panels
    await Promise.all([loadOverviewQueue(), loadOverviewRequests()]);
  } catch (e) {
    console.error('Overview load error', e);
  }
}

function setCard(id, online, value, sub) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.sc-value').textContent = value;
  el.querySelector('.sc-sub').textContent = sub;
  const status = el.querySelector('.sc-status');
  if (online) {
    el.className = el.className.replace(/\b(ok|warn|error)\b/, 'ok');
    status.textContent = 'Online';
  } else {
    el.className = el.className.replace(/\b(ok|warn|error)\b/, 'error');
    status.textContent = 'Offline';
  }
}

function setProwlarrCard(id, prStatus) {
  const el = document.getElementById(id);
  if (!el) return;
  const healthy = prStatus.healthyCount ?? 0;
  const total   = prStatus.indexerCount ?? 0;
  el.querySelector('.sc-value').innerHTML =
    `${healthy}<span style="font-size:16px;color:var(--muted)">/${total}</span>`;
  el.querySelector('.sc-sub').textContent = 'indexers healthy';
  const status = el.querySelector('.sc-status');
  if (!prStatus.online) {
    el.className = el.className.replace(/\b(ok|warn|error)\b/, 'error');
    status.textContent = 'Offline';
  } else if (healthy < total) {
    el.className = el.className.replace(/\b(ok|warn|error)\b/, 'warn');
    status.textContent = 'Degraded';
  } else {
    el.className = el.className.replace(/\b(ok|warn|error)\b/, 'ok');
    status.textContent = 'Online';
  }
}

async function loadOverviewQueue() {
  const [rdQ, snQ] = await Promise.all([
    api.get('/radarr/queue').catch(() => ({ records: [] })),
    api.get('/sonarr/queue').catch(() => ({ records: [] })),
  ]);
  const rdItems = (rdQ.records || []).slice(0, 4).map(r => ({
    title: r.movie?.title || r.title || 'Unknown',
    app: 'RADARR', appCls: 'radarr',
    quality: r.quality?.quality?.name || '—',
    size: fmt.bytes(r.size),
    status: queueStatusPill(r.status, r.trackedDownloadStatus?.toLowerCase()),
  }));
  const snItems = (snQ.records || []).slice(0, 4).map(r => ({
    title: `${r.series?.title || 'Unknown'} ${r.episode ? `S${String(r.episode.seasonNumber).padStart(2,'0')}E${String(r.episode.episodeNumber).padStart(2,'0')}` : ''}`,
    app: 'SONARR', appCls: 'sonarr',
    quality: r.quality?.quality?.name || '—',
    size: fmt.bytes(r.size),
    status: queueStatusPill(r.status, r.trackedDownloadStatus?.toLowerCase()),
  }));
  const items = [...rdItems, ...snItems];
  const tbody = document.getElementById('ov-queue-body');
  if (!tbody) return;
  tbody.innerHTML = items.length ? items.map(i => `
    <tr>
      <td style="max-width:160px">${i.title}</td>
      <td style="color:var(--${i.appCls});font-family:var(--mono);font-size:10px">${i.app}</td>
      <td style="font-family:var(--mono);font-size:10px">${i.quality}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${i.size}</td>
      <td>${i.status}</td>
    </tr>`).join('') : '<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">Queue is empty</td></tr>';
}

async function loadOverviewRequests() {
  const data = await api.get('/overseerr/requests?filter=pending&take=3').catch(() => null);
  const el = document.getElementById('ov-requests-body');
  if (!el || !data) return;
  const items = data.results || [];
  el.innerHTML = items.length ? items.map(r => buildRequestItem(r)).join('') :
    '<div style="padding:20px 16px;font-family:var(--mono);font-size:10px;color:var(--muted)">No pending requests</div>';
  attachRequestHandlers(el);
}

function buildRequestItem(r) {
  const media = r.media || {};
  const isMovie = r.type === 'movie';
  const title = media.originalTitle || (isMovie ? 'Movie' : 'Series');
  const requestedBy = r.requestedBy?.displayName || r.requestedBy?.username || 'Unknown';
  return `
    <div class="request-item" data-id="${r.id}">
      <div class="req-poster">${isMovie ? '🎬' : '📺'}</div>
      <div class="req-info">
        <div class="req-title">${title}</div>
        <div class="req-meta">${isMovie ? 'Movie' : 'Series'} · ${requestedBy} · ${fmt.ago(r.createdAt)}</div>
      </div>
      <div class="req-actions">
        <button class="btn btn-approve" data-action="approve" data-id="${r.id}">Approve</button>
        <button class="btn btn-deny" data-action="deny" data-id="${r.id}">Deny</button>
      </div>
    </div>`;
}

function attachRequestHandlers(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { action, id } = btn.dataset;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        if (action === 'approve') await api.post(`/overseerr/requests/${id}/approve`);
        if (action === 'deny')    await api.post(`/overseerr/requests/${id}/decline`);
        btn.closest('.request-item').remove();
      } catch {
        btn.textContent = 'Error';
      }
    });
  });
}

// ── OVERSEERR VIEW ───────────────────────
async function loadOverseerr() {
  try {
    const [status, pending, allRequests] = await Promise.all([
      api.get('/overseerr/status'),
      api.get('/overseerr/requests?filter=pending&take=10'),
      api.get('/overseerr/requests?filter=all&take=20'),
    ]);

    // Stat cards
    const pendingCount = pending.results?.length ?? 0;
    setEl('os-pending-count', pendingCount);
    setEl('os-processing-count', (allRequests.results || []).filter(r => r.media?.downloadStatus === 'PROCESSING').length);
    setEl('os-available-count', (allRequests.results || []).filter(r => r.status === 2).length);

    // Pending list
    const pendingEl = document.getElementById('os-pending-list');
    if (pendingEl) {
      pendingEl.innerHTML = (pending.results || []).length
        ? pending.results.map(r => buildRequestItem(r)).join('')
        : '<div style="padding:20px 16px;font-family:var(--mono);font-size:10px;color:var(--muted)">No pending requests</div>';
      attachRequestHandlers(pendingEl);
    }

    // All requests table
    const tbody = document.getElementById('os-all-body');
    if (tbody) {
      tbody.innerHTML = (allRequests.results || []).map(r => {
        const media = r.media || {};
        const isMovie = r.type === 'movie';
        const title = media.originalTitle || (isMovie ? 'Movie' : 'Series');
        const requestedBy = r.requestedBy?.displayName || r.requestedBy?.username || '?';
        const statusMap = { 1: ['pend', 'Pending'], 2: ['avail', 'Available'], 3: ['dl', 'Approved'], 4: ['miss', 'Declined'] };
        const [sc, st] = statusMap[r.status] || ['pause', 'Unknown'];
        const actions = r.status === 1
          ? `<div style="display:flex;gap:4px">
               <button class="btn btn-approve" style="padding:3px 8px" data-action="approve" data-id="${r.id}">✓</button>
               <button class="btn btn-deny" style="padding:3px 8px" data-action="deny" data-id="${r.id}">✕</button>
             </div>`
          : '<span style="font-family:var(--mono);font-size:10px;color:var(--muted)">—</span>';
        return `<tr>
          <td>${title}</td>
          <td>${pill(isMovie ? 'Movie' : 'Series', isMovie ? 'movie' : 'series')}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${requestedBy}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.ago(r.createdAt)}</td>
          <td>${pill(st, sc)}</td>
          <td>${actions}</td>
        </tr>`;
      }).join('');
      attachRequestHandlers(tbody);
    }
  } catch (e) {
    console.error('Overseerr view error', e);
  }
}

// ── RADARR VIEW ─────────────────────────
async function loadRadarr() {
  try {
    const [status, queue, wanted, movies] = await Promise.all([
      api.get('/radarr/status'),
      api.get('/radarr/queue'),
      api.get('/radarr/wanted'),
      api.get('/radarr/movies'),
    ]);

    setEl('rd-movie-count',   status.movieCount  ?? '?');
    setEl('rd-missing-count', status.missingCount ?? '?');
    setEl('rd-queue-count',   status.queueCount   ?? '?');

    // Queue table
    const qBody = document.getElementById('rd-queue-body');
    if (qBody) {
      const recs = queue.records || [];
      qBody.innerHTML = recs.length ? recs.map(r => `
        <tr>
          <td style="max-width:200px">${r.movie?.title || r.title || 'Unknown'}</td>
          <td style="font-family:var(--mono);font-size:10px">${r.quality?.quality?.name || '—'}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.bytes(r.size)}</td>
          <td>${progressBar(r.sizeleft != null ? (1 - r.sizeleft / r.size) * 100 : 0, 'radarr-c')}</td>
          <td>${queueStatusPill(r.status, r.trackedDownloadStatus?.toLowerCase())}</td>
        </tr>`).join('')
        : '<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">Queue is empty</td></tr>';
    }

    // Wanted table
    const wBody = document.getElementById('rd-wanted-body');
    if (wBody) {
      const recs = wanted.records || [];
      wBody.innerHTML = recs.length ? recs.slice(0, 10).map(m => `
        <tr>
          <td>${m.title}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${m.year || '—'}</td>
          <td>${pill('Missing', 'miss')}</td>
        </tr>`).join('')
        : '<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">Nothing missing</td></tr>';
    }

    // Media card grid
    const grid = document.getElementById('rd-media-grid');
    if (grid) {
      const recent = (movies || []).filter(m => m.hasFile).slice(0, 12);
      grid.innerHTML = recent.map(m => `
        <div class="media-card">
          <div class="media-card-art">🎬</div>
          <div class="media-card-info">
            <div class="media-card-title">${m.title}</div>
            <div class="media-card-meta">${m.year} · ${m.movieFile?.quality?.quality?.name || '?'}</div>
            <div class="media-card-status">${pill('Available', 'avail')}</div>
          </div>
        </div>`).join('');
    }
  } catch (e) {
    console.error('Radarr view error', e);
  }
}

// ── SONARR VIEW ─────────────────────────
async function loadSonarr() {
  try {
    const [status, queue, wanted, cutoff, calendar] = await Promise.all([
      api.get('/sonarr/status'),
      api.get('/sonarr/queue'),
      api.get('/sonarr/wanted'),
      api.get('/sonarr/cutoff'),
      api.get('/sonarr/calendar'),
    ]);

    setEl('sn-series-count',  status.seriesCount  ?? '?');
    setEl('sn-missing-count', status.missingCount  ?? '?');
    setEl('sn-queue-count',   status.queueCount    ?? '?');

    // Queue
    const qBody = document.getElementById('sn-queue-body');
    if (qBody) {
      const recs = queue.records || [];
      qBody.innerHTML = recs.length ? recs.map(r => {
        const ep = r.episode;
        const epStr = ep ? `S${String(ep.seasonNumber).padStart(2,'0')}E${String(ep.episodeNumber).padStart(2,'0')}` : '';
        return `<tr>
          <td style="max-width:200px">${r.series?.title || 'Unknown'} ${epStr}</td>
          <td style="font-family:var(--mono);font-size:10px">${r.quality?.quality?.name || '—'}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.bytes(r.size)}</td>
          <td>${progressBar(r.sizeleft != null ? (1 - r.sizeleft / r.size) * 100 : 0, 'sonarr-c')}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.eta(r.timeleft)}</td>
        </tr>`;
      }).join('')
        : '<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">Queue is empty</td></tr>';
    }

    // Cutoff unmet
    const cBody = document.getElementById('sn-cutoff-body');
    if (cBody) {
      const recs = cutoff.records || [];
      cBody.innerHTML = recs.slice(0, 8).map(r => `
        <tr>
          <td>${r.title}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${r.episodeFile?.quality?.quality?.name || '?'}</td>
          <td>${pill(r.qualityProfile?.cutoff?.name || '?', 'cutoff')}</td>
        </tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">All up to standard</td></tr>';
    }

    // Calendar
    buildCalendar(calendar);
  } catch (e) {
    console.error('Sonarr view error', e);
  }
}

function buildCalendar(episodes) {
  const calGrid = document.getElementById('sn-cal-grid');
  if (!calGrid) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group episodes by date string YYYY-MM-DD
  const byDate = {};
  (episodes || []).forEach(ep => {
    const d = ep.airDateUtc?.split('T')[0];
    if (d) {
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(ep);
    }
  });

  // Start from Monday
  const startOffset = (firstDay + 6) % 7;
  let html = '';
  for (let i = 0; i < startOffset; i++) html += '<div class="cal-day" style="opacity:0.3"><div class="cal-day-num"></div></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = d === now.getDate();
    const eps = byDate[dateStr] || [];
    const epHtml = eps.slice(0, 2).map(ep => {
      const aired = new Date(ep.airDateUtc) < now;
      const hasFile = ep.hasFile;
      const cls = hasFile ? 'aired' : (aired ? 'missing' : 'upcoming');
      const label = ep.series?.title ? `${ep.series.title.substring(0, 12)}` : ep.title?.substring(0, 14) || 'Episode';
      return `<div class="cal-event ${cls}">${label}</div>`;
    }).join('');
    html += `<div class="cal-day${isToday ? ' today' : ''}"><div class="cal-day-num">${d}</div>${epHtml}</div>`;
  }
  calGrid.innerHTML = html;
}

// ── DELUGE VIEW ─────────────────────────
async function loadDeluge() {
  try {
    const [status, torrents] = await Promise.all([
      api.get('/deluge/status'),
      api.get('/deluge/torrents'),
    ]);

    const list = Array.isArray(torrents) ? torrents : [];
    const dling  = list.filter(t => t.state?.toLowerCase() === 'downloading');
    const seeding = list.filter(t => t.state?.toLowerCase() === 'seeding');

    setEl('dl-dl-count',   dling.length);
    setEl('dl-seed-count', seeding.length);
    setEl('dl-dl-speed',   fmt.speed(status.downloadSpeed));
    setEl('dl-ul-speed',   fmt.speed(status.uploadSpeed));

    // Also update pulse bar
    if (status.online) {
      document.getElementById('dl-speed').textContent = fmt.speed(status.downloadSpeed);
      document.getElementById('ul-speed').textContent = fmt.speed(status.uploadSpeed);
    }

    const tbody = document.getElementById('dl-torrent-body');
    if (!tbody) return;

    tbody.innerHTML = list.length ? list.map(t => {
      const isPaused = t.state?.toLowerCase() === 'paused';
      const pct = t.progress ?? 0;
      const pctCls = pct < 30 && t.state?.toLowerCase() === 'downloading' ? 'slow' : '';
      return `
        <tr data-hash="${t.hash}">
          <td style="max-width:200px">${t.name}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.bytes(t.size)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              ${progressBar(pct, pctCls)}
              <span style="font-family:var(--mono);font-size:9px;color:var(--muted)">${fmt.pct(pct)}</span>
            </div>
          </td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--teal)">${fmt.speed(t.downloadSpeed)}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.speed(t.uploadSpeed)}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${t.ratio?.toFixed(2) ?? '—'}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.eta(t.eta)}</td>
          <td>${torrentStatePill(t.state)}</td>
          <td>
            <div class="torrent-actions">
              <button class="icon-btn" data-action="${isPaused ? 'resume' : 'pause'}" data-hash="${t.hash}">
                ${isPaused ? '▶' : '⏸'}
              </button>
              <button class="icon-btn danger" data-action="remove" data-hash="${t.hash}">✕</button>
            </div>
          </td>
        </tr>`;
    }).join('')
      : '<tr><td colspan="9" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">No torrents</td></tr>';

    // Torrent action handlers
    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { action, hash } = btn.dataset;
        btn.disabled = true;
        try {
          if (action === 'pause')  await api.post(`/deluge/torrents/${hash}/pause`);
          if (action === 'resume') await api.post(`/deluge/torrents/${hash}/resume`);
          if (action === 'remove') {
            if (confirm('Remove torrent? (files will be kept)')) {
              await api.delete(`/deluge/torrents/${hash}`);
              btn.closest('tr').remove();
              return;
            }
          }
          setTimeout(loadDeluge, 500);
        } catch {
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    console.error('Deluge view error', e);
  }
}

// ── PROWLARR VIEW ────────────────────────
async function loadProwlarr() {
  try {
    const [status, indexers, stats, history] = await Promise.all([
      api.get('/prowlarr/status'),
      api.get('/prowlarr/indexers'),
      api.get('/prowlarr/stats'),
      api.get('/prowlarr/history?pageSize=10'),
    ]);

    const healthy = (indexers || []).filter(i => i.enable && !i.status?.disabled).length;
    const total   = (indexers || []).filter(i => i.enable).length;

    setEl('pr-indexer-count', `${healthy}/${total}`);
    setEl('pr-grabs-count',   (history.records || []).length);
    setEl('pr-fail-count',    (indexers || []).filter(i => i.status?.disabled).length);

    // Indexer table
    const iBody = document.getElementById('pr-indexer-body');
    if (iBody) {
      const maxGrabs = Math.max(...(stats.indexers || []).map(s => s.numberOfGrabs || 0), 1);
      iBody.innerHTML = (indexers || []).filter(i => i.enable).map(idx => {
        const stat = (stats.indexers || []).find(s => s.indexerId === idx.id) || {};
        const degraded = idx.status?.disabled;
        const avgMs = stat.averageResponseTime?.toFixed(0) ?? '—';
        const avgCls = !stat.averageResponseTime ? 'color:var(--muted)' :
          stat.averageResponseTime > 1000 ? 'color:var(--amber)' : 'color:var(--green)';
        return `
          <tr${degraded ? ' style="background:rgba(240,165,0,0.04)"' : ''}>
            <td><div class="idx-indicator ${degraded ? 'warn' : 'ok'}" style="margin:0 auto"></div></td>
            <td style="${degraded ? 'color:var(--amber)' : ''}">${idx.name}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${idx.privacy === 'public' ? 'Public' : 'Private'}</td>
            <td style="font-family:var(--mono);font-size:10px">${stat.numberOfGrabs ?? 0}</td>
            <td style="font-family:var(--mono);font-size:10px;${avgCls}">${avgMs}${stat.averageResponseTime ? 'ms' : ''}</td>
            <td>${degraded ? pill('Degraded', 'pend') : pill('Online', 'avail')}</td>
          </tr>`;
      }).join('');
    }

    // Bar chart
    const barChart = document.getElementById('pr-bar-chart');
    if (barChart && stats.indexers) {
      const sorted = [...stats.indexers].sort((a,b) => (b.numberOfGrabs||0) - (a.numberOfGrabs||0)).slice(0, 8);
      const max = sorted[0]?.numberOfGrabs || 1;
      barChart.innerHTML = sorted.map(s => {
        const idx = (indexers || []).find(i => i.id === s.indexerId);
        const degraded = idx?.status?.disabled;
        const pct = Math.round((s.numberOfGrabs / max) * 100);
        return `
          <div class="bar-row">
            <div class="bar-label" style="${degraded ? 'color:var(--amber)' : ''}">${idx?.name || 'Unknown'}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;${degraded ? 'background:var(--amber)' : ''}"></div></div>
            <div class="bar-val" style="${degraded ? 'color:var(--amber)' : ''}">${s.numberOfGrabs}</div>
          </div>`;
      }).join('');
    }

    // History table
    const hBody = document.getElementById('pr-history-body');
    if (hBody) {
      const recs = history.records || [];
      hBody.innerHTML = recs.map(h => {
        const failed = h.eventType === 'indexerError' || h.successful === false;
        return `<tr>
          <td style="max-width:240px">${h.title || '—'}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${h.indexer || '—'}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.bytes(h.size)}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.ago(h.date)}</td>
          <td>${failed ? pill('Failed', 'miss') : pill('Grabbed', 'avail')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">No history</td></tr>';
    }
  } catch (e) {
    console.error('Prowlarr view error', e);
  }
}

// ── SEARCH ───────────────────────────────
function setupSearch() {
  const rdSearch = document.getElementById('rd-search-input');
  const snSearch = document.getElementById('sn-search-input');

  let rdTimer, snTimer;

  if (rdSearch) {
    rdSearch.addEventListener('input', () => {
      clearTimeout(rdTimer);
      rdTimer = setTimeout(() => runSearch('radarr', rdSearch.value), 400);
    });
  }
  if (snSearch) {
    snSearch.addEventListener('input', () => {
      clearTimeout(snTimer);
      snTimer = setTimeout(() => runSearch('sonarr', snSearch.value), 400);
    });
  }
}

async function runSearch(service, query) {
  if (!query || query.length < 2) return;
  const results = await api.get(`/${service}/search?query=${encodeURIComponent(query)}`).catch(() => []);
  showSearchModal(service, query, results);
}

function showSearchModal(service, query, results) {
  let modal = document.getElementById('search-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.7);z-index:1000;
      display:flex;align-items:center;justify-content:center;
    `;
    document.body.appendChild(modal);
  }

  const items = (Array.isArray(results) ? results : []).slice(0, 8);
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);width:600px;max-height:80vh;display:flex;flex-direction:column;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--teal);text-transform:uppercase;letter-spacing:0.1em">
          ${service === 'radarr' ? 'Radarr' : 'Sonarr'} Search — "${query}"
        </span>
        <button onclick="document.getElementById('search-modal').remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1;">
        ${items.length ? items.map(r => buildSearchResult(service, r)).join('') :
          '<div style="padding:40px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--muted)">No results found</div>'}
      </div>
    </div>`;

  modal.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const data = JSON.parse(btn.dataset.add);
      await addMedia(service, data, btn);
    });
  });

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function buildSearchResult(service, r) {
  const isMovie = service === 'radarr';
  const title = r.title || 'Unknown';
  const year = r.year || '';
  const overview = (r.overview || '').substring(0, 120) + (r.overview?.length > 120 ? '…' : '');
  const inLibrary = isMovie ? r.id != null : r.id != null;
  const btnLabel = inLibrary ? 'In Library' : '+ Add';
  const btnCls = inLibrary ? 'btn-ghost' : 'btn-primary';
  const payload = JSON.stringify(r).replace(/"/g, '&quot;');

  return `
    <div style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(33,40,47,0.6);">
      <div style="width:40px;height:60px;background:var(--panel2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;">
        ${isMovie ? '🎬' : '📺'}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;color:var(--text)">${title} ${year ? `<span style="color:var(--muted);font-size:11px">(${year})</span>` : ''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;line-height:1.4">${overview}</div>
      </div>
      <div style="flex-shrink:0;display:flex;align-items:center;">
        <button class="btn ${btnCls}" ${inLibrary ? 'disabled' : `data-add="${payload}"`}>${btnLabel}</button>
      </div>
    </div>`;
}

async function addMedia(service, data, btn) {
  btn.textContent = '…';
  btn.disabled = true;
  try {
    const [profiles, rootFolders] = await Promise.all([
      api.get(`/${service}/qualityprofiles`),
      api.get(`/${service}/rootfolders`),
    ]);

    const profile = profiles[0];
    const rootFolder = rootFolders[0];

    if (!profile || !rootFolder) {
      alert('Could not fetch quality profiles or root folders. Check your configuration.');
      btn.textContent = 'Error';
      return;
    }

    const payload = service === 'radarr'
      ? { ...data, qualityProfileId: profile.id, rootFolderPath: rootFolder.path, monitored: true, addOptions: { searchForMovie: true } }
      : { ...data, qualityProfileId: profile.id, rootFolderPath: rootFolder.path, monitored: true, seriesType: 'standard', seasonFolder: true, addOptions: { searchForMissingEpisodes: true } };

    await api.post(`/${service}/${service === 'radarr' ? 'movies' : 'series'}`, payload);
    btn.textContent = 'Added ✓';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
  } catch (e) {
    btn.textContent = 'Failed';
    btn.disabled = false;
    console.error('Add media error', e);
  }
}

// ── HELPERS ──────────────────────────────
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateFooter(statuses) {
  const map = { overseerr: 'ft-overseerr', radarr: 'ft-radarr', sonarr: 'ft-sonarr', prowlarr: 'ft-prowlarr', deluge: 'ft-deluge' };
  Object.entries(map).forEach(([key, id]) => {
    const dot = document.getElementById(id);
    if (!dot) return;
    const online = statuses[key]?.online;
    dot.className = `dot ${online ? 'ok' : 'error'}`;
  });
}

// ── TAB NAVIGATION ───────────────────────
const viewLoaders = {
  overview:  loadOverview,
  overseerr: loadOverseerr,
  radarr:    loadRadarr,
  sonarr:    loadSonarr,
  deluge:    loadDeluge,
  prowlarr:  loadProwlarr,
  settings:  () => {},
};

let currentTab = 'overview';
let refreshTimer = null;

function switchTab(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`view-${tab}`)?.classList.add('active');
  currentTab = tab;
  clearInterval(refreshTimer);
  viewLoaders[tab]?.();
  if (tab !== 'settings') {
    refreshTimer = setInterval(() => viewLoaders[tab]?.(), REFRESH_INTERVAL);
  }
}

// ── INIT ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  setupSearch();
  switchTab('overview');
});

// ── AUTH ─────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
});
