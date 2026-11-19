// ffmpeg steps: stem mix + loudness normalisation (EBU R128, -14 LUFS, true peak ≤ -1.5 dBTP),
// the H.264/AAC encode fed frame by frame from the director, and measurements for the checks.
import { writeFileSync } from 'node:fs';
import { FPS, ffmpegBin, run } from './env.mjs';

const TARGET = -14;

/** Integrated loudness, true peak and range of an audio/video file (ffmpeg ebur128). */
export async function loudness(file) {
  const { ffmpeg } = ffmpegBin();
  const txt = await run(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = txt.slice(txt.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = sum.match(re);
    return m ? Number(m[1]) : null;
  };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

/**
 * Mix the stems (music under the effects: music at -19, effects at -16 LUFS before the sum), then
 * gain + limiter to -14 LUFS integrated with peaks at -4 dBFS, 48 kHz stereo.
 */
export async function mixAudio(stems, out, duration) {
  const { ffmpeg } = ffmpegBin();
  const m = await loudness(stems.music);
  const s = await loudness(stems.sfx);
  const gm = -19 - (m.I ?? -30);
  const gs = -16 - (s.I ?? -30);
  const pre = `${out}.pre.wav`;
  await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', stems.music, '-i', stems.sfx, '-filter_complex', `[0:a]volume=${gm.toFixed(2)}dB[a];[1:a]volume=${gs.toFixed(2)}dB[b];[a][b]amix=inputs=2:normalize=0,acompressor=threshold=-20dB:ratio=3:attack=5:release=120:makeup=2,alimiter=limit=0.5:attack=2:release=60:level=disabled,atrim=0:${duration.toFixed(3)},afade=t=out:st=${(duration - 0.6).toFixed(3)}:d=0.6[o]`, '-map', '[o]', '-ar', '48000', '-c:a', 'pcm_s16le', pre]);
  // gain to the target, then a brick-wall limiter at -4 dBFS (leaves room for AAC overshoot so the
  // encoded true peak stays under -1 dBTP); two rounds correct the level the limiter took away
  const p = await loudness(pre);
  let gain = TARGET - (p.I ?? -30);
  for (let round = 0; round < 3; round++) {
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', pre, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.63:attack=1:release=80:level=disabled:asc=1,aresample=48000`, '-ar', '48000', '-c:a', 'pcm_s16le', out]);
    const got = await loudness(out);
    if (got.I === null || Math.abs(got.I - TARGET) <= 0.2) break;
    gain += TARGET - got.I;
  }
  return { stems: { music: m.I, sfx: s.I }, ...(await loudness(out)) };
}

/**
 * Encode: frames come from `frame(i)` (JPEG buffers) into ffmpeg's stdin; H.264 high profile,
 * yuv420p, 30 fps, AAC 48 kHz 192 kb/s, +faststart. Rate is capped so 40 s stays under 30 MB.
 */
export async function encode({ file, wav, frames, frame, progress }) {
  const { ffmpeg } = ffmpegBin();
  let feed;
  const done = run(
    ffmpeg,
    [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-i', wav,
      '-map', '0:v', '-map', '1:a',
      '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '19',
      '-maxrate', '5200k', '-bufsize', '10400k', '-r', String(FPS), '-g', '60',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart', file,
    ],
    { input: (stdin) => (feed = stdin) },
  );
  const write = (buf) => new Promise((res, rej) => (feed.write(buf, (e) => (e ? rej(e) : res())) ));
  for (let i = 0; i < frames; i++) {
    await write(await frame(i));
    progress?.(i);
  }
  feed.end();
  await done;
}

export async function poster(png, file) {
  writeFileSync(file, png);
}

/** ffprobe facts for the report. */
export async function probe(file) {
  const { ffprobe } = ffmpegBin();
  const j = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return {
    width: v.width, height: v.height, fps: v.r_frame_rate, vcodec: `${v.codec_name} ${v.profile}`, pix: v.pix_fmt, frames: Number(v.nb_frames),
    acodec: a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : null,
    duration: Number(j.format.duration), sizeMB: Number(j.format.size) / 1e6, kbps: Math.round(Number(j.format.bit_rate) / 1000),
  };
}
