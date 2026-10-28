import { Texture } from 'pixi.js';

// Balloon texture size and where the balloon body's center sits in it.
// Sprites anchor on the body so scaling and rotation stay centered.
export const BALLOON_TEX_W = 100;
export const BALLOON_TEX_H = 150;
export const BALLOON_ANCHOR_Y = 56 / BALLOON_TEX_H;

// Ground silhouette width. The ground is stretched to the full screen width.
export const GROUND_W = 1600;
const GROUND_H = 200;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const BALLOON_COLORS: [light: string, dark: string][] = [
  ['#ff5a7a', '#a8163f'], // red
  ['#ff9f1c', '#b4530a'], // orange
  ['#ffd23f', '#b38600'], // yellow
  ['#4cd964', '#1d7a33'], // green
  ['#3ec1ff', '#1666a6'], // blue
  ['#b388ff', '#5b2fa3'], // purple
  ['#ff7bd5', '#a11e7d'], // pink
  ['#2ee6c5', '#0f7f6d'], // teal
];

export function makeBalloonTextures(): Texture[] {
  return BALLOON_COLORS.map(([light, dark]) => Texture.from(drawBalloon(light, dark)));
}

// Three wrapped candies, one per color scheme
export function makeCandyTextures(): Texture[] {
  const schemes: [main: string, light: string, dark: string][] = [
    ['#ff8c1a', '#fff0a0', '#7a2e00'], // orange
    ['#8a2be2', '#e8c4ff', '#2b0050'], // purple
    ['#2ecc71', '#dfffd0', '#0b4a24'], // green
  ];
  return schemes.map(([main, light, dark]) => {
    const c = makeCanvas(96, 48);
    const g = c.getContext('2d')!;

    // Twisted wrappers at each end
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(30, 24);
    g.lineTo(3, 8);
    g.lineTo(9, 24);
    g.lineTo(3, 40);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(66, 24);
    g.lineTo(93, 8);
    g.lineTo(87, 24);
    g.lineTo(93, 40);
    g.closePath();
    g.fill();

    // Candy body
    const grad = g.createLinearGradient(0, 13, 0, 35);
    grad.addColorStop(0, light);
    grad.addColorStop(0.5, main);
    grad.addColorStop(1, dark);
    g.fillStyle = grad;
    roundedRect(g, 28, 13, 40, 22, 8);
    g.fill();

    // Stripes and shine
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.lineWidth = 3;
    for (let x = 36; x < 66; x += 9) {
      g.beginPath();
      g.moveTo(x, 15);
      g.lineTo(x - 4, 33);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.ellipse(42, 18, 8, 2.5, 0, 0, Math.PI * 2);
    g.fill();

    return Texture.from(c);
  });
}

// Soft white dot used for glows, stars, sparkles, and fireflies. Tint it to recolor.
export function makeGlowTexture(): Texture {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

export function makeMoonTexture(): Texture {
  const c = makeCanvas(160, 160);
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(62, 58, 8, 80, 80, 80);
  grad.addColorStop(0, '#fffdf2');
  grad.addColorStop(0.7, '#fff1bf');
  grad.addColorStop(1, '#f2dc8f');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(80, 80, 72, 0, Math.PI * 2);
  g.fill();

  // Soft, subtle craters
  g.fillStyle = 'rgba(190,160,90,0.14)';
  for (const [x, y, r] of [
    [58, 62, 14],
    [98, 96, 10],
    [92, 58, 7],
    [64, 104, 6],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return Texture.from(c);
}

// Three bat frames for one flap cycle: wings up, halfway, and down.
// Wings are narrow, with pointed finger tips and a scalloped trailing edge.
export function makeBatFrames(): Texture[] {
  const frames = [
    { a: 2, b: 18, c: 27 }, // wings up
    { a: 10, b: 23, c: 31 }, // halfway
    { a: 20, b: 31, c: 37 }, // wings down
  ];
  return frames.map(({ a, b, c }) => {
    const canvas = makeCanvas(64, 44);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#0d0218';
    drawBatWing(g, a, b, c, false);
    drawBatWing(g, a, b, c, true);

    // Head with two pointed ears
    g.beginPath();
    g.arc(32, 19, 3.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(29, 18);
    g.lineTo(28, 12);
    g.lineTo(31, 16.5);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(35, 16.5);
    g.lineTo(36, 12);
    g.lineTo(35, 18);
    g.closePath();
    g.fill();

    // Slim body
    g.beginPath();
    g.ellipse(32, 26, 2.8, 7, 0, 0, Math.PI * 2);
    g.fill();

    return Texture.from(canvas);
  });
}

// One bat wing: shoulder, then a long arm to the first finger tip, with
// three finger tips along the trailing edge. Mirror flips it for the other wing.
function drawBatWing(g: CanvasRenderingContext2D, a: number, b: number, c: number, mirror: boolean): void {
  const X = (x: number) => (mirror ? 64 - x : x);
  g.beginPath();
  g.moveTo(X(29), 22);
  g.quadraticCurveTo(X(16), 8, X(2), a); // leading edge to the wing tip
  g.quadraticCurveTo(X(7), (a + b) / 2 + 2, X(9), b); // scallop to the second finger tip
  g.quadraticCurveTo(X(13), (b + c) / 2 + 2, X(18), c); // scallop to the third finger tip
  g.lineTo(X(28), 30); // back toward the body
  g.quadraticCurveTo(X(30), 26, X(29), 22);
  g.closePath();
  g.fill();
}

// A witch on a bristle broom, flying right. Pointed hat, streaming hair, and
// a cape. Drawn with a faint purple rim light so she reads on the night sky.
export function makeWitchTexture(): Texture {
  const c = makeCanvas(150, 120);
  const g = c.getContext('2d')!;
  g.shadowColor = 'rgba(190,150,255,0.9)';
  g.shadowBlur = 5;
  const ink = '#14061f';

  // Broom handle, from the bristles at the back to the front
  g.strokeStyle = '#3a2412';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(22, 102);
  g.lineTo(132, 56);
  g.stroke();

  // Bristles: a fan of straw at the back end
  g.fillStyle = '#4a3016';
  g.beginPath();
  g.moveTo(24, 96);
  g.lineTo(4, 110);
  g.lineTo(10, 118);
  g.lineTo(18, 116);
  g.lineTo(30, 106);
  g.closePath();
  g.fill();

  g.fillStyle = ink;
  g.strokeStyle = ink;

  // Cape streaming back from the shoulders
  g.beginPath();
  g.moveTo(84, 62);
  g.quadraticCurveTo(56, 56, 36, 78);
  g.quadraticCurveTo(54, 74, 62, 90);
  g.quadraticCurveTo(74, 80, 84, 76);
  g.closePath();
  g.fill();

  // Dress draped over the broom
  g.beginPath();
  g.moveTo(74, 66);
  g.quadraticCurveTo(92, 70, 100, 92);
  g.lineTo(76, 90);
  g.quadraticCurveTo(68, 84, 74, 66);
  g.closePath();
  g.fill();

  // Torso leaning forward
  g.beginPath();
  g.moveTo(74, 62);
  g.lineTo(84, 48);
  g.lineTo(92, 56);
  g.lineTo(84, 68);
  g.closePath();
  g.fill();

  // Head
  g.beginPath();
  g.arc(90, 42, 7, 0, Math.PI * 2);
  g.fill();

  // Long hair streaming back
  g.beginPath();
  g.moveTo(84, 38);
  g.quadraticCurveTo(66, 34, 56, 46);
  g.quadraticCurveTo(70, 42, 84, 46);
  g.closePath();
  g.fill();

  // Hat: brim, then a tall cone with its tip bent back
  g.beginPath();
  g.ellipse(92, 33, 13, 3.5, -0.15, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(84, 33);
  g.lineTo(101, 31);
  g.quadraticCurveTo(98, 14, 110, 4);
  g.quadraticCurveTo(92, 14, 84, 33);
  g.closePath();
  g.fill();

  // Arm reaching to the broom, and a leg dangling
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(88, 60);
  g.lineTo(110, 64);
  g.stroke();
  g.beginPath();
  g.moveTo(82, 86);
  g.lineTo(78, 102);
  g.stroke();

  return Texture.from(c);
}

// A paper lantern with its hook at the top. The glow is a separate sprite.
export function makeLanternTexture(): Texture {
  const c = makeCanvas(48, 80);
  const g = c.getContext('2d')!;

  // Hook
  g.strokeStyle = '#2a1a0a';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(24, 4, 4, Math.PI, 0);
  g.stroke();

  // Top cap
  g.fillStyle = '#2b1a0b';
  g.fillRect(12, 8, 24, 5);

  // Body with a bright core
  const grad = g.createRadialGradient(24, 36, 2, 24, 36, 26);
  grad.addColorStop(0, '#fff6c2');
  grad.addColorStop(0.4, '#ffb347');
  grad.addColorStop(1, '#c4520e');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(13, 13);
  g.lineTo(35, 13);
  g.quadraticCurveTo(44, 36, 36, 60);
  g.lineTo(12, 60);
  g.quadraticCurveTo(4, 36, 13, 13);
  g.closePath();
  g.fill();

  // Ribs
  g.strokeStyle = 'rgba(60,20,0,0.35)';
  g.lineWidth = 1.2;
  for (const x of [18, 24, 30]) {
    g.beginPath();
    g.moveTo(x, 13);
    g.lineTo(x + (x - 24) * 0.25, 60);
    g.stroke();
  }

  // Bottom cap
  g.fillStyle = '#2b1a0b';
  g.fillRect(12, 60, 24, 5);

  return Texture.from(c);
}

// Soft drifting fog: a few overlapping pale purple blobs
export function makeFogTexture(): Texture {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 512;
    const y = 40 + Math.random() * 50;
    const r = 40 + Math.random() * 50;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(190,150,220,0.28)');
    grad.addColorStop(1, 'rgba(190,150,220,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fade the fog out toward its top and bottom edges so it has no hard lines
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createLinearGradient(0, 0, 0, 128);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(0.5, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 512, 128);
  g.globalCompositeOperation = 'source-over';

  return Texture.from(c);
}

// Night sky gradient. Stretched to fill the whole screen.
export function makeSkyTexture(): Texture {
  const c = makeCanvas(4, 256);
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#120428');
  sky.addColorStop(0.55, '#3a1459');
  sky.addColorStop(0.85, '#7a2a5a');
  sky.addColorStop(1, '#e0671e');
  g.fillStyle = sky;
  g.fillRect(0, 0, 4, 256);
  return Texture.from(c);
}

export function makeGhostTexture(): Texture {
  const c = makeCanvas(80, 90);
  const g = c.getContext('2d')!;

  // Soft glow behind the ghost
  const glow = g.createRadialGradient(40, 44, 8, 40, 44, 42);
  glow.addColorStop(0, 'rgba(200,170,255,0.55)');
  glow.addColorStop(1, 'rgba(200,170,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 80, 90);

  // Body with a wavy hem
  g.beginPath();
  g.moveTo(14, 84);
  g.lineTo(14, 40);
  g.bezierCurveTo(14, 14, 66, 14, 66, 40);
  g.lineTo(66, 84);
  g.quadraticCurveTo(60, 74, 53, 84);
  g.quadraticCurveTo(47, 74, 40, 84);
  g.quadraticCurveTo(33, 74, 27, 84);
  g.quadraticCurveTo(21, 74, 14, 84);
  g.closePath();
  g.fillStyle = '#f4efff';
  g.fill();

  // Eyes and mouth
  g.fillStyle = '#2a0f4a';
  g.beginPath();
  g.ellipse(31, 42, 4, 6, 0, 0, Math.PI * 2);
  g.ellipse(49, 42, 4, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(40, 58, 4, 5, 0, 0, Math.PI * 2);
  g.fill();

  return Texture.from(c);
}

// Dark hills along the bottom, with tombstones and jack-o'-lanterns on the near hill.
// Their sizes and spots are random, so each game looks a little different.
export function makeGroundTexture(): Texture {
  const c = makeCanvas(GROUND_W, GROUND_H);
  const g = c.getContext('2d')!;
  const w = GROUND_W;
  const h = GROUND_H;

  // Far hills, slightly lighter
  g.fillStyle = '#2a0d3a';
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h * 0.55);
  g.bezierCurveTo(w * 0.15, h * 0.35, w * 0.3, h * 0.7, w * 0.5, h * 0.5);
  g.bezierCurveTo(w * 0.7, h * 0.3, w * 0.85, h * 0.6, w, h * 0.45);
  g.lineTo(w, h);
  g.closePath();
  g.fill();

  // Near hills
  g.fillStyle = '#1a0826';
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(0, h * 0.8);
  g.bezierCurveTo(w * 0.2, h * 0.65, w * 0.35, h * 0.9, w * 0.5, h * 0.78);
  g.bezierCurveTo(w * 0.65, h * 0.66, w * 0.8, h * 0.92, w, h * 0.74);
  g.lineTo(w, h);
  g.closePath();
  g.fill();

  for (let i = 0; i < 3; i++) {
    drawTombstone(g, rand(0.05, 0.92) * w, rand(178, 184), rand(12, 20), rand(24, 36));
  }
  for (let i = 0; i < 7; i++) {
    drawPumpkin(g, rand(0.03, 0.97) * w, rand(166, 186), rand(9, 26));
  }

  return Texture.from(c);
}

function drawBalloon(light: string, dark: string): HTMLCanvasElement {
  const c = makeCanvas(BALLOON_TEX_W, BALLOON_TEX_H);
  const g = c.getContext('2d')!;

  // String
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(50, 106);
  g.quadraticCurveTo(42, 126, 52, 148);
  g.stroke();

  // Teardrop body
  g.beginPath();
  g.moveTo(50, 104);
  g.bezierCurveTo(30, 100, 8, 80, 8, 56);
  g.bezierCurveTo(8, 26, 26, 8, 50, 8);
  g.bezierCurveTo(74, 8, 92, 26, 92, 56);
  g.bezierCurveTo(92, 80, 70, 100, 50, 104);
  g.closePath();
  const grad = g.createRadialGradient(38, 38, 4, 50, 56, 56);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.2, light);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.fill();

  // Knot
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(45, 103);
  g.lineTo(55, 103);
  g.lineTo(50, 110);
  g.closePath();
  g.fill();

  // Shine
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(30, 36, 6, 11, -0.5, 0, Math.PI * 2);
  g.fill();

  return c;
}

function drawTombstone(g: CanvasRenderingContext2D, x: number, base: number, w: number, h: number): void {
  g.fillStyle = '#120420';
  g.beginPath();
  g.moveTo(x, base);
  g.lineTo(x, base - h + w / 2);
  g.arc(x + w / 2, base - h + w / 2, w / 2, Math.PI, 0);
  g.lineTo(x + w, base);
  g.closePath();
  g.fill();
}

// Jack-o'-lantern: x and y are its center, s is its size
function drawPumpkin(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const glow = g.createRadialGradient(x, y, s * 0.4, x, y, s * 2.2);
  glow.addColorStop(0, 'rgba(255,150,40,0.45)');
  glow.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(x, y, s * 2.2, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = '#e8701a';
  for (const dx of [-0.45, 0, 0.45]) {
    g.beginPath();
    g.ellipse(x + dx * s, y, s * 0.5, s * 0.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#3a4a1a';
  g.fillRect(x - s * 0.08, y - s * 0.8, s * 0.16, s * 0.3);

  // Face
  g.fillStyle = '#2a0a00';
  g.beginPath();
  g.moveTo(x - s * 0.4, y - s * 0.15);
  g.lineTo(x - s * 0.2, y - s * 0.15);
  g.lineTo(x - s * 0.3, y - s * 0.4);
  g.closePath();
  g.moveTo(x + s * 0.2, y - s * 0.15);
  g.lineTo(x + s * 0.4, y - s * 0.15);
  g.lineTo(x + s * 0.3, y - s * 0.4);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(x - s * 0.4, y + s * 0.12);
  g.lineTo(x + s * 0.4, y + s * 0.12);
  g.lineTo(x + s * 0.2, y + s * 0.32);
  g.lineTo(x, y + s * 0.15);
  g.lineTo(x - s * 0.2, y + s * 0.32);
  g.closePath();
  g.fill();
}

// Rounded rectangle path, without relying on ctx.roundRect
function roundedRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
