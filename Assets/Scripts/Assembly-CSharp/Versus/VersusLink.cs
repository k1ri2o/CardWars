using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

// A pipe to the other player's game. Messages are single lines of text.
// Sockets run on background threads; the game reads with TryReceive on the main thread.
public abstract class VersusLink
{
	public enum LinkState
	{
		Connecting,
		Connected,
		Closed
	}

	protected readonly object sync = new object();

	private readonly Queue<string> inbox = new Queue<string>();

	private LinkState state;

	private string status = string.Empty;

	protected volatile bool closing;

	public LinkState State
	{
		get
		{
			lock (sync)
			{
				return state;
			}
		}
	}

	// Last connection problem, for showing in the lobby.
	public string Status
	{
		get
		{
			lock (sync)
			{
				return status;
			}
		}
	}

	// Bumped every time a fresh connection is made, so the channel knows to resend.
	public int ConnectionCount { get; private set; }

	public abstract void Send(string message);

	public virtual void Close()
	{
		closing = true;
		SetState(LinkState.Closed, "closed");
	}

	public bool TryReceive(out string message)
	{
		lock (sync)
		{
			if (inbox.Count > 0)
			{
				message = inbox.Dequeue();
				return true;
			}
		}
		message = null;
		return false;
	}

	protected void Deliver(string message)
	{
		lock (sync)
		{
			inbox.Enqueue(message);
		}
	}

	protected void SetState(LinkState newState, string newStatus)
	{
		lock (sync)
		{
			if (state == LinkState.Closed)
			{
				return;
			}
			if (newState == LinkState.Connected && state != LinkState.Connected)
			{
				ConnectionCount++;
			}
			state = newState;
			if (newStatus != null)
			{
				status = newStatus;
			}
		}
	}

	// For links made of other links: the connection count is the sum of theirs.
	protected void SetCount(int count, LinkState newState, string newStatus)
	{
		lock (sync)
		{
			if (state == LinkState.Closed)
			{
				return;
			}
			ConnectionCount = count;
			state = newState;
			if (newStatus != null)
			{
				status = newStatus;
			}
		}
	}

	protected static void Nap(int ms)
	{
		Thread.Sleep(ms);
	}

	protected static Thread StartThread(string name, ThreadStart body)
	{
		Thread thread = new Thread(body);
		thread.Name = name;
		thread.IsBackground = true;
		thread.Start();
		return thread;
	}
}

// Direct TCP connection: the host listens on a port, the guest connects to the host's address.
// Used for same-network play and for internet play with a forwarded port.
public class TcpVersusLink : VersusLink
{
	public const int DefaultPort = 27027;

	private readonly bool isHost;

	private readonly string address;

	private readonly int port;

	private TcpListener listener;

	private TcpClient client;

	private NetworkStream stream;

	private TcpVersusLink(bool isHost, string address, int port)
	{
		this.isHost = isHost;
		this.address = address;
		this.port = port;
		StartThread("VersusTcp", Run);
	}

	public static TcpVersusLink Host(int port)
	{
		return new TcpVersusLink(true, null, port);
	}

	public static TcpVersusLink Join(string address, int port)
	{
		return new TcpVersusLink(false, address, port);
	}

	private void Run()
	{
		while (!closing)
		{
			try
			{
				TcpClient c = isHost ? AcceptOne() : ConnectOnce();
				if (c == null)
				{
					continue;
				}
				c.NoDelay = true;
				c.SendTimeout = 5000;
				lock (sync)
				{
					client = c;
					stream = c.GetStream();
				}
				SetState(LinkState.Connected, "connected");
				ReadLines(c.GetStream());
			}
			catch (Exception ex)
			{
				SetState(LinkState.Connecting, ex.Message);
			}
			DropClient();
			if (!closing)
			{
				SetState(LinkState.Connecting, null);
				Nap(isHost ? 100 : 1000);
			}
		}
	}

