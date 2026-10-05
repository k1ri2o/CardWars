using UnityEngine;

public class CWOpponentSequenceTrigger : MonoBehaviour
{
	private CWOpponentActionSequencer oppActionSqcr;

	private void OnClick()
	{
		oppActionSqcr = CWOpponentActionSequencer.GetInstance();
		if (VersusMatch.Active)
		{
			StartCoroutine(oppActionSqcr.VersusTurn());
			return;
		}
		StartCoroutine(oppActionSqcr.StartOpponentSequence());
	}

	private void Update()
	{
	}
}
