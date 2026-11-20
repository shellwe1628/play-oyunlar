/**
 * How each archer type is told apart, and the character materials.
 *
 * The Mixamo outfit texture is nearly black, so multiplying a colour into it gives silhouettes.
 * Instead the cloth is DYED in the shader: the dark fabric takes the type's colour (its texture
 * detail becomes the shading), bright and saturated trims (cream wraps, gold edges) keep their
 * own colour, and a rim light plus a little self-light keep the figure readable at phone size
 * against any backdrop. Hit flash and burning are a per-archer uniform of the same shader.
 */
import * as THREE from 'three';
import { PALETTE } from '@okcu/textures';
import type { Archer } from '@sim/world';

export type Hat = 'none' | 'band' | 'goggles' | 'horns' | 'leafcrown' | 'turban' | 'cap' | 'lantern' | 'plume' | 'imp' | 'ember' | 'halo' | 'wizard';

export interface Look {
  /** cloth dye */
  body: number;
  /** rim light / accent */
  accent: number;
  hat: Hat;
  bow: number;
  /** fletching of the nocked arrow */
  fletch: number;
  /** plated chest and shoulders (bosses) */
  plate: boolean;
  /** sash across the chest (elite) */
  sash: boolean;
}

const WOOD = 0xb9713a;
const BOWS = { wood: WOOD, leaf: 0x58c947, dark: 0x6a4a8c, gold: 0xffc93c, ice: 0x9fe6ff } as const;

function bossLook(kind: string | null): Look {
  switch (kind) {
    case 'giant':
      return { body: 0x8fc8ff, accent: 0xffffff, hat: 'horns', bow: BOWS.ice, fletch: 0xffffff, plate: true, sash: false };
    case 'summoner':
      return { body: 0xe8a33c, accent: 0x8e4cb8, hat: 'turban', bow: BOWS.gold, fletch: 0x8e4cb8, plate: true, sash: false };
    case 'warden':
      return { body: 0x4b4fa8, accent: 0xb9c4ff, hat: 'lantern', bow: BOWS.dark, fletch: 0xb9c4ff, plate: true, sash: false };
    case 'magma':
      return { body: 0x4a3236, accent: 0xff6a1a, hat: 'ember', bow: BOWS.dark, fletch: 0xff8a3a, plate: true, sash: false };
    case 'tempest':
      return { body: 0x5fb4e8, accent: 0xfff6c8, hat: 'halo', bow: BOWS.ice, fletch: 0xffffff, plate: true, sash: false };
    default:
      return { body: PALETTE.boss, accent: PALETTE.bossPlate, hat: 'horns', bow: BOWS.dark, fletch: PALETTE.bossScarf, plate: true, sash: false };
  }
}

/** Same colours and headgear per type as the 2D game's `lookFor`. */
export function lookFor(a: Archer): Look {
  const enemy = { fletch: PALETTE.enemyFletch, plate: false, sash: false };
  switch (a.type) {
    case 'player':
      return { body: PALETTE.player, accent: 0xfff0c0, hat: 'none', bow: WOOD, fletch: PALETTE.fletch, plate: false, sash: false };
    case 'archer':
      return { ...enemy, body: PALETTE.archer, accent: 0xd9b8ff, hat: 'none', bow: BOWS.wood };
    case 'shield':
      return { ...enemy, body: PALETTE.shield, accent: 0xbcd6ff, hat: 'none', bow: BOWS.wood };
    case 'jumper':
      return { ...enemy, body: PALETTE.jumper, accent: PALETTE.fireCore, hat: 'band', bow: BOWS.wood };
    case 'bomber':
      return { ...enemy, body: 0x6c6e8c, accent: PALETTE.bomberGoggle, hat: 'goggles', bow: BOWS.wood };
    case 'boss':
      return bossLook(a.bossKind);
    case 'healer':
      return { ...enemy, body: PALETTE.healer, accent: PALETTE.leaf, hat: 'leafcrown', bow: BOWS.leaf };
    case 'cover':
      return { ...enemy, body: PALETTE.cover, accent: PALETTE.cream, hat: 'turban', bow: BOWS.wood };
    case 'catcher':
      return { ...enemy, body: PALETTE.catcher, accent: PALETTE.white, hat: 'cap', bow: BOWS.wood };
    case 'ward':
      return { ...enemy, body: PALETTE.ward, accent: PALETTE.wardGlow, hat: 'lantern', bow: BOWS.dark };
    case 'elite':
      return { ...enemy, body: PALETTE.elite, accent: PALETTE.gold, hat: 'plume', bow: BOWS.gold, sash: true };
    case 'imp':
      return { ...enemy, body: PALETTE.imp, accent: PALETTE.pink, hat: 'imp', bow: BOWS.dark };
    case 'volley':
      return { ...enemy, body: PALETTE.volley, accent: PALETTE.volleyBand, hat: 'band', bow: BOWS.wood, sash: true };
    case 'mage':
      return { ...enemy, body: PALETTE.mage, accent: PALETTE.mageStar, hat: 'wizard', bow: BOWS.dark };
  }
}

