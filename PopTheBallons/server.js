// PopTheBallons server.
// Serves the Angular build and runs the game over Socket.IO on the same HTTP
// server, so one Render web service handles both.
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist', 'PopTheBallons', 'browser');

// Logical world size. The browser scales it to fit the screen.
const WORLD_W = 960;
const WORLD_H = 600;

const MAX_PLAYERS = 20;
const MIN_DURATION = 30; // seconds
const MAX_DURATION = 600; // seconds
const COLOR_COUNT = 8; // balloon colors (visual only)

const TICK_MS = 50; // simulation runs 20 times per second
const BROADCAST_EVERY = 2; // positions are sent 10 times per second
const DRIFT_MS = 500; // balloons pick a new drift every 0.5 s
const SPAWN_MIN_MS = 450;
const SPAWN_MAX_MS = 800;
// Density grows with the player count: more players means more balloons on screen
// and more frequent spawns, so there are more to pop.
const CAP_BASE = 22; // balloons on screen = CAP_BASE + CAP_PER_PLAYER per player
const CAP_PER_PLAYER = 3;
const CAP_MAX = 60;
const SPAWN_SCALE = 1.0; // spawn rate grows with the square root of the extra players

const CANDY_SHARE = 2 / 3; // 2 candy for every 1 ghost
const GHOST_HOME_CHANCE = 5 / 6; // 5 of 6 ghost drift steps head to the nearest recent pop
const RECENT_POP_MS = 1000; // a pop counts as "recent" for 1 second
const GHOST_SPEED = 60; // px per second, left or right, while drifting toward a pop
const DRIFT_SPEED = 30; // px per second, left or right

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rooms = new Map(); // room code -> room
const roomOfSocket = new Map(); // socket id -> room code

const app = express();
app.use(express.static(DIST));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(DIST, 'index.html'), (err) => {
    if (err) res.status(404).send('Build the app first with: yarn build');
  });
});

const server = http.createServer(app);
const io = new Server(server);

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const round = (n) => Math.round(n);

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += CODE_CHARS[randInt(0, CODE_CHARS.length - 1)];
  } while (rooms.has(code));
  return code;
}

function cleanName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 16);
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    duration: room.duration,
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score })),
  };
}

function announce(room) {
  io.to(room.code).emit('room', publicRoom(room));
}

// Chooses how a balloon moves until the next drift step.
// Every balloon only rises and moves left or right. Ghosts never fall, so they
// are not easier to spot by their movement.
function steer(b, recentPops, now) {
  const recent = recentPops.filter((p) => now - p.t <= RECENT_POP_MS);
  if (b.ghost && recent.length > 0 && Math.random() < GHOST_HOME_CHANCE) {
    // Ghosts drift left or right toward the nearest recent pop.
    let target = recent[0];
    let best = Infinity;
    for (const p of recent) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    const dir = Math.sign(target.x - b.x) || (Math.random() < 0.5 ? -1 : 1);
    b.vx = dir * GHOST_SPEED;
    b.vy = -b.rise;
  } else if (b.enter !== 0) {
    // Balloons that fly in from a side keep heading inward while they rise
    b.vx = b.enter * rand(40, 90);
    b.vy = -b.rise;
  } else {
    // Left or right, 1:1, while rising.
    b.vx = (Math.random() < 0.5 ? -1 : 1) * DRIFT_SPEED;
    b.vy = -b.rise;
  }
}

function newBalloon(room, now, fromSides = true) {
  const ghost = Math.random() >= CANDY_SHARE;
  const r = rand(26, 40);
  // Most balloons rise from the bottom. Some fly in from the left or right edge.
  const roll = fromSides ? Math.random() : 0.5;
  const enter = roll < 0.2 ? 1 : roll < 0.4 ? -1 : 0; // +1 enters from the left, -1 from the right
  const b = {
    id: room.nextId++,
    ghost,
    value: ghost ? randInt(1, 3) : randInt(1, 5),
    color: randInt(0, COLOR_COUNT - 1),
    x: enter === 1 ? -r : enter === -1 ? WORLD_W + r : rand(r, WORLD_W - r),
    y: enter === 0 ? WORLD_H + r : rand(WORLD_H * 0.3, WORLD_H * 0.95),
    enter,
    r,
    rise: rand(60, 130), // some balloons rise faster than others
    vx: 0,
    vy: 0,
  };
  steer(b, room.recentPops, now);
  return b;
}

