// ─────────────────────────────────────────
//  ArrDash — Frontend App
// ─────────────────────────────────────────

const REFRESH_INTERVAL = 30_000;

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
  pct: (n) => `${Math.round(n || 0)}%`,
  ago: (d) => {
    if (!d) return '—';
    const diff = (Date.now() - new Date(d)) / 1000;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
    return `${Math.round(diff / 86400)}d ago`;
  },
};

const pill = (label, cls) => `<span class="pill ${cls}">${label}</span>`;

const torrentStatePill = (state) => {
  const s = (state || '').toLowerCase();
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

const progressBar = (pct, cls = '') =>
  `<div class="progress-wrap"><div class="progress-fill ${cls}" style="width:${Math.min(100, pct || 0)}%"></div></div>`;

const emptyRow = (cols, msg) =>
  `<tr><td colspan="${cols}" style="color:var(--muted);text-align:center;padding:20px;font-family:var(--mono);font-size:10px">${msg}</td></tr>`;

const emptyDiv = (msg) =>
  `<div style="padding:20px 16px;font-family:var(--mono);font-size:10px;color:var(--muted)">${msg}</div>`;

// ── HELPERS ──────────────────────────────
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function updateFooter(statuses) {
  const map = { overseerr: 'ft-overseerr', radarr: 'ft-radarr', sonarr: 'ft-sonarr', prowlarr: 'ft-prowlarr', deluge: 'ft-deluge' };
  Object.entries(map).forEach(([key, id]) => {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.className = `dot ${statuses[key]?.online ? 'ok' : 'error'}`;
  });
}

function updateSidebarBadge(tab, count) {
  const nav = document.querySelector(`[data-tab="${tab}"]`);
  if (!nav) return;
  let badge = nav.querySelector('.badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'badge';
      nav.appendChild(badge);
    }
    badge.textContent = count;
  } else {
    if (badge) badge.remove();
  }
}

