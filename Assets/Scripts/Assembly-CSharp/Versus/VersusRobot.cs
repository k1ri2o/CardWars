using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.SceneManagement;

// A test player for 1v1 matches. It only exists when the game is started with
//   -versus-host            host a match (add -versus-room CODE for a fixed room code)
//   -versus-join TARGET     join a room code, or a host address on the same network
// and optionally -versus-broker HOST (use only that relay), -versus-name NAME,
// -versus-matches N (play N matches, then quit), -versus-seed N, -versus-speed X.
// It presses the same buttons a person would, with random moves and ring taps, so two
// robots can play whole matches against each other while the logs are checked for desyncs.
public class VersusRobot : MonoBehaviour
{
	private enum RingAim
	{
		Miss,
		Hit,
		Crit
	}

	private static bool booted;

	private static VersusRobot instance;

	private System.Random rng;

	private bool host;

	private string target = string.Empty;

	private string room = string.Empty;

	private string playerName = "Robot";

	private int matchesWanted = 1;

	private int matchesDone;

	private float speed = 1f;

	private float nextActionAt;

	private bool sessionStarted;

	private bool quitting;

	private BattlePhase lastPhase = BattlePhase.Start;

	private float phaseSince;

	private float lastStallLog;

	private RingAim ringAim;

	private bool ringAimChosen;

	private float resultClickAt;

	private bool landsPlaced;

	private bool bottleSpun;

	private bool battleReadyPressed;

	private int movesThisTurn;

	private int lastTurn = -1;

	private bool randomDecks;

	public static bool Active
	{
		get
		{
			return instance != null;
		}
	}

	// Called early at start-up (SessionManager.Awake). Does nothing unless the command line asks for a robot.
	public static void Boot()
	{
		if (booted)
		{
			return;
		}
		booted = true;
		string[] args = Environment.GetCommandLineArgs();
		UnityEngine.Debug.Log("[Robot] command line: " + string.Join(" ", args));
		bool wanted = false;
		for (int i = 0; i < args.Length; i++)
		{
			if (args[i] == "-versus-host" || args[i] == "-versus-join")
			{
				wanted = true;
			}
		}
		if (!wanted)
		{
			return;
		}
		GameObject go = new GameObject("VersusRobot");
		UnityEngine.Object.DontDestroyOnLoad(go);
		instance = go.AddComponent<VersusRobot>();
		instance.ReadArgs(args);
	}

	private void ReadArgs(string[] args)
	{
		int seed = Environment.TickCount;
		for (int i = 0; i < args.Length; i++)
		{
			string next = (i + 1 < args.Length) ? args[i + 1] : string.Empty;
			switch (args[i])
			{
			case "-versus-host":
				host = true;
				break;
			case "-versus-join":
				target = next;
				break;
			case "-versus-room":
				room = next;
				break;
			case "-versus-broker":
				MqttVersusLink.Brokers = new string[1] { next };
				break;
			case "-versus-name":
				playerName = next;
				break;
			case "-versus-matches":
				matchesWanted = Math.Max(1, VersusMessage.Int(next));
				break;
			case "-versus-deck":
				randomDecks = next == "random";
				break;
			case "-versus-seed":
				seed = VersusMessage.Int(next);
				break;
			case "-versus-speed":
			{
				float s;
				if (float.TryParse(next, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out s) && s > 0f)
				{
					speed = s;
				}
				break;
			}
			}
		}
		rng = new System.Random(seed);
		Say("ready: " + (host ? "host" : ("join " + target)) + ", seed " + seed + ", matches " + matchesWanted + ", speed " + speed);
	}

	private static void Say(string text)
	{
		UnityEngine.Debug.Log("[Robot] " + text);
	}

	private void Awake()
	{
		SceneManager.sceneLoaded += OnSceneLoaded;
	}

	private void OnDestroy()
	{
		SceneManager.sceneLoaded -= OnSceneLoaded;
	}

	private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
	{
		Say("scene " + scene.name + " (" + mode + "), active " + SceneManager.GetActiveScene().name);
		landsPlaced = false;
		bottleSpun = false;
		battleReadyPressed = false;
		lastTurn = -1;
		resultClickAt = 0f;
		nextActionAt = Time.realtimeSinceStartup + 2f;
	}

	// ---- Ring ----

	// Asked every frame while the ring spins; true taps it. Aims for a hit, a crit or a miss.
	public static bool WantsRingTap(float angle, float hitStart, float hitEnd, float critStart, float critEnd)
	{
		if (instance == null || !VersusMatch.Active)
		{
			return false;
		}
		return instance.RingTap(angle, hitStart, hitEnd, critStart, critEnd);
	}

