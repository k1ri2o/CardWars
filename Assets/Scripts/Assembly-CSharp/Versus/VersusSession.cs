using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

// The connection to the friend's game and the "Play a Friend" lobby. Lives across scenes.
// One player hosts and gets a room code; the other joins with that code (through free
// internet relays) or with the host's address (direct connection on the same network).
// Both send their deck in a "hello"; the host then picks the arena, the first player and
// the random seed, and both games launch the same battle.
public class VersusSession : MonoBehaviour
{
	private enum Stage
	{
		Menu,
		Hosting,
		Joining,
		InMatch,
		AfterMatch
	}

	private class Hello
	{
		public int Protocol;

		public string Content;

		public string Name;

		public string LeaderId;

		public int LeaderRank;

		public string Cards;

		public string Lands;

		public string[] ToMessage()
		{
			return new string[8]
			{
				"hello",
				Protocol.ToString(),
				Content,
				Name,
				LeaderId,
				LeaderRank.ToString(),
				Cards,
				Lands
			};
		}

		public static Hello FromMessage(string[] m)
		{
			if (m.Length < 8)
			{
				return null;
			}
			Hello h = new Hello();
			h.Protocol = VersusMessage.Int(m[1]);
			h.Content = m[2];
			h.Name = m[3];
			h.LeaderId = m[4];
			h.LeaderRank = VersusMessage.Int(m[5]);
			h.Cards = m[6];
			h.Lands = m[7];
			return h;
		}
	}

	private const string ChannelRoom = "cw1";

	// After this long without hearing from the friend during a match, the match is theirs to lose.
	private const float ForfeitSeconds = 120f;

	private const string CodeLetters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

	private static readonly string[] ContentFiles = new string[8] { "db_Creatures.json", "db_Spells.json", "db_Buildings.json", "db_Leaders.json", "db_RPS.json", "db_Parameters.json", "db_Quest.json", "db_LvUpScheme.json" };

	private VersusLink link;

	private VersusChannel channel;

	private Stage stage = Stage.Menu;

	private bool lobbyOpen;

	private bool connected;

	private string roomCode = string.Empty;

	private string joinText = string.Empty;

	private string nameText = string.Empty;

	private string message = string.Empty;

	private string error = string.Empty;

	private Hello myHello;

	private Hello peerHello;

	private bool iAmReady;

	private bool peerReady;

	private int matchesPlayed;

	private string lastResult = string.Empty;

	private float lostSince = -1f;

	private Action deckWarsFallback;

	private bool savedStopTutorial;

	private bool savedGlobalStopTutorial;

	private bool savedInputEnabler;

	private bool inputBlocked;

	private GUIStyle titleStyle;

	private GUIStyle textStyle;

	private GUIStyle smallStyle;

	private GUIStyle buttonStyle;

	private GUIStyle fieldStyle;

	private GUIStyle bannerStyle;

	private Texture2D panelTexture;

	private static string contentHash;

	public static VersusSession Instance { get; private set; }

	// A deck the test robot plays instead of the selected one (see VersusRobot).
	public static Deck RobotDeck;

	public bool IsConnected
	{
		get
		{
			return connected;
		}
	}

	public bool PeerLost
	{
		get
		{
			return channel != null && channel.PeerLost;
		}
	}

	public string PeerName
	{
		get
		{
			return (peerHello == null) ? "your friend" : peerHello.Name;
		}
	}

	public static VersusSession Ensure()
	{
		if (Instance == null)
		{
			GameObject go = new GameObject("VersusSession");
			UnityEngine.Object.DontDestroyOnLoad(go);
			go.AddComponent<AudioSource>();
			Instance = go.AddComponent<VersusSession>();
		}
		return Instance;
	}

	// Opened from the "Deck Wars" button on the battle menu.
	public static void OpenLobby(Action deckWars)
	{
		VersusSession session = Ensure();
		session.deckWarsFallback = deckWars;
		session.lobbyOpen = true;
		session.error = string.Empty;
		if (string.IsNullOrEmpty(session.nameText))
		{
			session.nameText = DefaultName();
		}
	}

	private void Awake()
	{
		SceneManager.sceneLoaded += OnSceneLoaded;
	}

	private void OnDestroy()
	{
		SceneManager.sceneLoaded -= OnSceneLoaded;
		Disconnect(false);
		if (Instance == this)
		{
			Instance = null;
		}
	}

