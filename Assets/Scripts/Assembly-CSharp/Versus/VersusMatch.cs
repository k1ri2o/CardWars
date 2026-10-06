using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

// A live 1v1 match against a friend. The friend sits in the opponent's seat: on each
// computer the local player is PlayerType.User and the friend is PlayerType.Opponent.
// Both computers run the whole battle themselves; only the players' choices (cards
// played, floops, targets, ring taps, end of turn) travel over the network, and every
// random draw comes from VersusRandom, so both battles stay identical.
public static class VersusMatch
{
	public const int ProtocolVersion = 1;

	// How long both computers wait, once everything has settled, before replaying the
	// friend's next move. The local player can't act faster than this anyway.
	public const float SettleSeconds = 0.4f;

	// A creature stuck "dying" this long is ignored, so a rare stuck death can't freeze the match.
	private const float StuckDeathSeconds = 6f;

	// How long a pick may wait behind a different message from the friend before it is dropped.
	private const float StrayPickSeconds = 5f;

	private static float pickMismatchSince = -1f;

	// How long a match decided by surrender or a lost friend may take to reach the result screen.
	private const float ForcedEndSeconds = 4f;

	// A card effect that hasn't moved on for this long is ignored, so a stuck effect can't freeze the match.
	private const float StuckEffectSeconds = 12f;

	// Card effects (rare-card pauses, spell and floop sequences) still running, per player.
	private static readonly int[] effects = new int[2];

	private static readonly float[] effectsChanged = new float[2];

	// When the local player's side last became calm enough for a new move (-1 = not calm).
	private static float localCalmSince = -1f;

	// True from launching a match until the battle scene is left.
	public static bool Active;

	public static bool IsHost;

	// Host is seat 0, guest is seat 1.
	public static int MySeat;

	public static int FirstSeat;

	public static uint Seed;

	public static string QuestId;

	public static string MyName = "Player";

	public static string PeerName = "Friend";

	// The match has a result: game over, surrender or forfeit.
	public static bool Over;

	public static bool PeerSurrendered;

	public static bool LocalSurrendered;

	// Out-of-sync detection: set when the two battles disagree.
	public static bool Desynced;

	public static string DesyncInfo = string.Empty;

	// Crit for the lane being fought right now, agreed by both players.
	public static bool LaneCrit;

	public static float LaneCritModifier = 2f;

	// The friend's card is waiting for them to pick a lane or a discard-pile card.
	public static CardScript PendingLanePick;

	public static CardScript PendingCardPick;

	// The local player's own discard-pile pick is open.
	public static CardScript LocalCardPick;

	// The friend's landscapes, in lane order, once they pressed Ready.
	public static LandscapeType[] PeerLandscapes;

	public static bool LocalLandscapesSent;

	// The local player started a floop whose effect hasn't begun yet.
	public static bool LocalFloopPending;

	// Seat of the winner as decided on this computer and on the friend's (-1 = not yet).
	public static int LocalWinnerSeat = -1;

	public static int PeerWinnerSeat = -1;

	// The result screen is up (or on its way).
	public static bool ResultShown;

	// The friend turned the start down, so this match ends without a result.
	public static bool NoContest;

	private static float forcedAt = -1f;

	private static readonly Queue<string[]> moves = new Queue<string[]>();

	private static readonly Dictionary<string, string> rings = new Dictionary<string, string>();

	private static readonly Dictionary<int, string> mySums = new Dictionary<int, string>();

	private static readonly Dictionary<int, string> peerSums = new Dictionary<int, string>();

	private static readonly uint[] rngHash = new uint[2];

	private static readonly int[] rngCount = new int[2];

	// Ring area bonuses from the friend's cards, kept apart from the local player's
	// (GameState holds the local player's, which shape the ring shown on this computer).
	private static readonly float[] peerAreaMods = new float[4];

	private static float deathsSince = -1f;

	public const int AreaHit = 0;

	public const int AreaCrit = 1;

	public const int AreaDefense = 2;

	public const int AreaDefenseCrit = 3;

	public static int SeatOf(PlayerType player)
	{
		return (player == PlayerType.User) ? MySeat : (1 - MySeat);
	}

	public static PlayerType PlayerOfSeat(int seat)
	{
		return (seat == MySeat) ? PlayerType.User : PlayerType.Opponent;
	}

