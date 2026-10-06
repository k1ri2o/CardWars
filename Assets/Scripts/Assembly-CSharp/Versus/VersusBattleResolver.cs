// Result handling for a 1v1 match: no rewards, no quest progress, back to the battle menu.
public class VersusBattleResolver : BattleResolver
{
	public QuestData questData { get; private set; }

	public int questStars
	{
		get
		{
			return -1;
		}
	}

	public string questConditionId
	{
		get
		{
			return null;
		}
	}

	public VersusBattleResolver(string questId)
	{
		questData = QuestManager.Instance.GetQuest(questId);
	}

	public bool SkipRegularLogic()
	{
		return true;
	}

	public void GetOverrideDropCard(ref bool dropCard, ref CardItem card)
	{
		dropCard = false;
		card = null;
	}

	public void SetResult(PlayerType winner)
	{
		VersusSession.OnMatchResult(winner);
		GlobalFlags.Instance.BattleResult = new BattleResult(BattleResult.Menu.BattleModeSelect);
	}
}
