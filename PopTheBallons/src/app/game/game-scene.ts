import { Application, Circle, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { GameState, PopEvent } from '../socket.service';
import {
  BALLOON_ANCHOR_Y,
  GROUND_W,
  makeBalloonTextures,
  makeGhostTexture,
  makeGroundTexture,
  makeSkyTexture,
  makeWorldDecorTexture,
} from './textures';

const W = 960;
const H = 600;
const BALLOON_BASE_R = 40; // balloon radius at scale 1
const CANDY_COLORS = [0xffd23f, 0xff7bd5, 0x4cd964, 0x3ec1ff, 0xffffff];

interface BalloonView {
  sprite: Sprite;
  tx: number;
  ty: number;
  phase: number;
}

// A short-lived visual: a particle, a smoke puff, a ghost, or floating text.
interface Fx {
  obj: Container;
  vx: number;
  vy: number;
  gravity: number;
  grow: number;
  life: number;
  max: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Pixi scene for the game board. The server decides everything. This class
// only draws balloons and pop effects, and reports clicks.
export class GameScene {
  private app?: Application;
  private destroyed = false;
  private readonly world = new Container();
  private readonly balloonLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly views = new Map<number, BalloonView>();
  private readonly fx: Fx[] = [];
  private balloonTextures: Texture[] = [];
  private ghostTexture?: Texture;
  // Sky and ground fill the whole screen, behind the scaled world
  private sky?: Sprite;
  private ground?: Sprite;
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
    if (!this.app || !this.ghostTexture) return;
    const { x, y } = pop;

    if (pop.ghost) {
      // Purple smoke, a ghost floating up, and a red minus.
      for (let i = 0; i < 3; i++) {
        const puff = new Graphics().circle(0, 0, rand(12, 18)).fill({ color: 0xb388ff, alpha: 0.5 });
        puff.position.set(x + rand(-12, 12), y + rand(-12, 12));
        this.addFx(puff, rand(-25, 25), rand(-25, -10), 0.8, 0, 1.2);
      }
      const ghost = new Sprite(this.ghostTexture);
      ghost.anchor.set(0.5);
      ghost.position.set(x, y);
      ghost.scale.set(0.8);
      this.addFx(ghost, 0, -60, 1.1);
      this.floatText(String(pop.points), x, y, '#ff5a7a');
    } else {
      // Candy sparkles and a green plus.
      for (let i = 0; i < 14; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(120, 260);
        const spark = new Graphics()
          .circle(0, 0, rand(3, 6))
          .fill({ color: CANDY_COLORS[i % CANDY_COLORS.length] });
        spark.position.set(x, y);
        this.addFx(spark, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, rand(0.5, 0.9), 240);
      }
      this.floatText(`+${pop.points}`, x, y, '#ffe066');
    }
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
    this.ghostTexture = makeGhostTexture();

    this.sky = new Sprite(makeSkyTexture());
    this.ground = new Sprite(makeGroundTexture());
    this.ground.anchor.set(0, 1);
    this.world.addChild(new Sprite(makeWorldDecorTexture(W, H)), this.balloonLayer, this.fxLayer);
    app.stage.addChild(this.sky, this.ground, this.world);
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

    // Sky covers the whole screen. Ground spans the full width at the bottom.
    if (this.sky) {
      this.sky.width = sw;
      this.sky.height = sh;
    }
    if (this.ground) {
      this.ground.scale.set(sw / GROUND_W);
      this.ground.position.set(0, sh);
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

    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      f.vy += f.gravity * dt;
      f.obj.x += f.vx * dt;
      f.obj.y += f.vy * dt;
      f.obj.scale.set(f.obj.scale.x + f.grow * dt);
      f.obj.alpha = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        f.obj.destroy();
        this.fx.splice(i, 1);
      }
    }
  }

  private addFx(obj: Container, vx: number, vy: number, life: number, gravity = 0, grow = 0): void {
    this.fxLayer.addChild(obj);
    this.fx.push({ obj, vx, vy, gravity, grow, life, max: life });
  }

  private floatText(text: string, x: number, y: number, color: string): void {
    const label = new Text({
      text,
      style: {
        fill: color,
        fontFamily: 'Arial, sans-serif',
        fontSize: 42,
        fontWeight: '900',
        stroke: { color: '#1a0830', width: 6 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    this.addFx(label, 0, -70, 1.0);
  }
}