	private void OnApplicationQuit()
	{
		Disconnect(true);
	}

	public void Send(string payload)
	{
		if (channel != null)
		{
			channel.Send(payload);
		}
	}

	// ---- Test robot (see VersusRobot) ----

	public void RobotHost(string name, string code)
	{
		lobbyOpen = true;
		nameText = name;
		error = string.Empty;
		StartHosting(code);
		VersusMatch.Log("hosting room " + roomCode);
		SendHello();
	}

	public void RobotJoin(string name, string target)
	{
		lobbyOpen = true;
		nameText = name;
		error = string.Empty;
		joinText = target;
		StartJoining(target);
	}

	public bool RobotAfterMatch
	{
		get
		{
			return stage == Stage.AfterMatch;
		}
	}

	public bool RobotCanRematch
	{
		get
		{
			return channel != null && peerHello != null && !iAmReady;
		}
	}

	public void RobotRematch()
	{
		lobbyOpen = true;
		error = string.Empty;
		SendHello();
	}

	// ---- Connecting ----

	private void StartHosting(string fixedCode)
	{
		Disconnect(true);
		roomCode = string.IsNullOrEmpty(fixedCode) ? NewRoomCode() : fixedCode.ToUpper(System.Globalization.CultureInfo.InvariantCulture);
		List<VersusLink> links = new List<VersusLink>();
		try
		{
			links.Add(TcpVersusLink.Host(TcpVersusLink.DefaultPort));
		}
		catch (Exception ex)
		{
			VersusMatch.Log("direct hosting unavailable: " + ex.Message);
		}
		foreach (string broker in MqttVersusLink.Brokers)
		{
			links.Add(new MqttVersusLink(broker, MqttVersusLink.DefaultPort, roomCode, true));
		}
		Open(new MultiVersusLink(links), true);
		stage = Stage.Hosting;
		message = "Waiting for your friend to join...";
	}

	private void StartJoining(string target)
	{
		Disconnect(true);
		target = target.Trim();
		if (target.Length == 0)
		{
			error = "Type the room code your friend sees.";
			return;
		}
		VersusLink newLink;
		if (target.IndexOf('.') >= 0 || target.IndexOf(':') >= 0)
		{
			string host = target;
			int port = TcpVersusLink.DefaultPort;
			int colon = target.LastIndexOf(':');
			if (colon > 0)
			{
				host = target.Substring(0, colon);
				int parsed = VersusMessage.Int(target.Substring(colon + 1));
				if (parsed > 0)
				{
					port = parsed;
				}
			}
			newLink = TcpVersusLink.Join(host, port);
			roomCode = string.Empty;
		}
		else
		{
			roomCode = target.ToUpper(System.Globalization.CultureInfo.InvariantCulture);
			List<VersusLink> links = new List<VersusLink>();
			foreach (string broker in MqttVersusLink.Brokers)
			{
				links.Add(new MqttVersusLink(broker, MqttVersusLink.DefaultPort, roomCode, false));
			}
			newLink = new MultiVersusLink(links);
		}
		Open(newLink, false);
		stage = Stage.Joining;
		message = "Connecting...";
		SendHello();
	}

	private void Open(VersusLink newLink, bool host)
	{
		link = newLink;
		channel = new VersusChannel(link, ChannelRoom);
		VersusMatch.IsHost = host;
		connected = false;
		peerHello = null;
		peerReady = false;
		iAmReady = false;
		matchesPlayed = 0;
		lostSince = -1f;
		error = string.Empty;
	}

	private void Disconnect(bool sayBye)
	{
		if (channel != null)
		{
			if (sayBye && connected)
			{
				channel.Send("bye");
				channel.Pump(Time.realtimeSinceStartup);
			}
			channel.Close();
		}
		channel = null;
		link = null;
		connected = false;
		peerHello = null;
		peerReady = false;
		iAmReady = false;
	}

	private void SendHello()
	{
		myHello = BuildMyHello();
		if (myHello == null)
		{
			error = "Pick a deck with a hero before playing.";
			return;
		}
		iAmReady = true;
		Send(VersusMessage.Join(myHello.ToMessage()));
		TryStart();
	}

	// ---- Every frame ----