	private bool RingTap(float angle, float hitStart, float hitEnd, float critStart, float critEnd)
	{
		if (!ringAimChosen)
		{
			ringAimChosen = true;
			int roll = rng.Next(100);
			ringAim = (roll < 55) ? RingAim.Hit : ((roll >= 80) ? RingAim.Miss : RingAim.Crit);
		}
		bool tap;
		switch (ringAim)
		{
		case RingAim.Hit:
			tap = angle >= hitStart + (hitEnd - hitStart) * 0.3f && angle <= hitEnd - (hitEnd - hitStart) * 0.3f;
			break;
		case RingAim.Crit:
			tap = angle >= critStart + (critEnd - critStart) * 0.3f && angle <= critEnd - (critEnd - critStart) * 0.3f;
			break;
		default:
			tap = angle < hitStart - 0.05f || angle > critEnd + 0.05f;
			break;
		}
		if (tap)
		{
			ringAimChosen = false;
		}
		return tap;
	}

	// ---- Every frame ----

	private void Update()
	{
		if (quitting)
		{
			return;
		}
		float now = Time.realtimeSinceStartup;
		if (speed != 1f && Time.timeScale == 1f)
		{
			Time.timeScale = speed;
		}
		if (VersusMatch.Active && BattlePhaseManager.GetInstance() != null)
		{
			BattleStep(now);
			return;
		}
		if (SceneManager.GetActiveScene().name == "AdventureTime")
		{
			MenuStep(now);
		}
	}

	private void MenuStep(float now)
	{
		if (now < nextActionAt)
		{
			return;
		}
		nextActionAt = now + 1f;
		SessionManager session = SessionManager.GetInstance();
		PlayerInfoScript pinfo = PlayerInfoScript.GetInstance();
		if (session == null || !session.IsReady() || pinfo == null)
		{
			return;
		}
		VersusSession versus = VersusSession.Ensure();
		if (randomDecks && (VersusSession.RobotDeck == null || (versus.RobotAfterMatch && versus.RobotCanRematch)))
		{
			VersusSession.RobotDeck = RandomDeck();
		}
		if (!sessionStarted)
		{
			sessionStarted = true;
			Say(host ? "hosting" : ("joining " + target));
			if (host)
			{
				versus.RobotHost(playerName, room);
			}
			else
			{
				versus.RobotJoin(playerName, target);
			}
			return;
		}
		if (versus.RobotAfterMatch)
		{
			if (matchesDone >= matchesWanted)
			{
				Finish();
				return;
			}
			if (versus.RobotCanRematch)
			{
				Say("rematch");
				versus.RobotRematch();
				nextActionAt = now + 3f;
			}
		}
	}

	private void Finish()
	{
		quitting = true;
		Say("done after " + matchesDone + " matches");
		Application.Quit();
	}

	public static void MatchEnded()
	{
		if (instance != null)
		{
			instance.matchesDone++;
			Say("match " + instance.matchesDone + " finished");
		}
	}

	private void BattleStep(float now)
	{
		BattlePhaseManager phaseMgr = BattlePhaseManager.GetInstance();
		GameState gs = GameState.Instance;
		if (phaseMgr == null || gs == null)
		{
			return;
		}
		BattlePhase phase = phaseMgr.Phase;
		if (phase != lastPhase)
		{
			Say("phase " + phase);
			lastPhase = phase;
			phaseSince = now;
		}
		if (now - phaseSince > 45f && now - lastStallLog > 15f)
		{
			lastStallLog = now;
			Say("still in " + phase + " after " + (int)(now - phaseSince) + " s; " + DescribeWaits());
		}
		if (now < nextActionAt)
		{
			return;
		}
		nextActionAt = now + Pause(0.3f, 1.2f);
		if (VersusMatch.LocalCardPick != null)
		{
			PickFromDiscard();
			return;
		}
		CardScript listener = gs.CurrentTargetingListener;
		if (listener != null && listener.Owner == PlayerType.User && (phase == BattlePhase.P1SetupLanePlyr || phase == BattlePhase.P1SetupLaneOpp))
		{
			PickLane(gs, listener);
			return;
		}
		if (phase.ToString().StartsWith("Result") || phase == BattlePhase.GameOver || VersusMatch.ResultShown)
		{
			ResultStep(now);
			return;
		}
		if (!landsPlaced && LandsNeeded(gs))
		{
			PlaceLands(gs);
			return;
		}
		if (!bottleSpun && PressBottle())
		{
			return;
		}
		if (!battleReadyPressed && PressBattleReady())
		{
			return;
		}
		// A person's taps are ignored while the game locks input, so the robot waits too.
		if (phase == BattlePhase.P1Setup && VersusMatch.LocalInputAllowed() && !UICamera.useInputEnabler)
		{
			int turn = GameDataScript.GetInstance().Turn;
			if (turn != lastTurn)
			{
				lastTurn = turn;
				movesThisTurn = 0;
			}
			TakeTurnStep(gs);
		}
	}

