# Hackathon demo video

Submission video: `guarded-agentic-commerce-submission.mp4`

- Duration: 2 minutes 39 seconds
- Resolution: 1920 × 1080
- Video: H.264 at 30 FPS
- Audio: none

The video uses screens captured during real browser interactions. Every step has a dedicated explanation panel covering customer discovery, multi-turn memory, in-chat products, cart actions, recommendations, the real Razorpay test checkout, LangGraph observability, catalogue creation, merchant guardrails, and a bounded campaign progressing through proposal, human approval, launch, active state, and automatic stop-loss.

To regenerate it on macOS:

1. Start the application and capture the numbered real interaction frames in `liveframes/`.
2. Install Pillow and FFmpeg.
3. Run `python3 build_detailed_video.py`.

The builder deliberately uses `-an`, so the submission has no audio track.