	private void Update()
	{
		if (inputBlocked != LobbyVisible())
		{
			BlockGameInput(LobbyVisible());
		}
		if (channel == null)
		{
			return;
		}
		float now = Time.realtimeSinceStartup;
		List<string> received = channel.Pump(now);
		if (channel.EverHeard && !connected)
		{
			connected = true;
			VersusMatch.Log("connected");
		}
		if (channel.PeerRestarted)
		{
			channel.ClearRestarted();
			OnPeerRestarted();
		}
		foreach (string payload in received)
		{
			Handle(VersusMessage.Split(payload));
		}
		if (VersusMatch.Active)
		{
			VersusMatch.Tick();
			VersusMatch.DeliverPicks();
			WatchConnection(now);
			VersusMatch.WatchForcedEnd();
		}
	}

	private void Handle(string[] m)
	{
		switch (m[0])
		{
		case "hello":
		{
			Hello h = Hello.FromMessage(m);
			if (h == null)
			{
				break;
			}
			peerHello = h;
			peerReady = true;
			VersusMatch.PeerName = h.Name;
			if (h.Protocol != VersusMatch.ProtocolVersion)
			{
				error = h.Name + " has a different version of the 1v1 mode. Both players need the same version.";
			}
			else if (h.Content != ContentHash())
			{
				error = h.Name + "'s card data is different from yours. Both players need the same game version.";
			}
			else
			{
				// A compatible hello (say, after the friend updated) clears an earlier version error.
				error = string.Empty;
				if (stage != Stage.InMatch)
				{
					message = h.Name + " is ready.";
				}
			}
			if (stage == Stage.Hosting && !iAmReady)
			{
				SendHello();
			}
			TryStart();
			break;
		}
		case "start":
			if (!VersusMatch.IsHost && m.Length >= 4 && peerHello != null && stage != Stage.InMatch)
			{
				if (iAmReady && LobbyVisible())
				{
					LaunchMatch(VersusMessage.UInt(m[1]), m[2], VersusMessage.Int(m[3]));
				}
				else
				{
					// Not on the lobby screen any more (changing deck): turn the start down.
					Send("unready");
				}
			}
			break;
		case "unready":
			peerReady = false;
			if (stage == Stage.InMatch && VersusMatch.Active)
			{
				// Only the lobby sends this, so the friend turned the start down (or cancelled
				// just as it went out): they never joined this match.
				VersusMatch.CancelMatch("friend backed out before the match started");
			}
			else
			{
				message = PeerName + " is changing their deck.";
			}
			break;
		case "bye":
			if (stage == Stage.InMatch && VersusMatch.Active)
			{
				if (VersusMatch.PeerLandscapes == null)
				{
					VersusMatch.CancelMatch("friend left before the match started");
				}
				else
				{
					VersusMatch.PeerLeft("friend left the match");
				}
			}
			message = PeerName + " left.";
			peerReady = false;
			peerHello = null;
			break;
		default:
			if (VersusMatch.Active)
			{
				VersusMatch.Receive(m);
			}
			break;
		}
	}

	// The host starts a match once both players have sent their decks.
	private void TryStart()
	{
		if (!VersusMatch.IsHost || !iAmReady || !peerReady || peerHello == null || myHello == null || stage == Stage.InMatch || error.Length > 0 || !LobbyVisible())
		{
			return;
		}
		if (peerHello.Protocol != VersusMatch.ProtocolVersion || peerHello.Content != ContentHash())
		{
			return;
		}
		System.Random rng = new System.Random();
		uint seed = (uint)rng.Next(1, int.MaxValue);
		List<QuestData> arenas = QuestManager.Instance.MPquests;
		string questId = (arenas != null && arenas.Count > 0) ? arenas[rng.Next(arenas.Count)].QuestID : "1001";
		int firstSeat = rng.Next(2);
		Send(VersusMessage.Join("start", seed, questId, firstSeat));
		LaunchMatch(seed, questId, firstSeat);
	}

