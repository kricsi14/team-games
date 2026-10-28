import { Application, Circle, Container, Sprite, Text, Texture } from 'pixi.js';
import { GameState, PopEvent } from '../socket.service';
import { Decor } from './decor';
import {
  BALLOON_ANCHOR_Y,
  GROUND_W,
  makeBalloonTextures,
  makeCandyTextures,
  makeFogTexture,
  makeGhostTexture,
  makeGlowTexture,
  makeGroundTexture,
  makeSkyTexture,
} from './textures';

const W = 960;
const H = 600;
const BALLOON_BASE_R = 40; // balloon radius at scale 1
const SPARKLE_COLORS = [0xffd23f, 0xff7bd5, 0x7cff8a, 0x7ad8ff, 0xffffff];

interface BalloonView {
  sprite: Sprite;
  tx: number;
  ty: number;
  phase: number;
}

// Called every frame with the effect's age, total lifetime, and frame time
type FxUpdate = (obj: Container, age: number, total: number, dt: number) => void;

// A short-lived visual: a candy, a ghost, a sparkle, a puff, or floating text.
interface Fx {
  obj: Container;
  vx: number;
  vy: number;
  gravity: number;
  grow: number;
  age: number;
  total: number;
  update?: FxUpdate;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Overshooting ease: pops in a little past full size, then settles
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

// Pixi scene for the game board. The server decides everything. This class
// draws the background, balloons, and pop effects, and reports clicks.
export class GameScene {
  private app?: Application;
  private destroyed = false;
  private readonly world = new Container();
  private readonly backLayer = new Container();
  private readonly balloonLayer = new Container();
  private readonly fxLayer = new Container();
  // Screen-space layer for lanterns, so they always hang from the top of the screen
  private readonly topLayer = new Container();
  private readonly views = new Map<number, BalloonView>();
  private readonly fx: Fx[] = [];
  private balloonTextures: Texture[] = [];
  private candyTextures: Texture[] = [];
  private ghostTexture?: Texture;
  private glowTexture?: Texture;
  private sky?: Sprite;
  private ground?: Sprite;
  private fog?: Sprite;
  private decor?: Decor;
  private pending?: GameState;
  private time = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly onPop: (id: number, x: number, y: number) => void,
  ) {
    void this.init();
  }

