// Lane.cs
import { NONE } from './consts.js';

export class Lane {
  constructor(owner, index) {
    this.owner = owner;
    this.index = index;
    /** [creature, building] */
    this.scripts = [null, null];
    /** [left, right] neighbours on the same side, null at the edges. */
    this.adjacentLanes = [null, null];
    this.opponentLane = null;
    this.type = NONE;
    this.flipped = false;
    this.abilitiesBlocked = false;
    this.disabled = false;
    this.floopMod = 0;
    this.rarityGate = Number.MAX_SAFE_INTEGER;
  }

  get isOuterLane() {
    return this.adjacentLanes[0] === null || this.adjacentLanes[1] === null;
  }

  hasCreature() { return this.scripts[0] !== null; }
  hasBuilding() { return this.scripts[1] !== null; }
  hasCard(type) { return this.scripts[type] !== null && this.scripts[type] !== undefined; }
  isEmpty() { return !this.hasCreature(); }
  getCreature() { return this.scripts[0]; }
  getBuilding() { return this.scripts[1]; }
  getScript(type) { return this.scripts[type] ?? null; }

  isCreatureFresh() {
    return this.hasCreature() ? this.getCreature().fresh : false;
  }

  getInnerLane() {
    if (this.adjacentLanes[0] === null) return this.adjacentLanes[1];
    if (this.adjacentLanes[1] === null) return this.adjacentLanes[0];
    return this;
  }

  isAdjacentTo(lane) {
    return this.adjacentLanes.includes(lane);
  }
}
