import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { makeBatFrames, makeGlowTexture, makeLanternTexture, makeMoonTexture, makeWitchTexture } from './textures';

const rand = (min: number, max: number) => min + Math.random() * (max - min);

interface Flyer {
  sprite: Sprite;
  witch: boolean;
  x: number;
  y: number;
  vx: number;
  speed: number;
  scale: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
  frames: Texture[];
  step: number;
  frameTimer: number;
  trailTimer: number;
}

interface Star {
  sprite: Sprite;
  speed: number;
  phase: number;
}

// Lanterns hang from the top of the screen, not the top of the game board
interface Lantern {
  root: Container;
  glow: Sprite;
  phase: number;
  fx: number; // horizontal position, as a fraction of the screen width
  size: number;
  len: number;
}

interface Firefly {
  sprite: Sprite;
  x: number;
  y: number;
  phase: number;
}

interface Puff {
  sprite: Sprite;
  age: number;
  life: number;
  scale: number;
}

// Wing cycle for bats: up, halfway, down, halfway
const BAT_FLAP_SEQUENCE = [0, 1, 2, 1];
const BAT_FLAP_STEP_S = 0.045; // about six flaps per second

// Living background. Stars, the moon, bats, and witches sit in the world (behind
// the balloons). Lanterns hang from the top of the screen.
export class Decor {
  private readonly glow: Texture;
  private readonly moon: Sprite;
  private readonly moonGlow: Sprite;
  private readonly moonOuter: Sprite;
  private readonly moonX: number;
  private readonly moonY: number;
  private readonly stars: Star[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly lanterns: Lantern[] = [];
  private readonly fireflies: Firefly[] = [];
  private readonly puffs: Puff[] = [];
  private readonly batFrames: Texture[];
  private readonly witchTexture: Texture;

  constructor(
    private readonly layer: Container,
    private readonly topLayer: Container,
    private readonly w: number,
    private readonly h: number,
  ) {
    this.glow = makeGlowTexture();
    this.batFrames = makeBatFrames();
    this.witchTexture = makeWitchTexture();

    // Stars, drawn first so everything else sits in front of them
    for (let i = 0; i < 70; i++) {
      const sprite = new Sprite(this.glow);
      sprite.anchor.set(0.5);
      sprite.position.set(rand(0, w), rand(0, h * 0.6));
      sprite.scale.set(rand(0.025, 0.07));
      layer.addChild(sprite);
      this.stars.push({ sprite, speed: rand(0.8, 2.4), phase: rand(0, Math.PI * 2) });
    }

    // Moon with a soft halo that pulses
    this.moonX = w * 0.85;
    this.moonY = h * 0.25;
    this.moonOuter = new Sprite(this.glow);
    this.moonOuter.anchor.set(0.5);
    this.moonOuter.tint = 0xfff0b8;
    this.moonGlow = new Sprite(this.glow);
    this.moonGlow.anchor.set(0.5);
    this.moonGlow.tint = 0xfff3c4;
    this.moon = new Sprite(makeMoonTexture());
    this.moon.anchor.set(0.5);
    this.moon.scale.set(0.58);
    layer.addChild(this.moonOuter, this.moonGlow, this.moon);

    // Bats and witches
    for (let i = 0; i < 6; i++) this.createFlyer(false, this.batFrames);
    for (let i = 0; i < 3; i++) this.createFlyer(true, [this.witchTexture]);

    // Lanterns, spread across the top of the screen with some variety
    const lanternTexture = makeLanternTexture();
    const count = 5;
    for (let i = 0; i < count; i++) {
      const root = new Container();
      const len = rand(14, 46);
      const string = new Graphics().moveTo(0, 0).lineTo(0, len).stroke({ width: 1.5, color: 0xd8c8ff, alpha: 0.5 });
      const glow = new Sprite(this.glow);
      glow.anchor.set(0.5);
      glow.tint = 0xffa040;
      glow.position.set(0, len + 32);
      const lantern = new Sprite(lanternTexture);
      lantern.anchor.set(0.5, 0);
      lantern.position.set(0, len);
      root.addChild(string, glow, lantern);
      this.topLayer.addChild(root);
      this.lanterns.push({
        root,
        glow,
        phase: rand(0, Math.PI * 2),
        fx: (i + 0.5 + rand(-0.2, 0.2)) / count,
        size: rand(0.8, 1.3),
        len,
      });
    }

    // Fireflies drifting low over the hills
    for (let i = 0; i < 12; i++) {
      const sprite = new Sprite(this.glow);
      sprite.anchor.set(0.5);
      sprite.tint = 0xd4ff5a;
      sprite.scale.set(rand(0.08, 0.14));
      const x = rand(0, w);
      const y = rand(h * 0.45, h * 0.9);
      sprite.position.set(x, y);
      layer.addChild(sprite);
      this.fireflies.push({ sprite, x, y, phase: rand(0, Math.PI * 2) });
    }
  }

  // sw is the screen width in pixels; s is the world-to-screen scale
  update(t: number, dt: number, sw: number, s: number): void {
    // Moon: the halo breathes, and the outer glow drifts slowly
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
    const bob = Math.sin(t * 0.6) * 2;
    const y = this.moonY + bob;
    this.moon.position.set(this.moonX, y);
    this.moonGlow.position.set(this.moonX, y);
    this.moonOuter.position.set(this.moonX, y);
    this.moonGlow.scale.set(2.1 + 0.25 * pulse);
    this.moonGlow.alpha = 0.4 + 0.18 * pulse;
    this.moonOuter.scale.set(3.9 + 0.35 * Math.sin(t * 0.5));
    this.moonOuter.alpha = 0.1 + 0.06 * Math.sin(t * 0.7 + 1);

    for (const st of this.stars) {
      st.sprite.alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * st.speed + st.phase));
    }

