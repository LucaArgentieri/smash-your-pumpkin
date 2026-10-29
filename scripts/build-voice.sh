#!/usr/bin/env bash
# Renders the combo-rank announcer lines into public/voice/*.mp3: espeak-ng
# speaks each word, then ffmpeg drops it about eight semitones, saturates it
# and puts it in a small arena reverb (Quake-announcer style).
#
#   scripts/build-voice.sh        (needs espeak-ng and ffmpeg)
set -euo pipefail
out="$(cd "$(dirname "$0")/.." && pwd)/public/voice"
tmp="$(mktemp -d)"
mkdir -p "$out"
for word in WICKED GRIM GHASTLY UNHOLY DAMNED APOCALYPTIC; do
  espeak-ng -v en-us+m3 -s 120 -p 15 -a 180 -w "$tmp/$word.wav" "$word"
  ffmpeg -hide_banner -loglevel error -y -i "$tmp/$word.wav" -af \
    "asetrate=22050*0.62,aresample=44100,highpass=f=70,lowpass=f=3200,volume=2.2,asoftclip=type=tanh,acompressor=threshold=-18dB:ratio=4:attack=5:release=120,aecho=0.8:0.6:70|140|260:0.35|0.25|0.15,apad=pad_dur=0.6,loudnorm=I=-14:TP=-1.5" \
    -ac 1 -b:a 96k "$out/$(echo "$word" | tr '[:upper:]' '[:lower:]').mp3"
  echo "public/voice/$(echo "$word" | tr '[:upper:]' '[:lower:]').mp3"
done
rm -r "$tmp"
