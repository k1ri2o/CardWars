using UnityEngine;

public class LandscapeReadyButtonScript : MonoBehaviour
{
	private LandscapeManagerScript LandscapeManager;

	private void Start()
	{
		LandscapeManager = LandscapeManagerScript.GetInstance();
	}

	private void OnClick()
	{
		if (VersusMatch.Active && !VersusMatch.LocalLandscapesSent)
		{
			GameState instance = GameState.Instance;
			VersusMatch.LocalLandscapesSent = true;
			VersusMatch.Send("lands", instance.GetLandscapeType(PlayerType.User, 0), instance.GetLandscapeType(PlayerType.User, 1), instance.GetLandscapeType(PlayerType.User, 2), instance.GetLandscapeType(PlayerType.User, 3));
		}
		LandscapeManager.AssignOpponentLandscapes();
		LandscapeManager.UpdateLandscapes();
	}
}
