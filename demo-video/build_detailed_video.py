#!/usr/bin/env python3
"""Create the detailed, silent 1080p hackathon slideshow from real UI captures."""

from pathlib import Path
import subprocess
import textwrap

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "detailed-frames"
RENDERED = SOURCE / "rendered"
OUTPUT = ROOT / "guarded-agentic-commerce-submission.mp4"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


SLIDES = [
    ("001-customer-home.jpg", "Customer storefront", "The experience starts with a shopkeeper-style chat and a guarded cart.", "The ₹2,000 spending limit is visible before any financial action.", 5.0),
    ("002-search-request.jpg", "Ask for a cream", "The customer describes the product and budget in natural language: skincare cream under ₹2,000.", "No product ID, filter form or exact keyword is required.", 5.0),
    ("003-agents-working.jpg", "Specialized agents run", "LangGraph separates intent, preference memory, catalogue lookup, ranking, clarification and guardrails.", "The loading state makes background work visible to the customer.", 5.0),
    ("004-products-in-chat.jpg", "Verified suggestions appear in chat", "Daily Barrier Face Cream and Night Repair Cream are returned inside the assistant message.", "Every price, stock count and shipping time comes from the merchant catalogue.", 6.0),
    ("005-extra-information.jpg", "Give extra information", "The next message only says that the cream is for daily use.", "The agent combines this new detail with the earlier skincare, cream and budget context.", 5.0),
    ("006-refined-daily-result.jpg", "Conversation memory refines the result", "The remembered context narrows the answer to Daily Barrier Face Cream.", "The response stays grounded and shows the product directly inside the chat.", 6.0),
    ("007-add-from-chat.jpg", "Add the suggested product", "The customer uses the Add to cart button inside the AI response.", "This preserves a simple shopkeeper conversation while still enabling direct commerce.", 5.0),
    ("008-cart-updated.jpg", "Guarded cart updates", "The verified ₹899 price is used and the cart remains below the ₹2,000 limit.", "Quantity controls, removal and the exact approved total remain visible.", 5.0),
    ("009-recommendations.jpg", "Explainable recommendations", "The upsell agent proposes compatible products based on the current cart and purchase context.", "Projected totals are calculated before the customer accepts anything.", 6.0),
    ("010-recommended-item-added.jpg", "Accept a recommended item", "Hydrating Sheet Mask is accepted and added for ₹299.", "The cart becomes ₹1,198 and measured recommendation uplift is recorded.", 5.5),
    ("011-approved-cart-total.jpg", "Approve the exact total", "The customer sees both cart lines and approves the verified ₹1,198 total.", "Checkout cannot silently change the amount or exceed the spending boundary.", 5.5),
    ("012-razorpay-test-checkout.jpg", "Razorpay test checkout", "The backend creates a real Razorpay test-mode order for ₹1,198.", "Razorpay's official checkout opens; signature verification is required before confirmation.", 7.0),
    ("013-merchant-console.jpg", "Merchant operations", "The merchant can inspect completed shopping, recommendation, checkout and campaign graphs.", "Node-level states create an explainable audit trail instead of a black-box agent.", 6.0),
    ("014-catalogue-form-empty.jpg", "Create authoritative catalogue data", "Every catalogue field is clearly labelled with its purpose and expected value.", "Required fields prevent incomplete products from becoming agent-visible inventory.", 6.0),
    ("015-catalogue-form-filled.jpg", "Enter the product details", "Aloe Daily Face Gel is configured with price, stock, shipping, tags and companion products.", "These values become the source of truth for search, inventory and cross-selling.", 6.0),
    ("016-product-saved.jpg", "Product saved in PostgreSQL", "The new ₹649 product appears with 25 units of stock and a success confirmation.", "The merchant can immediately edit or delete the authoritative record.", 6.0),
    ("017-revenue-gap-opportunity.jpg", "Detect a measured revenue gap", "Night Repair Cream converts at 2% versus an 8% benchmark across 1,200 measured views.", "The orchestrator estimates a ₹93,528 opportunity from evidence—not invented demand.", 6.0),
    ("018-campaign-boundaries.jpg", "Set bounded campaign inputs", "The merchant chooses a ₹1,500 budget, 10% discount and an approved channel.", "Hard policy limits are checked before a proposal can proceed.", 5.5),
    ("019-campaign-proposal.jpg", "Generate an explainable proposal", "The agent creates a consent-aware message, rationale, budget, discount and frequency cap.", "The campaign remains Draft even though policy checks pass.", 6.0),
    ("020-human-approval-required.jpg", "Require human approval", "A sensitive growth action cannot launch autonomously.", "The merchant must explicitly press Approve as merchant; the approval is timestamped.", 5.5),
    ("021-campaign-approved.jpg", "Approval unlocks launch", "The status changes to Approved and the launch control becomes available.", "The approval boundary is visible and reconstructable in the audit trail.", 5.0),
    ("022-campaign-active.jpg", "Launch inside policy boundaries", "The campaign becomes Active with the ₹1,500 budget, 10% discount and 1× frequency cap intact.", "Healthy and poor performance batches can now be measured.", 6.0),
    ("023-automatic-stop-loss.jpg", "Automatic stop-loss protects spend", "A poor batch records ₹600 spend with zero revenue and zero conversions.", "The campaign automatically pauses instead of continuing to waste the merchant budget.", 7.0),
]