export interface BodyUniforms {
  uTint: { value: THREE.Color };
  uDye: { value: number };
  uRim: { value: THREE.Color };
  uFloor: { value: number };
  uFlash: { value: number };
  uFlashCol: { value: THREE.Color };
}

const HEAD = /* glsl */ `
uniform vec3 uTint;
uniform float uDye;
uniform vec3 uRim;
uniform float uFloor;
uniform float uFlash;
uniform vec3 uFlashCol;
varying float vDye;
`;

const DYE = /* glsl */ `
#include <map_fragment>
{
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float hi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
  float lo = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
  // bright or saturated trims keep their own colour; the dark cloth takes the dye: the type's
  // colour on tunic and hood, plain leather on legs, boots and bracers (vDye, from the skinning)
  float keep = max(smoothstep(0.10, 0.24, lum), smoothstep(0.06, 0.15, hi - lo));
  float detail = clamp(0.3 + 0.85 * sqrt(lum * 16.0), 0.0, 1.2);
  vec3 dyed = mix(vec3(0.16, 0.10, 0.075), uTint, vDye) * detail;
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(dyed, diffuseColor.rgb * 1.6, keep), uDye);
}
`;

const FINISH = /* glsl */ `
{
  float fres = 1.0 - saturate(dot(normalize(vViewPosition), normal));
  outgoingLight += diffuseColor.rgb * uFloor + uRim * (fres * fres) * 0.55;
  outgoingLight = mix(outgoingLight, uFlashCol, uFlash);
}
#include <opaque_fragment>
`;

/** A clone of one of the character's materials with the dye / rim / flash shader. */
export function bodyMaterial(src: THREE.Material, uniforms: BodyUniforms, cloth: boolean): THREE.MeshPhongMaterial {
  const m = (src as THREE.MeshPhongMaterial).clone();
  m.normalMap = null; // invisible at this size and it is the costly part of the shader
  m.transparent = false;
  m.shininess = cloth ? 12 : 8;
  m.specular.setScalar(cloth ? 0.12 : 0.06);
  m.color.setScalar(1);
  const dye = cloth;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = HEAD + shader.fragmentShader.replace('#include <map_fragment>', dye ? DYE : '#include <map_fragment>').replace('#include <opaque_fragment>', FINISH);
    const head = `${dye ? 'attribute float aDye;' : ''}\nvarying float vDye;\n`;
    shader.vertexShader = head + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvDye = ${dye ? 'aDye' : '0.0'};`);
  };
  m.customProgramCacheKey = () => (dye ? 'okcu-cloth' : 'okcu-skin');
  return m;
}

export function newBodyUniforms(): BodyUniforms {
  return { uTint: { value: new THREE.Color(1, 1, 1) }, uDye: { value: 1 }, uRim: { value: new THREE.Color(1, 1, 1) }, uFloor: { value: 0.12 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) } };
}
