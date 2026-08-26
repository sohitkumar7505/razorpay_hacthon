#!/usr/bin/env python3
"""Build a silent, captioned demo from screenshots captured during real UI interactions."""

from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "liveframes"
RENDERED = SOURCE / "rendered"
OUTPUT = ROOT / "guarded-agentic-commerce-submission.mp4"

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path: str, size: int):
    return ImageFont.truetype(path, size)


STAGES = [
    ("000-customer-home.jpg", 3.0, "CUSTOMER STOREFRONT", "A guarded shopping agent, verified catalogue and budget-limited cart", (1010, 40), False),
    ("001-typing-search.jpg", 0.45, "1  DESCRIBE THE NEED", "The customer starts a natural shopkeeper-style conversation", (350, 665), False),
    ("002-typing-search.jpg", 0.45, "1  DESCRIBE THE NEED", "Product, use case and budget are entered naturally", (420, 665), False),
    ("003-typing-search.jpg", 0.45, "1  DESCRIBE THE NEED", "The request is built in real time", (490, 665), False),
    ("004-typing-search.jpg", 1.0, "1  DESCRIBE THE NEED", "Night-use skincare under the ₹2,000 spending limit", (550, 665), False),
    ("005-agent-loading.jpg", 1.0, "2  LANGGRAPH AGENTS RUN", "Intent, preferences, catalogue, ranking and guardrails execute", (550, 665), True),
    ("006-agent-results.jpg", 3.0, "3  VERIFIED RESULT", "Conversation memory keeps skincare, cream, night use and budget", (350, 205), False),
    ("007-typing-cart.jpg", 0.45, "4  CONVERSATIONAL CART", "The customer can act without finding a separate product button", (350, 665), False),
    ("008-typing-cart.jpg", 0.45, "4  CONVERSATIONAL CART", "“Add this cream to cart” resolves the referenced product", (430, 665), False),
    ("009-typing-cart.jpg", 0.8, "4  CONVERSATIONAL CART", "The cart agent understands the current conversation", (520, 665), False),
    ("010-cart-loading.jpg", 1.0, "4  CONVERSATIONAL CART", "Cart and risk agents validate the change", (550, 665), True),
    ("011-cart-added.jpg", 3.0, "5  GUARDED CART", "Verified price, quantity and remaining budget update immediately", (995, 230), False),
    ("012-recommendation-click.jpg", 1.0, "6  EXPLAINABLE UPSELL", "Recommendation is based on the cart and purchase history", (1000, 570), True),
    ("013-recommendation-accepted.jpg", 2.5, "6  EXPLAINABLE UPSELL", "The compatible add-on stays within the customer’s limit", (1000, 410), False),
    ("014-checkout-click.jpg", 1.0, "7  PROTECTED CHECKOUT", "The exact verified total is approved before payment", (1010, 500), True),
    ("015-razorpay-open.jpg", 4.0, "8  RAZORPAY TEST MODE", "A real Razorpay test order opens in the official checkout", (785, 555), False),
    ("016-merchant-agent-operations.jpg", 3.2, "MERCHANT CONSOLE", "Every LangGraph workflow and node state is observable", (1110, 40), True),
    ("017-catalogue-guardrails.jpg", 3.0, "9  MERCHANT GUARDRAILS", "Spending, discount, approval and policy limits are merchant-controlled", (930, 350), False),
    ("018-catalogue-form.jpg", 3.0, "10  CATALOGUE MANAGEMENT", "Clearly labelled fields support safe product and inventory updates", (300, 450), True),
    ("019-campaign-opportunities.jpg", 3.0, "11  GROWTH OPPORTUNITIES", "Measured conversion gaps become bounded campaign opportunities", (335, 230), False),
    ("020-campaign-generate-click.jpg", 1.0, "12  GENERATE PROPOSAL", "Budget, discount and channel are checked against policy", (335, 548), True),
    ("021-campaign-proposal.jpg", 3.0, "13  HUMAN APPROVAL", "The agent explains the proposal and waits for explicit approval", (1010, 545), False),
    ("022-campaign-approve-click.jpg", 1.0, "13  HUMAN APPROVAL", "A person approves sensitive campaign execution", (1010, 545), True),
    ("023-campaign-approved.jpg", 2.5, "14  POLICY PASSED", "Approval is recorded before launch becomes available", (1010, 545), False),
    ("024-campaign-launch-click.jpg", 1.0, "15  LAUNCH", "The bounded campaign is launched", (1010, 545), True),
    ("025-campaign-active.jpg", 4.0, "16  ACTIVE CAMPAIGN", "Policy passed • ₹1,500 budget • 10% discount • frequency cap 1×", (1000, 70), False),
]


