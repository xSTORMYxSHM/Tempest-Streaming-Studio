from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Tempest-Mainframe-Extension-Reviewer-Walkthrough.pdf"

INK = colors.HexColor("#05090E")
SURFACE = colors.HexColor("#09131B")
SURFACE_2 = colors.HexColor("#0D1B25")
CYAN = colors.HexColor("#54F2EB")
BLUE = colors.HexColor("#2684FF")
TEXT = colors.HexColor("#ECF9FF")
MUTED = colors.HexColor("#8BA4AF")
LINE = colors.HexColor("#24414B")
GREEN = colors.HexColor("#65E6B4")


def install_fonts():
    candidates = [
        (Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
        (Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("Tempest", str(regular)))
            pdfmetrics.registerFont(TTFont("Tempest-Bold", str(bold)))
            return "Tempest", "Tempest-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = install_fonts()


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    canvas.setFillColor(CYAN)
    canvas.rect(0, letter[1] - 0.14 * inch, letter[0], 0.14 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(0.58 * inch, 0.48 * inch, letter[0] - 0.58 * inch, 0.48 * inch)
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.58 * inch, 0.27 * inch, "TEMPEST MAINFRAME  •  TWITCH REVIEW WALKTHROUGH  •  v0.2.1")
    canvas.drawRightString(letter[0] - 0.58 * inch, 0.27 * inch, f"PAGE {doc.page}")
    canvas.restoreState()


getSampleStyleSheet()
title = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=25, leading=29, textColor=TEXT, spaceAfter=10)
subtitle = ParagraphStyle("Subtitle", fontName=FONT, fontSize=11.2, leading=16, textColor=MUTED, spaceAfter=12)
eyebrow = ParagraphStyle("Eyebrow", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=CYAN, tracking=1.6, spaceAfter=5)
heading = ParagraphStyle("Heading", fontName=FONT_BOLD, fontSize=16, leading=20, textColor=TEXT, spaceBefore=7, spaceAfter=7)
body = ParagraphStyle("Body", fontName=FONT, fontSize=9.2, leading=13.3, textColor=MUTED, spaceAfter=6)
body_center = ParagraphStyle("BodyCenter", parent=body, alignment=TA_CENTER)
step = ParagraphStyle("Step", fontName=FONT, fontSize=9.1, leading=13.2, textColor=TEXT, leftIndent=22, firstLineIndent=-22, spaceAfter=7)
small = ParagraphStyle("Small", fontName=FONT, fontSize=7.8, leading=11, textColor=MUTED)
small_bold = ParagraphStyle("SmallBold", fontName=FONT_BOLD, fontSize=8.1, leading=11, textColor=TEXT)


def p(text, style=body):
    return Paragraph(text, style)


def label(text):
    return p(text.upper(), eyebrow)


def bullet(text):
    return p(f"<font color='#54F2EB'>&#8226;</font>&nbsp;&nbsp;{text}", body)


def callout(title_text, text, accent=CYAN):
    table = Table([[p(title_text, small_bold), p(text, small)]], colWidths=[1.42 * inch, 5.23 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE_2),
        ("BOX", (0, 0), (-1, -1), 0.8, accent),
        ("LINEBEFORE", (1, 0), (1, 0), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def flow_card(number, title_text, detail):
    number_style = ParagraphStyle("Number", parent=body_center, fontName=FONT_BOLD, fontSize=14, textColor=INK)
    card = Table([[p(str(number), number_style)], [p(title_text, small_bold)], [p(detail, small)]], colWidths=[2.0 * inch], rowHeights=[0.34 * inch, None, None])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), CYAN),
        ("BACKGROUND", (0, 1), (0, -1), SURFACE),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 1), (-1, -1), 10),
        ("RIGHTPADDING", (0, 1), (-1, -1), 10),
        ("TOPPADDING", (0, 1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
    ]))
    return card


