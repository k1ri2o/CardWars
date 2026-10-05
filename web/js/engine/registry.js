// Script lookup by name, standing in for System.Type.GetType(ScriptName) in
// CardForm.GetScriptClass.
const scripts = new Map();
const defaults = { creature: null, building: null, spell: null, leader: null, card: null };

export function registerScript(name, cls) {
  scripts.set(name, cls);
}

export function registerScripts(map) {
  for (const [name, cls] of Object.entries(map)) scripts.set(name, cls);
}

export function setDefaultScripts(d) {
  Object.assign(defaults, d);
}

export function hasScript(name) {
  return scripts.has(name);
}

export function scriptNames() {
  return [...scripts.keys()];
}

export function scriptClassFor(name, type, isLeader = false) {
  const cls = scripts.get(name);
  if (cls) return cls;
  if (isLeader) return defaults.leader;
  switch (type) {
    case 0: return defaults.creature;
    case 1: return defaults.building;
    case 2: return defaults.spell;
    default: return defaults.card;
  }
}