def wrapped(draw, text, xy, width, font_obj, fill, spacing=10):
    avg = max(1, int(width / (font_obj.size * 0.53)))
    lines = textwrap.wrap(text, width=avg)
    draw.multiline_text(xy, "\n".join(lines), font=font_obj, fill=fill, spacing=spacing)
    return len(lines) * (font_obj.size + spacing)


def background():
    image = Image.new("RGB", (1920, 1080), "#070b12")
    draw = ImageDraw.Draw(image)
    for radius, color in [(720, "#101d3a"), (520, "#10263a"), (300, "#112d33")]:
        draw.ellipse((1550 - radius, -radius, 1550 + radius, radius), fill=color)
    draw.rectangle((0, 0, 1920, 1080), fill=(7, 11, 18, 210))
    return image


def card(title, subtitle, filename, accent="#60a5fa", footer="SILENT, CAPTIONED WALKTHROUGH"):
    image = background()
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((120, 115, 1800, 965), 40, fill="#0e1728", outline=accent, width=4)
    draw.text((180, 185), "RAZORPAY BUILDATHON", font=font(FONT_BOLD, 30), fill=accent)
    draw.multiline_text((180, 310), title, font=font(FONT_BOLD, 78), fill="white", spacing=16)
    draw.multiline_text((180, 610), subtitle, font=font(FONT_REGULAR, 34), fill="#cbd5e1", spacing=15)
    draw.text((180, 870), footer, font=font(FONT_BOLD, 24), fill="#5eead4")
    target = RENDERED / filename
    image.save(target, quality=94)
    return target


def render_slide(index, source_name, title, explanation, safety):
    image = background()
    draw = ImageDraw.Draw(image)
    draw.text((45, 35), f"STEP {index:02d}", font=font(FONT_BOLD, 24), fill="#60a5fa")
    draw.text((185, 27), title, font=font(FONT_BOLD, 42), fill="white")
    draw.text((1780, 41), "LIVE UI", font=font(FONT_BOLD, 20), fill="#5eead4")

    shot = Image.open(SOURCE / source_name).convert("RGB")
    shot = ImageOps.fit(shot, (1240, 698), method=Image.Resampling.LANCZOS)
    image.paste(shot, (40, 145))
    draw.rounded_rectangle((38, 143, 1282, 845), 18, outline="#334a78", width=4)

    draw.rounded_rectangle((1315, 145, 1880, 845), 24, fill="#0e1728", outline="#263a60", width=3)
    draw.text((1360, 195), "WHAT HAPPENS", font=font(FONT_BOLD, 20), fill="#93c5fd")
    used = wrapped(draw, explanation, (1360, 245), 470, font(FONT_REGULAR, 30), "#f8fafc", 12)
    y = 285 + used
    draw.line((1360, y, 1835, y), fill="#263a60", width=2)
    draw.text((1360, y + 38), "WHY IT IS SAFE", font=font(FONT_BOLD, 20), fill="#5eead4")
    wrapped(draw, safety, (1360, y + 88), 470, font(FONT_REGULAR, 27), "#cbd5e1", 12)

    draw.rounded_rectangle((40, 890, 1880, 1015), 22, fill="#0b1322", outline="#1e3153", width=2)
    draw.text((78, 922), "ACTUAL WORKING FLOW", font=font(FONT_BOLD, 21), fill="#fbbf24")
    draw.text((350, 918), "Captured from the running React + Node.js + LangGraph + PostgreSQL application", font=font(FONT_REGULAR, 25), fill="#cbd5e1")
    draw.text((78, 972), "No voice • no simulated UI • financial actions use Razorpay test mode", font=font(FONT_REGULAR, 21), fill="#64748b")
    target = RENDERED / f"slide-{index:02d}.jpg"
    image.save(target, quality=92)
    return target


def main():
    RENDERED.mkdir(parents=True, exist_ok=True)
    entries = []
    entries.append((card("Guarded Agentic\nCommerce", "A detailed customer-to-merchant walkthrough\nusing real application interactions", "000-title.jpg"), 5.0))
    entries.append((card("Customer journey", "Search → refine → add to cart → accept recommendation → Razorpay", "001-customer-chapter.jpg"), 3.5))

    for index, (name, title, explanation, safety, duration) in enumerate(SLIDES, start=1):
        if index == 13:
            entries.append((card("Merchant journey", "Observable agents → catalogue → bounded growth campaign", "050-merchant-chapter.jpg", accent="#fbbf24"), 3.5))
        entries.append((render_slide(index, name, title, explanation, safety), duration))

    entries.append((card("Validation complete", "49 / 49 automated tests passed\nProduction build passed\nRazorpay test checkout verified", "998-tests.jpg", accent="#5eead4", footer="CUSTOMER + MERCHANT WORKFLOWS VERIFIED"), 6.0))
    entries.append((card("Bounded. Explainable.\nReady to demonstrate.", "Verified catalogue • Human approval • Audit trail\nRazorpay test mode • Automatic stop-loss", "999-end.jpg", accent="#5eead4"), 5.0))

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