function balloonCap(room) {
  return Math.min(CAP_MAX, CAP_BASE + CAP_PER_PLAYER * room.players.size);
}

function spawnRate(room) {
  return 2 + SPAWN_SCALE * Math.sqrt(Math.max(0, room.players.size - 1));
}

function startGame(room) {
  const now = Date.now();
  room.status = 'playing';
  room.balloons = [];
  room.recentPops = [];
  // Start with a full board, spread over the screen, so the first seconds aren't empty
  for (let i = 0; i < balloonCap(room); i++) {
    const b = newBalloon(room, now, false);
    b.y = rand(b.r, WORLD_H + b.r);
    room.balloons.push(b);
  }
  room.endsAt = now + room.duration * 1000;
  room.nextSpawnAt = now;
  room.nextDriftAt = now;
  room.lastTick = now;
  room.tickCount = 0;
  for (const p of room.players.values()) p.score = 0;
  room.timer = setInterval(() => tick(room), TICK_MS);
  announce(room);
}

function endGame(room) {
  clearInterval(room.timer);
  room.timer = null;
  room.status = 'ended';
  room.balloons = [];
  announce(room);
}

function tick(room) {
  const now = Date.now();
  if (now >= room.endsAt) return endGame(room);
  const dt = (now - room.lastTick) / 1000;
  room.lastTick = now;

  if (now >= room.nextSpawnAt && room.balloons.length < balloonCap(room)) {
    room.balloons.push(newBalloon(room, now));
    room.nextSpawnAt = now + rand(SPAWN_MIN_MS, SPAWN_MAX_MS) / spawnRate(room);
  }

  room.recentPops = room.recentPops.filter((p) => now - p.t <= RECENT_POP_MS);
  if (now >= room.nextDriftAt) {
    for (const b of room.balloons) steer(b, room.recentPops, now);
    room.nextDriftAt = now + DRIFT_MS;
  }

  for (const b of room.balloons) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  room.balloons = room.balloons.filter((b) => b.y > -b.r * 2 && b.x > -100 && b.x < WORLD_W + 100);

  room.tickCount += 1;
  if (room.tickCount % BROADCAST_EVERY === 0) {
    io.to(room.code).emit('state', {
      remaining: Math.max(0, room.endsAt - now),
      // [id, x, y, radius, color]. Candy or ghost is deliberately not sent.
      balloons: room.balloons.map((b) => [b.id, round(b.x), round(b.y), round(b.r), b.color]),
    });
  }
}

function handlePop(socket, msg) {
  const room = rooms.get(roomOfSocket.get(socket.id));
  if (!room || room.status !== 'playing') return;
  const id = msg && msg.id;
  const x = msg && msg.x;
  const y = msg && msg.y;
  if (typeof x !== 'number' || typeof y !== 'number') return;

  const b = room.balloons.find((o) => o.id === id);
  if (!b) return; // already popped or floated away

  // Generous distance: allows for finger size and network delay.
  if (Math.hypot(b.x - x, b.y - y) > b.r * 1.6 + 24) return;

  room.balloons = room.balloons.filter((o) => o !== b);
  const player = room.players.get(socket.id);
  const points = b.ghost ? -b.value : b.value;
  player.score += points;
  room.recentPops.push({ x: b.x, y: b.y, t: Date.now() });

  io.to(room.code).emit('popped', {
    ghost: b.ghost,
    value: b.value,
    points,
    playerId: socket.id,
    playerName: player.name,
    x: round(b.x),
    y: round(b.y),
  });
  announce(room);
}