story = [
    Spacer(1, 0.23 * inch),
    label("Twitch Extension reviewer guide"),
    p("Tempest Mainframe", title),
    p("A clear review path for the free Twitch Panel companion to Tempest Streaming Studio.", subtitle),
    callout("AT A GLANCE", "<b>Version:</b> 0.2.1 &nbsp;&nbsp;•&nbsp;&nbsp; <b>Surface:</b> Twitch Panel &nbsp;&nbsp;•&nbsp;&nbsp; <b>Viewer account:</b> Twitch only &nbsp;&nbsp;•&nbsp;&nbsp; <b>Paid flow:</b> None", GREEN),
    Spacer(1, 0.17 * inch),
    label("What it is"),
    p("The channel's viewer signal deck", heading),
    p("Tempest Mainframe is the detailed viewer hub for Tempest Streaming Studio. It combines channel information and streamer-enabled utilities in one branded Twitch Panel. Modules can include Current Stream, Now Playing, Schedule, Goals, Polls, Counters, Commands, 3D Dice, Viewer Interactions, and Performances."),
    p("Studio remains authoritative for live content, permissions, access groups, cooldowns, safety, and on-stream rendering. Every action in this release is free."),
    Spacer(1, 0.05 * inch),
    label("Signal path"),
]

flow = Table([[flow_card(1, "TWITCH VIEWER", "Reads channel data or selects an enabled utility."), flow_card(2, "TEMPEST SIGNAL", "Carries the channel-scoped request securely."), flow_card(3, "STUDIO", "Validates access, updates state, and renders live results.")]], colWidths=[2.12 * inch] * 3)
flow.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
story += [flow, Spacer(1, 0.14 * inch), callout("REQUIRED APP", "Tempest Streaming Studio 1.8.0: <link href='https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio/releases/tag/v1.8.0' color='#54F2EB'>github.com/xSTORMYxSHM/Tempest-Streaming-Studio/releases/tag/v1.8.0</link>"), Spacer(1, 0.15 * inch)]

story += [label("Reviewer test"), p("Verify the panel in under two minutes", heading)]
review_steps = [
    "Open the live review channel with Tempest Mainframe activated in a Twitch Panel slot.",
    "Open the panel and confirm the header reports that Studio is online.",
    "Confirm Current Stream or another enabled informational module displays current Studio data.",
    "Select an enabled free interaction, poll, counter, command, or dice control.",
    "Confirm the panel reports the accepted result. If prompted, select <b>Share Twitch Identity</b> and repeat the action.",
]
story += [p(f"<font color='#54F2EB'><b>{index}.</b></font>&nbsp;&nbsp;{text}", step) for index, text in enumerate(review_steps, 1)]
story += [callout("PASS CONDITION", "The panel loads, shows current channel data, accepts an eligible free control, and explains offline, identity, locked, cooldown, and error states.", GREEN), PageBreak()]

story += [label("Broadcaster setup"), p("Connect and design Mainframe", heading)]
setup_steps = [
    "Install and activate Tempest Mainframe in a Twitch Panel slot.",
    "Open the Twitch configuration page and choose the theme, colors, typography, layout, density, and visible modules.",
    "Select <b>Save Panel Appearance</b>. Twitch stores these public presentation preferences for the channel.",
    "Open Studio 1.8.0 and go to <b>Twitch -&gt; Companion Extensions</b>.",
    "Pair Tempest Signal, enable <b>Tempest Mainframe - Panel</b>, choose its features, and save.",
    "Keep Studio running during the stream.",
]
story += [p(f"<font color='#54F2EB'><b>{index}.</b></font>&nbsp;&nbsp;{text}", step) for index, text in enumerate(setup_steps, 1)]
story += [Spacer(1, 0.04 * inch), callout("HOSTED SAFETY", "Twitch-hosted builds do not show the EBS address or local mock-mode controls. Those tools appear only when running the source locally."), Spacer(1, 0.17 * inch), label("Module coverage")]

