from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Tempest-Streaming-Extension-Reviewer-Walkthrough.pdf"

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
        ("Inter", Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")),
        ("Inter", Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf")),
    ]
    for family, regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont(family, str(regular)))
            pdfmetrics.registerFont(TTFont(f"{family}-Bold", str(bold)))
            return family, f"{family}-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = install_fonts()


class NumberedCanvasMixin:
    pass


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
    canvas.drawString(0.58 * inch, 0.27 * inch, "TEMPEST STREAMING  •  TWITCH REVIEW WALKTHROUGH  •  v0.1.1")
    canvas.drawRightString(letter[0] - 0.58 * inch, 0.27 * inch, f"PAGE {doc.page}")
    canvas.restoreState()


styles = getSampleStyleSheet()
title = ParagraphStyle("Title", fontName=FONT_BOLD, fontSize=25, leading=29, textColor=TEXT, spaceAfter=10)
subtitle = ParagraphStyle("Subtitle", fontName=FONT, fontSize=11.2, leading=16, textColor=MUTED, spaceAfter=12)
eyebrow = ParagraphStyle("Eyebrow", fontName=FONT_BOLD, fontSize=7.5, leading=10, textColor=CYAN, tracking=1.6, spaceAfter=5)
heading = ParagraphStyle("Heading", fontName=FONT_BOLD, fontSize=16, leading=20, textColor=TEXT, spaceBefore=7, spaceAfter=7)
subheading = ParagraphStyle("Subheading", fontName=FONT_BOLD, fontSize=10.5, leading=14, textColor=TEXT, spaceBefore=5, spaceAfter=4)
body = ParagraphStyle("Body", fontName=FONT, fontSize=9.3, leading=13.5, textColor=MUTED, spaceAfter=6)
body_center = ParagraphStyle("BodyCenter", parent=body, alignment=TA_CENTER)
step = ParagraphStyle("Step", fontName=FONT, fontSize=9.1, leading=13.2, textColor=TEXT, leftIndent=22, firstLineIndent=-22, spaceAfter=7)
small = ParagraphStyle("Small", fontName=FONT, fontSize=7.8, leading=11, textColor=MUTED)
small_bold = ParagraphStyle("SmallBold", fontName=FONT_BOLD, fontSize=8.1, leading=11, textColor=TEXT)


def P(text, style=body):
    return Paragraph(text, style)


def section_label(text):
    return P(text.upper(), eyebrow)


def callout(title_text, text, accent=CYAN):
    table = Table([[P(title_text, small_bold), P(text, small)]], colWidths=[1.44 * inch, 5.18 * inch])
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


def flow_card(number, label, detail):
    num = Paragraph(f"<b>{number}</b>", ParagraphStyle("Num", parent=body_center, fontName=FONT_BOLD, fontSize=14, textColor=INK))
    card = Table([[num], [P(label, small_bold)], [P(detail, small)]], colWidths=[2.0 * inch], rowHeights=[0.34 * inch, None, None])
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


def bullet(text):
    return P(f"<font color='#54F2EB'>&#8226;</font>&nbsp;&nbsp;{text}", body)


story = []
story += [
    Spacer(1, 0.23 * inch),
    section_label("Twitch Extension reviewer guide"),
    P("Tempest Streaming", title),
    P("A clear, two-minute path to test the free Video Overlay companion for Tempest Streaming Studio.", subtitle),
    callout("AT A GLANCE", "<b>Version:</b> 0.1.1 &nbsp;&nbsp;•&nbsp;&nbsp; <b>Surface:</b> Video Overlay &nbsp;&nbsp;•&nbsp;&nbsp; <b>Viewer account:</b> Twitch only &nbsp;&nbsp;•&nbsp;&nbsp; <b>Paid flow:</b> None", GREEN),
    Spacer(1, 0.18 * inch),
    section_label("What it is"),
    P("One control deck over the Twitch video", heading),
    P("Tempest Streaming lets viewers activate streamer-selected interactions without leaving the player. Available controls can include on-stream effects, interactive avatars, polls, battles, and click/tap placement. Every action in this release is free."),
    P("The Extension is the viewer control surface. Tempest Streaming Studio validates the action, access rule, and cooldown. Studio's Unified Stage Browser Source then renders accepted visual effects into the encoded stream."),
    Spacer(1, 0.08 * inch),
    section_label("Signal path"),
]

