// Boots the web game: loads the card data, registers every ability, shows the menu.
import { CardDb } from './engine/cards.js';
import './engine/scripts/index.js';
import { initArt } from './ui/cards.js';
import { App } from './ui/screens.js';

async function boot() {
  const root = document.getElementById('app');
  try {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error(`Could not load the card data (${res.status})`);
    const json = await res.json();
    initArt(json);
    const db = new CardDb(json);
    const app = new App(root, db);
    window.cardwars = { db, app };
    app.start();
  } catch (e) {
    console.error(e);
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'boot-error';
    p.textContent = 'Card Wars failed to start: ' + (e.message || e) +
      (location.protocol === 'file:' ? ' Open it through a web server (see the README), not as a file.' : '');
    root.append(p);
  }
}

boot();
