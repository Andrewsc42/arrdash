const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const ENV_PATH = path.resolve(__dirname, '../../.env');

// Parse .env file into object
function parseEnv(content) {
  const result = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    result[key] = val;
  });
  return result;
}

// Write updates into .env preserving comments
function writeEnv(updates) {
  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    content = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
  }

  Object.entries(updates).forEach(([key, val]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  });

  fs.writeFileSync(ENV_PATH, content, 'utf8');

  // Also apply to current process so routes work immediately before restart
  Object.entries(updates).forEach(([key, val]) => {
    process.env[key] = val;
  });
}

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const content = fs.existsSync(ENV_PATH)
      ? fs.readFileSync(ENV_PATH, 'utf8')
      : fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');

    const env = parseEnv(content);

    const mask = (val) => val && val.length > 6
      ? val.substring(0, 4) + '••••••••'
      : (val ? '••••••••' : '');

    const isPlaceholder = (val) => !val || val.startsWith('your_');

    res.json({
      isFirstRun: isPlaceholder(env.OVERSEERR_API_KEY) &&
                  isPlaceholder(env.RADARR_API_KEY)    &&
                  isPlaceholder(env.SONARR_API_KEY),
      overseerr: {
        url:    env.OVERSEERR_URL || '',
        apiKey: !isPlaceholder(env.OVERSEERR_API_KEY) ? mask(env.OVERSEERR_API_KEY) : '',
        hasKey: !isPlaceholder(env.OVERSEERR_API_KEY),
      },
      radarr: {
        url:    env.RADARR_URL || '',
        apiKey: !isPlaceholder(env.RADARR_API_KEY) ? mask(env.RADARR_API_KEY) : '',
        hasKey: !isPlaceholder(env.RADARR_API_KEY),
      },
      sonarr: {
        url:    env.SONARR_URL || '',
        apiKey: !isPlaceholder(env.SONARR_API_KEY) ? mask(env.SONARR_API_KEY) : '',
        hasKey: !isPlaceholder(env.SONARR_API_KEY),
      },
      prowlarr: {
        url:    env.PROWLARR_URL || '',
        apiKey: !isPlaceholder(env.PROWLARR_API_KEY) ? mask(env.PROWLARR_API_KEY) : '',
        hasKey: !isPlaceholder(env.PROWLARR_API_KEY),
      },
      deluge: {
        url:         env.DELUGE_URL || '',
        hasPassword: !isPlaceholder(env.DELUGE_PASSWORD),
      },
      port: env.PORT || '3000',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const {
      overseerrUrl, overseerrApiKey,
      radarrUrl, radarrApiKey,
      sonarrUrl, sonarrApiKey,
      prowlarrUrl, prowlarrApiKey,
      delugeUrl, delugePassword,
      port,
    } = req.body;

    const updates = {};

    if (overseerrUrl)                                          updates.OVERSEERR_URL     = overseerrUrl;
    if (overseerrApiKey && !overseerrApiKey.includes('••'))   updates.OVERSEERR_API_KEY = overseerrApiKey;
    if (radarrUrl)                                             updates.RADARR_URL        = radarrUrl;
    if (radarrApiKey && !radarrApiKey.includes('••'))         updates.RADARR_API_KEY    = radarrApiKey;
    if (sonarrUrl)                                             updates.SONARR_URL        = sonarrUrl;
    if (sonarrApiKey && !sonarrApiKey.includes('••'))         updates.SONARR_API_KEY    = sonarrApiKey;
    if (prowlarrUrl)                                           updates.PROWLARR_URL      = prowlarrUrl;
    if (prowlarrApiKey && !prowlarrApiKey.includes('••'))     updates.PROWLARR_API_KEY  = prowlarrApiKey;
    if (delugeUrl)                                             updates.DELUGE_URL        = delugeUrl;
    if (delugePassword && !delugePassword.includes('••'))     updates.DELUGE_PASSWORD   = delugePassword;
    if (port)                                                  updates.PORT              = port;

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, restarting: false });
    }

    writeEnv(updates);

    // Send response before restarting so the client gets confirmation
    res.json({ success: true, restarting: true });

    // Graceful restart after short delay — systemd will bring it back up
    setTimeout(() => {
      console.log('[arrdash] Settings updated — restarting to apply changes...');
      process.exit(0);
    }, 500);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/firstrun
router.get('/firstrun', (req, res) => {
  try {
    if (!fs.existsSync(ENV_PATH)) {
      return res.json({ firstRun: true });
    }
    const env = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
    const configured =
      env.OVERSEERR_API_KEY && !env.OVERSEERR_API_KEY.startsWith('your_') &&
      env.RADARR_API_KEY    && !env.RADARR_API_KEY.startsWith('your_')    &&
      env.SONARR_API_KEY    && !env.SONARR_API_KEY.startsWith('your_');
    res.json({ firstRun: !configured });
  } catch {
    res.json({ firstRun: true });
  }
});

