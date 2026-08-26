from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
W, H = 1280, 720
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

scenes = [
    {
        "source": None,
        "title": "Guarded Agentic Commerce",
        "subtitle": "Razorpay Buildathon · AI storefront + merchant growth platform",
        "narration": "Introducing Guarded Agentic Commerce, an end-to-end Razorpay Buildathon project. It combines a shopkeeper-style AI storefront with a merchant growth console, while keeping every price, inventory update, campaign, and payment bounded and explainable."
    },
    {
        "source": "01-customer-home.jpg",
        "title": "One workspace for the complete customer journey",
        "subtitle": "Persistent identity · conversational discovery · guarded cart",
        "narration": "The customer begins in a focused two-column workspace. The left side contains the conversational shopping agent and verified catalogue. The right side contains a spending-limited cart and explainable recommendations. Customer identity, chat, preferences, cart, and orders persist in PostgreSQL."
    },
    {
        "source": "02-agent-search.jpg",
        "title": "A shopkeeper-style multi-turn agent",
        "subtitle": "Remembers intent · searches authoritative data · asks for clarification",
        "narration": "The shopping agent remembers product type, use case, and budget across turns. LangGraph separates intent, preferences, catalogue search, ranking, clarification, guardrails, and response generation. Suggestions use only verified products, prices, stock, shipping time, and return rules."
    },
    {
        "source": "03-cart-recommendations.jpg",
        "title": "Natural cart actions and explainable recommendations",
        "subtitle": "Add by conversation · enforce limits · recommend from cart and history",
        "narration": "Natural commands such as add this cream, add the first product, change quantity, remove the item, or show something cheaper directly update the guarded cart. Recommendations explain which cart item or past purchase created the match, and never exceed the remaining budget."
    },
    {
        "source": "04-razorpay-checkout.jpg",
        "title": "Real Razorpay test checkout",
        "subtitle": "Exact-total approval · server-side HMAC verification · idempotent webhooks",
        "narration": "Checkout creates a real Razorpay test order only after the customer approves the exact verified total. The backend verifies the payment signature and session ownership. Successful payment creates an order, reduces inventory, clears the cart, updates purchase history, and safely ignores duplicate events."
    },
    {
        "source": "05-agent-operations.jpg",
        "title": "Visible LangGraph agent execution",
        "subtitle": "Shopping · recommendations · checkout · campaigns",
        "narration": "The merchant console makes agent execution visible. Every LangGraph workflow records node-level running, completed, and failed states with sensitive values redacted. Merchants can inspect shopping, recommendation, checkout, and campaign workflows instead of trusting an invisible black box."
    },
    {
        "source": "06-catalogue-guardrails.jpg",
        "title": "Authoritative catalogue and merchant controls",
        "subtitle": "Product CRUD + CSV import · inventory · policies · persistent guardrails",
        "narration": "Merchants can add, edit, delete, or import catalogue products with clearly labelled fields and row-level validation. They can control maximum spending, discount limits, approval thresholds, prohibited products, shipping policy, and return policy. Products and settings persist in Dockerized PostgreSQL."
    },
    {
        "source": "07-campaign-orchestrator.jpg",
        "title": "A bounded autonomous campaign orchestrator",
        "subtitle": "Measured opportunity · human approval · budget cap · automatic stop-loss",
        "narration": "The campaign orchestrator detects measured revenue gaps, proposes a bounded audience, budget, discount, and channel, then waits for human approval. It measures spend and revenue, enforces hard limits, reports return on ad spend, and automatically pauses poor performance."
    },
    {
        "source": None,
        "title": "Built for a trustworthy commerce demo",
        "subtitle": "React · Tailwind · Node.js · LangGraph · PostgreSQL · Docker · Razorpay",
        "narration": "The result is a complete agentic commerce demonstration built with React, Tailwind, Node.js, LangGraph, Docker, PostgreSQL, and Razorpay test mode. Forty-nine automated tests cover the core safety and commerce behavior. The full source code and setup instructions are included in the repository."
    }
]

def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)

def gradient_card(title, subtitle, ending=False):
    image = Image.new("RGB", (W, H), "#070b14")
    pixels = image.load()
    for y in range(H):
        for x in range(W):
            blue = int(28 * (x / W) + 18 * (1 - y / H))
            pixels[x, y] = (7 + blue // 4, 11 + blue // 3, 20 + blue)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((80, 75, 1200, 645), radius=36, fill=(12, 20, 38), outline=(49, 111, 255), width=2)
    draw.text((120, 120), "RAZORPAY BUILDATHON", font=font(22, True), fill="#60a5fa")
    draw.multiline_text((120, 225), title, font=font(62, True), fill="white", spacing=10)
    draw.multiline_text((120, 390), subtitle, font=font(28), fill="#a8b5cc", spacing=8)
    draw.text((120, 555), "SAFE · EXPLAINABLE · PERSISTENT" if not ending else "CODE + DEMO READY", font=font(20, True), fill="#34d399")
    return image

for index, scene in enumerate(scenes):
    if scene["source"]:
        image = Image.open(ROOT / scene["source"]).convert("RGB").resize((W, H))
        overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        draw.rectangle((0, 560, W, H), fill=(3, 8, 20, 225))
        draw.rectangle((0, 560, 10, H), fill=(37, 99, 235, 255))
        draw.text((42, 585), scene["title"], font=font(30, True), fill="white")
        draw.text((42, 635), scene["subtitle"], font=font(20), fill="#b8c5da")
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    else:
        image = gradient_card(scene["title"], scene["subtitle"], ending=index == len(scenes) - 1)
    image.save(ROOT / f"scene-{index:02d}.jpg", quality=96)
    (ROOT / f"narration-{index:02d}.txt").write_text(scene["narration"])

print(f"Generated {len(scenes)} captioned scenes")