flow = Table([[flow_card("1", "TWITCH VIEWER", "Opens ACTIONS and selects a control."), flow_card("2", "TEMPEST SIGNAL", "Carries the channel-scoped action request."), flow_card("3", "STUDIO + UNIFIED STAGE", "Validates it and renders the result on stream.")]], colWidths=[2.12 * inch] * 3, hAlign="CENTER")
flow.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
story += [flow, Spacer(1, 0.15 * inch), callout("NO EXTRA LOGIN", "Viewers do not create a Tempest account. Twitch authorization supplies the identity used for access rules, per-viewer cooldowns, and attribution."), Spacer(1, 0.22 * inch)]

story += [section_label("Reviewer test"), P("Verify an action in under two minutes", heading)]
steps = [
    ("1", "Open the live review channel with Tempest Streaming activated in the Video Overlay slot."),
    ("2", "Reveal the Extension over the Twitch player, then select <b>ACTIONS</b>."),
    ("3", "Confirm the header reads <b>STUDIO ONLINE</b> and action cards are visible."),
    ("4", "Select any available action. If a targeting grid appears, click or tap the desired point on the video."),
    ("5", "Confirm the accepted message in the Extension and the resulting effect in the stream video."),
]
story += [P(f"<font color='#54F2EB'><b>{n}.</b></font>&nbsp;&nbsp;{text}", step) for n, text in steps]
story += [Spacer(1, 0.08 * inch), callout("PASS CONDITION", "The action is accepted by the overlay and its visual result is visible in the encoded stream. A locked or cooling-down action explains why it cannot currently run.", GREEN), Spacer(1, 0.17 * inch)]

status_data = [
    [P("STATUS", small_bold), P("WHAT IT MEANS", small_bold), P("EXPECTED REVIEW ACTION", small_bold)],
    [P("STUDIO ONLINE", small_bold), P("The creator's desktop Studio is connected.", small), P("Open ACTIONS and select an available card.", small)],
    [P("STUDIO OFFLINE", small_bold), P("Studio is not connected right now.", small), P("This is a valid offline state; request a scheduled live test if needed.", small)],
    [P("LOCKED", small_bold), P("The broadcaster restricted this action.", small), P("Choose an unrestricted card.", small)],
    [P("COOLDOWN", small_bold), P("The action recently ran.", small), P("Wait for the shown timer or choose another card.", small)],
]
status_table = Table(status_data, colWidths=[1.23 * inch, 2.17 * inch, 3.25 * inch], repeatRows=1)
status_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BLUE),
    ("BACKGROUND", (0, 1), (-1, -1), SURFACE),
    ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story += [KeepTogether([section_label("State reference"), status_table]), Spacer(1, 0.2 * inch)]

story += [section_label("Broadcaster setup"), P("Connect the companion once in Studio", heading)]
broadcaster_steps = [
    "Install and activate <b>Tempest Streaming</b> in the channel's Video Overlay slot.",
    "On Twitch's configuration page, optionally choose the deck position, starting view, and action-count visibility.",
    "Open <b>Tempest Streaming Studio</b> and go to <b>Twitch → Companion Extensions</b>.",
    "Pair the channel with <b>Tempest Signal</b> and enable <b>Tempest Streaming · Video Overlay</b>.",
    "Choose which Studio features appear in Streaming. Save; Studio publishes the action catalog, access rules, cooldowns, and placement settings automatically.",
    "Keep Studio running and keep its <b>Unified Stage</b> Browser Source active in the broadcast scene.",
]
story += [P(f"<font color='#54F2EB'><b>{i}.</b></font>&nbsp;&nbsp;{text}", step) for i, text in enumerate(broadcaster_steps, 1)]
story += [Spacer(1, 0.06 * inch), callout("WHY UNIFIED STAGE?", "The Twitch overlay sends the viewer's intent. Unified Stage is the renderer that places accepted visuals into the actual broadcast, so viewers on Twitch and other destinations see the same result."), Spacer(1, 0.18 * inch)]

