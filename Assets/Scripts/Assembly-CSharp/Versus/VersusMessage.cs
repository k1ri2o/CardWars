using System;
using System.Globalization;
using System.Text;

// Messages are words separated by spaces: the first word says what it is, the rest are its values.
// Values are escaped so names and lists can hold spaces.
public static class VersusMessage
{
	public static string Join(params object[] parts)
	{
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < parts.Length; i++)
		{
			if (i > 0)
			{
				sb.Append(' ');
			}
			sb.Append(Escape(Convert.ToString(parts[i], CultureInfo.InvariantCulture)));
		}
		return sb.ToString();
	}

	public static string[] Split(string payload)
	{
		string[] parts = payload.Split(' ');
		for (int i = 0; i < parts.Length; i++)
		{
			parts[i] = Unescape(parts[i]);
		}
		return parts;
	}

	public static int Int(string s)
	{
		int value;
		if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out value))
		{
			return value;
		}
		return -1;
	}

	public static uint UInt(string s)
	{
		uint value;
		if (uint.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out value))
		{
			return value;
		}
		return 0u;
	}

	public static LandscapeType Landscape(string s)
	{
		try
		{
			return (LandscapeType)(int)Enum.Parse(typeof(LandscapeType), s);
		}
		catch (Exception)
		{
			return LandscapeType.None;
		}
	}

	private static string Escape(string s)
	{
		if (s == null)
		{
			return string.Empty;
		}
		StringBuilder sb = new StringBuilder(s.Length);
		foreach (char c in s)
		{
			switch (c)
			{
			case '%':
				sb.Append("%25");
				break;
			case ' ':
				sb.Append("%20");
				break;
			case '\n':
				sb.Append("%0A");
				break;
			case '\r':
				sb.Append("%0D");
				break;
			case '|':
				sb.Append("%7C");
				break;
			default:
				sb.Append(c);
				break;
			}
		}
		return sb.ToString();
	}

	private static string Unescape(string s)
	{
		if (s.IndexOf('%') < 0)
		{
			return s;
		}
		return s.Replace("%20", " ").Replace("%0A", "\n").Replace("%0D", "\r").Replace("%7C", "|").Replace("%25", "%");
	}
}