	private TcpClient AcceptOne()
	{
		TcpListener l;
		lock (sync)
		{
			l = listener;
		}
		if (l == null)
		{
			l = new TcpListener(IPAddress.Any, port);
			try
			{
				l.Start();
			}
			catch (Exception ex)
			{
				// The port is taken (another copy of the game?): try again in a while.
				SetState(LinkState.Connecting, "port " + port + " is busy: " + ex.Message);
				Nap(2000);
				return null;
			}
			lock (sync)
			{
				if (closing)
				{
					l.Stop();
					return null;
				}
				listener = l;
			}
			SetState(LinkState.Connecting, "waiting for the other player on port " + port);
		}
		return l.AcceptTcpClient();
	}

	private TcpClient ConnectOnce()
	{
		SetState(LinkState.Connecting, "connecting to " + address + ":" + port);
		TcpClient c = new TcpClient();
		try
		{
			IAsyncResult ar = c.BeginConnect(address, port, null, null);
			if (!ar.AsyncWaitHandle.WaitOne(5000, false))
			{
				throw new IOException("no answer from " + address + ":" + port);
			}
			c.EndConnect(ar);
			return c;
		}
		catch (Exception)
		{
			c.Close();
			throw;
		}
	}

	private void ReadLines(Stream s)
	{
		LineReader reader = new LineReader();
		byte[] buffer = new byte[8192];
		while (!closing)
		{
			int n = s.Read(buffer, 0, buffer.Length);
			if (n <= 0)
			{
				throw new IOException("the other player disconnected");
			}
			foreach (string line in reader.Feed(buffer, n))
			{
				Deliver(line);
			}
		}
	}

	private void DropClient()
	{
		lock (sync)
		{
			if (client != null)
			{
				try
				{
					client.Close();
				}
				catch (Exception)
				{
				}
			}
			client = null;
			stream = null;
		}
	}

	public override void Send(string message)
	{
		byte[] bytes = Encoding.UTF8.GetBytes(message + "\n");
		lock (sync)
		{
			if (stream == null)
			{
				return;
			}
			try
			{
				stream.Write(bytes, 0, bytes.Length);
			}
			catch (Exception)
			{
				try
				{
					client.Close();
				}
				catch (Exception)
				{
				}
			}
		}
	}

	public override void Close()
	{
		base.Close();
		DropClient();
		TcpListener l;
		lock (sync)
		{
			l = listener;
			listener = null;
		}
		if (l != null)
		{
			try
			{
				l.Stop();
			}
			catch (Exception)
			{
			}
		}
	}
}

// Splits a byte stream into UTF-8 lines.
public class LineReader
{
	private readonly MemoryStream pending = new MemoryStream();

	public List<string> Feed(byte[] buffer, int count)
	{
		List<string> lines = new List<string>();
		for (int i = 0; i < count; i++)
		{
			if (buffer[i] == 10)
			{
				lines.Add(Encoding.UTF8.GetString(pending.GetBuffer(), 0, (int)pending.Length));
				pending.SetLength(0L);
			}
			else
			{
				pending.WriteByte(buffer[i]);
			}
		}
		return lines;
	}
}

// Several links used together, for example a direct connection plus internet relays.
// Messages go out on every connected link; the channel above drops the duplicates.
public class MultiVersusLink : VersusLink
{
	private readonly List<VersusLink> links;

	public MultiVersusLink(List<VersusLink> links)
	{
		this.links = links;
		StartThread("VersusMulti", Run);
	}

	private void Run()
	{
		while (!closing)
		{
			int total = 0;
			bool connected = false;
			string status = null;
			foreach (VersusLink link in links)
			{
				total += link.ConnectionCount;
				if (link.State == LinkState.Connected)
				{
					connected = true;
					if (status == null)
					{
						status = link.Status;
					}
				}
				string message;
				while (link.TryReceive(out message))
				{
					Deliver(message);
				}
			}
			if (status == null && links.Count > 0)
			{
				status = links[0].Status;
			}
			SetCount(total, connected ? LinkState.Connected : LinkState.Connecting, status);
			Nap(15);
		}
	}

	public override void Send(string message)
	{
		foreach (VersusLink link in links)
		{
			if (link.State == LinkState.Connected)
			{
				link.Send(message);
			}
		}
	}

	public override void Close()
	{
		base.Close();
		foreach (VersusLink link in links)
		{
			link.Close();
		}
	}
}
