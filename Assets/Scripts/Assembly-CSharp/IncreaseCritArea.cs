public class IncreaseCritArea : CreatureScript
{
	public override bool CanFloop()
	{
		return (int)VersusMatch.GetAreaMod(base.Owner, VersusMatch.AreaCrit) == 0;
	}

	public override int EvaluateAbility()
	{
		return int.MinValue;
	}

	public override void Floop()
	{
		TargetList.Add(this);
		DoEffect();
	}

	public override bool DoResult(CardScript target)
	{
		VersusMatch.SetAreaMod(base.Owner, VersusMatch.AreaCrit, (float)base.Data.Val1 / 100f);
		return true;
	}
}
