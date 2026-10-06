// Peer-to-peer transport on top of PeerJS (vendor/peerjs.min.js, global Peer).
// Online, the free PeerJS cloud server introduces the two browsers; when the
// page is served by web/server, its own signaling server is used instead so
// LAN play works without internet. Game traffic always flows browser to browser.

const PREFIX = 'cardwars-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

let cachedConfig = null;

/** PeerJS options: our LAN signaling server when available, else the PeerJS cloud. */
export async function signalingConfig() {
  if (cachedConfig) return cachedConfig;
  let cfg = { debug: 1 };
  try {
    const r = await fetch('lan.json', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const secure = location.protocol === 'https:';
      cfg = {
        debug: 1,
        host: location.hostname,
        port: Number(location.port) || (secure ? 443 : 80),
        path: j.signaling.path,
        secure,
      };
    }
  } catch {
    // Static hosting: no LAN server, use the cloud.
  }
  cachedConfig = cfg;
  return cfg;
}

export function signalingLabel(cfg) {
  return cfg && cfg.path ? 'local network server' : 'PeerJS cloud';
}

/** Wraps a PeerJS DataConnection as a small JSON message pipe. */
export class Pipe {
  constructor(conn) {
    this.conn = conn;
    this.handlers = { message: [], close: [] };
    conn.on('data', (d) => {
      let msg = d;
      if (typeof d === 'string') {
        try { msg = JSON.parse(d); } catch { return; }
      }
      for (const h of this.handlers.message) h(msg);
    });
    const closed = () => {
      if (this.closed) return;
      this.closed = true;
      for (const h of this.handlers.close) h();
    };
    conn.on('close', closed);
    conn.on('error', closed);
    // PeerJS doesn't always fire close when the other tab vanishes.
    const pc = conn.peerConnection;
    if (pc) {
      pc.addEventListener('iceconnectionstatechange', () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
          setTimeout(() => {
            if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) closed();
          }, 4000);
        }
      });
    }
  }

  on(kind, h) { this.handlers[kind].push(h); }
  send(msg) {
    if (this.closed) return;
    try { this.conn.send(JSON.stringify(msg)); } catch { /* closing */ }
  }
  close() {
    try { this.conn.close(); } catch { /* already gone */ }
  }
}

function PeerCtor() {
  if (!window.Peer) throw new Error('Networking library failed to load');
  return window.Peer;
}

/**
 * Opens a room. Calls onGuest(pipe) for every guest connection.
 * Resolves { code, peer, label } once the signaling server accepted the code.
 */
export async function hostRoom(onGuest, preferredCode) {
  const cfg = await signalingConfig();
  const Peer = PeerCtor();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = attempt === 0 && preferredCode ? preferredCode : makeRoomCode();
    try {
      const peer = await new Promise((resolve, reject) => {
        const p = new Peer(PREFIX + code, cfg);
        const timer = setTimeout(() => reject(new Error('Signaling server did not answer')), 15000);
        p.on('open', () => { clearTimeout(timer); resolve(p); });
        p.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => onGuest(new Pipe(conn)));
      });
      peer.on('disconnected', () => {
        // Lost the signaling server; the open game keeps running, but
        // reconnect so a dropped guest can rejoin.
        setTimeout(() => { try { peer.reconnect(); } catch { /* destroyed */ } }, 2000);
      });
      return { code, peer, label: signalingLabel(cfg) };
    } catch (e) {
      if (e && e.type === 'unavailable-id') continue;
      throw friendlyError(e);
    }
  }
  throw new Error('Could not get a free room code, try again');
}

/** Joins a room by code. Resolves { pipe, peer }. */
export async function joinRoom(code) {
  const cfg = await signalingConfig();
  const Peer = PeerCtor();
  const peer = await new Promise((resolve, reject) => {
    const p = new Peer(cfg);
    const timer = setTimeout(() => reject(new Error('Signaling server did not answer')), 15000);
    p.on('open', () => { clearTimeout(timer); resolve(p); });
    p.on('error', (e) => { clearTimeout(timer); reject(friendlyError(e)); });
  });
  const pipe = await new Promise((resolve, reject) => {
    const conn = peer.connect(PREFIX + normalizeCode(code), { reliable: true });
    const timer = setTimeout(() => reject(new Error("Couldn't reach that room. Check the code, or try again if either of you is on a strict network.")), 20000);
    conn.on('open', () => { clearTimeout(timer); resolve(new Pipe(conn)); });
    peer.on('error', (e) => { clearTimeout(timer); reject(friendlyError(e)); });
  });
  return { pipe, peer };
}

function friendlyError(e) {
  const type = e && e.type;
  switch (type) {
    case 'peer-unavailable': return new Error('No game is open with that code.');
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return new Error("Can't reach the signaling server. Check your internet connection.");
    case 'browser-incompatible': return new Error("This browser can't do peer-to-peer play.");
    default: return e instanceof Error ? e : new Error(String(e && e.message || e));
  }
}
