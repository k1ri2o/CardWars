using System;
using System.Collections.Generic;

// Reliable, ordered messages on top of a VersusLink that may drop and reconnect.
// Every message carries a sequence number; the other side acknowledges what it has,
// and anything not acknowledged is sent again. Duplicates are ignored.
// Wire format: "<room>|<sender run id>|<seq>|<ack>|<payload>"; seq 0 is a heartbeat.
// The run id changes when a game is restarted, which resets the numbering.
public class VersusChannel
{
	public const float HeartbeatSeconds = 1f;

	public const float ResendSeconds = 2f;

	public const float LostSeconds = 10f;

	private class Outgoing
	{
		public int Seq;

		public string Payload;

		public float SentAt;
	}

	private readonly VersusLink link;

	private readonly string room;

	private readonly string runId;

	private readonly List<Outgoing> unacked = new List<Outgoing>();

	private string peerRunId;

	// Run ids of earlier games we talked to; late messages from them are ignored.
	private readonly List<string> retiredRunIds = new List<string>();

	private int nextSeq = 1;

	private int received;

	private float clock;

	private float lastHeard;

	private float lastSent = -1000f;

	private int seenConnections;

	public VersusLink Link
	{
		get
		{
			return link;
		}
	}

	// True when nothing has arrived from the other game for a while.
	public bool PeerLost { get; private set; }

	public bool EverHeard { get; private set; }

	// Set when the other game restarted (its run id changed) after we had heard from it.
	public bool PeerRestarted { get; private set; }

	public VersusChannel(VersusLink link, string room)
	{
		this.link = link;
		this.room = room;
		runId = Guid.NewGuid().ToString("N").Substring(0, 8);
	}

	public void Send(string payload)
	{
		Outgoing m = new Outgoing();
		m.Seq = nextSeq++;
		m.Payload = payload;
		unacked.Add(m);
		Transmit(m);
	}

	// Call once per frame with the current time; returns the payloads that arrived, in order.
	public List<string> Pump(float now)
	{
		clock = now;
		List<string> result = new List<string>();
		if (link.ConnectionCount != seenConnections)
		{
			seenConnections = link.ConnectionCount;
			foreach (Outgoing item in unacked)
			{
				Transmit(item);
			}
		}
		string raw;
		while (link.TryReceive(out raw))
		{
			string[] parts = raw.Split(new char[1] { '|' }, 5);
			int seq;
			int ack;
			if (parts.Length < 5 || parts[0] != room || parts[1] == runId || !int.TryParse(parts[2], out seq) || !int.TryParse(parts[3], out ack))
			{
				continue;
			}
			if (retiredRunIds.Contains(parts[1]))
			{
				continue;
			}
			if (peerRunId != parts[1])
			{
				if (peerRunId != null)
				{
					if (VersusMatch.Active || now - lastHeard <= LostSeconds)
					{
						// Another game in the room, or a stray message: keep talking to the friend we have.
						// A friend whose game really restarted goes quiet first.
						continue;
					}
					retiredRunIds.Add(peerRunId);
					// The new run knows nothing of ours, so our numbering starts over too.
					PeerRestarted = true;
					unacked.Clear();
					nextSeq = 1;
				}
				peerRunId = parts[1];
				received = 0;
			}
			lastHeard = now;
			EverHeard = true;
			unacked.RemoveAll((Outgoing m) => m.Seq <= ack);
			if (seq == received + 1)
			{
				received = seq;
				result.Add(parts[4]);
			}
			else if (seq > received + 1)
			{
				// Something was lost on the way: acknowledge again so the sender resends.
				lastSent = -1000f;
			}
		}
		PeerLost = EverHeard && now - lastHeard > LostSeconds;
		foreach (Outgoing item2 in unacked)
		{
			if (now - item2.SentAt > ResendSeconds)
			{
				Transmit(item2);
			}
		}
		if (now - lastSent > HeartbeatSeconds)
		{
			link.Send(room + "|" + runId + "|0|" + received + "|");
			lastSent = now;
		}
		return result;
	}

	private void Transmit(Outgoing m)
	{
		link.Send(room + "|" + runId + "|" + m.Seq + "|" + received + "|" + m.Payload);
		m.SentAt = clock;
		lastSent = clock;
	}

	public void ClearRestarted()
	{
		PeerRestarted = false;
	}

	public void Close()
	{
		link.Close();
	}
}
