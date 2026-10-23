// node tools/render.js <playwright-core dir> <base url>  ->  assets/p/*.webp and assets/poster.jpg
const { chromium } = require(process.argv[2]); const fs = require('fs'); const path = require('path');
const base = process.argv[3], root = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, args: ['--window-position=4000,4000'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + '/tools/render.html'); await p.waitForFunction(() => window.__ready);
  const shots = await p.evaluate(() => window.__render());
  let bytes = 0; for (const [id, url] of Object.entries(shots)) { const buf = Buffer.from(url.split(',')[1], 'base64'); bytes += buf.length; fs.writeFileSync(path.join(root, 'assets/p', id + '.webp'), buf); }
  console.log('photos', Object.keys(shots).length, Math.round(bytes / 1024) + ' KB', 'errors', errs.length);
  // the poster: the hero shot without any words, used while the 3D boots
  const q = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await q.goto(base + '/?q=0'); await q.addStyleTag({ content: 'main,.nav,footer,.toast{visibility:hidden!important}' });
  await q.waitForTimeout(9000);
  await q.screenshot({ path: path.join(root, 'assets/poster.jpg'), type: 'jpeg', quality: 70 });
  console.log('poster', Math.round(fs.statSync(path.join(root, 'assets/poster.jpg')).size / 1024) + ' KB');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
