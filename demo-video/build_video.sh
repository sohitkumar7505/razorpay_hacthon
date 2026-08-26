#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

for index in 00 01 02 03 04 05 06 07 08; do
  ffmpeg -y -loglevel error \
    -loop 1 -framerate 30 -i "scene-${index}.jpg" \
    -i "narration-${index}.aiff" \
    -vf "scale=1280:720,zoompan=z='min(max(zoom,pzoom)+0.00008,1.035)':d=1:s=1280x720:fps=30,format=yuv420p" \
    -af "apad=pad_dur=0.8" \
    -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k \
    -shortest -movflags +faststart "clip-${index}.mp4"
done

ffmpeg -y -loglevel error -f concat -safe 0 -i concat.txt -c copy guarded-agentic-commerce-demo.mp4

ffmpeg -y -loglevel error -i guarded-agentic-commerce-demo.mp4 \
  -c copy -movflags +faststart guarded-agentic-commerce-submission.mp4

echo "Created guarded-agentic-commerce-submission.mp4"