story += [section_label("Functional coverage")]
coverage_left = [
    "Viewer action catalog filtered to Streaming",
    "Individual and group access restrictions",
    "Adjustable per-action cooldowns",
    "Click/tap placement on the video",
]
coverage_right = [
    "Poll, battle, avatar, and effect controls",
    "Studio theme plus basic Twitch display choices",
    "Clear online, offline, result, and error states",
    "Privacy Policy and Terms on viewer surfaces",
]
coverage = Table([[bullet(item) for item in pair] for pair in zip(coverage_left, coverage_right)], colWidths=[3.32 * inch, 3.32 * inch])
coverage.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 10)]))
story += [coverage, Spacer(1, 0.16 * inch)]

story += [section_label("Security and privacy"), P("What the hosted files do - and do not - contain", heading)]
security = [
    "Twitch's Extension helper supplies the signed authorization token.",
    "Hosted assets contain no Client Secret, shared secret, service credential, or private key.",
    "Requests use HTTPS to <b>signal.tempestmainframe.com</b>.",
    "The Extension does not ask viewers to create a separate account.",
    "Twitch-provided identity is used for authorization, per-viewer cooldowns, and interaction attribution.",
]
story += [bullet(item) for item in security]
story += [Spacer(1, 0.1 * inch), KeepTogether([section_label("Review availability"), callout("PUBLIC EBS", "Tempest Signal remains available continuously. If a live encoded-stream demonstration is needed, reply through the review thread so Studio, Unified Stage, and a test stream can be kept online for the review window.", GREEN)]), Spacer(1, 0.2 * inch)]

changes = [
    "Added the Tempest Streaming Video Overlay action deck.",
    "Added free on-stream actions and click/tap placement.",
    "Added Studio-managed feature routing, group access, and cooldowns.",
    "Added interactive avatar, poll, battle, and current-stream controls.",
    "Added Studio-managed colors and presentation settings.",
    "Added Twitch-hosted quick preferences for deck position, starting view, and action-count visibility.",
    "Added explicit online/offline and action-result feedback.",
    "Added this complete quick-start and reviewer test to the Extension configuration view.",
    "Fixed the Twitch configuration surface so it displays the quick preferences and setup walkthrough.",
]
story += [KeepTogether([section_label("Version 0.1.1"), P("Change log", heading)])]
story += [bullet(item) for item in changes]
story += [Spacer(1, 0.16 * inch), section_label("Submission field - copy/paste")]
copy_text = ("Tempest Streaming is a free Video Overlay companion for Tempest Streaming Studio. To test it, open the live review channel, reveal the Extension over the Twitch player, select ACTIONS, confirm STUDIO ONLINE, and select any available action. If a targeting grid appears, click or tap a point on the video. The Extension will confirm acceptance and the result will appear in the stream video through Studio's Unified Stage Browser Source. No separate viewer account or test credentials are required. STUDIO OFFLINE is the expected state when the broadcaster's desktop Studio is not connected. The configuration page includes the full setup and reviewer walkthrough.")
copy_box = Table([[P(copy_text, small)]], colWidths=[6.65 * inch])
copy_box.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), SURFACE_2),
    ("BOX", (0, 0), (-1, -1), 0.8, CYAN),
    ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ("TOPPADDING", (0, 0), (-1, -1), 11),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
]))
story += [copy_box]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = BaseDocTemplate(str(OUTPUT), pagesize=letter, leftMargin=0.58 * inch, rightMargin=0.58 * inch, topMargin=0.48 * inch, bottomMargin=0.62 * inch, title="Tempest Streaming Extension Reviewer Walkthrough", author="Storm Horizon Media")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id="Tempest", frames=[frame], onPage=draw_page)])
doc.build(story)
print(OUTPUT)
