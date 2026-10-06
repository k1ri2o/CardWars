# Card Wars 1v1

Live 1v1 against a friend inside the original game: the same 3D board, creatures,
floops, ketchup bottle and battle ring, with your friend in the opponent's chair instead
of the computer. It works over the internet with a room code, or directly on the same Wi-Fi.

## Install (Windows)

Download and double-click **Install-CardWars1v1.bat** from the
[1v1-latest release](https://github.com/k1ri2o/CardWars/releases/tag/1v1-latest), or paste
this into PowerShell:

```powershell
irm https://github.com/k1ri2o/CardWars/releases/download/1v1-latest/Install-CardWars1v1.ps1 -OutFile $env:TEMP\i.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\i.ps1
```

It downloads Card Wars 1.12.8 for Windows (about 280 MB) into
`%LOCALAPPDATA%\CardWars1v1`, swaps in the 1v1 build of the game's code, and puts a
**Card Wars 1v1** shortcut on the desktop. Run it again to update; your progress and decks
are kept. Both players need the same version.

## Play

1. Pick the deck you want in the deck builder.
2. Tap **Battle**, then **Deck Wars**. The *Play a Friend* screen opens.
3. One player taps **Host a match** and reads out the 5-letter room code.
4. The other types the code and taps **Join**. On the same Wi-Fi you can also type the
   host's address shown under the code (Windows may ask to allow Card Wars through the
   firewall the first time you host; allow it for direct play).

The host's game picks the arena and who goes first. Each player places their own
landscapes, plays on their own turn, and taps the ring for their own creatures, on attack
and on defence. After the match, **Rematch** starts another one with the same friend (you
can change your deck first). The original online ladder is still there under
**Deck Wars ladder**.

If a player closes the game or loses connection for two minutes, the other player wins.

## How it works

Both games run the same battle in lockstep. Every move (cards, floops, hero abilities,
targets, discard picks, landscape placement, ring taps) is sent to the other game and
replayed there through the same code the computer opponent uses; all random effects draw
from a shared seed, and the two games compare a checksum of the board after every turn.
Messages travel through free public MQTT relays (several at once) or a direct TCP
connection on port 27027. The code is in `Assets/Scripts/Assembly-CSharp/Versus/`.

## Build

`versus/build-dll.sh <Managed folder of the release> [out.dll]` compiles every script
under `Assets/` with Mono's `mcs` into `Assembly-CSharp.dll`, which replaces the one in
`CardWars/game/CardWars_Data/Managed/`. The *Card Wars 1v1 build* workflow does this on
every push and publishes the result to the 1v1-latest release.

## Testing with robot players

Starting the game with `-versus-host` or `-versus-join <code>` adds a robot that plays by
itself through the real screens (random moves, random ring taps), e.g. two copies on one PC:

```
CardWars.exe -versus-host -versus-room TEST1 -versus-matches 5 -versus-deck random
CardWars.exe -versus-join TEST1 -versus-matches 5 -versus-deck random
```

Other options: `-versus-broker <host>` (use one MQTT relay), `-versus-name`, `-versus-seed`,
`-versus-speed <x>`. The game log (`-logFile`) then shows every move, ring result and
turn checksum, and `OUT OF SYNC` if the two games ever disagree.

`versus/RelayCheck.cs` checks the internet relays: a host and a guest exchange messages
through each MQTT broker with the game's own link and channel code. The build workflow
runs it on every push.