	// The friend's side of the board.
	public static bool IsRemote(PlayerType player)
	{
		return Active && player == PlayerType.Opponent;
	}

	// A person makes this side's choices (the local player, or the friend over the network).
	public static bool IsHumanControlled(PlayerType player)
	{
		return player == PlayerType.User || (Active && player == PlayerType.Opponent);
	}

	// The computer opponent makes this side's choices.
	public static bool IsAI(PlayerType player)
	{
		return !Active && player == PlayerType.Opponent;
	}

	public static void NoteRandom(int seat, uint value)
	{
		rngHash[seat] = (rngHash[seat] ^ value) * 16777619u;
		rngCount[seat]++;
	}

	// Called right before the battle is launched, on both computers.
	public static void BeginMatch(bool isHost, uint seed, string questId, int firstSeat)
	{
		Active = true;
		IsHost = isHost;
		MySeat = (!isHost) ? 1 : 0;
		Seed = seed;
		QuestId = questId;
		FirstSeat = firstSeat;
		Over = false;
		PeerSurrendered = false;
		LocalSurrendered = false;
		Desynced = false;
		DesyncInfo = string.Empty;
		LaneCrit = false;
		PendingLanePick = null;
		PendingCardPick = null;
		LocalCardPick = null;
		PeerLandscapes = null;
		LocalLandscapesSent = false;
		LocalFloopPending = false;
		VersusBanner.Text = null;
		LocalWinnerSeat = -1;
		PeerWinnerSeat = -1;
		ResultShown = false;
		NoContest = false;
		forcedAt = -1f;
		moves.Clear();
		rings.Clear();
		mySums.Clear();
		peerSums.Clear();
		for (int i = 0; i < 2; i++)
		{
			rngHash[i] = 2166136261u;
			rngCount[i] = 0;
		}
		for (int j = 0; j < peerAreaMods.Length; j++)
		{
			peerAreaMods[j] = 0f;
		}
		deathsSince = -1f;
		for (int k = 0; k < 2; k++)
		{
			effects[k] = 0;
			effectsChanged[k] = 0f;
		}
		localCalmSince = -1f;
		VersusRandom.Seed(seed);
		Log("match begins: seat " + MySeat + ", seed " + seed + ", quest " + questId + ", first seat " + firstSeat);
	}

	// Called when the battle scene is left.
	public static void EndMatch()
	{
		if (Active)
		{
			Log("match ends");
		}
		Active = false;
		VersusBanner.Text = null;
		PendingLanePick = null;
		PendingCardPick = null;
		LocalCardPick = null;
		moves.Clear();
	}

	public static void Log(string message)
	{
		UnityEngine.Debug.Log("[Versus] " + message);
	}

	public static void Send(params object[] parts)
	{
		VersusSession session = VersusSession.Instance;
		if (session == null)
		{
			Log("no connection; dropped " + parts[0]);
			return;
		}
		session.Send(VersusMessage.Join(parts));
		if (IsTurnMove(parts[0] as string))
		{
			// The next move has to wait until this one has fully played out.
			localCalmSince = -1f;
		}
	}

	// ---- Incoming messages ----

	// Battle messages from the friend, handed over by VersusSession in arrival order.
	public static void Receive(string[] m)
	{
		switch (m[0])
		{
		case "play":
		case "spell":
		case "floop":
		case "leader":
		case "end":
		case "target":
		case "pick":
			moves.Enqueue(m);
			break;
		case "ring":
			if (m.Length >= 4)
			{
				rings[m[1] + ":" + m[2]] = m[3];
			}
			break;
		case "sum":
			if (m.Length >= 3)
			{
				int turn = VersusMessage.Int(m[1]);
				peerSums[turn] = m[2];
				CompareSums(turn);
			}
			break;
		case "lands":
			if (m.Length >= 5)
			{
				LandscapeType[] lands = new LandscapeType[4];
				for (int i = 0; i < 4; i++)
				{
					lands[i] = VersusMessage.Landscape(m[i + 1]);
				}
				PeerLandscapes = lands;
				Log("friend's landscapes arrived");
			}
			break;
		case "surrender":
			Log("friend surrendered");
			PeerSurrendered = true;
			FinishWithWinner(PlayerType.User);
			break;
		case "over":
			if (m.Length >= 2)
			{
				PeerWinnerSeat = VersusMessage.Int(m[1]);
				Log("friend's game ended: seat " + PeerWinnerSeat + " won");
				if (LocalWinnerSeat >= 0 && LocalWinnerSeat != PeerWinnerSeat)
				{
					ReportDesync("the two games disagree on who won");
				}
			}
			break;
		}
	}

