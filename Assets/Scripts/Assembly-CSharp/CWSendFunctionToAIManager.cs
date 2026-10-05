using UnityEngine;

public class CWSendFunctionToAIManager : MonoBehaviour
{
	private void OnClick()
	{
		if (VersusMatch.Active)
		{
			return;
		}
		AIManager.Instance.MakeDecision();
	}

	private void Update()
	{
	}
}
