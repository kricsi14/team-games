import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Player, Room, SocketService } from '../socket.service';
import { GameScene } from './game-scene';

@Component({
  selector: 'app-game',
  imports: [RouterLink],
  template: `
    @if (room(); as r) {
      @if (!socket.connected()) {
        <div class="banner">Connection lost. Reconnecting…</div>
      }

      @switch (r.status) {
        @case ('lobby') {
          <main class="page">
            <div class="top">
              <div class="code">{{ r.code }}</div>
              <div class="top-actions">
                <button (click)="fullscreen()">Fullscreen</button>
                <button (click)="leave()">Leave</button>
              </div>
            </div>
            <p class="hint">Share this code so others can join.</p>

            <section class="card">
              <h2>Players ({{ r.players.length }}/20)</h2>
              <ul class="players">
                @for (p of r.players; track p.id) {
                  <li>
                    {{ p.name }}
                    @if (p.id === r.hostId) {
                      <span class="tag">host</span>
                    }
                    @if (p.id === socket.myId()) {
                      <span class="tag you">you</span>
                    }
                  </li>
                }
              </ul>
              <p>Game length: {{ fmt(r.duration * 1000) }}</p>

              @if (isHost(r)) {
                <button class="primary" (click)="start()">Start game</button>
              } @else {
                <p class="hint">Waiting for the host to start…</p>
              }
              @if (error()) {
                <p class="error">{{ error() }}</p>
              }
            </section>
          </main>
        }

        @case ('playing') {
          <div class="stage" #stage></div>
          <div class="hud">
            <div class="pill">Time {{ timeLeft() }}</div>
            <div class="pill">Score {{ myScore(r) }}</div>
            <button class="pill" (click)="fullscreen()">Fullscreen</button>
            <button class="pill" (click)="leave()">Leave</button>
          </div>
          <div class="rotate-hint">
            <div class="phone-icon"></div>
            <p>Turn your phone sideways to play.</p>
          </div>
          <aside class="board">
            @for (p of ranking(r); track p.id) {
              <div [class.me]="p.id === socket.myId()">{{ p.name }}: {{ p.score }}</div>
            }
          </aside>
        }

        @case ('ended') {
          <main class="page">
            <h2>Game over</h2>
            <ol class="ranking">
              @for (p of ranking(r); track p.id) {
                <li>{{ p.name }} <b>{{ p.score }}</b></li>
              }
            </ol>
            @if (isHost(r)) {
              <button class="primary" (click)="playAgain()">Play again</button>
            }
            <button (click)="leave()">Leave</button>
            @if (error()) {
              <p class="error">{{ error() }}</p>
            }
          </main>
        }
      }
    } @else {
      <main class="page center">
        <h1>Not in this room</h1>
        <p>Your connection may have dropped, or the room no longer exists.</p>
        <a routerLink="/">Back to the lobby</a>
      </main>
    }
  `,
})
export class GameComponent {
  protected readonly socket = inject(SocketService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly code = this.route.snapshot.paramMap.get('code') ?? '';

  protected readonly room = computed<Room | null>(() => {
    const r = this.socket.room();
    return r && r.code === this.code ? r : null;
  });
  protected readonly remaining = signal(0);
  protected readonly timeLeft = computed(() => formatTime(this.remaining()));
  protected readonly error = signal('');
  protected readonly fmt = formatTime;

  private readonly stage = viewChild<ElementRef<HTMLDivElement>>('stage');
  private scene?: GameScene;

  constructor() {
    this.socket.connect();

    const subs: Subscription[] = [
      this.socket.state$.subscribe((s) => {
        this.remaining.set(s.remaining);
        this.scene?.applyState(s);
      }),
      this.socket.pop$.subscribe((p) => this.scene?.showPop(p)),
    ];

    // Create the Pixi board when the game starts, and remove it when it ends
    effect(() => {
      const r = this.room();
      const el = this.stage();
      if (r?.status === 'playing' && el && !this.scene) {
        this.scene = new GameScene(el.nativeElement, (id, x, y) => this.socket.pop(id, x, y));
      } else if (r?.status !== 'playing' && this.scene) {
        this.scene.destroy();
        this.scene = undefined;
      }
    });

    this.destroyRef.onDestroy(() => {
      subs.forEach((s) => s.unsubscribe());
      this.scene?.destroy();
      this.scene = undefined;
    });
  }

  protected isHost(r: Room): boolean {
    return r.hostId === this.socket.myId();
  }

  protected ranking(r: Room): Player[] {
    return [...r.players].sort((a, b) => b.score - a.score);
  }

  protected myScore(r: Room): number {
    return r.players.find((p) => p.id === this.socket.myId())?.score ?? 0;
  }

  protected async start(): Promise<void> {
    const res = await this.socket.startGame();
    this.error.set(res.ok ? '' : (res.error ?? 'Could not start the game'));
  }

  protected async playAgain(): Promise<void> {
    const res = await this.socket.playAgain();
    this.error.set(res.ok ? '' : (res.error ?? 'Could not restart the game'));
  }

  // Makes the page fullscreen so phones get the whole display. Some browsers
  // (iPhone Safari, for example) don't allow this, so failure is silent.
  protected fullscreen(): void {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen()
      .then(() => {
        const orientation = screen.orientation;
        if (orientation && 'lock' in orientation) {
          orientation.lock('landscape').catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }

  protected async leave(): Promise<void> {
    await this.socket.leaveRoom();
    await this.router.navigate(['/']);
  }
}

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
