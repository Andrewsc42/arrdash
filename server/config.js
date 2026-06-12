require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  overseerr: {
    url: process.env.OVERSEERR_URL,
    apiKey: process.env.OVERSEERR_API_KEY,
  },
  radarr: {
    url: process.env.RADARR_URL,
    apiKey: process.env.RADARR_API_KEY,
  },
  sonarr: {
    url: process.env.SONARR_URL,
    apiKey: process.env.SONARR_API_KEY,
  },
  prowlarr: {
    url: process.env.PROWLARR_URL,
    apiKey: process.env.PROWLARR_API_KEY,
  },
  deluge: {
    url: process.env.DELUGE_URL,
    password: process.env.DELUGE_PASSWORD,
  },
};