	private void LaunchMatch(uint seed, string questId, int firstSeat)
	{
		Deck mine = BuildDeck(myHello);
		Deck theirs = BuildDeck(peerHello);
		if (mine == null || theirs == null)
		{
			error = "Couldn't build the decks for this match.";
			return;
		}
		VersusMatch.BeginMatch(VersusMatch.IsHost, seed, questId, firstSeat);
		VersusMatch.MyName = myHello.Name;
		VersusMatch.PeerName = peerHello.Name;
		GlobalFlags flags = GlobalFlags.Instance;
		savedGlobalStopTutorial = flags.stopTutorial;
		flags.InMPMode = true;
		flags.BattleResult = null;
		flags.ReturnToMainMenu = false;
		flags.ReturnToBuildDeck = false;
		DebugFlagsScript debugFlags = DebugFlagsScript.GetInstance();
		if (debugFlags != null)
		{
			savedStopTutorial = debugFlags.stopTutorial;
			debugFlags.stopTutorial = true;
		}
		stage = Stage.InMatch;
		iAmReady = false;
		peerReady = false;
		lobbyOpen = false;
		if (inputBlocked)
		{
			// Hand input back now, so the quest launcher's own input lock isn't undone next frame.
			BlockGameInput(false);
		}
		error = string.Empty;
		lastResult = string.Empty;
		matchesPlayed++;
		QuestLaunchHelper launcher = GetComponent<QuestLaunchHelper>();
		if (launcher == null)
		{
			launcher = base.gameObject.AddComponent<QuestLaunchHelper>();
		}
		launcher.LaunchQuest(questId, mine, theirs, new VersusBattleResolver(questId));
	}

	// Called by VersusBattleResolver when the battle has a result (winner null = left the battle).
	public static void OnMatchResult(PlayerType winner)
	{
		if (Instance == null)
		{
			return;
		}
		if (VersusMatch.NoContest)
		{
			Instance.lastResult = Instance.PeerName + " backed out before the match started.";
		}
		else if (winner == null)
		{
			Instance.lastResult = "You left the match.";
		}
		else if (winner == PlayerType.User)
		{
			Instance.lastResult = "You beat " + Instance.PeerName + "!";
		}
		else
		{
			Instance.lastResult = Instance.PeerName + " won this one.";
		}
	}

	private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
	{
		if (scene.name != "AdventureTime" || stage != Stage.InMatch)
		{
			return;
		}
		VersusMatch.EndMatch();
		GlobalFlags.Instance.InMPMode = false;
		GlobalFlags.Instance.stopTutorial = savedGlobalStopTutorial;
		DebugFlagsScript debugFlags = DebugFlagsScript.GetInstance();
		if (debugFlags != null)
		{
			debugFlags.stopTutorial = savedStopTutorial;
		}
		stage = (channel == null) ? Stage.Menu : Stage.AfterMatch;
		lobbyOpen = true;
		VersusRobot.MatchEnded();
		message = string.Empty;
	}

	private void OnPeerRestarted()
	{
		VersusMatch.Log("friend's game restarted");
		if (stage == Stage.InMatch && VersusMatch.Active)
		{
			VersusMatch.PeerLeft("friend's game restarted");
		}
		peerHello = null;
		peerReady = false;
		message = PeerName + "'s game restarted.";
		if (VersusMatch.IsHost || stage == Stage.AfterMatch)
		{
			iAmReady = false;
		}
		if (stage == Stage.Joining)
		{
			SendHello();
		}
	}

	private void WatchConnection(float now)
	{
		if (VersusMatch.Over || !channel.PeerLost)
		{
			lostSince = -1f;
			return;
		}
		if (lostSince < 0f)
		{
			lostSince = now;
			VersusMatch.Log("lost contact with friend");
		}
		if (now - lostSince > ForfeitSeconds)
		{
			VersusMatch.PeerLeft("friend gone too long");
		}
	}

	// ---- Decks ----

	private static string DefaultName()
	{
		PlayerInfoScript pinfo = PlayerInfoScript.GetInstance();
		if (pinfo != null && !string.IsNullOrEmpty(pinfo.MPPlayerName))
		{
			return pinfo.MPPlayerName;
		}
		return "Player";
	}

