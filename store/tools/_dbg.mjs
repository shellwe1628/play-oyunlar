import { captureBuild, serve } from './lib/build.mjs';
import { launch, openGame } from './lib/browser.mjs';
const b = await captureBuild('okcu'); const srv = await serve(b.dir); const br = await launch();
const g = await openGame(br, b, { url: srv.url, lang: 'en' });
const out = await g.page.evaluate(() => { const H=window.__OYUN__; const log=[]; for (let i=0;i<60;i++){ const d=H.state().data; log.push([d.phase,d.wave,d.reload,d.shots,d.kos,d.health].join(',')); if ((d.phase==='title'||d.phase==='play') && d.reload===0) H.act('aimbot',{error:0.004}); H.act('advance',0.2);} return log; });
console.log(out.join(' | '));
await g.close(); await br.close(); await srv.close();