	private float Pause(float min, float max)
	{
		return (min + (float)rng.NextDouble() * (max - min)) / speed;
	}

	private string DescribeWaits()
	{
		return "quiet " + VersusMatch.IsQuiet(PlayerType.User) + "/" + VersusMatch.IsQuiet(PlayerType.Opponent) + ", lane pick " + (VersusMatch.PendingLanePick != null) + ", card pick " + (VersusMatch.PendingCardPick != null) + ", my pick " + (VersusMatch.LocalCardPick != null) + ", deaths " + VersusMatch.DeathsPending() + ", effects " + VersusMatch.EffectCount(PlayerType.User) + "/" + VersusMatch.EffectCount(PlayerType.Opponent) + ", input locked " + UICamera.useInputEnabler + ", banner " + VersusBanner.Text + ", timeScale " + Time.timeScale;
	}

	// ---- Before the first turn ----

	private bool LandsNeeded(GameState gs)
	{
		LandscapeManagerScript lands = LandscapeManagerScript.GetInstance();
		if (lands == null || lands.ReadyButton == null || UnityEngine.Object.FindObjectOfType<CWLandscapeCardDragOld>() == null)
		{
			return false;
		}
		for (int i = 0; i < 4; i++)
		{
			if (gs.GetLandscapeType(PlayerType.User, i) == LandscapeType.None)
			{
				return true;
			}
		}
		return false;
	}

	private void PlaceLands(GameState gs)
	{
		Deck deck = gs.GetDeck(PlayerType.User);
		List<LandscapeType> types = new List<LandscapeType>();
		for (int i = 0; i < deck.GetLandscapeCount(); i++)
		{
			types.Add(deck.GetLandscape(i));
		}
		while (types.Count < 4)
		{
			types.Add(LandscapeType.Corn);
		}
		Shuffle(types);
		LandscapeManagerScript lands = LandscapeManagerScript.GetInstance();
		for (int j = 0; j < 4; j++)
		{
			gs.SetLandscape(PlayerType.User, j, types[j]);
		}
		lands.UpdateLandscapes();
		foreach (CWLandscapeCardDragOld card in UnityEngine.Object.FindObjectsOfType<CWLandscapeCardDragOld>())
		{
			card.gameObject.SetActive(false);
		}
		landsPlaced = true;
		Say("lands " + types[0] + " " + types[1] + " " + types[2] + " " + types[3]);
		lands.ReadyButton.SendMessage("OnClick", SendMessageOptions.DontRequireReceiver);
	}

	private bool PressBottle()
	{
		CWKetchupBottleScript bottle = UnityEngine.Object.FindObjectOfType<CWKetchupBottleScript>();
		if (bottle == null || !bottle.gameObject.activeInHierarchy || bottle.Spin)
		{
			return false;
		}
		bottleSpun = true;
		Say("spin the bottle");
		bottle.SetSpinFlag();
		return true;
	}

	// After the bottle stops, "tap anywhere" goes through the bottle's tap delegate to the battle-ready button.
	private bool PressBattleReady()
	{
		CWKetchupBottleScript bottle = UnityEngine.Object.FindObjectOfType<CWKetchupBottleScript>();
		if (bottle == null || !bottleSpun || bottle.Spin)
		{
			return false;
		}
		CWTapDelegate tap = bottle.GetComponent<CWTapDelegate>();
		if (tap == null || tap.disableFlag)
		{
			return false;
		}
		battleReadyPressed = true;
		Say("tap to start the battle");
		bottle.gameObject.SendMessage("OnClick", SendMessageOptions.DontRequireReceiver);
		return true;
	}

	// ---- Turns ----