modules = [
    ("Current Stream", "Live title, category, viewer count, and channel state."),
    ("Now Playing", "Current station or track information and Listen link."),
    ("Schedule", "The channel's next scheduled stream."),
    ("Goal", "Subscription, follower, Bits, or custom progress from Studio."),
    ("Poll", "One active numeric poll and one vote per identified viewer."),
    ("Counters", "Streamer-defined death, restart, or other counts."),
    ("Commands", "Published chatbot commands and permissions."),
    ("3D Dice", "Streamer-enabled dice and custom ranges rendered by Studio."),
    ("Interactions", "Free channel actions with Studio access and cooldowns."),
    ("Performances", "Sound and performance triggers enabled by the broadcaster."),
]
module_rows = [[p("MODULE", small_bold), p("REVIEW EXPECTATION", small_bold)]] + [[p(name, small_bold), p(detail, small)] for name, detail in modules]
module_table = Table(module_rows, colWidths=[1.42 * inch, 5.23 * inch], repeatRows=1)
module_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("BACKGROUND", (0, 1), (-1, -1), SURFACE),
    ("GRID", (0, 0), (-1, -1), 0.4, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story += [module_table, PageBreak()]

story += [label("Expected states"), p("What reviewers should see", heading)]
states = [
    ("STUDIO ONLINE", "Live information and eligible controls are available."),
    ("STUDIO OFFLINE", "The panel still loads and disables unavailable live controls until Studio reconnects."),
    ("IDENTITY REQUIRED", "Select Share Twitch Identity for a one-vote or identity-restricted feature."),
    ("LOCKED", "Studio denied the action because of a broadcaster-defined access rule."),
    ("COOLDOWN", "The action recently ran and reports its remaining wait time."),
    ("EMPTY MODULE", "The broadcaster has not published data for that module or chose to hide it."),
]
state_rows = [[p("STATE", small_bold), p("EXPECTED BEHAVIOR", small_bold)]] + [[p(name, small_bold), p(detail, small)] for name, detail in states]
state_table = Table(state_rows, colWidths=[1.6 * inch, 5.05 * inch], repeatRows=1)
state_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("BACKGROUND", (0, 1), (-1, -1), SURFACE),
    ("GRID", (0, 0), (-1, -1), 0.4, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
]))
story += [state_table, Spacer(1, 0.16 * inch), label("Security and source")]
security = [
    "No separate viewer account or reviewer credentials are required.",
    "Hosted assets contain no Client Secret, shared secret, stream key, service credential, or private key.",
    "Requests use HTTPS to <b>signal.tempestmainframe.com</b>.",
    "Twitch-hosted configuration contains public panel presentation settings only.",
    "Frontend HTML, CSS, and vanilla JavaScript are human-readable and not obfuscated.",
    "Public source: <link href='https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio' color='#54F2EB'>github.com/xSTORMYxSHM/Tempest-Streaming-Studio</link>",
]
story += [bullet(item) for item in security]
story += [Spacer(1, 0.1 * inch), label("Version 0.2.1"), p("Change log", heading)]
changes = [
    "Reorganized configuration around setup, panel appearance, and viewer-facing modules.",
    "Added an in-Extension broadcaster quick start and reviewer test.",
    "Added clear offline, identity, locked, cooldown, and empty-module expectations.",
    "Hid EBS routing and local mock mode from Twitch-hosted builds.",
    "Retained developer routing controls for local source previews.",
    "Updated the required Studio download and public source references to 1.8.0.",
]
story += [bullet(item) for item in changes]
story += [Spacer(1, 0.1 * inch), callout("REVIEW AVAILABILITY", "Tempest Signal remains public continuously. If Twitch needs a scheduled live demonstration, reply through the review thread so Studio and a test stream can be kept online for the agreed window.", GREEN)]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = BaseDocTemplate(str(OUTPUT), pagesize=letter, leftMargin=0.58 * inch, rightMargin=0.58 * inch, topMargin=0.48 * inch, bottomMargin=0.62 * inch, title="Tempest Mainframe Extension Reviewer Walkthrough", author="Storm Horizon Media")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id="Tempest", frames=[frame], onPage=draw_page)])
doc.build(story)
print(OUTPUT)