    for (const f of this.flyers) this.updateFlyer(f, t, dt);

    for (const l of this.lanterns) {
      l.root.position.set(sw * l.fx, 0);
      l.root.scale.set(s * l.size);
      l.root.rotation = Math.sin(t * 1.1 + l.phase) * 0.08;
      const flick = 0.5 + 0.5 * Math.sin(t * 2.3 + l.phase);
      l.glow.alpha = 0.4 + 0.25 * flick;
      l.glow.scale.set(1.5 + 0.2 * flick);
    }

    for (const fly of this.fireflies) {
      fly.x += Math.sin(t * 0.5 + fly.phase) * 14 * dt;
      fly.y += Math.cos(t * 0.4 + fly.phase) * 10 * dt;
      if (fly.x < 0) fly.x += this.w;
      if (fly.x > this.w) fly.x -= this.w;
      fly.sprite.position.set(fly.x, fly.y);
      fly.sprite.alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 2 + fly.phase));
    }

    this.updatePuffs(dt);
  }

  private createFlyer(witch: boolean, frames: Texture[]): void {
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    this.layer.addChild(sprite);
    const flyer: Flyer = {
      sprite,
      witch,
      x: 0,
      y: 0,
      vx: 0,
      speed: 0,
      // Bats are small and fast. Witches are bigger and drift a little slower.
      scale: witch ? rand(0.8, 1.05) : rand(0.5, 0.85),
      bobAmp: witch ? 12 : rand(14, 22),
      bobSpeed: witch ? rand(0.9, 1.3) : rand(3, 5),
      phase: rand(0, Math.PI * 2),
      frames,
      step: 0,
      frameTimer: 0,
      trailTimer: 0,
    };
    this.flyers.push(flyer);
    this.respawn(flyer, true);
  }

  // Starts a flyer on one side (or anywhere, on the first spawn) and sends it across
  private respawn(f: Flyer, initial: boolean): void {
    const dir = Math.random() < 0.5 ? 1 : -1;
    f.speed = f.witch ? rand(55, 85) : rand(110, 170);
    f.vx = dir * f.speed;
    f.x = initial ? rand(0, this.w) : dir > 0 ? -80 : this.w + 80;
    f.y = f.witch ? rand(this.h * 0.12, this.h * 0.42) : rand(this.h * 0.06, this.h * 0.5);
    f.sprite.scale.set(f.scale * dir, f.scale);
  }

  private updateFlyer(f: Flyer, t: number, dt: number): void {
    f.x += f.vx * dt;
    const bob = Math.sin(t * f.bobSpeed + f.phase) * f.bobAmp;
    f.sprite.position.set(f.x, f.y + bob);

    if (f.witch) {
      f.sprite.rotation = Math.sin(t * f.bobSpeed + f.phase) * 0.06;
      f.trailTimer -= dt;
      if (f.trailTimer <= 0) {
        f.trailTimer = 0.14;
        this.spawnPuff(f.x - Math.sign(f.vx) * 60 * f.scale, f.y + bob + 10, 0xb388ff, 0.22, 1.1);
      }
    } else {
      f.frameTimer += dt;
      if (f.frameTimer > BAT_FLAP_STEP_S) {
        f.frameTimer = 0;
        f.step = (f.step + 1) % BAT_FLAP_SEQUENCE.length;
        f.sprite.texture = f.frames[BAT_FLAP_SEQUENCE[f.step]];
      }
    }

    const offLeft = f.vx < 0 && f.x < -100;
    const offRight = f.vx > 0 && f.x > this.w + 100;
    if (offLeft || offRight) this.respawn(f, false);
  }

  private spawnPuff(x: number, y: number, tint: number, scale: number, life: number): void {
    const sprite = new Sprite(this.glow);
    sprite.anchor.set(0.5);
    sprite.tint = tint;
    sprite.position.set(x, y);
    sprite.scale.set(scale);
    this.layer.addChild(sprite);
    this.puffs.push({ sprite, age: 0, life, scale });
  }

  private updatePuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      const k = p.age / p.life;
      p.sprite.alpha = Math.max(0, (1 - k) * 0.6);
      p.sprite.scale.set(p.scale * (1 + k * 0.8));
      if (p.age >= p.life) {
        p.sprite.destroy();
        this.puffs.splice(i, 1);
      }
    }
  }
}