	private void TakeTurnStep(GameState gs)
	{
		List<Action> plays = new List<Action>();
		List<Action> floops = new List<Action>();
		Action leader = null;
		List<CardItem> hand = new List<CardItem>(gs.GetHand(PlayerType.User));
		foreach (CardItem card in hand)
		{
			for (int lane = 0; lane < 4; lane++)
			{
				if (card.Form.Type != CardType.Spell && gs.LaneHasCard(PlayerType.User, lane, card.Form.Type))
				{
					continue;
				}
				if (card.Form.CanPlay(PlayerType.User, lane))
				{
					CardItem c = card;
					int l = lane;
					plays.Add(delegate
					{
						PlayCard(c, l);
					});
					if (card.Form.Type == CardType.Spell)
					{
						break;
					}
				}
			}
		}
		for (int i = 0; i < 4; i++)
		{
			if (gs.LaneHasCreature(PlayerType.User, i))
			{
				CreatureScript creature = gs.GetCreature(PlayerType.User, i);
				if (!creature.Flooped && gs.CanFloopCard(PlayerType.User, creature))
				{
					int l2 = i;
					floops.Add(delegate
					{
						Floop(l2);
					});
				}
			}
		}
		if (gs.IsLeaderAbilityReady(PlayerType.User))
		{
			leader = UseLeader;
		}
		int roll = rng.Next(100);
		bool tired = movesThisTurn >= 12;
		if (!tired && plays.Count > 0 && roll < 55)
		{
			movesThisTurn++;
			plays[rng.Next(plays.Count)]();
		}
		else if (!tired && floops.Count > 0 && roll < 80)
		{
			movesThisTurn++;
			floops[rng.Next(floops.Count)]();
		}
		else if (!tired && leader != null && roll < 88)
		{
			movesThisTurn++;
			leader();
		}
		else if (!tired && roll < 92 && (plays.Count > 0 || floops.Count > 0))
		{
			// Think a little longer.
			nextActionAt = Time.realtimeSinceStartup + Pause(1f, 3f);
		}
		else
		{
			EndTurn();
		}
		nextActionAt = Mathf.Max(nextActionAt, Time.realtimeSinceStartup + Pause(0.5f, 1.5f));
	}

	private void PlayCard(CardItem card, int lane)
	{
		foreach (CWTBDragToMove drag in UnityEngine.Object.FindObjectsOfType<CWTBDragToMove>())
		{
			if (drag.RobotPlay(card, lane))
			{
				Say("play " + card.Form.ID + " to lane " + lane);
				return;
			}
		}
		Say("couldn't find " + card.Form.ID + " in the hand");
	}

	private void Floop(int lane)
	{
		GameState gs = GameState.Instance;
		CreatureScript creature = gs.GetCreature(PlayerType.User, lane);
		CWFloopActionManager floops = CWFloopActionManager.GetInstance();
		CreatureManagerScript creatures = CreatureManagerScript.GetInstance();
		GameObject model = creatures.Instances[(int)PlayerType.User, lane, (int)CardType.Creature];
		if (creature == null || model == null)
		{
			return;
		}
		Say("floop " + creature.Data.Form.ID + " in lane " + lane);
		floops.player = PlayerType.User;
		floops.lane = lane;
		floops.card = creature.Data;
		floops.anim = model.GetComponent<Animation>();
		floops.StartCoroutine(floops.PlayFloopAction());
	}

	private void UseLeader()
	{
		foreach (CWTriggerLeaderAbility button in Resources.FindObjectsOfTypeAll<CWTriggerLeaderAbility>())
		{
			if (button.gameObject.scene.name != "BattleScene")
			{
				continue;
			}
			Say("hero ability");
			MethodInfo click = typeof(CWTriggerLeaderAbility).GetMethod("OnClick", BindingFlags.Instance | BindingFlags.NonPublic);
			click.Invoke(button, null);
			return;
		}
	}

	private void EndTurn()
	{
		CWP1SetupBranch branch = UnityEngine.Object.FindObjectOfType<CWP1SetupBranch>();
		if (branch == null)
		{
			Say("no end-turn button");
			return;
		}
		Say("end turn");
		branch.Advance();
	}

	// ---- Picks ----

	private void PickLane(GameState gs, CardScript listener)
	{
		PlayerType side = gs.CurrentSelectionSide;
		List<int> lanes = new List<int>();
		for (int i = 0; i < 4; i++)
		{
			if (listener.SelectionFilter(gs.GetLane(side, i)))
			{
				lanes.Add(i);
			}
		}
		if (lanes.Count == 0)
		{
			Say("nothing to target for " + listener.Data.Form.ID);
			return;
		}
		int pick = lanes[rng.Next(lanes.Count)];
		Say("target " + side + " lane " + pick + " for " + listener.Data.Form.ID);
		gs.SelectTarget(pick);
	}

