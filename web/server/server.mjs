// Serves the Card Wars web game and runs a PeerJS signaling server next to it,
// so two devices on the same network can play without internet access.
//   cd web/server && npm install && npm start      (PORT=8080 by default)
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ExpressPeerServer } from 'peer';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;

const app = express();
const server = http.createServer(app);

// The game asks for this file to find out it can use our signaling server.
app.get('/lan.json', (_req, res) => res.json({ signaling: { path: '/peerjs' } }));
app.use('/peerjs', ExpressPeerServer(server, { path: '/', allow_discovery: false }));
app.use(express.static(webDir, { index: 'index.html', extensions: ['html'] }));

server.listen(port, '0.0.0.0', () => {
  console.log('Card Wars is running.');
  console.log(`  On this computer:   http://localhost:${port}/`);
  for (const addr of lanAddresses()) console.log(`  On your network:    http://${addr}:${port}/`);
  console.log('Share the network address with the other player, then Host / Join as usual.');
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