	// The battle reached its result here: tell the friend's game, which may still be playing it out.
	public static void LocalResult(bool localWins)
	{
		if (LocalWinnerSeat >= 0)
		{
			return;
		}
		LocalWinnerSeat = localWins ? MySeat : (1 - MySeat);
		Send("over", LocalWinnerSeat);
		if (PeerWinnerSeat >= 0 && PeerWinnerSeat != LocalWinnerSeat)
		{
			ReportDesync("the two games disagree on who won");
		}
	}

	// The friend left. If their game had already reached the result, this one ends the same way;
	// otherwise they forfeit.
	// The friend never joined this match: leave it without a result.
	public static void CancelMatch(string why)
	{
		if (Over)
		{
			return;
		}
		Log(why + "; no result");
		NoContest = true;
		FinishWithWinner(PlayerType.User);
	}

	public static void PeerLeft(string why)
	{
		if (Over)
		{
			return;
		}
		if (PeerWinnerSeat >= 0)
		{
			Log(why + " after the match ended; finishing it the same way here");
			FinishWithWinner(PlayerOfSeat(PeerWinnerSeat));
			return;
		}
		Log(why + "; the match is yours");
		FinishWithWinner(PlayerType.User);
	}

	public static string[] PeekMove()
	{
		return (moves.Count <= 0) ? null : moves.Peek();
	}

	public static string[] TakeMove()
	{
		return (moves.Count <= 0) ? null : moves.Dequeue();
	}

	public static bool IsTurnMove(string kind)
	{
		return kind == "play" || kind == "spell" || kind == "floop" || kind == "leader" || kind == "end";
	}

	// Hands a waiting pick message to the friend's card that asked for it. Runs every frame.
	public static void DeliverPicks()
	{
		if (!Active || moves.Count <= 0)
		{
			pickMismatchSince = -1f;
			return;
		}
		string[] m = moves.Peek();
		bool waiting = PendingLanePick != null || PendingCardPick != null;
		bool matches = (m[0] == "target" && PendingLanePick != null) || (m[0] == "pick" && PendingCardPick != null);
		if (!waiting || matches)
		{
			pickMismatchSince = -1f;
		}
		else if (pickMismatchSince < 0f)
		{
			pickMismatchSince = Time.realtimeSinceStartup;
		}
		else if (Time.realtimeSinceStartup - pickMismatchSince > StrayPickSeconds)
		{
			// The friend's game moved on without the pick this game is waiting for: the games disagree.
			// Give up on the pick so the match can at least be finished.
			pickMismatchSince = -1f;
			ReportDesync("waiting for a pick but the friend sent " + m[0]);
			if (PendingLanePick != null)
			{
				CardScript lanePick = PendingLanePick;
				PendingLanePick = null;
				lanePick.CancelFloop();
				// Nothing will finish the friend's move now, so resume their turn as a finished effect would.
				CWOpponentActionSequencer sequencer = CWOpponentActionSequencer.GetInstance();
				if (sequencer != null)
				{
					sequencer.resumeFlag = true;
				}
				BattlePhaseManager phaseMgr = BattlePhaseManager.GetInstance();
				if (phaseMgr != null)
				{
					phaseMgr.Phase = (!IsMyTurn()) ? BattlePhase.P2Setup : BattlePhase.P1Setup;
				}
				UICamera.useInputEnabler = false;
			}
			if (PendingCardPick != null)
			{
				CardScript cardPick = PendingCardPick;
				PendingCardPick = null;
				cardPick.CloseDiscardPile();
			}
			VersusBanner.Text = null;
			return;
		}
		if (m[0] == "target" && PendingLanePick != null)
		{
			moves.Dequeue();
			PendingLanePick = null;
			int idx = VersusMessage.Int(m[1]);
			Log("friend picked lane " + idx);
			GameState.Instance.SelectTargetFromPeer(idx);
		}
		else if (m[0] == "pick" && PendingCardPick != null)
		{
			moves.Dequeue();
			CardScript script = PendingCardPick;
			PendingCardPick = null;
			List<CardItem> pile = GameState.Instance.GetDiscardPile(script.Owner);
			int idx2 = VersusMessage.Int(m[1]);
			CardItem card = (idx2 < 0 || idx2 >= pile.Count) ? null : pile[idx2];
			if (card == null || card.Form.ID != m[2])
			{
				ReportDesync("discard pick " + m[2] + " at " + idx2 + " not found");
				card = pile.Find((CardItem c) => c.Form.ID == m[2]);
			}
			if (card != null)
			{
				Log("friend picked " + card.Form.ID + " from the discard pile");
				script.CardSelection(card);
			}
		}
	}