// ── OVERVIEW ────────────────────────────
async function loadOverview() {
  try {
    const [osStatus, rdStatus, snStatus, prStatus, dlStatus] = await Promise.all([
      api.get('/overseerr/status').catch(() => ({ online: false })),
      api.get('/radarr/status').catch(() => ({ online: false })),
      api.get('/sonarr/status').catch(() => ({ online: false })),
      api.get('/prowlarr/status').catch(() => ({ online: false })),
      api.get('/deluge/status').catch(() => ({ online: false })),
    ]);

    setCard('ov-overseerr', osStatus.online, osStatus.pendingCount ?? '?', 'pending requests');
    setCard('ov-radarr',    rdStatus.online, rdStatus.movieCount   ?? '?', 'movies in library');
    setCard('ov-sonarr',    snStatus.online, snStatus.seriesCount  ?? '?', 'series tracked');
    setProwlarrCard('ov-prowlarr', prStatus);
    updateFooter({ overseerr: osStatus, radarr: rdStatus, sonarr: snStatus, prowlarr: prStatus, deluge: dlStatus });
    updateSidebarBadge('overseerr', osStatus.pendingCount || 0);

    // Pulse bar
    if (dlStatus.online) {
      document.getElementById('dl-speed').textContent = fmt.speed(dlStatus.downloadSpeed);
      document.getElementById('ul-speed').textContent = fmt.speed(dlStatus.uploadSpeed);
    }
    if (osStatus.online) {
      setEl('pulse-requests', osStatus.pendingCount ?? 0);
    }
    if (prStatus.online) {
      setEl('pulse-indexers', `${prStatus.healthyCount ?? '?'}/${prStatus.indexerCount ?? '?'}`);
    }

    await Promise.all([loadOverviewQueue(), loadOverviewRequests(), loadOverviewDeluge(), loadOverviewIndexers()]);
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
  el.className = el.className.replace(/\b(ok|warn|error)\b/, online ? 'ok' : 'error');
  status.textContent = online ? 'Online' : 'Offline';
}

function setProwlarrCard(id, prStatus) {
  const el = document.getElementById(id);
  if (!el) return;
  const healthy = prStatus.healthyCount ?? 0;
  const total   = prStatus.indexerCount ?? 0;
  el.querySelector('.sc-value').innerHTML = `${healthy}<span style="font-size:16px;color:var(--muted)">/${total}</span>`;
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

async function loadOverviewDeluge() {
  try {
    const [status, torrents] = await Promise.all([
      api.get('/deluge/status').catch(() => ({ online: false })),
      api.get('/deluge/torrents').catch(() => []),
    ]);
    const list = Array.isArray(torrents) ? torrents : [];
    const downloading = list.filter(t => t.state?.toLowerCase() === 'downloading');

    // Calculate real speeds from torrent list (more reliable than status endpoint)
    const dlBps = list.reduce((sum, t) => sum + (t.downloadSpeed || t.download_payload_rate || 0), 0);
    const ulBps = list.reduce((sum, t) => sum + (t.uploadSpeed   || t.upload_payload_rate   || 0), 0);

    // Update speed bar
    const dlBar = document.getElementById('ov-dl-bar');
    const ulBar = document.getElementById('ov-ul-bar');
    const dlVal = document.getElementById('ov-dl-speed');
    const ulVal = document.getElementById('ov-ul-speed');

    if (status.online) {
      const maxSpeed = 20 * 1024 * 1024;
      if (dlBar) dlBar.style.width = `${Math.min(100, (dlBps / maxSpeed) * 100)}%`;
      if (ulBar) ulBar.style.width = `${Math.min(100, (ulBps / maxSpeed) * 100)}%`;
      if (dlVal) dlVal.textContent = fmt.speed(dlBps);
      if (ulVal) ulVal.textContent = fmt.speed(ulBps);
    }

    // Torrent table
    const tbody = document.getElementById('ov-deluge-body');
    if (!tbody) return;

    if (!status.online) {
      tbody.innerHTML = emptyRow(5, 'Deluge offline');
      return;
    }

    tbody.innerHTML = downloading.length
      ? downloading.slice(0, 5).map(t => {
          const pct = t.progress ?? 0;
          const spd = t.downloadSpeed || t.download_payload_rate || 0;
          return `<tr>
            <td style="max-width:160px">${t.name}</td>
            <td>${progressBar(pct, pct < 30 ? 'slow' : '')}</td>
            <td style="color:var(--teal);font-family:var(--mono);font-size:10px">${fmt.speed(spd)}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.eta(t.eta)}</td>
            <td>${torrentStatePill(t.state)}</td>
          </tr>`;
        }).join('')
      : emptyRow(5, 'No active downloads');
  } catch (e) {
    console.error('Overview deluge error', e);
  }
}


async function loadOverviewIndexers() {
  try {
    const indexers = await api.get('/prowlarr/indexers').catch(() => []);
    const el = document.getElementById('ov-indexer-list');
    if (!el) return;
    const enabled = (indexers || []).filter(i => i.enable);
    el.innerHTML = enabled.length
      ? enabled.slice(0, 8).map(idx => {
          const degraded = idx.status?.disabled;
          return `<div class="indexer-item">
            <div class="idx-indicator ${degraded ? 'warn' : 'ok'}"></div>
            <div class="idx-name" style="${degraded ? 'color:var(--amber)' : ''}">${idx.name}</div>
            <div class="idx-stat" style="${degraded ? 'color:var(--amber)' : ''}">${degraded ? 'Timeout' : 'Online'}</div>
          </div>`;
        }).join('')
      : '<div style="padding:20px 16px;font-family:var(--mono);font-size:10px;color:var(--muted)">No indexers configured</div>';
  } catch (e) { console.error('Overview indexers error', e); }
}

async function loadOverviewQueue() {
  try {
    const [rdQ, snQ] = await Promise.all([
      api.get('/radarr/queue').catch(() => ({ records: [] })),
      api.get('/sonarr/queue').catch(() => ({ records: [] })),
    ]);
    const rdItems = (rdQ.records || []).slice(0, 3).map(r => ({
      title: r.movie?.title || r.title || 'Unknown',
      app: 'RADARR', appCls: 'radarr',
      quality: r.quality?.quality?.name || '—',
      size: fmt.bytes(r.size),
      status: queueStatusPill(r.status, r.trackedDownloadStatus?.toLowerCase()),
    }));
    const snItems = (snQ.records || []).slice(0, 3).map(r => ({
      title: `${r.series?.title || 'Unknown'} ${r.episode ? `S${String(r.episode.seasonNumber).padStart(2,'0')}E${String(r.episode.episodeNumber).padStart(2,'0')}` : ''}`,
      app: 'SONARR', appCls: 'sonarr',
      quality: r.quality?.quality?.name || '—',
      size: fmt.bytes(r.size),
      status: queueStatusPill(r.status, r.trackedDownloadStatus?.toLowerCase()),
    }));
    const items = [...rdItems, ...snItems];
    const tbody = document.getElementById('ov-queue-body');
    if (!tbody) return;
    tbody.innerHTML = items.length
      ? items.map(i => `<tr>
          <td style="max-width:160px">${i.title}</td>
          <td style="color:var(--${i.appCls});font-family:var(--mono);font-size:10px">${i.app}</td>
          <td style="font-family:var(--mono);font-size:10px">${i.quality}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${i.size}</td>
          <td>${i.status}</td>
        </tr>`).join('')
      : emptyRow(5, 'Queue is empty');
  } catch (e) {
    console.error('Overview queue error', e);
  }
}

async function loadOverviewRequests() {
  try {
    const data = await api.get('/overseerr/requests?filter=pending&take=3').catch(() => null);
    const el = document.getElementById('ov-requests-body');
    if (!el || !data) return;
    const items = data.results || [];
    el.innerHTML = items.length
      ? items.map(r => buildRequestItem(r)).join('')
      : emptyDiv('No pending requests');
    attachRequestHandlers(el);
  } catch (e) {
    console.error('Overview requests error', e);
  }
}

function buildRequestItem(r) {
  const media = r.media || {};
  const isMovie = r.type === 'movie';
  const title = media.originalTitle || (isMovie ? 'Unknown Movie' : 'Unknown Series');
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
    const [pending, allRequests] = await Promise.all([
      api.get('/overseerr/requests?filter=pending&take=10').catch(() => ({ results: [] })),
      api.get('/overseerr/requests?filter=all&take=20').catch(() => ({ results: [] })),
    ]);

    const pendingCount     = (pending.results || []).length;
    const processingCount  = (allRequests.results || []).filter(r => r.media?.downloadStatus === 'PROCESSING').length;
    const availableCount   = (allRequests.results || []).filter(r => r.status === 2).length;

    setEl('os-pending-count',    pendingCount);
    setEl('os-processing-count', processingCount);
    setEl('os-available-count',  availableCount);
    updateSidebarBadge('overseerr', pendingCount);

    // Pending list
    const pendingEl = document.getElementById('os-pending-list');
    if (pendingEl) {
      pendingEl.innerHTML = pendingCount
        ? pending.results.map(r => buildRequestItem(r)).join('')
        : emptyDiv('No pending requests');
      attachRequestHandlers(pendingEl);
    }

    // Recent activity — built from all requests sorted by date
    const activityEl = document.getElementById('os-activity-feed');
    if (activityEl) {
      const recent = [...(allRequests.results || [])]
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        .slice(0, 6);

      activityEl.innerHTML = recent.length ? recent.map(r => {
        const media = r.media || {};
        const title = media.originalTitle || 'Unknown';
        const statusMap = {
          1: { icon: '◷', cls: 'req',   text: 'pending approval' },
          2: { icon: '✓', cls: 'added', text: 'available on Plex' },
          3: { icon: '⬇', cls: 'dl',    text: 'approved' },
          4: { icon: '✕', cls: 'err',   text: 'declined' },
          5: { icon: '⬇', cls: 'dl',    text: 'processing' },
        };
        const s = statusMap[r.status] || { icon: '?', cls: 'req', text: 'unknown' };
        return `<div class="activity-item">
          <div class="activity-icon ${s.cls}">${s.icon}</div>
          <div class="activity-text">
            <div class="activity-main"><strong>${title}</strong> — ${s.text}</div>
            <div class="activity-time">${fmt.ago(r.updatedAt || r.createdAt)}</div>
          </div>
        </div>`;
      }).join('') : emptyDiv('No recent activity');
    }

    // All requests table
    const tbody = document.getElementById('os-all-body');
    if (tbody) {
      tbody.innerHTML = (allRequests.results || []).map(r => {
        const media = r.media || {};
        const isMovie = r.type === 'movie';
        const title = media.originalTitle || 'Unknown';
        const requestedBy = r.requestedBy?.displayName || r.requestedBy?.username || '?';
        const statusMap = { 1: ['pend','Pending'], 2: ['avail','Available'], 3: ['dl','Approved'], 4: ['miss','Declined'] };
        const [sc, st] = statusMap[r.status] || ['pause','Unknown'];
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
      }).join('') || emptyRow(6, 'No requests found');
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
      api.get('/radarr/status').catch(() => ({ online: false })),
      api.get('/radarr/queue').catch(() => ({ records: [] })),
      api.get('/radarr/wanted').catch(() => ({ records: [] })),
      api.get('/radarr/movies').catch(() => []),
    ]);

    setEl('rd-movie-count',   status.movieCount   ?? '?');
    setEl('rd-missing-count', status.missingCount  ?? '?');
    setEl('rd-queue-count',   status.queueCount    ?? '?');

    // Queue table
    const qBody = document.getElementById('rd-queue-body');
    if (qBody) {
      const recs = queue.records || [];
      qBody.innerHTML = recs.length
        ? recs.map(r => `<tr>
            <td style="max-width:200px">${r.movie?.title || r.title || 'Unknown'}</td>
            <td style="font-family:var(--mono);font-size:10px">${r.quality?.quality?.name || '—'}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.bytes(r.size)}</td>
            <td>${progressBar(r.sizeleft != null ? (1 - r.sizeleft / r.size) * 100 : 0, 'radarr-c')}</td>
            <td>${queueStatusPill(r.status, r.trackedDownloadStatus?.toLowerCase())}</td>
          </tr>`).join('')
        : emptyRow(5, 'Queue is empty');
    }

    // Wanted table
    const wBody = document.getElementById('rd-wanted-body');
    if (wBody) {
      const recs = wanted.records || [];
      wBody.innerHTML = recs.length
        ? recs.slice(0, 10).map(m => `<tr>
            <td>${m.title}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${m.year || '—'}</td>
            <td>${pill('Missing', 'miss')}</td>
          </tr>`).join('')
        : emptyRow(3, 'Nothing missing');
    }

    // Media grid
    const grid = document.getElementById('rd-media-grid');
    if (grid) {
      const recent = (Array.isArray(movies) ? movies : []).filter(m => m.hasFile).slice(0, 12);
      grid.innerHTML = recent.length
        ? recent.map(m => `
            <div class="media-card">
              <div class="media-card-art">🎬</div>
              <div class="media-card-info">
                <div class="media-card-title">${m.title}</div>
                <div class="media-card-meta">${m.year} · ${m.movieFile?.quality?.quality?.name || '?'}</div>
                <div class="media-card-status">${pill('Available', 'avail')}</div>
              </div>
            </div>`).join('')
        : '<div style="padding:20px;font-family:var(--mono);font-size:10px;color:var(--muted)">No movies in library</div>';
    }

    // Wire up Search All Missing button
    const searchBtn = document.getElementById('rd-search-missing-btn');
    if (searchBtn) {
      searchBtn.onclick = async () => {
        searchBtn.textContent = 'Searching…';
        searchBtn.disabled = true;
        try {
          await api.post('/radarr/command', { name: 'MissingMoviesSearch' });
          searchBtn.textContent = 'Search Triggered ✓';
          setTimeout(() => { searchBtn.textContent = 'Search All Missing'; searchBtn.disabled = false; }, 3000);
        } catch {
          searchBtn.textContent = 'Error';
          searchBtn.disabled = false;
        }
      };
    }
  } catch (e) {
    console.error('Radarr view error', e);
  }
}

