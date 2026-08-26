# Hackathon demo video

Submission video: `guarded-agentic-commerce-submission.mp4`

- Duration: approximately 1 minute
- Resolution: 1280 × 720
- Video: H.264 at 30 FPS
- Audio: none

The video uses screens captured during real browser interactions. On-screen chapter captions, a visible cursor, and red click indicators show customer discovery, multi-turn memory, conversational cart actions, recommendations, the real Razorpay test checkout, LangGraph observability, catalogue management, merchant guardrails, and a bounded campaign progressing through proposal, human approval, launch, and active state.

To regenerate it on macOS:

1. Start the application and capture the numbered real interaction frames in `liveframes/`.
2. Install Pillow and FFmpeg.
3. Run `python3 build_live_video.py`.

The builder deliberately uses `-an`, so the submission has no audio track.