	// The friend's game is evidently past this lane: it fought a later lane, or its next turn has begun.
	public static bool PeerMovedPast(int turn, int lane)
	{
		foreach (string[] move in moves)
		{
			if (IsTurnMove(move[0]))
			{
				return true;
			}
		}
		foreach (int sumTurn in peerSums.Keys)
		{
			if (sumTurn > turn)
			{
				return true;
			}
		}
		for (int later = lane + 1; later < 4; later++)
		{
			if (rings.ContainsKey(turn + ":" + later))
			{
				return true;
			}
		}
		return false;
	}

	public static bool TryTakeRing(int turn, int lane, out string result)
	{
		string key = turn + ":" + lane;
		if (rings.TryGetValue(key, out result))
		{
			rings.Remove(key);
			return true;
		}
		return false;
	}

	// ---- Settling: both computers apply moves only when the board is still ----

	public static bool DeathsPending()
	{
		GameState gs = GameState.Instance;
		bool pending = false;
		for (int p = 0; p < 2; p++)
		{
			for (int i = 0; i < 4; i++)
			{
				if (gs.LaneHasCreature(p, i))
				{
					CreatureScript creature = gs.GetCreature(p, i);
					if (creature.MarkedForDeath || creature.Health <= 0)
					{
						pending = true;
					}
				}
			}
		}
		if (!pending)
		{
			deathsSince = -1f;
			return false;
		}
		// Game time, so a paused game (menu, ring) doesn't count toward giving up on a death.
		if (deathsSince < 0f)
		{
			deathsSince = Time.time;
		}
		if (Time.time - deathsSince > StuckDeathSeconds)
		{
			return false;
		}
		return true;
	}

	// Nothing is still happening for this player: no summon, death, pick or floop in progress.
	public static bool IsQuiet(PlayerType mover)
	{
		GameState gs = GameState.Instance;
		if (gs.IsSummoning(mover) || gs.IsFlooping(mover))
		{
			return false;
		}
		if (PendingLanePick != null || PendingCardPick != null || LocalCardPick != null)
		{
			return false;
		}
		if (mover == PlayerType.User && LocalFloopPending)
		{
			return false;
		}
		if (EffectsRunning(mover))
		{
			return false;
		}
		return !DeathsPending();
	}

	// Runs a card effect coroutine, counting it as running for its owner until it ends, so the
	// next move waits for it (some cards start two effects, and each ends by setting the phase).
	public static IEnumerator Track(PlayerType owner, IEnumerator effect)
	{
		EffectStarted(owner);
		try
		{
			while (effect.MoveNext())
			{
				yield return effect.Current;
			}
		}
		finally
		{
			EffectEnded(owner);
		}
	}

	private static void EffectStarted(PlayerType owner)
	{
		if (Active)
		{
			effects[(int)owner]++;
			effectsChanged[(int)owner] = Time.time;
		}
	}

	private static void EffectEnded(PlayerType owner)
	{
		if (Active && effects[(int)owner] > 0)
		{
			effects[(int)owner]--;
			effectsChanged[(int)owner] = Time.time;
		}
	}

	public static bool EffectsRunning(PlayerType owner)
	{
		if (effects[(int)owner] <= 0)
		{
			return false;
		}
		// Game time, so a paused game doesn't count toward giving up on an effect.
		if (Time.time - effectsChanged[(int)owner] > StuckEffectSeconds)
		{
			return false;
		}
		return true;
	}

	public static int EffectCount(PlayerType owner)
	{
		return effects[(int)owner];
	}

	// Called every frame during a match: tracks how long the local side has been calm.
	public static void Tick()
	{
		if (!LocalCalmNow())
		{
			localCalmSince = -1f;
		}
		else if (localCalmSince < 0f)
		{
			localCalmSince = Time.realtimeSinceStartup;
		}
	}

