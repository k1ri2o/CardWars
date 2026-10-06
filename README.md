<p align="center"><img src="docs/images/title.jpg" alt="Card Wars title screen: Jake and Finn at the card table" width="800"></p>

<h1 align="center">Card Wars 1v1</h1>

<p align="center">
  <b>Adventure Time: Card Wars on PC, with live 1v1 against a friend over the internet.</b><br>
  The real game: the same 3D board, creatures, floops, ketchup bottle and battle ring, with your friend in the opponent's chair.
</p>

<p align="center">
  <a href="https://github.com/k1ri2o/CardWars/releases/tag/1v1-latest"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows-2ea44f?style=for-the-badge&logo=windows&logoColor=white"></a>
  <a href="web/README.md"><img alt="Play in the browser" src="https://img.shields.io/badge/Play-in%20the%20browser-f5a623?style=for-the-badge&logo=googlechrome&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/k1ri2o/CardWars/actions/workflows/versus.yml"><img alt="1v1 build" src="https://github.com/k1ri2o/CardWars/actions/workflows/versus.yml/badge.svg"></a>
  <a href="https://github.com/k1ri2o/CardWars/actions/workflows/web.yml"><img alt="Web game tests" src="https://github.com/k1ri2o/CardWars/actions/workflows/web.yml/badge.svg"></a>
  <img alt="Unity 2017.4" src="https://img.shields.io/badge/Unity-2017.4-222?logo=unity">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20browser-blue">
</p>

<p align="center">
  <img src="docs/images/battle.gif" alt="A 1v1 battle: both players' creatures fight lane by lane while the battle ring spins" width="800">
</p>

## Why it's cool

- **Real 1v1 in the original game.** Host a match, read out the 5-letter room code, and your friend joins from anywhere. Each of you plays your own deck, on your own turn, and taps the ring for your own creatures.
- **Works over the internet or on the same Wi-Fi.** Matches go through free public relays, so nobody has to open ports. On the same network you can also connect directly.
- **Everything unlocked from the first launch.** No tutorial. Every card (4 copies of each, the most a deck can hold), every hero, every quest on both maps and every dungeon.
- **Both games stay in sync.** Every move is replayed on the other side through the same code the computer opponent uses, all randomness comes from a shared seed, and the two games compare a checksum of the board after every turn.
- **Also in the browser.** A web version of the battle for two players, playable on phones too, with pass & play and a practice mode.

## Screenshots

<table>
  <tr>
    <td colspan="2"><img src="docs/images/players.jpg" alt="Alice and Bob, two real players, take their seats"></td>
  </tr>
  <tr>
    <td colspan="2" align="center">Two real players: you and your friend take the seats</td>
  </tr>
  <tr>
    <td><img src="docs/images/battle-start.jpg" alt="The battle starts at the card table"></td>
    <td><img src="docs/images/ring.jpg" alt="Tapping the battle ring to attack"></td>
  </tr>
  <tr>
    <td align="center">Battle!</td>
    <td align="center">Tap the ring for your own creatures</td>
  </tr>
  <tr>
    <td><img src="docs/images/menu.jpg" alt="Main menu with 1664 cards and a level 15 hero"></td>
    <td><img src="docs/images/undefended.jpg" alt="An undefended lane takes a hit"></td>
  </tr>
  <tr>
    <td align="center">Everything unlocked: 1664 cards, level 15 heroes</td>
    <td align="center">Leave a lane open and pay for it</td>
  </tr>
</table>

## Install (Windows)

Download and double-click **Install-CardWars1v1.bat** from the
[1v1-latest release](https://github.com/k1ri2o/CardWars/releases/tag/1v1-latest), or paste
this into PowerShell:

```powershell
irm https://github.com/k1ri2o/CardWars/releases/download/1v1-latest/Install-CardWars1v1.ps1 -OutFile $env:TEMP\i.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\i.ps1
```

It downloads Card Wars 1.12.8 for Windows, swaps in the 1v1 build of the game's code and
puts a **Card Wars 1v1** shortcut on your desktop. Run it again to update. Both players need
the same version.

The first launch may show an optional *Register / Login* box: press **Cancel**, then **No**,
to play as a guest.

## Play a friend

1. Pick your deck in the deck builder.
2. Tap **Battle**, then **Deck Wars**. The *Play a Friend* screen opens.
3. One player taps **Host a match** and reads out the room code.
4. The other types the code and taps **Join**.

After the match, **Rematch** starts another one. The full rules and details are in
[versus/README.md](versus/README.md).

## How it works

```mermaid
sequenceDiagram
    participant You as Your game
    participant Net as Relay or direct link
    participant Friend as Friend's game
    You->>Net: your move (card, floop, target, ring tap)
    Net->>Friend: same move
    Friend->>Friend: replays it like the computer opponent would
    You-->>Friend: board checksum after every turn
    Friend-->>You: board checksum after every turn
```

The game's own C# scripts are in `Assets/Scripts/Assembly-CSharp/`. The 1v1 code lives in
[`Versus/`](Assets/Scripts/Assembly-CSharp/Versus): the lobby and session, a reliable
message channel, the MQTT relay and direct TCP links, the shared random seed, and robot
players that play whole matches by themselves for testing. GitHub Actions compiles the
scripts into `Assembly-CSharp.dll` with Mono on every push and publishes the installer.

## What's in this repository

| Folder | What it is |
| --- | --- |
| [`Assets/`](Assets) | The Unity 2017.4 project of the PC port: scripts, card and hero data, art, scenes |
| [`Assets/Scripts/Assembly-CSharp/Versus/`](Assets/Scripts/Assembly-CSharp/Versus) | Live 1v1 and the everything-unlocked starter pack |
| [`versus/`](versus) | Windows installer, DLL build script, relay check |
| [`web/`](web) | The browser version of the battle |

## Build it yourself

You don't need Unity to build the game code:

```bash
versus/build-dll.sh <CardWars_Data/Managed folder of the 1.12.8 release> Assembly-CSharp.dll
```

Copy the DLL into `CardWars/game/CardWars_Data/Managed/`. The full Unity project opens in
Unity 2017.4.40f1.

## Credits

Card Wars and Adventure Time belong to Cartoon Network. The original mobile game was made
by Kung Fu Factory. The PC port this builds on is
[shishkabob27/CardWars](https://github.com/shishkabob27/CardWars). This is a non-commercial
fan project and is not affiliated with or endorsed by any of them.
