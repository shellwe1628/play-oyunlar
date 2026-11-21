/**
 * Instanced camera-facing sprites in ONE draw call. Every sprite picks an atlas tile, a tint, an
 * alpha and how additive it is (0 = normal blend, 1 = pure glow): the batch draws with
 * premultiplied blending, so both kinds live in the same buffer and keep their slot order.
 * Slots are plain indices; callers own the bookkeeping (pools or "rewrite everything each frame").
 */
import * as THREE from 'three';
import { fxAtlas, GRID, linB, linG, linR } from './atlas';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iSize;
attribute vec4 iColor;
attribute vec2 iTile;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  float cs = cos(iSize.z);
  float sn = sin(iSize.z);
  vec2 p = position.xy * iSize.xy;
  p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += p;
  gl_Position = projectionMatrix * mv;
  float col = mod(iTile.x, ${GRID}.0);
  float row = floor(iTile.x / ${GRID}.0);
  vec2 q = mix(vec2(0.012), vec2(0.988), uv);
  vUv = vec2((col + q.x) / ${GRID}.0, 1.0 - (row + 1.0 - q.y) / ${GRID}.0);
  vColor = iColor;
  vAdd = iTile.y;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec4 t = texture2D(map, vUv);
  float a = clamp(t.a * vColor.a, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(t.rgb * vColor.rgb, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vAdd));
}`;

export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Float32Array;
  private readonly tile: Float32Array;
  private readonly attrs: THREE.InstancedBufferAttribute[];

  constructor(capacity: number, renderOrder: number) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 4);
    this.tile = new Float32Array(capacity * 2);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const mk = (name: string, arr: Float32Array, n: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.attrs = [mk('iPos', this.pos, 3), mk('iSize', this.size, 3), mk('iColor', this.color, 4), mk('iTile', this.tile, 2)];
    geo.instanceCount = capacity;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: fxAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.castShadow = false;
  }

  /**
   * Write sprite `i`. Scene units (metres, y up); `rot` counter-clockwise radians; `hex` an sRGB
   * colour; `add` 0 … 1 how additive.
   */
  put(i: number, x: number, y: number, z: number, w: number, h: number, rot: number, hex: number, alpha: number, tile: number, add: number): void {
    if (i < 0 || i >= this.capacity) return;
    const p = i * 3;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.size[p] = w;
    this.size[p + 1] = h;
    this.size[p + 2] = rot;
    const c = i * 4;
    this.color[c] = linR(hex);
    this.color[c + 1] = linG(hex);
    this.color[c + 2] = linB(hex);
    this.color[c + 3] = alpha;
    this.tile[i * 2] = tile;
    this.tile[i * 2 + 1] = add;
  }

  hide(i: number): void {
    if (i < 0 || i >= this.capacity) return;
    this.size[i * 3] = 0;
    this.size[i * 3 + 1] = 0;
    this.color[i * 4 + 3] = 0;
  }

  /** Hide slots [from, to). */
  hideRange(from: number, to: number): void {
    for (let i = from; i < to; i++) this.hide(i);
  }

  /** Upload this frame's changes. */
  commit(): void {
    for (const a of this.attrs) a.needsUpdate = true;
  }
}
