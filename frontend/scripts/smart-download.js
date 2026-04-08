const https = require('https');
const fs = require('fs');
const path = require('path');

const fontName = 'Cormorant+Garamond';
const dest = path.join(__dirname, '../public/fonts/CormorantGaramond-Regular.ttf');

const options = {
  hostname: 'fonts.googleapis.com',
  path: `/css2?family=${fontName}:wght@400&display=swap`,
  headers: {
    // Faking a very old Android user agent forces Google Fonts to serve .ttf instead of .woff2
    'User-Agent': 'Mozilla/5.0 (Linux; U; Android 4.1.1; en-gb; Build/KLP) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30'
  }
};

https.get(options, (res) => {
  let css = '';
  res.on('data', d => css += d);
  res.on('end', () => {
    const match = css.match(/url\((https:\/\/[^)]+\.ttf)\)/);
    if (!match) {
      console.log('TTF URL not found in CSS. CSS was:');
      console.log(css);
      return;
    }
    const ttfUrl = match[1];
    
    https.get(ttfUrl, (ttfRes) => {
      const file = fs.createWriteStream(dest);
      ttfRes.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('Font successfully downloaded from:', ttfUrl);
      });
    }).on('error', console.error);
  });
}).on('error', console.error);