def add_caption(image: Image.Image, title: str, subtitle: str) -> Image.Image:
    image = image.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((24, 18, 930, 92), 14, fill=(5, 10, 20, 225), outline=(69, 129, 255, 220), width=2)
    draw.text((44, 29), title, font=font(FONT_BOLD, 20), fill=(103, 167, 255, 255))
    draw.text((44, 58), subtitle, font=font(FONT_REGULAR, 18), fill=(245, 247, 251, 255))
    return Image.alpha_composite(image, overlay)


def add_cursor(image: Image.Image, position, clicked: bool) -> Image.Image:
    draw = ImageDraw.Draw(image)
    x, y = position
    if clicked:
        draw.ellipse((x - 24, y - 24, x + 24, y + 24), outline=(255, 85, 85, 240), width=6)
        draw.ellipse((x - 12, y - 12, x + 12, y + 12), outline=(255, 210, 210, 220), width=3)
    points = [(x, y), (x, y + 34), (x + 9, y + 25), (x + 17, y + 43), (x + 25, y + 39), (x + 17, y + 21), (x + 31, y + 20)]
    draw.polygon(points, fill=(255, 255, 255, 255), outline=(5, 8, 14, 255))
    return image


def make_card(title: str, subtitle: str, filename: str):
    image = Image.new("RGB", (1280, 720), "#070b12")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((70, 80, 1210, 640), 32, fill="#0e1728", outline="#2563eb", width=3)
    draw.text((110, 145), "RAZORPAY BUILDATHON", font=font(FONT_BOLD, 22), fill="#60a5fa")
    draw.multiline_text((110, 230), title, font=font(FONT_BOLD, 58), fill="white", spacing=12)
    draw.multiline_text((110, 405), subtitle, font=font(FONT_REGULAR, 28), fill="#cbd5e1", spacing=12)
    draw.text((110, 565), "Silent live walkthrough • On-screen actions and click indicators", font=font(FONT_BOLD, 20), fill="#5eead4")
    image.save(RENDERED / filename, quality=94)


def main():
    RENDERED.mkdir(parents=True, exist_ok=True)
    make_card("Guarded Agentic\nCommerce", "Real customer and merchant workflows\nReact • Node.js • LangGraph • PostgreSQL • Razorpay", "000-title.jpg")

    entries = [(RENDERED / "000-title.jpg", 3.5)]
    for index, (name, duration, title, subtitle, cursor, clicked) in enumerate(STAGES, start=1):
        image = Image.open(SOURCE / name)
        image = add_caption(image, title, subtitle)
        image = add_cursor(image, cursor, clicked).convert("RGB")
        target = RENDERED / f"{index:03d}.jpg"
        image.save(target, quality=93)
        entries.append((target, duration))

    make_card("Built for bounded,\nexplainable commerce", "Verified data • Human approval • Audit trails\nReal Razorpay test checkout • Dockerized PostgreSQL", "999-end.jpg")
    entries.append((RENDERED / "999-end.jpg", 4.0))

    concat = RENDERED / "frames.txt"
    with concat.open("w") as handle:
        for path, duration in entries:
            handle.write(f"file '{path.as_posix()}'\n")
            handle.write(f"duration {duration}\n")
        handle.write(f"file '{entries[-1][0].as_posix()}'\n")

    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat),
        "-vf", "fps=30,format=yuv420p", "-an", "-c:v", "libx264", "-crf", "20", "-preset", "medium",
        "-movflags", "+faststart", str(OUTPUT),
    ], check=True)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
