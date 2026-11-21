/**
 * The station: four fixed camera views as pure data. Every object declares which anomaly types
 * it supports; anomalies are generated from this, never hand-authored.
 * Coordinates are view px (VIEW × VIEW), x/y is the object's centre, w/h its unscaled size.
 */

export const VIEW = 640;

export const ANOMALY_TYPES = ['moved', 'recolor', 'missing', 'extra', 'resized', 'state', 'intruder'] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

/** Drawing recipe names (the scene owns one renderer per kind). */
export type ObjectKind =
  | 'lens' | 'window' | 'desk' | 'book' | 'oilcan' | 'chair' | 'clock' | 'bucket' | 'wrench'
  | 'crate' | 'hatch' | 'frame' | 'porthole' | 'sconce' | 'coat' | 'boots' | 'door' | 'umbrella'
  | 'handlantern' | 'rope' | 'toolbox' | 'moon' | 'shiplight' | 'buoy' | 'boat' | 'barrel'
  | 'postlamp' | 'bollard' | 'lifering' | 'gull' | 'net' | 'ceilinglamp' | 'stove' | 'kettle'
  | 'table' | 'mug' | 'bread' | 'cupboard' | 'pan' | 'calendar' | 'radio';

export type IntruderKind = 'shadow' | 'face' | 'eyes' | 'hand';

export interface ObjectDef {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  /** Initial on/off state (light lit, door open, window open). Required for 'state'. */
  on?: boolean;
  /** Supported anomaly types ('intruder' is never per-object; it uses intruder spots). */
  types: readonly Exclude<AnomalyType, 'intruder'>[];
}

