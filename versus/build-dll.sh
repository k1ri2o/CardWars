#!/bin/bash
# Builds the game's scripts (Assets/**/*.cs) into Assembly-CSharp.dll for the Windows
# release of Card Wars, the same way the release's own Assembly-CSharp.dll was built.
#
# usage: versus/build-dll.sh <Managed folder of the release> [output.dll]
#   The Managed folder is CardWars/game/CardWars_Data/Managed inside
#   https://github.com/shishkabob27/CardWars/releases/download/1.12.8/CardWars-Windows.zip
# Needs mcs (Mono's C# compiler; apt package mono-mcs).
set -euo pipefail
MANAGED=$(cd "$1" && pwd)
OUT=${2:-Assembly-CSharp.dll}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LIST=$(mktemp)
trap 'rm -f "$LIST"' EXIT
(cd "$ROOT" && find Assets -name '*.cs' -not -path '*/Editor/*' | sort | sed "s|^|$ROOT/|") > "$LIST"
REFS=()
for dll in "$MANAGED"/*.dll; do
  case "$(basename "$dll")" in
    Assembly-CSharp.dll|mscorlib.dll) ;;
    *) REFS+=("-r:$dll") ;;
  esac
done
mcs -target:library -nostdlib "-r:$MANAGED/mscorlib.dll" "${REFS[@]}" -unsafe -debug- -optimize+ \
  -nowarn:0168,0219,0414,0618,0649,0169,0162,0108,0114,0109,0067,0659,0661,0660,0672,0252,0253,1717 \
  -out:"$OUT" "@$LIST"
echo "built $OUT ($(stat -c %s "$OUT") bytes)"
