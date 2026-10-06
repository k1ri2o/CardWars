using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Text;

// Internet play without running a server: both games connect out to a free public MQTT
// broker and exchange messages on topics named after the room code. Plain MQTT 3.1.1
// over TCP port 1883 (the game's Mono runtime is too old for modern TLS).
public class MqttVersusLink : VersusLink
{
	public static string[] Brokers = new string[3] { "broker.emqx.io", "broker.hivemq.com", "test.mosquitto.org" };

	public const int DefaultPort = 1883;

	private const int KeepAliveSeconds = 30;

	private readonly string broker;

	private readonly int port;

	private readonly string inTopic;

	private readonly string outTopic;

	private readonly string clientId;

	private TcpClient client;

	private NetworkStream stream;

	private DateTime lastSend;

	public MqttVersusLink(string broker, int port, string room, bool isHost)
	{
		this.broker = broker;
		this.port = port;
		// The topic is named after a hash of the room code, so the code itself never shows on the relay.
		string root = "cardwars-1v1/" + RoomHash(room) + "/";
		inTopic = root + ((!isHost) ? "to-guest" : "to-host");
		outTopic = root + ((!isHost) ? "to-host" : "to-guest");
		clientId = "cw1v1-" + Guid.NewGuid().ToString("N").Substring(0, 16);
		StartThread("VersusMqtt", Run);
		StartThread("VersusMqttPing", PingLoop);
	}

	private static string RoomHash(string room)
	{
		using (System.Security.Cryptography.SHA1 sha = System.Security.Cryptography.SHA1.Create())
		{
			byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes("cardwars-1v1:" + room.ToUpperInvariant()));
			StringBuilder sb = new StringBuilder();
			for (int i = 0; i < 10; i++)
			{
				sb.Append(hash[i].ToString("x2"));
			}
			return sb.ToString();
		}
	}

	private void Run()
	{
		while (!closing)
		{
			try
			{
				SetState(LinkState.Connecting, "connecting to " + broker);
				TcpClient c = new TcpClient();
				try
				{
					IAsyncResult ar = c.BeginConnect(broker, port, null, null);
					if (!ar.AsyncWaitHandle.WaitOne(8000, false))
					{
						throw new IOException("no answer from " + broker);
					}
					c.EndConnect(ar);
				}
				catch (Exception)
				{
					c.Close();
					throw;
				}
				c.NoDelay = true;
				c.SendTimeout = 5000;
				NetworkStream s = c.GetStream();
				lock (sync)
				{
					client = c;
					stream = s;
				}
				Write(Connect());
				ReadPacket(s, 0x20);
				Write(Subscribe(inTopic));
				ReadPacket(s, 0x90);
				SetState(LinkState.Connected, "connected through " + broker);
				while (!closing)
				{
					Packet p = ReadPacket(s, -1);
					if ((p.Type & 0xF0) == 0x30)
					{
						OnPublish(p);
					}
				}
			}
			catch (Exception ex)
			{
				SetState(LinkState.Connecting, ex.Message);
			}
			Drop();
			if (!closing)
			{
				Nap(2000);
			}
		}
	}

	private void PingLoop()
	{
		while (!closing)
		{
			Nap(1000);
			if (State == LinkState.Connected && (DateTime.UtcNow - lastSend).TotalSeconds > KeepAliveSeconds / 2)
			{
				Write(new byte[2] { 0xC0, 0 });
			}
		}
	}

	private void OnPublish(Packet p)
	{
		int topicLength = (p.Body[0] << 8) | p.Body[1];
		int offset = 2 + topicLength;
		if ((p.Type & 6) != 0)
		{
			offset += 2;
		}
		Deliver(Encoding.UTF8.GetString(p.Body, offset, p.Body.Length - offset));
	}

	public override void Send(string message)
	{
		byte[] topic = Str(outTopic);
		byte[] payload = Encoding.UTF8.GetBytes(message);
		MemoryStream body = new MemoryStream();
		body.Write(topic, 0, topic.Length);
		body.Write(payload, 0, payload.Length);
		Write(Frame(0x30, body.ToArray()));
	}

	public override void Close()
	{
		if (State == LinkState.Connected)
		{
			Write(new byte[2] { 0xE0, 0 });
		}
		base.Close();
		Drop();
	}

	private void Write(byte[] packet)
	{
		lock (sync)
		{
			if (stream == null)
			{
				return;
			}
			try
			{
				stream.Write(packet, 0, packet.Length);
				lastSend = DateTime.UtcNow;
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

	private void Drop()
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

	private byte[] Connect()
	{
		MemoryStream body = new MemoryStream();
		byte[] name = Str("MQTT");
		body.Write(name, 0, name.Length);
		body.WriteByte(4);
		body.WriteByte(2);
		body.WriteByte(0);
		body.WriteByte(KeepAliveSeconds);
		byte[] id = Str(clientId);
		body.Write(id, 0, id.Length);
		return Frame(0x10, body.ToArray());
	}

	private static byte[] Subscribe(string topic)
	{
		MemoryStream body = new MemoryStream();
		body.WriteByte(0);
		body.WriteByte(1);
		byte[] t = Str(topic);
		body.Write(t, 0, t.Length);
		body.WriteByte(0);
		return Frame(0x82, body.ToArray());
	}

	private static byte[] Str(string s)
	{
		byte[] bytes = Encoding.UTF8.GetBytes(s);
		byte[] result = new byte[bytes.Length + 2];
		result[0] = (byte)(bytes.Length >> 8);
		result[1] = (byte)(bytes.Length & 0xFF);
		Array.Copy(bytes, 0, result, 2, bytes.Length);
		return result;
	}

	private static byte[] Frame(int type, byte[] body)
	{
		List<byte> packet = new List<byte>(body.Length + 5);
		packet.Add((byte)type);
		int length = body.Length;
		do
		{
			int digit = length % 128;
			length /= 128;
			if (length > 0)
			{
				digit |= 0x80;
			}
			packet.Add((byte)digit);
		}
		while (length > 0);
		packet.AddRange(body);
		return packet.ToArray();
	}

	private struct Packet
	{
		public int Type;

		public byte[] Body;
	}

	private static Packet ReadPacket(Stream s, int expectedType)
	{
		Packet p = default(Packet);
		p.Type = ReadByte(s);
		int length = 0;
		int multiplier = 1;
		int digit;
		do
		{
			digit = ReadByte(s);
			length += (digit & 0x7F) * multiplier;
			multiplier *= 128;
		}
		while ((digit & 0x80) != 0);
		p.Body = new byte[length];
		int read = 0;
		while (read < length)
		{
			int n = s.Read(p.Body, read, length - read);
			if (n <= 0)
			{
				throw new IOException("the relay server closed the connection");
			}
			read += n;
		}
		if (expectedType >= 0 && p.Type != expectedType)
		{
			throw new IOException("unexpected reply from the relay server");
		}
		if (p.Type == 0x20 && p.Body.Length >= 2 && p.Body[1] != 0)
		{
			throw new IOException("the relay server refused the connection");
		}
		return p;
	}

	private static int ReadByte(Stream s)
	{
		int b = s.ReadByte();
		if (b < 0)
		{
			throw new IOException("the relay server closed the connection");
		}
		return b;
	}
}
