using System.Collections.Generic;
using UnityEngine;

public class CWList<T> : List<T>
{
	public T RandomItem()
	{
		if (Count <= 0)
		{
			return default(T);
		}
		int index = Random.Range(0, Count);
		return this[index];
	}

	// A random item drawn from the owner's stream (the same on both computers in a 1v1 match).
	public T RandomItem(PlayerType owner)
	{
		if (Count <= 0)
		{
			return default(T);
		}
		return this[VersusRandom.Range(owner, 0, Count)];
	}
}