	// Turn 1 belongs to the player who goes first, turn 2 to the other, and so on.
	public static bool IsMyTurn()
	{
		GameDataScript gameData = GameDataScript.GetInstance();
		if (gameData == null)
		{
			return false;
		}
		bool firstPlayersTurn = gameData.Turn % 2 == 1;
		return firstPlayersTurn == (FirstSeat == MySeat);
	}

	private static bool LocalCalmNow()
	{
		if (!Active || Over || !IsMyTurn())
		{
			return false;
		}
		BattlePhaseManager phaseMgr = BattlePhaseManager.GetInstance();
		if (phaseMgr == null || phaseMgr.Phase != BattlePhase.P1Setup)
		{
			return false;
		}
		CWPlayerHandsController hands = CWPlayerHandsController.GetInstance();
		if (hands != null && hands.spinStart)
		{
			return false;
		}
		return IsQuiet(PlayerType.User);
	}

	// Whether the local player may start a new move now.
	public static bool LocalInputAllowed()
	{
		if (!Active)
		{
			return true;
		}
		if (!LocalCalmNow())
		{
			return false;
		}
		// Everything has looked settled for a moment, so a brief gap between two steps of
		// the previous move isn't taken for its end.
		return localCalmSince >= 0f && Time.realtimeSinceStartup - localCalmSince >= SettleSeconds;
	}

	// ---- Ring area bonuses ----

	public static float GetAreaMod(PlayerType owner, int kind)
	{
		if (IsRemote(owner))
		{
			return peerAreaMods[kind];
		}
		GameState gs = GameState.Instance;
		switch (kind)
		{
		case AreaHit:
			return gs.HitAreaModifier;
		case AreaCrit:
			return gs.CritAreaModifier;
		case AreaDefense:
			return gs.DefenseAreaModifier;
		default:
			return gs.DefenseAreaCritModifier;
		}
	}

	public static void SetAreaMod(PlayerType owner, int kind, float value)
	{
		if (IsRemote(owner))
		{
			peerAreaMods[kind] = value;
			return;
		}
		GameState gs = GameState.Instance;
		switch (kind)
		{
		case AreaHit:
			gs.HitAreaModifier = value;
			break;
		case AreaCrit:
			gs.CritAreaModifier = value;
			break;
		case AreaDefense:
			gs.DefenseAreaModifier = value;
			break;
		default:
			gs.DefenseAreaCritModifier = value;
			break;
		}
	}

	// The friend's attack bonuses end after their attack, their defense bonuses after they defend.
	public static void ClearPeerAttackAreas()
	{
		peerAreaMods[AreaHit] = 0f;
		peerAreaMods[AreaCrit] = 0f;
	}

	public static void ClearPeerDefenseAreas()
	{
		peerAreaMods[AreaDefense] = 0f;
		peerAreaMods[AreaDefenseCrit] = 0f;
	}

	// ---- Battle ring for two ----

	public const string None = "none";

	public const string Normal = "normal";

	public const string Crit = "crit";

	public const string Blocked = "blocked";

	public const string Counter = "counter";

	// Both players tap their ring. A defender's block or counter beats the attack;
	// otherwise the attacker's tap decides (Hit = damage, Crit = double, Miss = nothing).
	public static string CombineRings(string attacker, string defender, bool defended, bool noAttack)
	{
		if (noAttack)
		{
			return None;
		}
		if (defended)
		{
			if (defender == "Crit")
			{
				return Counter;
			}
			if (defender == "Hit")
			{
				return Blocked;
			}
		}
		if (attacker == "Hit")
		{
			return Normal;
		}
		if (attacker == "Crit")
		{
			return Crit;
		}
		return None;
	}

	// ---- End of game ----

	// Ends the match for a reason other than a hero reaching 0 (surrender or a lost friend).
	public static void FinishWithWinner(PlayerType winner)
	{
		if (Over)
		{
			return;
		}
		Over = true;
		forcedAt = Time.realtimeSinceStartup;
		GameState gs = GameState.Instance;
		PlayerType loser = !winner;
		gs.SetHealth(loser, 0);
		GameDataScript gameData = GameDataScript.GetInstance();
		if (gameData != null)
		{
			gameData.UpdateText();
			gameData.Timer = 1f;
		}
	}

