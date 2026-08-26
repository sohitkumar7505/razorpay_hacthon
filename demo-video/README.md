# Hackathon demo video

Submission video: `guarded-agentic-commerce-submission.mp4`

- Duration: approximately 2 minutes 56 seconds
- Resolution: 1280 × 720
- Video: H.264 at 30 FPS
- Audio: AAC narration
- Size: approximately 11 MB

The video covers customer discovery, multi-turn memory, conversational cart actions, recommendations, Razorpay test checkout, LangGraph observability, catalogue management, merchant guardrails, PostgreSQL persistence, and bounded campaigns.

To regenerate it on macOS:

1. Capture or replace the numbered source JPG files.
2. Run `python3 build_assets.py`.
3. Generate each `narration-NN.aiff` with macOS `say` using its matching text file.
4. Run `./build_video.sh` with FFmpeg installed.
