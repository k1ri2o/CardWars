using System.Collections;
using UnityEngine;

public class CWSetPhase : MonoBehaviour
{
	public BattlePhase setPhase;

	public float delay;

	private BattlePhaseManager phaseMgr;

	private void Start()
	{
		phaseMgr = BattlePhaseManager.GetInstance();
	}

	private void OnClick()
	{
		if (VersusMatch.Active && (setPhase == BattlePhase.P1SetupBanner || setPhase == BattlePhase.P2SetupBanner) && GameDataScript.GetInstance().Turn <= 1)
		{
			StartCoroutine(VersusStart());
			return;
		}
		phaseMgr.SetPhase(delay, setPhase);
	}

	// The first turn starts once the friend has placed their landscapes too.
	private IEnumerator VersusStart()
	{
		while (VersusMatch.PeerLandscapes == null && !VersusMatch.Over)
		{
			VersusBanner.Text = "Waiting for " + VersusMatch.PeerName + " to place their lands...";
			yield return null;
		}
		VersusBanner.Text = null;
		LandscapeManagerScript landscapes = LandscapeManagerScript.GetInstance();
		landscapes.AssignOpponentLandscapes();
		landscapes.UpdateLandscapes();
		phaseMgr.SetPhase(delay, setPhase);
	}

	private void Update()
	{
	}
}