	// FinishWithWinner normally ends the battle within a second. If the battle is stuck somewhere
	// the regular game-over check doesn't look (a friend's pick that will never come, a banner),
	// go to the result screen anyway. Runs every frame.
	public static void WatchForcedEnd()
	{
		if (!Active || forcedAt < 0f || ResultShown || PauseMenu.pauseMenuShown)
		{
			return;
		}
		if (Time.realtimeSinceStartup - forcedAt < ForcedEndSeconds)
		{
			return;
		}
		GameDataScript gameData = GameDataScript.GetInstance();
		if (gameData == null)
		{
			return;
		}
		Log("battle didn't reach the result by itself; showing it now");
		PendingLanePick = null;
		PendingCardPick = null;
		VersusBanner.Text = null;
		gameData.ForceEndGame();
	}

	// Both heroes fell together: more health left wins; an exact tie goes to whoever played second.
	public static bool LocalWinsTie()
	{
		GameState gs = GameState.Instance;
		int mine = gs.GetHealth(PlayerType.User);
		int theirs = gs.GetHealth(PlayerType.Opponent);
		if (mine != theirs)
		{
			return mine > theirs;
		}
		return MySeat != FirstSeat;
	}

	// ---- Desync detection ----

	public static void TurnFinished(int turn)
	{
		string sum = StateChecksum();
		mySums[turn] = sum;
		Send("sum", turn, sum);
		Log("turn " + turn + " ended, state " + sum);
		CompareSums(turn);
	}

	private static void CompareSums(int turn)
	{
		string mine;
		string theirs;
		if (mySums.TryGetValue(turn, out mine) && peerSums.TryGetValue(turn, out theirs))
		{
			if (mine != theirs)
			{
				ReportDesync("turn " + turn + ": " + mine + " vs " + theirs + " :: " + StateText());
			}
			mySums.Remove(turn);
			peerSums.Remove(turn);
		}
	}

	public static void ReportDesync(string info)
	{
		if (!Desynced)
		{
			Desynced = true;
			DesyncInfo = info;
		}
		UnityEngine.Debug.LogWarning("[Versus] OUT OF SYNC: " + info);
	}

	public static string StateChecksum()
	{
		string text = StateText();
		uint h = 2166136261u;
		for (int i = 0; i < text.Length; i++)
		{
			h = (h ^ text[i]) * 16777619u;
		}
		return h.ToString("x8");
	}

	// Everything that matters for the rest of the match, listed in seat order.
	public static string StateText()
	{
		GameState gs = GameState.Instance;
		StringBuilder sb = new StringBuilder();
		sb.Append("mp").Append(gs.CurrentMagicPoints);
		for (int seat = 0; seat < 2; seat++)
		{
			PlayerType p = PlayerOfSeat(seat);
			sb.Append(" | seat").Append(seat);
			sb.Append(" hp").Append(gs.GetHealth(p));
			sb.Append(" ap").Append(gs.GetMagicPoints(p));
			sb.Append(" cd").Append(gs.GetLeaderCooldown(p));
			sb.Append(" hand[");
			AppendCards(sb, gs.GetHand(p));
			sb.Append("] deck[");
			AppendCards(sb, gs.GetDeck(p).GetCards());
			sb.Append("] discard[");
			AppendCards(sb, gs.GetDiscardPile(p));
			sb.Append("] lanes[");
			for (int i = 0; i < 4; i++)
			{
				Lane lane = gs.GetLane(p, i);
				sb.Append((int)lane.Type);
				for (int k = 0; k < 2; k++)
				{
					CardScript script = lane.Scripts[k];
					if (script == null)
					{
						sb.Append("-");
						continue;
					}
					sb.Append(script.Data.Form.ID);
					CreatureScript creature = script as CreatureScript;
					if (creature != null)
					{
						sb.Append("/").Append(creature.ATK).Append("/").Append(creature.Health);
					}
					if (script.Flooped)
					{
						sb.Append("*");
					}
				}
				sb.Append(";");
			}
			sb.Append("] rng").Append(rngCount[seat]).Append(":").Append(rngHash[seat].ToString("x8"));
		}
		return sb.ToString();
	}

	private static void AppendCards(StringBuilder sb, List<CardItem> cards)
	{
		for (int i = 0; i < cards.Count; i++)
		{
			if (i > 0)
			{
				sb.Append(",");
			}
			sb.Append(cards[i].Form.ID);
		}
	}
}
