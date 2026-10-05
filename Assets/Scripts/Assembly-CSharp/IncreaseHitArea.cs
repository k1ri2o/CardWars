public class IncreaseHitArea : CreatureScript
{
	public override bool CanFloop()
	{
		return (int)VersusMatch.GetAreaMod(base.Owner, VersusMatch.AreaHit) == 0;
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
		VersusMatch.SetAreaMod(base.Owner, VersusMatch.AreaHit, (float)base.Data.Val1 / 100f);
		return true;
	}
}