	private void PickFromDiscard()
	{
		CardScript script = VersusMatch.LocalCardPick;
		List<CWDiscardCard> choices = new List<CWDiscardCard>();
		foreach (CWDiscardCard card in UnityEngine.Object.FindObjectsOfType<CWDiscardCard>())
		{
			if (card.filterScript == script && card.card != null && script.CardFilter(card.card))
			{
				choices.Add(card);
			}
		}
		if (choices.Count == 0)
		{
			Say("no discard card to pick for " + script.Data.Form.ID);
			nextActionAt = Time.realtimeSinceStartup + 2f;
			return;
		}
		CWDiscardCard choice = choices[rng.Next(choices.Count)];
		Say("pick " + choice.card.Form.ID + " from the discard pile for " + script.Data.Form.ID);
		choice.OnClick();
	}

	// ---- After the battle ----

	private void ResultStep(float now)
	{
		if (resultClickAt == 0f)
		{
			resultClickAt = now + 6f / speed;
			return;
		}
		if (now < resultClickAt)
		{
			return;
		}
		resultClickAt = now + 4f / speed;
		if (ClickActive<CWResultOK>() || ClickActive<ResultsScreenButtonScript>() || ClickActive<CWPlayerLose>())
		{
			return;
		}
		Say("no result button to press yet");
	}

	private bool ClickActive<T>() where T : MonoBehaviour
	{
		foreach (T button in UnityEngine.Object.FindObjectsOfType<T>())
		{
			Collider collider = button.GetComponent<Collider>();
			if (collider != null && !collider.enabled)
			{
				continue;
			}
			CWResultOK ok = button as CWResultOK;
			if (ok != null && ok.GoToBuildDeck)
			{
				continue;
			}
			Say("press " + button.gameObject.name);
			button.SendMessage("OnClick", SendMessageOptions.DontRequireReceiver);
			return true;
		}
		return false;
	}

	private static readonly string[] Heroes = new string[21]
	{
		"Leader_Finn", "Leader_Jake", "Leader_PrincessBubblegum", "Leader_Marceline", "Leader_BMO", "Leader_Lumpy", "Leader_Earl", "Leader_IceKing", "Leader_LadyRainicorn", "Leader_Ricardio",
		"Leader_Hunson", "Leader_Gunter", "Leader_DrDonut", "Leader_FlamePrincess", "Leader_Ash", "Leader_MagicMan", "Leader_PeppermintButler", "Leader_BananaGuard", "Leader_CinnamonBun", "Leader_Fionna",
		"Leader_Cake"
	};

	// A random hero and 30 random cards from two landscapes, so matches run through many different card abilities.
	private Deck RandomDeck()
	{
		Faction[] factions = new Faction[5]
		{
			Faction.Corn,
			Faction.Plains,
			Faction.Swamp,
			Faction.Cotton,
			Faction.Sand
		};
		Faction a = factions[rng.Next(factions.Length)];
		Faction b = factions[rng.Next(factions.Length)];
		List<CardForm> pool = new List<CardForm>();
		foreach (CardForm form in CardDataManager.Instance.GetCards())
		{
			if ((form.Type == CardType.Creature || form.Type == CardType.Spell || form.Type == CardType.Building) && (form.Faction == a || form.Faction == b || form.Faction == Faction.Universal))
			{
				pool.Add(form);
			}
		}
		Deck deck = new Deck();
		deck.Name = "Robot_Deck";
		string hero = Heroes[rng.Next(Heroes.Length)];
		deck.Leader = LeaderManager.Instance.CreateLeader(hero, 1 + rng.Next(5));
		List<string> ids = new List<string>();
		for (int i = 0; i < 30 && pool.Count > 0; i++)
		{
			CardForm pick = pool[rng.Next(pool.Count)];
			deck.AddCard(new CardItem(pick, 1 + rng.Next(3)));
			ids.Add(pick.ID);
		}
		deck.AddLandscape((LandscapeType)a);
		deck.AddLandscape((LandscapeType)a);
		deck.AddLandscape((LandscapeType)b);
		deck.AddLandscape((LandscapeType)b);
		Say("random deck: " + hero + ", " + a + "/" + b + ": " + string.Join(" ", ids.ToArray()));
		return deck;
	}

	private void Shuffle<T>(List<T> list)
	{
		for (int i = list.Count - 1; i > 0; i--)
		{
			int j = rng.Next(i + 1);
			T t = list[i];
			list[i] = list[j];
			list[j] = t;
		}
	}
}