	private Hello BuildMyHello()
	{
		PlayerInfoScript pinfo = PlayerInfoScript.GetInstance();
		if (pinfo == null)
		{
			return null;
		}
		Deck deck = (RobotDeck != null) ? RobotDeck : pinfo.GetSelectedDeckCopy();
		if (deck == null || deck.Leader == null || deck.CardCount() == 0)
		{
			return null;
		}
		StringBuilder cards = new StringBuilder();
		foreach (CardItem card in deck.GetCards())
		{
			if (cards.Length > 0)
			{
				cards.Append(',');
			}
			cards.Append(card.Form.ID).Append(':').Append(card.Level);
		}
		StringBuilder lands = new StringBuilder();
		for (int i = 0; i < deck.GetLandscapeCount(); i++)
		{
			if (lands.Length > 0)
			{
				lands.Append(',');
			}
			lands.Append(deck.GetLandscape(i).ToString());
		}
		Hello h = new Hello();
		h.Protocol = VersusMatch.ProtocolVersion;
		h.Content = ContentHash();
		h.Name = CleanName(nameText);
		h.LeaderId = deck.Leader.Form.ID;
		h.LeaderRank = Math.Max(1, deck.Leader.Rank);
		h.Cards = cards.ToString();
		h.Lands = lands.ToString();
		return h;
	}

	// Both computers build both decks from the same hello messages, so card order matches exactly.
	private static Deck BuildDeck(Hello h)
	{
		if (h == null)
		{
			return null;
		}
		try
		{
			Deck deck = new Deck();
			deck.Name = "Versus_Deck";
			deck.Leader = LeaderManager.Instance.CreateLeader(h.LeaderId, h.LeaderRank);
			foreach (string entry in h.Cards.Split(','))
			{
				if (entry.Length == 0)
				{
					continue;
				}
				string[] parts = entry.Split(':');
				CardForm form = CardDataManager.Instance.GetCard(parts[0]);
				if (form == null)
				{
					VersusMatch.Log("unknown card " + parts[0]);
					return null;
				}
				CardItem item = new CardItem(form);
				if (parts.Length > 1 && VersusMessage.Int(parts[1]) > 0)
				{
					item.Level = VersusMessage.Int(parts[1]);
				}
				deck.AddCard(item);
			}
			foreach (string land in h.Lands.Split(','))
			{
				if (land.Length > 0 && deck.GetLandscapeCount() < 4)
				{
					deck.AddLandscape(VersusMessage.Landscape(land));
				}
			}
			return deck;
		}
		catch (Exception ex)
		{
			VersusMatch.Log("bad deck: " + ex.Message);
			return null;
		}
	}

	private static string CleanName(string name)
	{
		name = (name ?? string.Empty).Trim();
		if (name.Length == 0)
		{
			name = "Player";
		}
		if (name.Length > 16)
		{
			name = name.Substring(0, 16);
		}
		return name;
	}

	// A fingerprint of the card rules, so two games with different data never play each other.
	public static string ContentHash()
	{
		if (contentHash != null)
		{
			return contentHash;
		}
		uint h = 2166136261u;
		foreach (string file in ContentFiles)
		{
			string text = string.Empty;
			try
			{
				text = TFUtils.GetJsonFileContent(System.IO.Path.Combine("Blueprints", file));
			}
			catch (Exception)
			{
			}
			foreach (char c in text)
			{
				if (c != '\r')
				{
					h = (h ^ c) * 16777619u;
				}
			}
		}
		contentHash = h.ToString("x8");
		return contentHash;
	}

	private static string NewRoomCode()
	{
		System.Random rng = new System.Random();
		char[] code = new char[5];
		for (int i = 0; i < code.Length; i++)
		{
			code[i] = CodeLetters[rng.Next(CodeLetters.Length)];
		}
		return new string(code);
	}

	private static string LocalAddress()
	{
		try
		{
			foreach (IPAddress address in Dns.GetHostAddresses(Dns.GetHostName()))
			{
				if (address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(address))
				{
					return address.ToString();
				}
			}
		}
		catch (Exception)
		{
		}
		return null;
	}

	// ---- Screen ----

	private bool LobbyVisible()
	{
		return lobbyOpen && stage != Stage.InMatch;
	}

	// While the lobby is up, taps must not reach the menu underneath.
	private void BlockGameInput(bool block)
	{
		inputBlocked = block;
		if (block)
		{
			savedInputEnabler = UICamera.useInputEnabler;
			UICamera.useInputEnabler = true;
		}
		else
		{
			UICamera.useInputEnabler = savedInputEnabler;
		}
		if (EventSystem.current != null)
		{
			EventSystem.current.enabled = !block;
		}
	}

