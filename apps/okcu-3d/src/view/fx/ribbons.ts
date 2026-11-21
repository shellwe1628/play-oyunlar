/**
 * Soft ribbons in the play plane, rebuilt every frame in one dynamic buffer and ONE draw call:
 * arrow trails, glow streaks, heal beams, zap lines, the glow hugging the bow's limbs.
 * A strip is a run of points with a half-width, colour, alpha, additive amount and edge softness
 * each; joints share vertices, so curves have no gaps. Premultiplied blending, like SpriteBatch.
 */
import * as THREE from 'three';
import { linB, linG, linR } from './atlas';

const VERT = /* glsl */ `
attribute vec4 aColor;
attribute vec3 aAux;
varying vec4 vColor;
varying vec3 vAux;
void main() {
  vColor = aColor;
  vAux = aAux;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying vec3 vAux;
void main() {
  float e = 1.0 - abs(vAux.x);
  float prof = mix(smoothstep(0.0, 0.3, e), e * e * (3.0 - 2.0 * e) * e, vAux.z);
  float a = clamp(vColor.a * prof, 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vAux.y));
}`;

export class Ribbons {
  readonly mesh: THREE.Mesh;
  private readonly maxPts: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly aux: Float32Array;
  private readonly idx: Uint16Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly aPos: THREE.BufferAttribute;
  private readonly aCol: THREE.BufferAttribute;
  private readonly aAux: THREE.BufferAttribute;
  private nPts = 0;
  private nIdx = 0;
  private inStrip = 0;
  private lx = 0;
  private ly = 0;

  constructor(maxPoints: number, renderOrder: number, depthTest = false) {
    this.maxPts = Math.min(maxPoints, 32000);
    this.pos = new Float32Array(this.maxPts * 6);
    this.col = new Float32Array(this.maxPts * 8);
    this.aux = new Float32Array(this.maxPts * 6);
    this.idx = new Uint16Array(this.maxPts * 6);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3);
    this.aCol = new THREE.BufferAttribute(this.col, 4);
    this.aAux = new THREE.BufferAttribute(this.aux, 3);
    for (const a of [this.aPos, this.aCol, this.aAux]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aColor', this.aCol);
    this.geo.setAttribute('aAux', this.aAux);
    const ib = new THREE.BufferAttribute(this.idx, 1);
    ib.setUsage(THREE.DynamicDrawUsage);
    this.geo.setIndex(ib);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  /** Start this frame's ribbons from scratch. */
  begin(): void {
    this.nPts = 0;
    this.nIdx = 0;
    this.inStrip = 0;
  }

  /** Start a new strip (the next `point` is its first). */
  strip(): void {
    this.inStrip = 0;
  }

  private write(p: number, x: number, y: number, z: number, nx: number, ny: number, half: number): void {
    const o = p * 6;
    this.pos[o] = x + nx * half;
    this.pos[o + 1] = y + ny * half;
    this.pos[o + 2] = z;
    this.pos[o + 3] = x - nx * half;
    this.pos[o + 4] = y - ny * half;
    this.pos[o + 5] = z;
  }

  /**
   * Add a point to the current strip. Scene units; `half` is the half-width in metres; `soft`
   * 0 = a crisp line with a thin feathered edge, 1 = a glow that falls off from the centre.
   */
  point(x: number, y: number, z: number, half: number, hex: number, alpha: number, add: number, soft: number): void {
    if (this.nPts >= this.maxPts) return;
    const p = this.nPts++;
    let nx = 0;
    let ny = 1;
    if (this.inStrip > 0) {
      const dx = x - this.lx;
      const dy = y - this.ly;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;
      ny = dx / len;
      if (this.inStrip === 1) {
        // the first point had no direction yet: give it this segment's
        const o = (p - 1) * 6;
        const px = (this.pos[o]! + this.pos[o + 3]!) / 2;
        const py = (this.pos[o + 1]! + this.pos[o + 4]!) / 2;
        const ph = Math.hypot(this.pos[o]! - px, this.pos[o + 1]! - py);
        this.write(p - 1, px, py, this.pos[o + 2]!, nx, ny, ph);
      }
      const a = (p - 1) * 2;
      const i = this.nIdx;
      this.idx[i] = a;
      this.idx[i + 1] = a + 1;
      this.idx[i + 2] = a + 2;
      this.idx[i + 3] = a + 2;
      this.idx[i + 4] = a + 1;
      this.idx[i + 5] = a + 3;
      this.nIdx += 6;
    }
    this.write(p, x, y, z, nx, ny, half);
    const r = linR(hex);
    const g = linG(hex);
    const b = linB(hex);
    const c = p * 8;
    this.col[c] = this.col[c + 4] = r;
    this.col[c + 1] = this.col[c + 5] = g;
    this.col[c + 2] = this.col[c + 6] = b;
    this.col[c + 3] = this.col[c + 7] = alpha;
    const u = p * 6;
    this.aux[u] = 1;
    this.aux[u + 3] = -1;
    this.aux[u + 1] = this.aux[u + 4] = add;
    this.aux[u + 2] = this.aux[u + 5] = soft;
    this.lx = x;
    this.ly = y;
    this.inStrip++;
  }

  /** A straight tapered line: one strip of two points. */
  line(x0: number, y0: number, x1: number, y1: number, z: number, half0: number, half1: number, hex: number, a0: number, a1: number, add: number, soft: number): void {
    this.strip();
    this.point(x0, y0, z, half0, hex, a0, add, soft);
    this.point(x1, y1, z, half1, hex, a1, add, soft);
  }

  /** Upload this frame's ribbons. */
  commit(): void {
    this.geo.setDrawRange(0, this.nIdx);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aAux.needsUpdate = true;
    this.geo.getIndex()!.needsUpdate = true;
  }
}