// ── SONARR VIEW ─────────────────────────
async function loadSonarr() {
  try {
    const [status, queue, cutoff, calendar] = await Promise.all([
      api.get('/sonarr/status').catch(() => ({ online: false })),
      api.get('/sonarr/queue').catch(() => ({ records: [] })),
      api.get('/sonarr/cutoff').catch(() => ({ records: [] })),
      api.get('/sonarr/calendar').catch(() => []),
    ]);

    setEl('sn-series-count',  status.seriesCount  ?? '?');
    setEl('sn-missing-count', status.missingCount  ?? '?');
    setEl('sn-queue-count',   status.queueCount    ?? '?');

    // Queue
    const qBody = document.getElementById('sn-queue-body');
    if (qBody) {
      const recs = queue.records || [];
      qBody.innerHTML = recs.length
        ? recs.map(r => {
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
        : emptyRow(5, 'Queue is empty');
    }

    // Cutoff unmet
    const cBody = document.getElementById('sn-cutoff-body');
    if (cBody) {
      const recs = cutoff.records || [];
      cBody.innerHTML = recs.length
        ? recs.slice(0, 8).map(r => `<tr>
            <td>${r.title}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${r.episodeFile?.quality?.quality?.name || '?'}</td>
            <td>${pill(r.qualityProfile?.cutoff?.name || '?', 'cutoff')}</td>
          </tr>`).join('')
        : emptyRow(3, 'All up to standard');
    }

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
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDate = {};
  (episodes || []).forEach(ep => {
    const d = ep.airDateUtc?.split('T')[0];
    if (d) { if (!byDate[d]) byDate[d] = []; byDate[d].push(ep); }
  });
  const startOffset = (firstDay + 6) % 7;
  let html = '';
  for (let i = 0; i < startOffset; i++) html += '<div class="cal-day" style="opacity:0.3"><div class="cal-day-num"></div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = d === now.getDate();
    const eps = byDate[dateStr] || [];
    const epHtml = eps.slice(0, 2).map(ep => {
      const aired = new Date(ep.airDateUtc) < now;
      const cls = ep.hasFile ? 'aired' : (aired ? 'missing' : 'upcoming');
      const label = ep.series?.title?.substring(0, 12) || ep.title?.substring(0, 14) || 'Episode';
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
      api.get('/deluge/status').catch(() => ({ online: false })),
      api.get('/deluge/torrents').catch(() => []),
    ]);

    const list = Array.isArray(torrents) ? torrents : [];
    const dling   = list.filter(t => t.state?.toLowerCase() === 'downloading');
    const seeding = list.filter(t => t.state?.toLowerCase() === 'seeding');

    setEl('dl-dl-count',   dling.length);
    setEl('dl-seed-count', seeding.length);

    // Calculate real speeds from torrent list (more reliable than status endpoint)
    const dlSpeed = list.reduce((sum, t) => sum + (t.downloadSpeed || t.download_payload_rate || 0), 0);
    const ulSpeed = list.reduce((sum, t) => sum + (t.uploadSpeed   || t.upload_payload_rate   || 0), 0);

    setEl('dl-dl-speed', fmt.speed(dlSpeed));
    setEl('dl-ul-speed', fmt.speed(ulSpeed));

    if (status.online) {
      document.getElementById('dl-speed').textContent = fmt.speed(dlSpeed);
      document.getElementById('ul-speed').textContent = fmt.speed(ulSpeed);
    }

    const tbody = document.getElementById('dl-torrent-body');
    if (!tbody) return;

    tbody.innerHTML = list.length
      ? list.map(t => {
          const isPaused = t.state?.toLowerCase() === 'paused';
          const pctCls = torrentPct < 30 && !isPaused ? 'slow' : '';
          return `<tr data-hash="${t.hash}">
            <td style="max-width:200px">${t.name}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.bytes(t.size)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                ${progressBar(torrentPct, pctCls)}
                <span style="font-family:var(--mono);font-size:9px;color:var(--muted)">${fmt.pct(torrentPct)}</span>
              </div>
            </td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--teal)">${fmt.speed(dlSpd)}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.speed(ulSpd)}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${t.ratio?.toFixed(2) ?? '—'}</td>
            <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.eta(t.eta)}</td>
            <td>${torrentStatePill(t.state)}</td>
            <td>
              <div class="torrent-actions">
                <button class="icon-btn" data-action="${isPaused ? 'resume' : 'pause'}" data-hash="${t.hash}">${isPaused ? '▶' : '⏸'}</button>
                <button class="icon-btn danger" data-action="remove" data-hash="${t.hash}">✕</button>
              </div>
            </td>
          </tr>`;
        }).join('')
      : emptyRow(9, 'No torrents');

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
          setTimeout(loadDeluge, 800);
        } catch {
          btn.disabled = false;
        }
      });
    });

    // Pause All button
    const pauseAllBtn = document.getElementById('dl-pause-all-btn');
    if (pauseAllBtn) {
      pauseAllBtn.onclick = async () => {
        pauseAllBtn.textContent = 'Pausing…';
        pauseAllBtn.disabled = true;
        try {
          await Promise.all(list
            .filter(t => t.state?.toLowerCase() === 'downloading')
            .map(t => api.post(`/deluge/torrents/${t.hash}/pause`))
          );
          setTimeout(() => { loadDeluge(); pauseAllBtn.textContent = 'Pause All'; pauseAllBtn.disabled = false; }, 800);
        } catch {
          pauseAllBtn.textContent = 'Pause All';
          pauseAllBtn.disabled = false;
        }
      };
    }

    // Add Torrent button
    const addBtn = document.getElementById('dl-add-btn');
    if (addBtn) {
      addBtn.onclick = () => showAddTorrentModal();
    }

  } catch (e) {
    console.error('Deluge view error', e);
  }
}