export interface IntruderSpot {
  id: string;
  kind: IntruderKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomStyle = 'lamp' | 'stairs' | 'dock' | 'kitchen';

export interface CameraDef {
  id: string;
  style: RoomStyle;
  objects: readonly ObjectDef[];
  intruders: readonly IntruderSpot[];
}

const C = {
  lamp: 0xffd36b,
  glass: 0x2d4a6b,
  wood: 0x6b4a2f,
  woodLight: 0x8a6a3f,
  chair: 0x7a5535,
  iron: 0x3b4048,
  steel: 0x9aa3ad,
  cream: 0xe8e0c8,
  teal: 0x3f7f7a,
  sea: 0x5d7d8f,
} as const;

export const STATION: readonly CameraDef[] = [
  {
    id: 'lamp',
    style: 'lamp',
    objects: [
      { id: 'lens', kind: 'lens', x: 320, y: 250, w: 170, h: 230, color: C.lamp, on: true, types: ['state', 'recolor', 'resized'] },
      { id: 'window-l', kind: 'window', x: 88, y: 150, w: 110, h: 170, color: C.glass, on: true, types: ['state'] },
      { id: 'window-r', kind: 'window', x: 552, y: 150, w: 110, h: 170, color: C.glass, on: true, types: ['state'] },
      { id: 'frame', kind: 'frame', x: 70, y: 330, w: 70, h: 80, color: 0x3c6e8f, types: ['recolor', 'missing', 'moved', 'resized'] },
      { id: 'clock', kind: 'clock', x: 470, y: 330, w: 70, h: 70, color: C.cream, types: ['moved', 'missing', 'resized', 'recolor'] },
      { id: 'wrench', kind: 'wrench', x: 600, y: 330, w: 36, h: 100, color: C.steel, types: ['moved', 'missing', 'extra'] },
      { id: 'desk', kind: 'desk', x: 130, y: 505, w: 210, h: 90, color: C.wood, types: ['recolor', 'moved'] },
      { id: 'book', kind: 'book', x: 95, y: 445, w: 70, h: 28, color: 0x8b3f5a, types: ['moved', 'missing', 'recolor', 'extra'] },
      { id: 'oilcan', kind: 'oilcan', x: 185, y: 432, w: 50, h: 58, color: 0x4f7a5a, types: ['moved', 'missing', 'recolor', 'extra'] },
      { id: 'chair', kind: 'chair', x: 270, y: 530, w: 80, h: 120, color: C.chair, types: ['moved', 'missing', 'recolor'] },
      { id: 'hatch', kind: 'hatch', x: 380, y: 600, w: 140, h: 44, color: 0x4a3a2a, on: false, types: ['state'] },
      { id: 'crate', kind: 'crate', x: 470, y: 520, w: 100, h: 80, color: C.woodLight, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'bucket', kind: 'bucket', x: 580, y: 560, w: 64, h: 66, color: C.sea, types: ['moved', 'missing', 'extra', 'recolor'] },
    ],
    intruders: [
      { id: 'intruder-1', kind: 'shadow', x: 545, y: 420, w: 70, h: 190 },
      { id: 'intruder-2', kind: 'face', x: 88, y: 140, w: 60, h: 70 },
      { id: 'intruder-3', kind: 'hand', x: 380, y: 585, w: 80, h: 60 },
    ],
  },
  {
    id: 'stairs',
    style: 'stairs',
    objects: [
      { id: 'porthole', kind: 'porthole', x: 500, y: 130, w: 110, h: 110, color: C.glass, on: true, types: ['state'] },
      { id: 'map', kind: 'frame', x: 300, y: 140, w: 110, h: 84, color: 0x8fae7a, types: ['recolor', 'missing', 'resized', 'moved'] },
      { id: 'sconce-a', kind: 'sconce', x: 130, y: 170, w: 50, h: 70, color: C.lamp, on: true, types: ['state', 'recolor', 'moved'] },
      { id: 'sconce-b', kind: 'sconce', x: 430, y: 330, w: 50, h: 70, color: C.lamp, on: true, types: ['state', 'recolor', 'moved'] },
      { id: 'barometer', kind: 'clock', x: 250, y: 290, w: 60, h: 60, color: 0xc9b98a, types: ['moved', 'missing', 'resized'] },
      { id: 'coat', kind: 'coat', x: 70, y: 350, w: 74, h: 150, color: 0xd9a441, types: ['moved', 'missing', 'recolor', 'extra'] },
      { id: 'umbrella', kind: 'umbrella', x: 160, y: 380, w: 40, h: 120, color: 0x2f5f8a, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'lantern', kind: 'handlantern', x: 340, y: 450, w: 50, h: 72, color: C.lamp, on: true, types: ['state', 'moved', 'missing'] },
      { id: 'door', kind: 'door', x: 565, y: 500, w: 120, h: 220, color: C.wood, on: false, types: ['state', 'recolor'] },
      { id: 'boots', kind: 'boots', x: 85, y: 585, w: 86, h: 54, color: 0x4a5560, types: ['moved', 'missing', 'extra'] },
      { id: 'toolbox', kind: 'toolbox', x: 230, y: 590, w: 96, h: 54, color: C.teal, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'rope', kind: 'rope', x: 420, y: 595, w: 96, h: 50, color: 0xb89a6a, types: ['moved', 'missing', 'extra', 'resized'] },
    ],
    intruders: [
      { id: 'intruder-1', kind: 'shadow', x: 565, y: 500, w: 80, h: 200 },
      { id: 'intruder-2', kind: 'eyes', x: 330, y: 230, w: 90, h: 40 },
      { id: 'intruder-3', kind: 'face', x: 500, y: 130, w: 60, h: 70 },
    ],
  },
  {
    id: 'dock',
    style: 'dock',
    objects: [
      { id: 'moon', kind: 'moon', x: 500, y: 90, w: 76, h: 76, color: 0xf2ecd0, types: ['resized', 'moved', 'recolor'] },
      { id: 'shiplight', kind: 'shiplight', x: 140, y: 236, w: 56, h: 30, color: C.lamp, on: true, types: ['state', 'moved'] },
      { id: 'buoy', kind: 'buoy', x: 250, y: 320, w: 44, h: 64, color: 0xd98c3a, on: true, types: ['moved', 'missing', 'recolor', 'state'] },
      { id: 'boat', kind: 'boat', x: 450, y: 350, w: 180, h: 70, color: 0x6a8fa0, types: ['moved', 'missing', 'recolor'] },
      { id: 'postlamp', kind: 'postlamp', x: 50, y: 400, w: 44, h: 190, color: C.lamp, on: true, types: ['state', 'recolor'] },
      { id: 'lifering', kind: 'lifering', x: 600, y: 440, w: 60, h: 60, color: C.cream, types: ['recolor', 'missing', 'moved'] },
      { id: 'gull', kind: 'gull', x: 370, y: 445, w: 54, h: 40, color: 0xdfe4e8, types: ['moved', 'missing', 'extra'] },
      { id: 'bollard', kind: 'bollard', x: 470, y: 485, w: 44, h: 52, color: C.iron, types: ['moved', 'missing', 'extra'] },
      { id: 'crate-a', kind: 'crate', x: 140, y: 515, w: 104, h: 84, color: C.woodLight, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'barrel', kind: 'barrel', x: 300, y: 520, w: 62, h: 84, color: C.chair, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'crate-b', kind: 'crate', x: 575, y: 545, w: 90, h: 72, color: 0x9a7a4a, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'net', kind: 'net', x: 400, y: 595, w: 130, h: 50, color: 0x6e8a6a, types: ['moved', 'missing', 'resized'] },
    ],
    intruders: [
      { id: 'intruder-1', kind: 'shadow', x: 220, y: 470, w: 70, h: 180 },
      { id: 'intruder-2', kind: 'hand', x: 560, y: 360, w: 80, h: 60 },
      { id: 'intruder-3', kind: 'eyes', x: 330, y: 270, w: 90, h: 40 },
    ],
  },
  {
    id: 'kitchen',
    style: 'kitchen',
    objects: [
      { id: 'lamp', kind: 'ceilinglamp', x: 330, y: 60, w: 96, h: 76, color: C.lamp, on: true, types: ['state', 'recolor'] },
      { id: 'window', kind: 'window', x: 120, y: 160, w: 140, h: 150, color: C.glass, on: true, types: ['state'] },
      { id: 'cupboard', kind: 'cupboard', x: 555, y: 150, w: 140, h: 150, color: C.wood, on: false, types: ['state', 'recolor'] },
      { id: 'calendar', kind: 'calendar', x: 420, y: 190, w: 62, h: 82, color: C.cream, types: ['recolor', 'missing', 'resized', 'moved'] },
      { id: 'pan', kind: 'pan', x: 280, y: 215, w: 76, h: 96, color: C.iron, types: ['moved', 'missing', 'extra', 'resized'] },
      { id: 'radio', kind: 'radio', x: 100, y: 330, w: 96, h: 64, color: C.woodLight, on: true, types: ['state', 'moved', 'missing'] },
      { id: 'kettle', kind: 'kettle', x: 530, y: 318, w: 72, h: 64, color: 0x5d8fa0, types: ['moved', 'missing', 'recolor', 'extra'] },
      { id: 'stove', kind: 'stove', x: 545, y: 455, w: 150, h: 200, color: C.iron, on: false, types: ['state'] },
      { id: 'mug', kind: 'mug', x: 220, y: 412, w: 44, h: 44, color: C.cream, types: ['moved', 'missing', 'extra', 'recolor'] },
      { id: 'bread', kind: 'bread', x: 340, y: 418, w: 84, h: 36, color: 0xc9965a, types: ['moved', 'missing', 'extra'] },
      { id: 'table', kind: 'table', x: 290, y: 490, w: 250, h: 110, color: C.chair, types: ['recolor', 'moved'] },
      { id: 'chair', kind: 'chair', x: 110, y: 545, w: 80, h: 120, color: 0x8a5a3a, types: ['moved', 'missing', 'recolor'] },
    ],
    intruders: [
      { id: 'intruder-1', kind: 'face', x: 120, y: 155, w: 60, h: 70 },
      { id: 'intruder-2', kind: 'shadow', x: 410, y: 450, w: 70, h: 180 },
      { id: 'intruder-3', kind: 'hand', x: 555, y: 120, w: 80, h: 60 },
    ],
  },
];

/** Every (object, type) pair the logbook can record, keyed `camera:object:type`. */
export function logbookKeys(station: readonly CameraDef[] = STATION): string[] {
  const keys: string[] = [];
  for (const cam of station) {
    for (const o of cam.objects) for (const t of o.types) keys.push(logKey(cam.id, o.id, t));
    for (const s of cam.intruders) keys.push(logKey(cam.id, s.id, 'intruder'));
  }
  return keys;
}

export function logKey(cameraId: string, objectId: string, type: AnomalyType): string {
  return `${cameraId}:${objectId}:${type}`;
}
