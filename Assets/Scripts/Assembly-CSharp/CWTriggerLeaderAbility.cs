using UnityEngine;

public class CWTriggerLeaderAbility : MonoBehaviour
{
	private bool Used;

	private void Start()
	{
	}

	private void OnEnable()
	{
		Used = false;
	}

	private void OnClick()
	{
		if (!Used)
		{
			if (VersusMatch.Active)
			{
				if (!VersusMatch.LocalInputAllowed())
				{
					return;
				}
				VersusMatch.Send("leader");
			}
			BattlePhaseManager.GetInstance().Phase = BattlePhase.P1LeaderAbility;
			Used = true;
			CWFloopActionManager.GetInstance().TriggerLeader(PlayerType.User);
		}
	}

	private void Update()
	{
	}
}
