import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

export function assetCacheControl(filename) {
  if (/\.html$/i.test(filename)) return 'no-cache';
  if (/[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/i.test(filename))
    return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600, must-revalidate';
}

// Precompressed representations share the original URL and MIME type. Express
// handles conditional requests and byte ranges for the selected representation.
export function staticAssets(directory) {
  const root = path.resolve(directory);
  const plain = express.static(root, { setHeaders(res, filename) {
    res.setHeader('Cache-Control', assetCacheControl(filename));
    res.vary('Accept-Encoding');
  } });
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let filename;
    try { filename = path.resolve(root, '.' + decodeURIComponent(req.path)); }
    catch { return next(); }
    if (!filename.startsWith(root + path.sep)) return next();
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    if (encoding === 'br' || encoding === 'gzip') {
      const variant = filename + (encoding === 'br' ? '.br' : '.gz');
      try {
        const info = await fs.stat(variant);
        if (info.isFile()) {
          res.type(path.extname(filename));
          res.set('Content-Encoding', encoding);
          res.set('Cache-Control', assetCacheControl(filename));
          res.vary('Accept-Encoding');
          return res.sendFile(variant, error => { if (error) next(error); });
        }
      } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return next(error); }
    }
    return plain(req, res, next);
  };
}
