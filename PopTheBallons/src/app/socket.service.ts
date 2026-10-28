import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface Room {
  code: string;
  status: 'lobby' | 'playing' | 'ended';
  hostId: string;
  duration: number;
  players: Player[];
}

// [id, x, y, radius, color]
export type BalloonTuple = [number, number, number, number, number];

export interface GameState {
  remaining: number;
  balloons: BalloonTuple[];
}

export interface PopEvent {
  ghost: boolean;
  value: number;
  points: number;
  playerId: string;
  playerName: string;
  x: number;
  y: number;
}

export interface Ack {
  ok: boolean;
  code?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  readonly connected = signal(false);
  readonly myId = signal<string | null>(null);
  readonly room = signal<Room | null>(null);
  readonly state$ = new Subject<GameState>();
  readonly pop$ = new Subject<PopEvent>();

  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket) return this.socket;

    const s = io();
    s.on('connect', () => {
      this.connected.set(true);
      this.myId.set(s.id ?? null);
    });
    s.on('disconnect', () => {
      // The server removes players when they disconnect, so the room is gone too.
      this.connected.set(false);
      this.room.set(null);
    });
    s.on('room', (room: Room) => this.room.set(room));
    s.on('state', (state: GameState) => this.state$.next(state));
    s.on('popped', (pop: PopEvent) => this.pop$.next(pop));

    this.socket = s;
    return s;
  }

  createRoom(name: string, duration: number): Promise<Ack> {
    return this.request('createRoom', { name, duration });
  }

  joinRoom(code: string, name: string): Promise<Ack> {
    return this.request('joinRoom', { code, name });
  }

  startGame(): Promise<Ack> {
    return this.request('startGame');
  }

  playAgain(): Promise<Ack> {
    return this.request('playAgain');
  }

  async leaveRoom(): Promise<void> {
    this.room.set(null);
    await this.request('leaveRoom');
  }

  pop(id: number, x: number, y: number): void {
    this.connect().emit('pop', { id, x, y });
  }

  private async request(event: string, payload?: unknown): Promise<Ack> {
    try {
      return (await this.connect().timeout(8000).emitWithAck(event, payload)) as Ack;
    } catch {
      return { ok: false, error: 'The server did not respond. Check your connection.' };
    }
  }
}
