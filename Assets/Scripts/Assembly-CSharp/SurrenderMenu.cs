using System;
using Multiplayer;
using UnityEngine;

public class SurrenderMenu : AsyncData<string>
{
	private float savedTimeScale;

	private void OnEnable()
	{
		PauseMenu.pauseMenuShown = true;
		savedTimeScale = Time.timeScale;
		// A 1v1 match can't be paused: the friend's game keeps going, so this one does too.
		if (!VersusMatch.Active)
		{
			Time.timeScale = 0f;
		}
	}

	private void SurrenderMenuYes()
	{
		if (VersusMatch.Active)
		{
			if (!VersusMatch.Over)
			{
				VersusMatch.LocalSurrendered = true;
				VersusMatch.Over = true;
				VersusMatch.Send("surrender");
			}
			SurrenderMenuDone();
			return;
		}
		if (GlobalFlags.Instance.InMPMode && Asyncdata.processed)
		{
			global::Multiplayer.Multiplayer.MatchFinish(SessionManager.GetInstance().theSession, CWMPMapController.GetInstance().mLastMPData.mMatchID, true, StringCallback);
		}
		SurrenderMenuDone();
	}

	private void StringCallback(string data, ResponseFlag flag)
	{
		Asyncdata.Set(flag, data);
	}

	private void Update()
	{
		if (!Asyncdata.processed)
		{
			Asyncdata.processed = true;
			if (Asyncdata.MP_Data != null)
			{
				PlayerInfoScript instance = PlayerInfoScript.GetInstance();
				instance.TotalTrophies = Convert.ToInt32(Asyncdata.MP_Data);
				instance.Save();
			}
		}
	}

	private void SurrenderMenuDone()
	{
		if (!VersusMatch.Active)
		{
			Time.timeScale = savedTimeScale;
		}
		PauseMenu.pauseMenuShown = false;
	}
}