	private void SetupStyles(float scale)
	{
		if (titleStyle != null)
		{
			return;
		}
		panelTexture = new Texture2D(1, 1);
		panelTexture.SetPixel(0, 0, new Color(0.08f, 0.1f, 0.18f, 0.92f));
		panelTexture.Apply();
		titleStyle = new GUIStyle(GUI.skin.label);
		titleStyle.fontSize = 40;
		titleStyle.fontStyle = FontStyle.Bold;
		titleStyle.alignment = TextAnchor.MiddleCenter;
		titleStyle.normal.textColor = new Color(1f, 0.85f, 0.2f);
		textStyle = new GUIStyle(GUI.skin.label);
		textStyle.fontSize = 24;
		textStyle.wordWrap = true;
		textStyle.alignment = TextAnchor.MiddleCenter;
		textStyle.normal.textColor = Color.white;
		smallStyle = new GUIStyle(textStyle);
		smallStyle.fontSize = 18;
		smallStyle.normal.textColor = new Color(0.8f, 0.85f, 1f);
		bannerStyle = new GUIStyle(textStyle);
		bannerStyle.fontSize = 22;
		bannerStyle.normal.background = panelTexture;
		bannerStyle.padding = new RectOffset(16, 16, 8, 8);
		buttonStyle = new GUIStyle(GUI.skin.button);
		buttonStyle.fontSize = 26;
		buttonStyle.fontStyle = FontStyle.Bold;
		fieldStyle = new GUIStyle(GUI.skin.textField);
		fieldStyle.fontSize = 28;
		fieldStyle.alignment = TextAnchor.MiddleCenter;
	}

