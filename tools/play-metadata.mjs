#!/usr/bin/env node
// Prepares the fastlane `supply` metadata folder for one app's upload (used by
// .github/workflows/play-yukle.yml; safe to run locally, it talks to nobody).
//   node tools/play-metadata.mjs <slug> <outDir> [--listing]
//
// Reads build/<slug>-release.json (written by tools/aab.mjs) for the versionCode, copies
// store/<slug>/metadata/android/ (fastlane's Android layout, if it exists) into <outDir>, and makes
// sure every language in store/apps.json has release notes for exactly this versionCode
// (<outDir>/<locale>/changelogs/<versionCode>.txt), taken in this order from:
//   store/<slug>/metadata/android/<locale>/changelogs/<versionCode>.txt, then default.txt, then the
//   highest-numbered <n>.txt there, then store/apps.json releaseNotes[<locale>].
// --listing: the listing texts and images will be pushed too, so they are checked against Play's
// limits (title <= 30, short description <= 80, full description <= 4000 characters; icon
// 512×512, feature graphic 1024×500 PNG; 2-8 phone screenshots) and missing pieces are listed.
// Exit code 1 with a readable message on any problem.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './template.mjs';

const [slug, outDir, flag] = process.argv.slice(2);
const listing = flag === '--listing';
const problems = [];
const notes = [];

function fail(msg) {
  console.error(`play-metadata: FAILED\n${msg}`);
  process.exit(1);
}

if (!slug || !outDir) fail('usage: node tools/play-metadata.mjs <slug> <outDir> [--listing]');
const cfg = JSON.parse(readFileSync(join(ROOT, 'store', 'apps.json'), 'utf8'));
const app = cfg.apps.find((a) => a.slug === slug);
if (!app) fail(`store/apps.json has no app "${slug}"`);
const reportFile = join(ROOT, 'build', `${slug}-release.json`);
if (!existsSync(reportFile)) fail(`${relative(ROOT, reportFile)} not found: run npm run aab -- ${slug} first`);
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
if (report.applicationId !== app.applicationId) fail(`${relative(ROOT, reportFile)} is for ${report.applicationId}, apps.json says ${app.applicationId}`);
const vc = report.versionCode;

const src = join(ROOT, 'store', slug, 'metadata', 'android');

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const a = join(from, name);
    const b = join(to, name);
    if (statSync(a).isDirectory()) copyTree(a, b);
    else copyFileSync(a, b);
  }
}

rmSync(outDir, { recursive: true, force: true });
if (existsSync(src)) copyTree(src, outDir);
else {
  mkdirSync(outDir, { recursive: true });
  notes.push(`${relative(ROOT, src)} does not exist: release notes come from store/apps.json`);
}

/** Visible length as Play counts it (code points). */
const len = (s) => [...s.trim()].length;

for (const lang of cfg.languages) {
  const srcLogs = join(src, lang, 'changelogs');
  let text = null;
  let from = null;
  if (existsSync(srcLogs)) {
    const files = readdirSync(srcLogs).filter((f) => f.endsWith('.txt'));
    const numbered = files.filter((f) => /^\d+\.txt$/.test(f)).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    const pick = files.includes(`${vc}.txt`) ? `${vc}.txt` : files.includes('default.txt') ? 'default.txt' : numbered[0];
    if (pick) {
      text = readFileSync(join(srcLogs, pick), 'utf8').trim();
      from = relative(ROOT, join(srcLogs, pick));
    }
  }
  if (!text) {
    text = app.releaseNotes?.[lang]?.trim() ?? '';
    from = `store/apps.json releaseNotes.${lang}`;
  }
  if (!text) problems.push(`${lang}: no release notes anywhere (add store/apps.json releaseNotes.${lang})`);
  else if (len(text) > 500) problems.push(`${lang}: release notes are ${len(text)} characters, Play allows 500 (${from})`);
  const dir = join(outDir, lang, 'changelogs');
  mkdirSync(dir, { recursive: true });
  // Only this build's notes: fastlane must not pick up an older file for another versionCode.
  for (const f of readdirSync(dir)) rmSync(join(dir, f));
  writeFileSync(join(dir, `${vc}.txt`), `${text}\n`);
  notes.push(`${lang}: release notes for versionCode ${vc} from ${from}`);
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

if (listing) {
  if (!existsSync(src)) problems.push(`--listing asked but ${relative(ROOT, src)} does not exist`);
  const limits = { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000 };
  for (const lang of cfg.languages) {
    const dir = join(outDir, lang);
    for (const [file, max] of Object.entries(limits)) {
      const p = join(dir, file);
      if (!existsSync(p)) problems.push(`${lang}/${file} missing`);
      else if (len(readFileSync(p, 'utf8')) === 0) problems.push(`${lang}/${file} is empty`);
      else if (len(readFileSync(p, 'utf8')) > max) problems.push(`${lang}/${file} is ${len(readFileSync(p, 'utf8'))} characters, Play allows ${max}`);
    }
    const title = existsSync(join(dir, 'title.txt')) ? readFileSync(join(dir, 'title.txt'), 'utf8').trim() : null;
    if (title && title !== app.title[lang]) notes.push(`${lang}: listing title "${title}" differs from apps.json "${app.title[lang]}" (allowed, but check it is intended)`);
    const img = join(dir, 'images');
    for (const [file, w, h] of [
      ['icon.png', 512, 512],
      ['featureGraphic.png', 1024, 500],
    ]) {
      const p = join(img, file);
      if (!existsSync(p)) {
        // Play needs these once per app; a language without them falls back to the default.
        (lang === cfg.defaultLanguage ? problems : notes).push(`${lang}/images/${file} missing`);
        continue;
      }
      const size = pngSize(p);
      if (!size) problems.push(`${lang}/images/${file} is not a PNG`);
      else if (size[0] !== w || size[1] !== h) problems.push(`${lang}/images/${file} is ${size[0]}×${size[1]}, Play wants ${w}×${h}`);
    }
    const shots = join(img, 'phoneScreenshots');
    const n = existsSync(shots) ? readdirSync(shots).filter((f) => /\.(png|jpe?g)$/i.test(f)).length : 0;
    if (n > 8) problems.push(`${lang}/images/phoneScreenshots has ${n} files, Play allows 8`);
    else if (n < 2) (lang === cfg.defaultLanguage ? problems : notes).push(`${lang}/images/phoneScreenshots has ${n} files, Play needs at least 2`);
  }
}

for (const n of notes) console.log(`note: ${n}`);
if (problems.length) fail(`  ${problems.join('\n  ')}`);
console.log(`ok: ${relative(ROOT, outDir) || outDir} ready for ${app.applicationId} versionCode ${vc}${listing ? ' (listing texts and images checked)' : ' (release notes only)'}`);
