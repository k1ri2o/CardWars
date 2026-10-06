using System;
using System.Collections.Generic;
using System.Threading;

// Checks that the internet relays the 1v1 mode uses work: for each MQTT broker, a host and a
// guest join the same room through it and exchange messages over VersusChannel, the reliable
// channel the game uses. Built and run by .github/workflows/versus.yml; also handy locally:
//   mono RelayCheck.exe [broker ...]
public static class RelayCheck
{
	public static int Main(string[] args)
	{
		string[] brokers = (args.Length <= 0) ? MqttVersusLink.Brokers : args;
		int working = 0;
		foreach (string broker in brokers)
		{
			string error = Check(broker);
			if (error == null)
			{
				working++;
				Console.WriteLine("ok      " + broker);
			}
			else
			{
				Console.WriteLine("FAILED  " + broker + ": " + error);
			}
		}
		Console.WriteLine(working + " of " + brokers.Length + " relays work");
		return (working <= 0) ? 1 : 0;
	}

	private static string Check(string broker)
	{
		string room = "CHECK" + new Random().Next(1000000);
		MqttVersusLink hostLink = new MqttVersusLink(broker, MqttVersusLink.DefaultPort, room, true);
		MqttVersusLink guestLink = new MqttVersusLink(broker, MqttVersusLink.DefaultPort, room, false);
		try
		{
			DateTime start = DateTime.UtcNow;
			while (hostLink.State != VersusLink.LinkState.Connected || guestLink.State != VersusLink.LinkState.Connected)
			{
				if ((DateTime.UtcNow - start).TotalSeconds > 20.0)
				{
					return "couldn't connect (" + hostLink.Status + " / " + guestLink.Status + ")";
				}
				Thread.Sleep(100);
			}
			VersusChannel host = new VersusChannel(hostLink, "check");
			VersusChannel guest = new VersusChannel(guestLink, "check");
			const int count = 20;
			for (int i = 0; i < count; i++)
			{
				host.Send("to-guest " + i);
				guest.Send("to-host " + i);
			}
			List<string> atHost = new List<string>();
			List<string> atGuest = new List<string>();
			start = DateTime.UtcNow;
			while (atHost.Count < count || atGuest.Count < count)
			{
				float now = (float)(DateTime.UtcNow - start).TotalSeconds;
				if (now > 30f)
				{
					return "only " + atGuest.Count + " and " + atHost.Count + " of " + count + " messages arrived";
				}
				atHost.AddRange(host.Pump(now));
				atGuest.AddRange(guest.Pump(now));
				Thread.Sleep(20);
			}
			for (int j = 0; j < count; j++)
			{
				if (atGuest[j] != "to-guest " + j || atHost[j] != "to-host " + j)
				{
					return "messages arrived out of order";
				}
			}
			return null;
		}
		catch (Exception ex)
		{
			return ex.GetType().Name + ": " + ex.Message;
		}
		finally
		{
			hostLink.Close();
			guestLink.Close();
		}
	}
}