  applyState(state: GameState): void {
    if (!this.app) {
      this.pending = state;
      return;
    }
    const seen = new Set<number>();
    for (const [id, x, y, r, color] of state.balloons) {
      seen.add(id);
      const view = this.views.get(id) ?? this.createBalloon(id, r, color, x, y);
      view.tx = x;
      view.ty = y;
    }
    // Balloons missing from the state were popped or floated away.
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.sprite.destroy();
        this.views.delete(id);
      }
    }
  }

  showPop(pop: PopEvent): void {
    const glow = this.glowTexture;
    const ghost = this.ghostTexture;
    if (!this.app || !glow || !ghost) return;
    if (pop.ghost) this.ghostPop(pop, ghost, glow);
    else this.candyPop(pop, glow);
  }

  destroy(): void {
    this.destroyed = true;
    this.views.clear();
    this.fx.length = 0;
    this.app?.destroy(true, { children: true });
    this.app = undefined;
  }

  private async init(): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: this.host,
      background: '#120428',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    this.host.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none'; // no page scrolling while playing

    this.balloonTextures = makeBalloonTextures();
    this.candyTextures = makeCandyTextures();
    this.ghostTexture = makeGhostTexture();
    this.glowTexture = makeGlowTexture();

    // Screen-space layers: sky, ground, fog, and lanterns. The world (decor,
    // balloons, effects) sits on top.
    this.sky = new Sprite(makeSkyTexture());
    this.ground = new Sprite(makeGroundTexture());
    this.ground.anchor.set(0, 1);
    this.fog = new Sprite(makeFogTexture());
    this.fog.alpha = 0.4;
    app.stage.addChild(this.sky, this.ground, this.fog, this.topLayer, this.world);
    this.world.addChild(this.backLayer, this.balloonLayer, this.fxLayer);
    this.decor = new Decor(this.backLayer, this.topLayer, W, H);

    app.ticker.add((ticker) => this.frame(ticker.deltaMS));

    if (this.pending) {
      this.applyState(this.pending);
      this.pending = undefined;
    }
  }

  private createBalloon(id: number, r: number, color: number, x: number, y: number): BalloonView {
    const sprite = new Sprite(this.balloonTextures[color % this.balloonTextures.length]);
    sprite.anchor.set(0.5, BALLOON_ANCHOR_Y);
    sprite.scale.set(r / BALLOON_BASE_R);
    sprite.position.set(x, y);

    // Pixi's event system does the hit test. The hit area is a bit larger than
    // the balloon so it's easy to tap on a phone.
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.hitArea = new Circle(0, 0, BALLOON_BASE_R * 1.3);
    sprite.on('pointerdown', (event) => {
      const p = this.world.toLocal(event.global);
      this.onPop(id, p.x, p.y);
    });

    this.balloonLayer.addChild(sprite);
    const view: BalloonView = { sprite, tx: x, ty: y, phase: Math.random() * Math.PI * 2 };
    this.views.set(id, view);
    return view;
  }

  private frame(deltaMs: number): void {
    const app = this.app;
    if (!app) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    this.time += dt;

    const sw = app.screen.width;
    const sh = app.screen.height;
    const groundHeight = (sw * 200) / GROUND_W; // the ground texture is 200 units tall

    // Sky covers the whole screen. Ground spans the full width at the bottom.
    if (this.sky) {
      this.sky.width = sw;
      this.sky.height = sh;
    }
    if (this.ground) {
      this.ground.scale.set(sw / GROUND_W);
      this.ground.position.set(0, sh);
    }
    // Fog drifts slowly across the bottom of the screen
    if (this.fog) {
      this.fog.width = sw * 1.6;
      this.fog.height = 150;
      this.fog.position.set(-sw * 0.3 + Math.sin(this.time * 0.08) * sw * 0.15, sh - groundHeight - 90);
    }

    // Fit the world to the screen, keeping its shape
    const s = Math.min(sw / W, sh / H);
    this.world.scale.set(s);
    this.world.position.set((sw - W * s) / 2, (sh - H * s) / 2);

    // Ease balloons toward the server's positions, and add a gentle tilt
    const ease = 1 - Math.exp(-dt * 10);
    for (const v of this.views.values()) {
      v.sprite.x += (v.tx - v.sprite.x) * ease;
      v.sprite.y += (v.ty - v.sprite.y) * ease;
      v.sprite.rotation = Math.sin(this.time * 2 + v.phase) * 0.08;
    }

    this.decor?.update(this.time, dt, sw, s);

    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.age += dt;
      f.vy += f.gravity * dt;
      f.obj.x += f.vx * dt;
      f.obj.y += f.vy * dt;
      f.obj.scale.set(f.obj.scale.x + f.grow * dt);
      if (f.update) {
        f.update(f.obj, f.age, f.total, dt);
      } else {
        f.obj.alpha = Math.max(0, 1 - f.age / f.total);
      }
      if (f.age >= f.total) {
        f.obj.destroy();
        this.fx.splice(i, 1);
      }
    }
  }

  private addFx(
    obj: Container,
    vx: number,
    vy: number,
    total: number,
    gravity = 0,
    grow = 0,
    update?: FxUpdate,
  ): void {
    this.fxLayer.addChild(obj);
    this.fx.push({ obj, vx, vy, gravity, grow, age: 0, total, update });
  }

  // Several small candies burst out in a fan, spin, and fade over about 1.5 to 1.9 seconds.
  // Sparkles and floating points go with them.
  private candyPop(pop: PopEvent, glow: Texture): void {
    const { x, y } = pop;

    const count = 4;
    for (let i = 0; i < count; i++) {
      const candy = new Sprite(this.candyTextures[Math.floor(rand(0, this.candyTextures.length))]);
      candy.anchor.set(0.5);
      candy.position.set(x, y);
      const size = rand(0.32, 0.46);
      const angle = -Math.PI / 2 + rand(-1.1, 1.1);
      const speed = rand(100, 190);
      const spin = rand(-6, 6);
      this.addFx(
        candy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        rand(1.5, 1.9),
        170,
        0,
        (o, age, total) => {
          o.rotation = spin * age;
          o.scale.set(size * (0.3 + 0.7 * easeOutBack(Math.min(1, age / 0.22))));
          o.alpha = Math.min(1, (total - age) / 0.5);
        },
      );
    }

    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(110, 240);
      const sparkle = new Sprite(glow);
      sparkle.anchor.set(0.5);
      sparkle.tint = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
      sparkle.position.set(x, y);
      sparkle.scale.set(rand(0.2, 0.4));
      this.addFx(sparkle, Math.cos(a) * s, Math.sin(a) * s - 80, rand(0.7, 1.1), 200, -0.15);
    }

    this.floatText(`+${pop.points}`, x, y, '#ffe066');
  }

  // A ghost flies off in its own direction, wobbling and leaving a faint trail.
  // It fades out after about 2 to 3 seconds.
  private ghostPop(pop: PopEvent, texture: Texture, glow: Texture): void {
    const { x, y } = pop;

    const ghost = new Sprite(texture);
    ghost.anchor.set(0.5);
    ghost.position.set(x, y);
    ghost.scale.set(0.8);
    const angle = rand(-Math.PI * 0.8, -Math.PI * 0.2);
    const speed = rand(110, 150);
    const total = rand(2.2, 2.8);
    let nextPuff = 0;
    this.addFx(ghost, Math.cos(angle) * speed, Math.sin(angle) * speed, total, 0, 0, (o, age, life) => {
      o.rotation = Math.sin(age * 4) * 0.2;
      o.alpha = Math.min(1, age / 0.15) * Math.min(1, (life - age) / 0.9);
      o.scale.set(0.8 + 0.06 * Math.sin(age * 3));
      if (age >= nextPuff && age < life - 0.5) {
        nextPuff = age + 0.16;
        this.puff(o.x, o.y, glow);
      }
    });

    this.floatText(String(pop.points), x, y, '#ff5a7a');
  }

  // A small purple puff left behind by the ghost
  private puff(x: number, y: number, glow: Texture): void {
    const p = new Sprite(glow);
    p.anchor.set(0.5);
    p.tint = 0xb388ff;
    p.position.set(x, y);
    p.scale.set(0.35);
    this.addFx(p, 0, -12, 0.8, 0, 0.5);
  }

  private floatText(text: string, x: number, y: number, color: string): void {
    const label = new Text({
      text,
      style: {
        fill: color,
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: 46,
        fontWeight: '900',
        stroke: { color: '#1a0830', width: 7 },
        dropShadow: { color: '#000000', alpha: 0.45, blur: 4, distance: 3, angle: Math.PI / 2 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    label.scale.set(0.6);
    this.addFx(label, 0, -60, 1.6, 0, 0, (o, age, total) => {
      o.scale.set(0.6 + 0.6 * easeOutBack(Math.min(1, age / 0.2)));
      o.alpha = Math.min(1, (total - age) / 0.5);
    });
  }
}
