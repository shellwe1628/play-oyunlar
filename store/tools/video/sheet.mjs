// node store/tools/video/sheet.mjs <dir-with-jpgs-or-mp4> <out.png> [every=8] [cols=8] [w=216]
// Contact sheet of a recorded clip folder (or a video) for looking at it.
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ffmpegBin, run } from './lib/env.mjs';
const [src, out, every = '8', cols = '8', w = '216'] = process.argv.slice(2);
const { ffmpeg } = ffmpegBin();
const input = statSync(src).isDirectory() ? ['-framerate', '30', '-i', join(src, '%05d.jpg')] : ['-i', src];
const n = Number(every);
await run(ffmpeg, ['-loglevel', 'error', '-y', ...input, '-vf', `select='not(mod(n\,${n}))',scale=${w}:-1,tile=${cols}x4`, '-frames:v', '1', out]);
console.log(existsSync(out) ? out : 'no output');