	private void OnGUI()
	{
		float scale = Screen.height / 720f;
		SetupStyles(scale);
		GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(scale, scale, 1f));
		float width = Screen.width / scale;
		GUI.depth = -100;
		if (stage == Stage.InMatch)
		{
			DrawMatchBanner(width);
		}
		else if (lobbyOpen)
		{
			DrawLobby(width);
		}
	}

	private void DrawMatchBanner(float width)
	{
		string text = null;
		if (VersusMatch.Desynced)
		{
			text = "The two games went out of sync. Finish or leave this match.";
		}
		else if (channel != null && channel.PeerLost && !VersusMatch.Over)
		{
			text = "Lost contact with " + PeerName + ". Waiting for them to come back...";
		}
		else if (VersusBanner.Text != null)
		{
			text = VersusBanner.Text;
		}
		if (text == null)
		{
			return;
		}
		Vector2 size = bannerStyle.CalcSize(new GUIContent(text));
		float w = Mathf.Min(size.x + 20f, width - 40f);
		GUI.Label(new Rect((width - w) / 2f, 12f, w, 48f), text, bannerStyle);
	}

	private void DrawLobby(float width)
	{
		float w = 760f;
		float h = 560f;
		Rect panel = new Rect((width - w) / 2f, (720f - h) / 2f, w, h);
		GUI.DrawTexture(panel, panelTexture);
		GUILayout.BeginArea(new Rect(panel.x + 30f, panel.y + 20f, w - 60f, h - 40f));
		GUILayout.Label("Play a Friend", titleStyle, GUILayout.Height(60f));
		switch (stage)
		{
		case Stage.Menu:
			DrawMenu();
			break;
		case Stage.Hosting:
			DrawHosting();
			break;
		case Stage.Joining:
			DrawJoining();
			break;
		case Stage.AfterMatch:
			DrawAfterMatch();
			break;
		}
		if (error.Length > 0)
		{
			GUILayout.Space(8f);
			GUILayout.Label(error, smallStyle);
		}
		GUILayout.EndArea();
	}

	private void DrawMenu()
	{
		GUILayout.Label("Live 1v1 against a friend with your selected deck.", smallStyle);
		GUILayout.Space(10f);
		GUILayout.BeginHorizontal();
		GUILayout.Label("Your name", textStyle, GUILayout.Width(180f), GUILayout.Height(50f));
		nameText = GUILayout.TextField(nameText, 16, fieldStyle, GUILayout.Height(50f));
		GUILayout.EndHorizontal();
		GUILayout.Space(16f);
		if (GUILayout.Button("Host a match", buttonStyle, GUILayout.Height(64f)))
		{
			error = string.Empty;
			StartHosting(null);
			SendHello();
		}
		GUILayout.Space(10f);
		GUILayout.BeginHorizontal();
		joinText = GUILayout.TextField(joinText, 40, fieldStyle, GUILayout.Height(64f), GUILayout.Width(330f));
		if (GUILayout.Button("Join", buttonStyle, GUILayout.Height(64f)))
		{
			error = string.Empty;
			StartJoining(joinText);
		}
		GUILayout.EndHorizontal();
		GUILayout.Label("To join, type your friend's room code (or their address on the same Wi-Fi).", smallStyle);
		GUILayout.FlexibleSpace();
		GUILayout.BeginHorizontal();
		if (deckWarsFallback != null && GUILayout.Button("Deck Wars ladder", buttonStyle, GUILayout.Height(54f)))
		{
			lobbyOpen = false;
			deckWarsFallback();
		}
		if (GUILayout.Button("Back", buttonStyle, GUILayout.Height(54f)))
		{
			lobbyOpen = false;
		}
		GUILayout.EndHorizontal();
	}

	private void DrawHosting()
	{
		GUILayout.Label("Your room code", textStyle);
		GUILayout.Label(roomCode, titleStyle, GUILayout.Height(70f));
		string address = LocalAddressCached();
		if (address != null)
		{
			GUILayout.Label("On the same Wi-Fi your friend can also type " + address, smallStyle);
		}
		GUILayout.Space(12f);
		GUILayout.Label(connected ? message : "Waiting for your friend to join...", textStyle);
		GUILayout.Label(LinkStatus(), smallStyle);
		GUILayout.FlexibleSpace();
		if (GUILayout.Button("Cancel", buttonStyle, GUILayout.Height(54f)))
		{
			Disconnect(true);
			stage = Stage.Menu;
		}
	}

	private void DrawJoining()
	{
		GUILayout.Label((roomCode.Length > 0) ? ("Room " + roomCode) : joinText, textStyle);
		GUILayout.Space(12f);
		GUILayout.Label(connected ? ("Connected. " + message) : "Connecting...", textStyle);
		GUILayout.Label(LinkStatus(), smallStyle);
		GUILayout.FlexibleSpace();
		if (GUILayout.Button("Cancel", buttonStyle, GUILayout.Height(54f)))
		{
			Disconnect(true);
			stage = Stage.Menu;
		}
	}

	private void DrawAfterMatch()
	{
		if (lastResult.Length > 0)
		{
			GUILayout.Label(lastResult, textStyle, GUILayout.Height(50f));
		}
		if (channel == null || peerHello == null)
		{
			GUILayout.Label((message.Length > 0) ? message : (PeerName + " left."), textStyle);
		}
		else if (iAmReady)
		{
			GUILayout.Label("Waiting for " + PeerName + " to press Rematch...", textStyle);
		}
		else if (peerReady)
		{
			GUILayout.Label(PeerName + " wants a rematch!", textStyle);
		}
		GUILayout.Space(12f);
		GUILayout.Label("You can change your deck before a rematch.", smallStyle);
		GUILayout.FlexibleSpace();
		GUILayout.BeginHorizontal();
		if (iAmReady)
		{
			if (GUILayout.Button("Cancel rematch", buttonStyle, GUILayout.Height(64f)))
			{
				iAmReady = false;
				Send("unready");
			}
		}
		else
		{
			if (channel != null && peerHello != null && GUILayout.Button("Rematch", buttonStyle, GUILayout.Height(64f)))
			{
				error = string.Empty;
				SendHello();
			}
			if (GUILayout.Button("Change deck", buttonStyle, GUILayout.Height(64f)))
			{
				lobbyOpen = false;
			}
		}
		if (GUILayout.Button("Leave", buttonStyle, GUILayout.Height(64f)))
		{
			Disconnect(true);
			stage = Stage.Menu;
			lobbyOpen = false;
		}
		GUILayout.EndHorizontal();
	}

	private string cachedAddress;

	private bool addressLooked;

	private string LocalAddressCached()
	{
		if (!addressLooked)
		{
			addressLooked = true;
			cachedAddress = LocalAddress();
		}
		return cachedAddress;
	}

	private string LinkStatus()
	{
		if (link == null)
		{
			return string.Empty;
		}
		return link.Status;
	}
}

// One line of text shown at the top of the battle while the game waits on the friend.
public static class VersusBanner
{
	public static string Text;
}