module.exports = router;const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const ENV_PATH = path.resolve(__dirname, '../../.env');

// Parse .env file into object
function parseEnv(content) {
  const result = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    result[key] = val;
  });
  return result;
}

// Write updates into .env preserving comments
function writeEnv(updates) {
  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    content = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
  }

  Object.entries(updates).forEach(([key, val]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${val}`);
    } else {
      content += `\n${key}=${val}`;
    }
  });

  fs.writeFileSync(ENV_PATH, content, 'utf8');

  // Also apply to current process so routes work immediately before restart
  Object.entries(updates).forEach(([key, val]) => {
    process.env[key] = val;
  });
}

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const content = fs.existsSync(ENV_PATH)
      ? fs.readFileSync(ENV_PATH, 'utf8')
      : fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');

    const env = parseEnv(content);

    const mask = (val) => val && val.length > 6
      ? val.substring(0, 4) + '••••••••'
      : (val ? '••••••••' : '');

    const isPlaceholder = (val) => !val || val.startsWith('your_');

    res.json({
      isFirstRun: isPlaceholder(env.OVERSEERR_API_KEY) &&
                  isPlaceholder(env.RADARR_API_KEY)    &&
                  isPlaceholder(env.SONARR_API_KEY),
      overseerr: {
        url:    env.OVERSEERR_URL || '',
        apiKey: !isPlaceholder(env.OVERSEERR_API_KEY) ? mask(env.OVERSEERR_API_KEY) : '',
        hasKey: !isPlaceholder(env.OVERSEERR_API_KEY),
      },
      radarr: {
        url:    env.RADARR_URL || '',
        apiKey: !isPlaceholder(env.RADARR_API_KEY) ? mask(env.RADARR_API_KEY) : '',
        hasKey: !isPlaceholder(env.RADARR_API_KEY),
      },
      sonarr: {
        url:    env.SONARR_URL || '',
        apiKey: !isPlaceholder(env.SONARR_API_KEY) ? mask(env.SONARR_API_KEY) : '',
        hasKey: !isPlaceholder(env.SONARR_API_KEY),
      },
      prowlarr: {
        url:    env.PROWLARR_URL || '',
        apiKey: !isPlaceholder(env.PROWLARR_API_KEY) ? mask(env.PROWLARR_API_KEY) : '',
        hasKey: !isPlaceholder(env.PROWLARR_API_KEY),
      },
      deluge: {
        url:         env.DELUGE_URL || '',
        hasPassword: !isPlaceholder(env.DELUGE_PASSWORD),
      },
      port: env.PORT || '3000',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const {
      overseerrUrl, overseerrApiKey,
      radarrUrl, radarrApiKey,
      sonarrUrl, sonarrApiKey,
      prowlarrUrl, prowlarrApiKey,
      delugeUrl, delugePassword,
      port,
    } = req.body;

    const updates = {};

    if (overseerrUrl)                                          updates.OVERSEERR_URL     = overseerrUrl;
    if (overseerrApiKey && !overseerrApiKey.includes('••'))   updates.OVERSEERR_API_KEY = overseerrApiKey;
    if (radarrUrl)                                             updates.RADARR_URL        = radarrUrl;
    if (radarrApiKey && !radarrApiKey.includes('••'))         updates.RADARR_API_KEY    = radarrApiKey;
    if (sonarrUrl)                                             updates.SONARR_URL        = sonarrUrl;
    if (sonarrApiKey && !sonarrApiKey.includes('••'))         updates.SONARR_API_KEY    = sonarrApiKey;
    if (prowlarrUrl)                                           updates.PROWLARR_URL      = prowlarrUrl;
    if (prowlarrApiKey && !prowlarrApiKey.includes('••'))     updates.PROWLARR_API_KEY  = prowlarrApiKey;
    if (delugeUrl)                                             updates.DELUGE_URL        = delugeUrl;
    if (delugePassword && !delugePassword.includes('••'))     updates.DELUGE_PASSWORD   = delugePassword;
    if (port)                                                  updates.PORT              = port;

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, restarting: false });
    }

    writeEnv(updates);

    // Send response before restarting so the client gets confirmation
    res.json({ success: true, restarting: true });

    // Graceful restart after short delay — systemd will bring it back up
    setTimeout(() => {
      console.log('[arrdash] Settings updated — restarting to apply changes...');
      process.exit(0);
    }, 500);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/firstrun
router.get('/firstrun', (req, res) => {
  try {
    if (!fs.existsSync(ENV_PATH)) {
      return res.json({ firstRun: true });
    }
    const env = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
    const configured =
      env.OVERSEERR_API_KEY && !env.OVERSEERR_API_KEY.startsWith('your_') &&
      env.RADARR_API_KEY    && !env.RADARR_API_KEY.startsWith('your_')    &&
      env.SONARR_API_KEY    && !env.SONARR_API_KEY.startsWith('your_');
    res.json({ firstRun: !configured });
  } catch {
    res.json({ firstRun: true });
  }
});

module.exports = router;
