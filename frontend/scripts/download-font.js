/* eslint-disable @typescript-eslint/no-require-imports */
const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf';
const dest = path.join(__dirname, '../public/fonts/DMSerifDisplay-Regular.ttf');

function download(url, dest) {
  https.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      return download(res.headers.location, dest);
    }
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Font downloaded successfully!');
    });
  }).on('error', (err) => {
    console.error('Error downloading:', err);
  });
}

download(url, dest);
