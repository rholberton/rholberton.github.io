// Simple HTTP server for local development
// Run with: node server.js
// Then open: http://localhost:8000

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.patt': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

const server = http.createServer((req, res) => {
  // Parse URL and remove query string
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const relativePath = urlPath.replace(/^\/+/, "");

  // Default to index.html for root
  const requestedPath = relativePath === "" ? "index.html" : relativePath;

  // Normalize path to prevent directory traversal
  const safePath = path.normalize(requestedPath);
  const filePath = path.join(__dirname, safePath);

  // Ensure file is within project directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 - Forbidden</h1>', 'utf-8');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const baseContentType = MIME_TYPES[extname] || 'application/octet-stream';
  const isUtf8Text = ['.html', '.js', '.css', '.json'].includes(extname);
  const contentType = isUtf8Text ? `${baseContentType}; charset=utf-8` : baseContentType;

  // Set CORS headers for cross-origin resources
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, headers);
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop the server');
  
  // Automatically open Chrome in incognito mode
  const url = `http://localhost:${PORT}/`;
  const { exec } = require('child_process');
  const platform = process.platform;
  
  let command;
  if (platform === 'win32') {
    // Windows: Use start command with Chrome incognito
    command = `start chrome --incognito "${url}"`;
  } else if (platform === 'darwin') {
    // macOS: Use open command with Chrome incognito
    command = `open -na "Google Chrome" --args --incognito "${url}"`;
  } else {
    // Linux: Use google-chrome or chromium
    command = `google-chrome --incognito "${url}" || chromium --incognito "${url}"`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.log(`Could not automatically open Chrome incognito. Please manually open: ${url}`);
      console.log(`Error: ${error.message}`);
    } else {
      console.log(`Opening Chrome in incognito mode at ${url}`);
    }
  });
});
