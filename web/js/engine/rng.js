// Seeded random numbers (mulberry32) standing in for UnityEngine.Random, so a
// match can be replayed from its seed when debugging.
export class Rng {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** UnityEngine.Random.Range(int, int): max is exclusive. */
  range(min, max) {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min));
  }

  /** UnityEngine.Random.Range(float, float). */
  rangeFloat(min, max) {
    return min + this.next() * (max - min);
  }

  /** CWList.RandomItem / WeightedList.RandomItem with equal weights. */
  pick(list) {
    if (!list || list.length === 0) return null;
    return list[this.range(0, list.length)];
  }
}
