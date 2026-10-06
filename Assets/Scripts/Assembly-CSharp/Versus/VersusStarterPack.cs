using System;
using System.Collections.Generic;

// Every player starts with everything unlocked: every card and hero, every quest on the
// Land of Ooo and Fionna & Cake maps, every dungeon on every day, and no tutorial.
// Runs once per save, right after it is loaded, so new players and saves from older
// builds both get it. A marker in the save's list of finished tutorials records that it ran.
public static class VersusStarterPack
{
	public const string Marker = "VERSUS_STARTER_PACK_1";

	// Level 15 heroes have 85 HP and room for 29 cards in a deck.
	public const int HeroLevel = 15;

	// Room left in the card box after the collection is added.
	public const int SpareInventory = 200;

	// Quest maps whose quests are all opened.
	private static readonly string[] MapQuestTypes = new string[2] { "main", "fc" };

	public static void Apply(PlayerInfoScript player)
	{
		if (player == null)
		{
			return;
		}
		try
		{
			if (!player.tutorialsCompleted.Contains(Marker))
			{
				SkipTutorials();
				int cards = AddEveryCard(player.DeckManager);
				int heroes = AddEveryHero();
				int quests = OpenEveryQuest(player);
				player.MaxInventory = Math.Max(player.MaxInventory, player.DeckManager.CardCount() + SpareInventory);
				player.tutorialsCompleted.Add(Marker);
				VersusMatch.Log("starter pack: added " + cards + " cards and " + heroes + " heroes, opened " + quests + " quests, tutorial skipped");
			}
			OpenEveryDungeon();
		}
		catch (Exception e)
		{
			UnityEngine.Debug.LogError("[Versus] starter pack failed: " + e);
		}
	}

	// Marks every one-time tutorial and tutorial flow as done. Reusable entries are the game's
	// warnings (deck too big, card box full and so on) and keep working.
	private static void SkipTutorials()
	{
		TutorialManager tutorials = TutorialManager.Instance;
		foreach (TutorialInfo info in tutorials.tutorials.Values)
		{
			if (!info.Reusable)
			{
				tutorials.markTutorialCompleted(info.TutorialID);
			}
			if (!string.IsNullOrEmpty(info.Flow))
			{
				tutorials.markTutorialCompleted(info.Flow);
			}
		}
	}

	// Tops every card up to the most copies a deck may hold.
	private static int AddEveryCard(PlayerDeckManager decks)
	{
		int copies = Math.Max(1, ParametersManager.Instance.Max_Duplicates_In_Deck);
		Dictionary<CardForm, int> owned = new Dictionary<CardForm, int>();
		foreach (CardItem item in decks.Inventory)
		{
			int count;
			owned.TryGetValue(item.Form, out count);
			owned[item.Form] = count + 1;
		}
		int added = 0;
		foreach (CardForm form in CardDataManager.Instance.GetCards())
		{
			int count;
			owned.TryGetValue(form, out count);
			for (int i = count; i < copies; i++)
			{
				decks.AddCard(new CardItem(form, 1, false));
				added++;
			}
		}
		decks.PrecacheCounts();
		return added;
	}

	// Adds every hero, and raises heroes below HeroLevel to it. New heroes go at the end of
	// the list because decks remember their hero by position.
	private static int AddEveryHero()
	{
		LeaderManager leaders = LeaderManager.Instance;
		int added = 0;
		foreach (LeaderForm form in leaders.leaderForms.Values)
		{
			int level = Math.Max(HeroLevel, form.StartLevel);
			LeaderItem hero = leaders.GetLeader(form.ID);
			if (hero == null)
			{
				leaders.leaders.Add(leaders.CreateLeader(form.ID, level));
				added++;
			}
			else if (hero.Rank < level)
			{
				hero.XP = XPManager.Instance.FindRequiredXP(form.LvUpSchemeID, level);
			}
		}
		return added;
	}

	// Gives every map quest three stars, which is how the game itself opens the quests and
	// map regions behind them (the developers' own "Unlock Quests" debug button did the same).
	private static int OpenEveryQuest(PlayerInfoScript player)
	{
		int opened = 0;
		foreach (string questType in MapQuestTypes)
		{
			foreach (QuestData quest in QuestManager.Instance.GetQuestsByType(questType))
			{
				if (player.GetQuestProgress(quest) < 3)
				{
					player.SetQuestProgress(quest, 3);
					opened++;
				}
			}
		}
		QuestManager.Instance.InitializeQuestStates();
		return opened;
	}

	// Dungeons normally open on set days of the week; this shows all of them every day.
	// Not saved, so it is set again on every load.
	private static void OpenEveryDungeon()
	{
		GlobalFlags.Instance.disableDungeonTimeLock = true;
		DebugFlagsScript flags = DebugFlagsScript.GetInstance();
		if (flags != null)
		{
			flags.disableDungeonTimeLock = true;
		}
	}
}
