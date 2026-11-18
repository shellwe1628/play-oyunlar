#!/usr/bin/env node
// Mixamo'dan indirilen bir FBX animasyonunu (With Skin) 2B kare dizisine çevirir:
// saydam arka planlı tek bir PNG şeridi + kare bilgilerini tutan bir JSON.
//
//   node tools/mixamo/fbx-kareler.mjs <dosya.fbx> --ad idle [--cikti games/okcu/public/anim]
//        [--fps 12] [--boy 192] [--yon 90] [--egim 0] [--sutun 8] [--kare N] [--yerinde 1]
//
// --yon: karakterin kendi ekseni çevresinde dönüşü (derece). 0 = önden, 90 = yandan (sağa bakar).
// --egim: kameranın yukarıdan bakış açısı (derece). --yerinde 0: kök hareketini korur.
// Ayrıntı: tools/mixamo/README.md
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const THREE_DIR = join(ROOT, 'node_modules/three');

function parseArgs(argv) {
  const o = { cikti: 'games/okcu/public/anim', fps: 12, boy: 192, yon: 90, egim: 0, sutun: 8, kare: 0, yerinde: 1 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  o.fbx = rest[0];
  for (const k of ['fps', 'boy', 'yon', 'egim', 'sutun', 'kare', 'yerinde']) o[k] = Number(o[k]);
  return o;
}

const PAGE = `<!doctype html><meta charset="utf-8"><body><script type="importmap">
{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}
</script><script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

window.render = async (o) => {
  const obj = await new FBXLoader().loadAsync('/model.fbx');
  const clip = obj.animations.reduce((a, b) => (!a || b.duration > a.duration ? b : a), null);
  if (!clip) throw new Error('FBX içinde animasyon yok');
  let meshes = 0;
  obj.traverse((n) => { if (n.isMesh) { meshes++; n.frustumCulled = false; } });
  if (!meshes) throw new Error('FBX içinde model yok: Mixamo\\'dan "With Skin" seçerek indirin');

  const scene = new THREE.Scene();
  const pivot = new THREE.Group();
  pivot.add(obj);
  pivot.rotation.y = (o.yon * Math.PI) / 180;
  scene.add(pivot);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a9a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(1, 2, 3);
  scene.add(sun);

  const mixer = new THREE.AnimationMixer(obj);
  mixer.clipAction(clip).play();
  const n = o.kare > 0 ? o.kare : Math.max(2, Math.round(clip.duration * o.fps));
  const hips = obj.getObjectByName('mixamorigHips') || null;
  const base = new THREE.Vector3();
  const v = new THREE.Vector3();
  const pose = (i) => {
    mixer.setTime((clip.duration * i) / n);
    obj.position.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    if (o.yerinde && hips) {
      // kök hareketini sil: kalça yatayda hep ilk karedeki yerinde kalsın
      hips.getWorldPosition(v);
      if (i === 0) base.copy(v);
      obj.position.x -= v.x - base.x;
      obj.position.z -= v.z - base.z;
    }
    scene.updateMatrixWorld(true);
  };

  // tüm karelerdeki kemik konumlarından ortak bir çerçeve çıkar (kareler arasında titreme olmasın)
  const tilt = (o.egim * Math.PI) / 180;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);
  cam.position.set(0, Math.sin(tilt), Math.cos(tilt)).multiplyScalar(5000);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    pose(i);
    obj.traverse((b) => {
      if (!b.isBone) return;
      b.getWorldPosition(v).applyMatrix4(inv);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    });
  }
  const pad = (y1 - y0) * 0.16; // kemik uçlarının dışındaki et, saç, ayak
  x0 -= pad; x1 += pad; y0 -= pad * 0.6; y1 += pad;
  const fh = o.boy;
  const fw = Math.ceil((fh * (x1 - x0)) / (y1 - y0) / 2) * 2;
  cam.left = x0; cam.right = x1; cam.top = y1; cam.bottom = y0;
  cam.updateProjectionMatrix();

  const gl = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1);
  gl.setSize(fw, fh, false);
  gl.setClearColor(0x000000, 0);
  const cols = Math.min(o.sutun, n);
  const rows = Math.ceil(n / cols);
  const sheet = document.createElement('canvas');
  sheet.width = fw * cols; sheet.height = fh * rows;
  const ctx = sheet.getContext('2d');
  for (let i = 0; i < n; i++) {
    pose(i);
    gl.render(scene, cam);
    ctx.drawImage(gl.domElement, (i % cols) * fw, Math.floor(i / cols) * fh);
  }
  // ayak tabanı: çerçevenin altından ölçülen zemin çizgisi (0 = alt kenar)
  const ground = Math.round((fh * (0 - y0)) / (y1 - y0));
  return {
    png: sheet.toDataURL('image/png').split(',')[1],
    meta: { clip: clip.name, frames: n, columns: cols, rows, frameWidth: fw, frameHeight: fh,
      fps: +(n / clip.duration).toFixed(3), duration: +clip.duration.toFixed(4), groundFromBottom: ground },
  };
};
window.ready = true;
</script>`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.fbx || !o.ad) {
    console.error('Kullanım: node tools/mixamo/fbx-kareler.mjs <dosya.fbx> --ad <isim> [--cikti klasör] [--fps 12] [--boy 192] [--yon 90]');
    process.exit(1);
  }
  const fbx = resolve(o.fbx);
  if (!existsSync(fbx)) throw new Error(`Dosya yok: ${fbx}`);
  if (!existsSync(THREE_DIR)) throw new Error('three kurulu değil: depo kökünde "npm install" çalıştırın');

  const types = { '.js': 'text/javascript', '.html': 'text/html' };
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let body, type = 'application/octet-stream';
      if (url === '/') { body = PAGE; type = 'text/html'; }
      else if (url === '/model.fbx') body = await readFile(fbx);
      else if (url.startsWith('/three/')) {
        const p = normalize(join(THREE_DIR, url.slice(7)));
        if (!p.startsWith(THREE_DIR)) throw new Error('yol');
        body = await readFile(p);
        type = types[p.slice(p.lastIndexOf('.'))] ?? type;
      } else throw new Error('yok');
      res.writeHead(200, { 'content-type': type });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('sayfa hatası:', e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction('window.ready === true');
    const { png, meta } = await page.evaluate((a) => globalThis.render(a), o);
    const out = resolve(ROOT, o.cikti);
    await mkdir(out, { recursive: true });
    await writeFile(join(out, `${o.ad}.png`), Buffer.from(png, 'base64'));
    await writeFile(join(out, `${o.ad}.json`), JSON.stringify({ name: o.ad, image: `${o.ad}.png`, ...meta }, null, 2) + '\n');
    console.log(`${o.ad}: ${meta.frames} kare, ${meta.frameWidth}×${meta.frameHeight}, ${meta.fps} fps → ${join(out, o.ad)}.png`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