function addPlayer(room, socket, name) {
  room.players.set(socket.id, { id: socket.id, name, score: 0 });
  roomOfSocket.set(socket.id, room.code);
  socket.join(room.code);
}

function removePlayer(socket) {
  const code = roomOfSocket.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  roomOfSocket.delete(socket.id);
  socket.leave(code);
  if (!room) return;

  room.players.delete(socket.id);
  if (room.players.size === 0) {
    clearInterval(room.timer);
    rooms.delete(code);
    return;
  }
  if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
  announce(room);
}

io.on('connection', (socket) => {
  const reply = (ack, data) => {
    if (typeof ack === 'function') ack(data);
  };

  socket.on('createRoom', (msg, ack) => {
    if (roomOfSocket.has(socket.id)) return reply(ack, { ok: false, error: 'Leave your current room first' });
    const name = cleanName(msg && msg.name);
    if (!name) return reply(ack, { ok: false, error: 'Enter a name' });
    const duration = Math.round(Number(msg && msg.duration));
    if (!(duration >= MIN_DURATION && duration <= MAX_DURATION)) {
      return reply(ack, { ok: false, error: `Game length must be ${MIN_DURATION}-${MAX_DURATION} seconds` });
    }

    const code = makeCode();
    const room = {
      code,
      status: 'lobby',
      hostId: socket.id,
      duration,
      players: new Map(),
      balloons: [],
      recentPops: [],
      nextId: 1,
      timer: null,
      endsAt: 0,
      nextSpawnAt: 0,
      nextDriftAt: 0,
      lastTick: 0,
      tickCount: 0,
    };
    rooms.set(code, room);
    addPlayer(room, socket, name);
    announce(room);
    reply(ack, { ok: true, code });
  });

  socket.on('joinRoom', (msg, ack) => {
    if (roomOfSocket.has(socket.id)) return reply(ack, { ok: false, error: 'Leave your current room first' });
    const code = String((msg && msg.code) || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return reply(ack, { ok: false, error: 'Room not found' });
    if (room.status !== 'lobby') return reply(ack, { ok: false, error: 'This game has already started' });
    if (room.players.size >= MAX_PLAYERS) return reply(ack, { ok: false, error: `Room is full (${MAX_PLAYERS} players)` });
    const name = cleanName(msg && msg.name);
    if (!name) return reply(ack, { ok: false, error: 'Enter a name' });

    addPlayer(room, socket, name);
    announce(room);
    reply(ack, { ok: true, code });
  });

  socket.on('startGame', (_msg, ack) => {
    const room = rooms.get(roomOfSocket.get(socket.id));
    if (!room) return reply(ack, { ok: false, error: 'You are not in a room' });
    if (room.hostId !== socket.id) return reply(ack, { ok: false, error: 'Only the host can start' });
    if (room.status !== 'lobby') return reply(ack, { ok: false, error: 'The game is not in the lobby' });
    startGame(room);
    reply(ack, { ok: true });
  });

  socket.on('playAgain', (_msg, ack) => {
    const room = rooms.get(roomOfSocket.get(socket.id));
    if (!room) return reply(ack, { ok: false, error: 'You are not in a room' });
    if (room.hostId !== socket.id) return reply(ack, { ok: false, error: 'Only the host can restart' });
    if (room.status !== 'ended') return reply(ack, { ok: false, error: 'The game is still running' });
    room.status = 'lobby';
    for (const p of room.players.values()) p.score = 0;
    announce(room);
    reply(ack, { ok: true });
  });

  socket.on('leaveRoom', (_msg, ack) => {
    removePlayer(socket);
    reply(ack, { ok: true });
  });

  socket.on('pop', (msg) => handlePop(socket, msg));
  socket.on('disconnect', () => removePlayer(socket));
});

server.listen(PORT, () => {
  console.log(`PopTheBallons listening on port ${PORT}`);
});
