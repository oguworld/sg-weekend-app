require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

async function fetchUnsplashImage(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  return new Promise((resolve) => {
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&client_id=${key}`;
    https.get(url, { headers: { 'Accept-Version': 'v1' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json?.urls?.regular ?? null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

module.exports = { fetchUnsplashImage };