function showAddTorrentModal() {
  let modal = document.getElementById('add-torrent-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'add-torrent-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);width:500px;padding:0;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--teal);text-transform:uppercase;letter-spacing:0.1em">Add Torrent</span>
        <button onclick="document.getElementById('add-torrent-modal').remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:12px;">
        <div class="setting-row">
          <div class="setting-label">Magnet Link or URL</div>
          <input class="setting-input" type="text" id="torrent-url-input" placeholder="magnet:?xt=urn:btih:...">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-ghost" onclick="document.getElementById('add-torrent-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="torrent-add-confirm">Add</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('torrent-add-confirm').onclick = async () => {
    const url = document.getElementById('torrent-url-input').value.trim();
    if (!url) return;
    const btn = document.getElementById('torrent-add-confirm');
    btn.textContent = 'Adding…';
    btn.disabled = true;
    try {
      await api.post('/deluge/torrents', { url });
      modal.remove();
      setTimeout(loadDeluge, 1000);
    } catch {
      btn.textContent = 'Error';
      btn.disabled = false;
    }
  };
}

// ── PROWLARR VIEW ────────────────────────
async function loadProwlarr() {
  try {
    const [indexers, stats, history] = await Promise.all([
      api.get('/prowlarr/indexers').catch(() => []),
      api.get('/prowlarr/stats').catch(() => ({ indexers: [] })),
      api.get('/prowlarr/history?pageSize=10').catch(() => ({ records: [] })),
    ]);

    const enabled  = (indexers || []).filter(i => i.enable);
    const healthy  = enabled.filter(i => !i.status?.disabled).length;
    const total    = enabled.length;
    const grabsToday = (history.records || []).filter(h => {
      const d = new Date(h.date);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const failures = enabled.filter(i => i.status?.disabled).length;

    setEl('pr-indexer-count', `${healthy}/${total}`);
    setEl('pr-grabs-count',   grabsToday);
    setEl('pr-fail-count',    failures);

    // Fix failures card color - only warn if there are actual failures
    const failCard = document.getElementById('pr-fail-card');
    if (failCard) {
      failCard.className = failCard.className.replace(/(ok|warn|error)/, failures > 0 ? 'warn' : 'ok');
      const failStatus = failCard.querySelector('.sc-status');
      if (failStatus) failStatus.textContent = failures > 0 ? 'Warning' : 'All Good';
    }

    // Indexer table
    const iBody = document.getElementById('pr-indexer-body');
    if (iBody) {
      iBody.innerHTML = enabled.length
        ? enabled.map(idx => {
            const stat = (stats.indexers || []).find(s => s.indexerId === idx.id) || {};
            const degraded = idx.status?.disabled;
            const avgMs = stat.averageResponseTime?.toFixed(0);
            const avgCls = !avgMs ? 'color:var(--muted)' : stat.averageResponseTime > 1000 ? 'color:var(--amber)' : 'color:var(--green)';
            return `<tr${degraded ? ' style="background:rgba(240,165,0,0.04)"' : ''}>
              <td><div class="idx-indicator ${degraded ? 'warn' : 'ok'}" style="margin:0 auto"></div></td>
              <td style="${degraded ? 'color:var(--amber)' : ''}">${idx.name}</td>
              <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${idx.privacy === 'public' ? 'Public' : 'Private'}</td>
              <td style="font-family:var(--mono);font-size:10px">${stat.numberOfGrabs ?? 0}</td>
              <td style="font-family:var(--mono);font-size:10px;${avgCls}">${avgMs ? avgMs + 'ms' : '—'}</td>
              <td>${degraded ? pill('Degraded', 'pend') : pill('Online', 'avail')}</td>
            </tr>`;
          }).join('')
        : emptyRow(6, 'No indexers configured');
    }

    // Bar chart
    const barChart = document.getElementById('pr-bar-chart');
    if (barChart) {
      const sorted = [...(stats.indexers || [])].sort((a,b) => (b.numberOfGrabs||0) - (a.numberOfGrabs||0)).slice(0, 8);
      const max = sorted[0]?.numberOfGrabs || 1;
      barChart.innerHTML = sorted.length
        ? sorted.map(s => {
            const idx = enabled.find(i => i.id === s.indexerId);
            const degraded = idx?.status?.disabled;
            const pct = Math.round((s.numberOfGrabs / max) * 100);
            return `<div class="bar-row">
              <div class="bar-label" style="${degraded ? 'color:var(--amber)' : ''}">${idx?.name || 'Unknown'}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%;${degraded ? 'background:var(--amber)' : ''}"></div></div>
              <div class="bar-val" style="${degraded ? 'color:var(--amber)' : ''}">${s.numberOfGrabs}</div>
            </div>`;
          }).join('')
        : '<div style="padding:20px;font-family:var(--mono);font-size:10px;color:var(--muted)">No grab data yet</div>';
    }

    // History
    const hBody = document.getElementById('pr-history-body');
    if (hBody) {
      const recs = history.records || [];
      hBody.innerHTML = recs.length
        ? recs.map(h => {
            const failed = h.eventType === 'indexerError' || h.successful === false;
            // Prowlarr history uses different field names depending on version
            const title   = h.title       || h.sourceTitle || h.query || '—';
            const indexer = h.indexer     || h.indexerName || '—';
            const size    = h.size        || h.downloadVolumeFactor || 0;
            return `<tr>
              <td style="max-width:240px">${title}</td>
              <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${indexer}</td>
              <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${size ? fmt.bytes(size) : '—'}</td>
              <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${fmt.ago(h.date)}</td>
              <td>${failed ? pill('Failed','miss') : pill('Grabbed','avail')}</td>
            </tr>`;
          }).join('')
        : emptyRow(5, 'No grab history yet');
    }

    // Test All button
    const testAllBtn = document.getElementById('pr-test-all-btn');
    if (testAllBtn) {
      testAllBtn.onclick = async () => {
        testAllBtn.textContent = 'Testing…';
        testAllBtn.disabled = true;
        try {
          await api.post('/prowlarr/indexers/testall');
          testAllBtn.textContent = 'Done ✓';
          setTimeout(() => { loadProwlarr(); testAllBtn.textContent = 'Test All'; testAllBtn.disabled = false; }, 2000);
        } catch {
          testAllBtn.textContent = 'Test All';
          testAllBtn.disabled = false;
        }
      };
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
      rdTimer = setTimeout(() => { if (rdSearch.value.length > 1) runSearch('radarr', rdSearch.value); }, 400);
    });
  }
  if (snSearch) {
    snSearch.addEventListener('input', () => {
      clearTimeout(snTimer);
      snTimer = setTimeout(() => { if (snSearch.value.length > 1) runSearch('sonarr', snSearch.value); }, 400);
    });
  }
}

async function runSearch(service, query) {
  const results = await api.get(`/${service}/search?query=${encodeURIComponent(query)}`).catch(() => []);
  showSearchModal(service, query, results);
}

function showSearchModal(service, query, results) {
  let modal = document.getElementById('search-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'search-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;';
  const items = (Array.isArray(results) ? results : []).slice(0, 8);
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);width:600px;max-height:80vh;display:flex;flex-direction:column;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:var(--mono);font-size:10px;color:var(--teal);text-transform:uppercase;letter-spacing:0.1em">
          ${service === 'radarr' ? 'Radarr' : 'Sonarr'} — "${query}"
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
  document.body.appendChild(modal);
}

function buildSearchResult(service, r) {
  const isMovie = service === 'radarr';
  const title = r.title || 'Unknown';
  const year = r.year || '';
  const overview = (r.overview || '').substring(0, 120) + (r.overview?.length > 120 ? '…' : '');
  const inLibrary = r.id != null;
  const payload = JSON.stringify(r).replace(/"/g, '&quot;');
  return `
    <div style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(33,40,47,0.6);">
      <div style="width:40px;height:60px;background:var(--panel2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;">${isMovie ? '🎬' : '📺'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;color:var(--text)">${title} ${year ? `<span style="color:var(--muted);font-size:11px">(${year})</span>` : ''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px;line-height:1.4">${overview}</div>
      </div>
      <div style="flex-shrink:0;display:flex;align-items:center;">
        <button class="btn ${inLibrary ? 'btn-ghost' : 'btn-primary'}" ${inLibrary ? 'disabled' : `data-add="${payload}"`}>${inLibrary ? 'In Library' : '+ Add'}</button>
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
    if (!profile || !rootFolder) { alert('Could not fetch quality profiles or root folders.'); btn.textContent = 'Error'; return; }
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
  }
}

// ── SETTINGS ─────────────────────────────────────────────────
async function loadSettings() {
  try {
    const data = await api.get('/settings');
    const banner = document.getElementById('first-run-banner');
    if (banner) banner.style.display = data.isFirstRun ? 'flex' : 'none';
    setInput('cfg-overseerr-url', data.overseerr?.url);
    setInput('cfg-overseerr-key', data.overseerr?.hasKey ? data.overseerr.apiKey : '');
    setInput('cfg-radarr-url',    data.radarr?.url);
    setInput('cfg-radarr-key',    data.radarr?.hasKey ? data.radarr.apiKey : '');
    setInput('cfg-sonarr-url',    data.sonarr?.url);
    setInput('cfg-sonarr-key',    data.sonarr?.hasKey ? data.sonarr.apiKey : '');
    setInput('cfg-prowlarr-url',  data.prowlarr?.url);
    setInput('cfg-prowlarr-key',  data.prowlarr?.hasKey ? data.prowlarr.apiKey : '');
    setInput('cfg-deluge-url',    data.deluge?.url);
    setInput('cfg-deluge-password', data.deluge?.hasPassword ? '••••••••' : '');
    setInput('cfg-port',          data.port);
  } catch (e) { console.error('Settings load error', e); }
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.value = value;
}

async function saveSettings() {
  const btn = document.getElementById('settings-save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;
  const body = {
    overseerrUrl:    document.getElementById('cfg-overseerr-url')?.value,
    overseerrApiKey: document.getElementById('cfg-overseerr-key')?.value,
    radarrUrl:       document.getElementById('cfg-radarr-url')?.value,
    radarrApiKey:    document.getElementById('cfg-radarr-key')?.value,
    sonarrUrl:       document.getElementById('cfg-sonarr-url')?.value,
    sonarrApiKey:    document.getElementById('cfg-sonarr-key')?.value,
    prowlarrUrl:     document.getElementById('cfg-prowlarr-url')?.value,
    prowlarrApiKey:  document.getElementById('cfg-prowlarr-key')?.value,
    delugeUrl:       document.getElementById('cfg-deluge-url')?.value,
    delugePassword:  document.getElementById('cfg-deluge-password')?.value,
    port:            document.getElementById('cfg-port')?.value,
  };
  try {
    const res = await api.post('/settings', body);
    if (res.success) {
      if (res.restarting) {
        btn.textContent = 'Restarting…';
        showFeedback('✓ Settings saved — restarting server...', 'var(--amber)');
        await pollUntilBack();
        showFeedback('✓ Server back online!', 'var(--green)');
        const banner = document.getElementById('first-run-banner');
        if (banner) banner.style.display = 'none';
        setTimeout(() => switchTab('overview'), 1200);
      } else {
        showFeedback('✓ Settings saved', 'var(--green)');
      }
    } else {
      showFeedback('✗ Failed to save settings', 'var(--red)');
    }
  } catch {
    showFeedback('✗ Error saving settings', 'var(--red)');
  } finally {
    btn.textContent = 'Save All';
    btn.disabled = false;
  }
}

async function pollUntilBack(attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try { const res = await fetch('/api/auth/status'); if (res.ok) return true; } catch {}
  }
  return false;
}

function showFeedback(msg, color) {
  const el = document.getElementById('settings-feedback');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color;
  el.style.background = color === 'var(--green)' ? 'rgba(63,185,80,0.08)' : color === 'var(--amber)' ? 'rgba(240,165,0,0.08)' : 'rgba(224,82,82,0.08)';
  el.style.border = `1px solid ${color}`;
  el.style.display = 'block';
  if (color !== 'var(--amber)') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── FIRST RUN CHECK ──────────────────────────────────────────
async function checkFirstRun() {
  try {
    const data = await api.get('/settings/firstrun');
    if (data.firstRun) {
      switchTab('settings');
      const banner = document.getElementById('first-run-banner');
      if (banner) banner.style.display = 'flex';
      return true;
    }
  } catch (e) { console.error('First run check failed', e); }
  return false;
}

// ── AUTH ─────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}

// ── TAB NAVIGATION ───────────────────────
const viewLoaders = {
  overview:  loadOverview,
  overseerr: loadOverseerr,
  radarr:    loadRadarr,
  sonarr:    loadSonarr,
  deluge:    loadDeluge,
  prowlarr:  loadProwlarr,
  settings:  loadSettings,
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

  const saveBtn = document.getElementById('settings-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  setupSearch();

  checkFirstRun().then(isFirst => {
    if (!isFirst) switchTab('overview');
  });
});
