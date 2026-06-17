// Quiniela Mundial 2026 - Servidor con sincronización en tiempo real
// Sirve el HTML estático + WebSocket para sincronizar predicciones entre todos los participantes.
// Persistencia: el estado se guarda en Upstash Redis (gratis, no caduca) para que sobreviva
// a los reinicios del plan gratuito de Render. Si no hay credenciales de Upstash configuradas
// (por ejemplo en desarrollo local), se usa un archivo local como respaldo automático.

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// ========================
// PERSISTENCIA
// ========================
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_ENABLED = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
const STATE_KEY = 'quiniela:state';
const LOCAL_STATE_FILE = path.join(__dirname, 'state.json');

if (UPSTASH_ENABLED) {
  console.log('Persistencia: usando Upstash Redis (permanente).');
} else {
  console.log('Persistencia: UPSTASH_REDIS_REST_URL/TOKEN no configuradas. Usando archivo local como respaldo (no sobrevive a un redeploy/spin-down en Render).');
}

async function upstashCommand(cmd) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upstash respondió ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.result;
}

function saveStateToLocalFile() {
  try {
    fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('No se pudo escribir el respaldo local:', err.message);
  }
}

function loadStateFromLocalFile() {
  try {
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      const raw = fs.readFileSync(LOCAL_STATE_FILE, 'utf-8');
      state = { ...state, ...JSON.parse(raw) };
      console.log('Estado cargado desde el respaldo local (state.json).');
    }
  } catch (err) {
    console.error('No se pudo leer el respaldo local:', err.message);
  }
}

async function saveState() {
  if (UPSTASH_ENABLED) {
    try {
      await upstashCommand(['SET', STATE_KEY, JSON.stringify(state)]);
      return;
    } catch (err) {
      console.error('Error guardando en Upstash, se usará el respaldo local mientras tanto:', err.message);
    }
  }
  saveStateToLocalFile();
}

async function loadState() {
  if (UPSTASH_ENABLED) {
    try {
      const result = await upstashCommand(['GET', STATE_KEY]);
      if (result) {
        state = { ...state, ...JSON.parse(result) };
        console.log('Estado cargado desde Upstash.');
        return;
      }
      console.log('Upstash no tenía estado previo guardado, se empieza desde cero.');
      return;
    } catch (err) {
      console.error('Error cargando desde Upstash, se intentará el respaldo local:', err.message);
    }
  }
  loadStateFromLocalFile();
}

// ========================
// ESTADO COMPARTIDO
// ========================
// matchId -> { playerId: { s1, s2 } }
// championPicks: { playerId: "🇲🇽 México" }
// knockoutTeams: { "matchId_1": { flag, name } }
// players: { "1": "Jugador 1" }
let state = {
  predictions: {},
  championPicks: {},
  knockoutTeams: {},
  players: {},
  // estado adicional: partidos marcados como live/done y resultados oficiales
  matchStatus: {},   // matchId -> "pending" | "live" | "done"
  matchScores: {},   // matchId -> { s1, s2 }
};

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(data);
  });
}

wss.on('connection', (ws) => {
  // 1) Al conectarse, enviar estado completo
  ws.send(JSON.stringify({ type: 'init', state }));

  // 2) Escuchar cambios del cliente, retransmitir y guardar
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }

    switch (msg.type) {
      case 'pred':
        if (!msg.matchId || !msg.playerId) return;
        if (!state.predictions[msg.matchId]) state.predictions[msg.matchId] = {};
        if (msg.s1 === null || msg.s1 === undefined) {
          delete state.predictions[msg.matchId][msg.playerId];
        } else {
          state.predictions[msg.matchId][msg.playerId] = { s1: msg.s1, s2: msg.s2 };
        }
        broadcast({ type: 'pred', matchId: msg.matchId, playerId: msg.playerId, s1: msg.s1, s2: msg.s2 });
        saveState();
        break;

      case 'champion':
        if (!msg.playerId || !msg.team) return;
        state.championPicks[msg.playerId] = msg.team;
        broadcast({ type: 'champion', playerId: msg.playerId, team: msg.team });
        saveState();
        break;

      case 'knockoutTeam':
        if (!msg.key || !msg.team) return;
        state.knockoutTeams[msg.key] = msg.team;
        broadcast({ type: 'knockoutTeam', key: msg.key, team: msg.team });
        saveState();
        break;

      case 'playerName':
        if (!msg.playerId || !msg.name) return;
        state.players[String(msg.playerId)] = msg.name;
        broadcast({ type: 'playerName', playerId: msg.playerId, name: msg.name });
        saveState();
        break;

      case 'matchStatus':
        if (!msg.matchId) return;
        state.matchStatus[msg.matchId] = msg.status;
        broadcast({ type: 'matchStatus', matchId: msg.matchId, status: msg.status });
        saveState();
        break;

      case 'matchScore':
        if (!msg.matchId) return;
        state.matchScores[msg.matchId] = { s1: msg.s1, s2: msg.s2 };
        broadcast({ type: 'matchScore', matchId: msg.matchId, s1: msg.s1, s2: msg.s2 });
        saveState();
        break;
    }
  });

  ws.on('close', () => {});
});

// Servir frontend estático (index.html vive en la misma carpeta que este archivo)
const publicDir = __dirname;
app.use(express.static(publicDir));

// Health check
app.get('/healthz', (_, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;

// Cargar el estado guardado antes de empezar a aceptar conexiones
await loadState();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Quiniela corriendo en puerto ${PORT}`);
});
