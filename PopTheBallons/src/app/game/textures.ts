import { Texture } from 'pixi.js';

// Balloon texture size and where the balloon body's center sits in it.
// Sprites anchor on the body so scaling and rotation stay centered.
export const BALLOON_TEX_W = 100;
export const BALLOON_TEX_H = 150;
export const BALLOON_ANCHOR_Y = 56 / BALLOON_TEX_H;

// Ground silhouette width. The ground is stretched to the full screen width.
export const GROUND_W = 1600;
const GROUND_H = 200;

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

// Stars, moon, and bats, drawn in world space on a transparent background.
export function makeWorldDecorTexture(w: number, h: number): Texture {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;

  // Stars
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.3 + Math.random() * 0.7).toFixed(2)})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h * 0.6, 0.8 + Math.random() * 1.6, 0, Math.PI * 2);
    g.fill();
  }

  // Moon with a soft halo. The halo stays inside the world so it isn't clipped.
  const mx = w * 0.85;
  const my = h * 0.25;
  const haloR = 120;
  const halo = g.createRadialGradient(mx, my, 40, mx, my, haloR);
  halo.addColorStop(0, 'rgba(255,240,190,0.35)');
  halo.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(mx, my, haloR, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff3c4';
  g.beginPath();
  g.arc(mx, my, 46, 0, Math.PI * 2);
  g.fill();

  // Bats
  const bats: [number, number, number][] = [
    [0.12, 0.18, 1.1],
    [0.3, 0.3, 0.8],
    [0.62, 0.12, 0.9],
    [0.5, 0.42, 0.65],
  ];
  for (const [fx, fy, s] of bats) drawBat(g, w * fx, h * fy, 26 * s);

  return Texture.from(c);
}

// Dark hills silhouette along the bottom of the screen
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

function drawBat(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = '#0d0218';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x - s * 0.6, y - s * 0.6, x - s * 1.4, y - s * 0.1);
  g.quadraticCurveTo(x - s * 0.9, y + s * 0.2, x - s * 0.6, y + s * 0.1);
  g.quadraticCurveTo(x - s * 0.4, y + s * 0.5, x, y + s * 0.2);
  g.quadraticCurveTo(x + s * 0.4, y + s * 0.5, x + s * 0.6, y + s * 0.1);
  g.quadraticCurveTo(x + s * 0.9, y + s * 0.2, x + s * 1.4, y - s * 0.1);
  g.quadraticCurveTo(x + s * 0.6, y - s * 0.6, x, y);
  g.closePath();
  g.fill();
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
