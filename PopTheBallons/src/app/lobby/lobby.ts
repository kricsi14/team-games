import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Ack, SocketService } from '../socket.service';

const NAME_KEY = 'poptheballons.name';

@Component({
  selector: 'app-lobby',
  imports: [RouterLink],
  template: `
    <main class="page">
      <h1>PopTheBallons</h1>
      <p class="subtitle">Pop candy, dodge ghosts, climb the leaderboard.</p>

      @if (socket.room(); as r) {
        <p><a [routerLink]="['/room', r.code]">Return to room {{ r.code }}</a></p>
      }

      <label class="name-field">
        Your name
        <input maxlength="16" placeholder="Name" [value]="name()" (input)="setName(read($event))" />
      </label>

      <div class="grid">
        <section class="card">
          <h2>Create a room</h2>
          <label>
            Game length
            <select (change)="duration.set(+read($event))">
              @for (opt of durations; track opt.seconds) {
                <option [value]="opt.seconds" [selected]="opt.seconds === duration()">{{ opt.label }}</option>
              }
            </select>
          </label>
          <button class="primary" [disabled]="busy()" (click)="create()">Create room</button>
        </section>

        <section class="card">
          <h2>Join a room</h2>
          <label>
            Room code
            <input maxlength="5" placeholder="ABCDE" [value]="code()" (input)="code.set(read($event).toUpperCase())" />
          </label>
          <button class="primary" [disabled]="busy()" (click)="join()">Join room</button>
        </section>
      </div>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
      @if (!socket.connected()) {
        <p class="hint">Connecting to the server…</p>
      }
    </main>
  `,
})
export class LobbyComponent {
  protected readonly socket = inject(SocketService);
  private readonly router = inject(Router);

  // The name is remembered between visits, so returning to the lobby keeps it.
  protected readonly name = signal(loadName());
  protected readonly code = signal('');
  protected readonly duration = signal(60);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly durations = [
    { seconds: 30, label: '30 seconds' },
    { seconds: 60, label: '1 minute' },
    { seconds: 120, label: '2 minutes' },
    { seconds: 300, label: '5 minutes' },
    { seconds: 600, label: '10 minutes' },
  ];

  constructor() {
    this.socket.connect();
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected setName(value: string): void {
    this.name.set(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      // Storage can be blocked (private browsing, for example). The name still works for this visit.
    }
  }

  protected create(): void {
    void this.run(() => this.socket.createRoom(this.name(), this.duration()));
  }

  protected join(): void {
    void this.run(() => this.socket.joinRoom(this.code(), this.name()));
  }

  private async run(action: () => Promise<Ack>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    const res = await action();
    this.busy.set(false);
    if (res.ok && res.code) {
      await this.router.navigate(['/room', res.code]);
    } else {
      this.error.set(res.error ?? 'Something went wrong');
    }
  }
}

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
