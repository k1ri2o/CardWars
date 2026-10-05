using System.Collections.Generic;

// Random numbers that come out the same in both players' games.
// Each player has their own stream, seeded from the match seed, so a draw made for
// one player never shifts the other's. Outside a 1v1 match this is UnityEngine.Random.
public static class VersusRandom
{
	private static readonly uint[] state = new uint[2];

	public static void Seed(uint matchSeed)
	{
		state[0] = Mix(matchSeed ^ 0x9E3779B9u);
		state[1] = Mix(matchSeed ^ 0x7F4A7C15u);
	}

	// min inclusive, max exclusive, like UnityEngine.Random.Range(int, int).
	public static int Range(PlayerType owner, int min, int max)
	{
		if (!VersusMatch.Active)
		{
			return UnityEngine.Random.Range(min, max);
		}
		if (max <= min)
		{
			return min;
		}
		uint r = Next(VersusMatch.SeatOf(owner));
		return min + (int)(r % (uint)(max - min));
	}

	// Like UnityEngine.Random.value: 0..1 inclusive.
	public static float Value(PlayerType owner)
	{
		if (!VersusMatch.Active)
		{
			return UnityEngine.Random.value;
		}
		return (float)(Next(VersusMatch.SeatOf(owner)) & 0xFFFFFF) / 16777215f;
	}

	public static T Pick<T>(List<T> items, PlayerType owner)
	{
		if (items == null || items.Count == 0)
		{
			return default(T);
		}
		return items[Range(owner, 0, items.Count)];
	}

	private static uint Next(int seat)
	{
		// xorshift32: tiny, fast and identical on every machine.
		uint x = state[seat];
		x ^= x << 13;
		x ^= x >> 17;
		x ^= x << 5;
		state[seat] = x;
		VersusMatch.NoteRandom(seat, x);
		return x;
	}

	private static uint Mix(uint x)
	{
		x ^= x >> 16;
		x *= 0x7FEB352Du;
		x ^= x >> 15;
		x *= 0x846CA68Bu;
		x ^= x >> 16;
		return (x != 0) ? x : 1u;
	}
}
