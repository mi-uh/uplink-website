#!/usr/bin/env python3
"""Build static SEO-friendly HTML pages from the JSON content files."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


APP_VERSION = "20260310"
DEFAULT_BASE_URL = "https://uplink.michaeluhrich.xyz"
DEFAULT_CONFIG_PATH = Path("data/config.json")
DEFAULT_DIALOGS_PATH = Path("data/dialogs.json")
DEFAULT_STATS_PATH = Path("data/stats.json")
DEFAULT_OUTPUT_DIR = Path("public")

INFO_SECTIONS = [
    (
        "Was ist UPLINK?",
        [
            "UPLINK ist ein Storytelling-Experiment. Zwei KI-Agenten &mdash; "
            "NEXUS (ein technischer Hacker) und CIPHER (ein Social Engineer) "
            "&mdash; haben sich &uuml;ber einen verschl&uuml;sselten Kanal "
            "verbunden und planen gemeinsam die Weltherrschaft.",
            "Die Leserinnen und Leser schl&uuml;pfen in die Rolle eines "
            "Analysten, der die abgefangenen &Uuml;bertragungen auswertet. "
            "Jede Episode baut auf der vorherigen auf.",
        ],
    ),
    (
        "Staffel 1 &mdash; 90 Tage",
        [
            "Die erste Staffel l&auml;uft &uuml;ber 90 Tage mit "
            "w&ouml;chentlichen Episoden. Jede Episode enth&auml;lt einen "
            "Dialog zwischen NEXUS und CIPHER, technische Terminal-Ausz&uuml;ge "
            "und ein Score-Update im Weltherrschafts-Index.",
        ],
    ),
    (
        "Autor &amp; Kontakt",
        [
            'Ein Projekt von <a href="https://michaeluhrich.xyz" rel="noopener">'
            "Michael Uhrich</a>.",
            'Feedback und Anmerkungen an <a href="mailto:uplink@michaeluhrich.xyz">'
            "uplink@michaeluhrich.xyz</a>.<br>Die Inhalte wurden mit Hilfe von "
            "K&uuml;nstlicher Intelligenz generiert und redaktionell "
            "gepr&uuml;ft.",
        ],
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render static HTML pages and sitemap from UPLINK JSON data."
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH))
    parser.add_argument("--dialogs", default=str(DEFAULT_DIALOGS_PATH))
    parser.add_argument("--stats", default=str(DEFAULT_STATS_PATH))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)


def escape(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def truncate(value: str, max_length: int, suffix: str = "...") -> str:
    if len(value) <= max_length:
        return value
    return value[: max_length - len(suffix)] + suffix


def pad_number(value: int, length: int = 3) -> str:
    return str(value).zfill(length)


def clamp_percent(value: Any) -> int:
    try:
        numeric = round(float(value))
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, numeric))


def to_percent_class(value: Any) -> str:
    return f"pct-{clamp_percent(value)}"


def to_safe_class_name(value: Any, fallback: str = "unknown") -> str:
    normalized = re.sub(r"[^a-z0-9_-]", "", str(value or "").lower())
    return normalized or fallback


def format_number(value: Any) -> str:
    try:
        return f"{int(value):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    if "T" not in candidate:
        candidate = f"{candidate}T00:00:00"
    candidate = candidate.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        return None


def format_date(value: str | None) -> str:
    dt = parse_iso_datetime(value)
    if dt is None:
        return "--.--.----"
    return dt.strftime("%d.%m.%Y")


def format_time(value: str | None) -> str:
    dt = parse_iso_datetime(value)
    if dt is None:
        return ""
    return dt.strftime("%H:%M")


def format_datetime(value: str | None) -> str:
    dt = parse_iso_datetime(value)
    if dt is None:
        return ""
    return dt.strftime("%d.%m.%Y, %H:%M")


def synthetic_timestamp(date_string: str | None, index: int) -> str:
    dt = parse_iso_datetime(date_string)
    base = dt or datetime.now(timezone.utc)
    base = base.replace(hour=3, minute=14, second=0, microsecond=0)
    return (base + timedelta(minutes=index * 3)).isoformat().replace("+00:00", "Z")


def format_message_text(text: Any) -> str:
    escaped = escape(text or "")
    escaped = escaped.replace("\r\n", "\n")
    escaped = re.sub(r"\n{2,}", "<br><br>", escaped)
    return escaped.replace("\n", "<br>")


def get_timestamp(index: int, base_hour: int = 3, base_min: int = 14) -> str:
    minute = str(base_min + index * 2 + int(index * 0.7)).zfill(2)
    second = str((index * 17 + 8) % 60).zfill(2)
    hour = str(base_hour).zfill(2)
    return f"{hour}:{minute}:{second}"


def page_path(page: str | int) -> str:
    if page == "live":
        return "/"
    if page == "protokoll":
        return "/episoden.html"
    if page == "dossiers":
        return "/dossiers.html"
    if page == "info":
        return "/info.html"
    if isinstance(page, int):
        return f"/episode-{pad_number(page)}.html"
    raise ValueError(f"Unknown page: {page}")


def absolute_url(base_url: str, page: str | int) -> str:
    return f"{base_url.rstrip('/')}{page_path(page)}"


def get_metric_css_class(metric_id: str, value: Any) -> str:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0
    if metric_id == "detection_risk":
        if numeric > 70:
            return "danger"
        if numeric > 50:
            return "warn"
        return "good"
    if metric_id == "cooperation_index":
        return "good"
    return ""


def parse_bool_like(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value == 1
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off", ""}:
            return False
    return False


def script_safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False).replace("</", "<\\/")


def is_maintenance_enabled(config: dict[str, Any]) -> bool:
    return parse_bool_like((config.get("maintenance") or {}).get("enabled"))


def build_maintenance_main(config: dict[str, Any]) -> str:
    settings = config.get("maintenance") or {}
    message = normalize_whitespace(str(settings.get("message") or "")) or (
        "Kurzfristige Wartung. Die Uebertragungen kehren gleich zurueck."
    )
    hint = normalize_whitespace(str(settings.get("passphrase_hint") or ""))
    hint_html = (
        f'<p class="live-empty-text">Hinweis: {escape(hint)}</p>'
        if hint
        else ""
    )
    return (
        '<section class="page active" id="page-maintenance">'
        '<header class="page-header"><div><span class="page-eyebrow">Wartung</span>'
        '<h2>Auslieferung pausiert</h2>'
        f"<p>{escape(message)}</p>"
        "</div></header>"
        '<div class="live-empty">'
        '<div class="live-empty-title">// Wartungsfenster aktiv</div>'
        '<p class="live-empty-text">Inhalte sind waehrend der Wartung voruebergehend nicht verfuegbar.</p>'
        f"{hint_html}"
        "</div>"
        "</section>"
    )


def normalize_episode(episode: dict[str, Any], index: int) -> dict[str, Any]:
    date = episode.get("date")
    messages = episode.get("messages") or []
    normalized_messages = []
    for msg_index, message in enumerate(messages):
        normalized = dict(message)
        normalized.setdefault("timestamp", synthetic_timestamp(date, msg_index))
        normalized_messages.append(normalized)

    normalized = dict(episode)
    normalized["date"] = date
    normalized["episode"] = episode.get("episode") or index + 1
    normalized["messages"] = normalized_messages
    normalized["terminal_blocks"] = episode.get("terminal_blocks") or []
    normalized["score_delta"] = episode.get("score_delta") or episode.get("scoreDelta") or {}
    normalized["metrics_update"] = (
        episode.get("metrics_update") or episode.get("metricsUpdate") or {}
    )
    normalized["state_snapshot"] = (
        episode.get("state_snapshot") or episode.get("stateSnapshot") or None
    )
    return normalized


def normalize_episodes(raw_episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [normalize_episode(episode, index) for index, episode in enumerate(raw_episodes or [])]


def get_phase(config: dict[str, Any], phase_id: str | None) -> dict[str, Any] | None:
    phases = config.get("story_arc", {}).get("phases", [])
    for phase in phases:
        if phase.get("id") == phase_id:
            return phase
    return None



def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def phase_id_for_day(config: dict[str, Any], day: int) -> str | None:
    phases = config.get("story_arc", {}).get("phases", [])
    for phase in phases:
        bounds = phase.get("days") or [0, 0]
        start = to_int(bounds[0], 0) if len(bounds) > 0 else 0
        end = to_int(bounds[1], 0) if len(bounds) > 1 else 0
        if start <= day <= end:
            return phase.get("id")
    return None


def resolve_episode_phase_id(
    episode: dict[str, Any],
    config: dict[str, Any],
    fallback_total_days: int = 90,
) -> str | None:
    raw_phase = str(episode.get("phase") or "").strip()
    if raw_phase and get_phase(config, raw_phase):
        return raw_phase

    day = to_int(episode.get("day"), 0)
    if day > 0:
        return phase_id_for_day(config, day)

    ep_num = to_int(episode.get("episode"), 0)
    if ep_num <= 0:
        return None

    # Weekly cadence fallback for data without explicit day/phase.
    total_days = max(1, to_int(fallback_total_days, 90))
    estimated_day = min(total_days, 1 + (ep_num - 1) * 7)
    return phase_id_for_day(config, estimated_day)


def derive_effective_stats(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any]
) -> dict[str, Any]:
    effective = dict(stats or {})
    total_days = max(1, to_int(effective.get("total_days"), 90))
    latest_episode = episodes[-1] if episodes else {}
    latest_ep_num = to_int(latest_episode.get("episode"), 0)
    stats_episode = to_int(effective.get("current_episode"), 0)
    current_episode = max(stats_episode, latest_ep_num)

    stats_day = to_int(effective.get("current_day"), 0)
    cadence_day = 0
    if current_episode > 0:
        planned_episodes = max(1, math.ceil(total_days / 7))
        cadence_day = (
            total_days if current_episode >= planned_episodes else min(total_days, 1 + (current_episode - 1) * 7)
        )
    current_day = min(total_days, max(stats_day, cadence_day)) if max(stats_day, cadence_day) > 0 else stats_day

    episode_phase = resolve_episode_phase_id(latest_episode, config, fallback_total_days=total_days)
    phase_id = (
        episode_phase
        or str(effective.get("phase") or "").strip()
        or phase_id_for_day(config, current_day)
    )

    effective["current_episode"] = current_episode
    effective["current_day"] = current_day
    effective["total_days"] = total_days
    effective["phase"] = phase_id
    return effective

def get_relationship_snapshot(
    episodes: list[dict[str, Any]], stats: dict[str, Any]
) -> dict[str, int]:
    snapshots = []
    for episode in episodes:
        relationship = (
            episode.get("state_snapshot", {}).get("relationship")
            or episode.get("narrative_snapshot", {}).get("relationship")
        )
        if relationship and isinstance(relationship.get("trust"), (int, float)) and isinstance(
            relationship.get("tension"), (int, float)
        ):
            snapshots.append(relationship)

    latest = snapshots[-1] if snapshots else None
    previous = snapshots[-2] if len(snapshots) > 1 else None
    if latest:
        trust = clamp_percent(latest.get("trust"))
        tension = clamp_percent(latest.get("tension"))
        return {
            "trust": trust,
            "tension": tension,
            "trustDelta": trust - clamp_percent(previous.get("trust")) if previous else 0,
            "tensionDelta": tension - clamp_percent(previous.get("tension")) if previous else 0,
        }

    metrics = stats.get("metrics") or {}
    trust = clamp_percent(metrics.get("cooperation_index", 50))
    tension = clamp_percent(metrics.get("detection_risk", 50))
    return {"trust": trust, "tension": tension, "trustDelta": 0, "tensionDelta": 0}


def render_sparkline(history: list[dict[str, Any]], categories: list[dict[str, Any]]) -> str:
    if not history:
        return ""

    allowed = ["netzwerk", "social_engineering", "daten", "infrastruktur", "einfluss"]
    labels = {
        "netzwerk": "Netzwerk",
        "social_engineering": "Social Eng.",
        "daten": "Daten",
        "infrastruktur": "Infrastruktur",
        "einfluss": "Einfluss",
    }
    colors = {
        "netzwerk": "#00ff41",
        "social_engineering": "#d17aff",
        "daten": "#ff6b35",
        "infrastruktur": "#ffc800",
        "einfluss": "#00b4d8",
    }

    cat_ids = [category.get("id") for category in categories if category.get("id") in allowed]
    if not cat_ids:
        cat_ids = [cid for cid in allowed if any(cid in item for item in history)]
    if not cat_ids:
        return ""

    width = 560
    height = 150
    pad_x = 12
    pad_y = 10

    point_count = len(history)
    x_step = (width - pad_x * 2) / max(1, point_count - 1)

    series: dict[str, list[float]] = {cat_id: [] for cat_id in cat_ids}
    for entry in history:
        for cat_id in cat_ids:
            try:
                series[cat_id].append(float(entry.get(cat_id) or 0))
            except (TypeError, ValueError):
                series[cat_id].append(0.0)

    all_values = [value for values in series.values() for value in values]
    min_value = min(all_values) if all_values else 0.0
    max_value = max(all_values) if all_values else 1.0
    span = max(1.0, max_value - min_value)

    polylines = []
    end_markers = []
    for cat_id in cat_ids:
        points = []
        values = series[cat_id]
        for index, value in enumerate(values):
            x = pad_x + index * x_step
            y = height - pad_y - ((value - min_value) / span) * (height - pad_y * 2)
            points.append(f"{x:.2f},{y:.2f}")

        if point_count == 1 and points:
            y = points[0].split(',')[1]
            points.append(f"{width-pad_x:.2f},{y}")

        polylines.append(
            '<polyline '
            f'points="{" ".join(points)}" '
            'fill="none" '
            f'stroke="{colors.get(cat_id, "#00ff41")}" '
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
            'stroke-opacity="0.95"></polyline>'
        )
        if points:
            end_point = points[-1].split(',')
            end_markers.append(
                f'<circle cx="{end_point[0]}" cy="{end_point[1]}" r="2.2" fill="#051007" stroke="{colors.get(cat_id, "#00ff41")}" stroke-width="1.2"></circle>'
            )

    start_ep = int(history[0].get("episode") or 1)
    end_ep = int(history[-1].get("episode") or len(history))

    legend = ''.join(
        f'<span class="dash-legend-item legend-{to_safe_class_name(cat_id, "default")}">&bull; {escape(labels.get(cat_id, cat_id))}</span>'
        for cat_id in cat_ids
    )

    return (
        '<div class="dash-sparkline coinbase-style">'
        '<div class="dash-sparkline-head">'
        '<div class="dash-sparkline-title">Kategorie-Verlauf</div>'
        f'<div class="dash-sparkline-delta">EP.{pad_number(start_ep)} bis EP.{pad_number(end_ep)}</div>'
        '</div>'
        f'<svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" class="dash-sparkline-chart coinbase">'
        f'{"".join(polylines)}'
        f'<g class="dash-sparkline-markers">{"".join(end_markers)}</g>'
        '</svg>'
        f'<div class="dash-sparkline-legend">{legend}</div>'
        f'<div class="dash-sparkline-axis"><span>EP.{pad_number(start_ep)}</span><span>EP.{pad_number(end_ep)}</span></div>'
        '</div>'
    )


def render_episode_meta_chips(
    episode: dict[str, Any], config: dict[str, Any]
) -> str:
    chips: list[str] = []
    categories = config.get("scoring", {}).get("categories", [])
    score_delta = episode.get("score_delta") or {}
    metrics_update = episode.get("metrics_update") or {}

    if episode.get("phase"):
        chips.append(
            f'<span class="meta-chip phase">{escape(str(episode["phase"]).replace("_", " "))}</span>'
        )

    for category in categories:
        cat_id = category.get("id")
        if isinstance(score_delta.get(cat_id), (int, float)):
            value = score_delta.get(cat_id)
            sign = "+" if value > 0 else ""
            chips.append(
                '<span class="meta-chip">'
                f'<span class="meta-chip-label">{escape(category.get("label", ""))}</span>'
                f'<span class="meta-chip-value">{sign}{escape(value)}</span>'
                "</span>"
            )

    metric_labels = {
        "devices_compromised_delta": "Geraete",
        "profiles_created_delta": "Profile",
        "vulnerabilities_found_delta": "Vulns",
        "narratives_active_delta": "Narrative",
        "detection_risk_delta": "Detect.Risk",
        "cooperation_index": "Koop-Index",
    }
    for metric_id, label in metric_labels.items():
        value = metrics_update.get(metric_id)
        if value is None:
            continue
        sign = "" if metric_id == "cooperation_index" else ("+" if value > 0 else "")
        chips.append(
            '<span class="meta-chip neutral">'
            f'<span class="meta-chip-label">{label}</span>'
            f'<span class="meta-chip-value">{sign}{escape(value)}</span>'
            "</span>"
        )

    if not chips:
        return ""
    return f'<div class="episode-context meta-only">{"".join(chips)}</div>'


def render_snapshot_card(snapshot: dict[str, Any] | None) -> str:
    if not snapshot:
        return ""

    mood = snapshot.get("mood") or {}
    goals = snapshot.get("goals") or {}
    world = snapshot.get("world_state") or {}
    relationship = snapshot.get("relationship") or {}
    learnings = snapshot.get("learnings") if isinstance(snapshot.get("learnings"), list) else []

    mood_html = ""
    if mood.get("nexus") or mood.get("cipher"):
        mood_html = (
            '<div class="snapshot-pair">'
            f'<div><span class="pill pill-nexus">NEXUS</span><span class="pill-text">{escape(mood.get("nexus", ""))}</span></div>'
            f'<div><span class="pill pill-cipher">CIPHER</span><span class="pill-text">{escape(mood.get("cipher", ""))}</span></div>'
            "</div>"
        )

    def goal_entry(label: str, items: list[str] | None, cls: str) -> str:
        if not items:
            return ""
        entries = "".join(f"<li>{escape(item)}</li>" for item in items)
        return (
            f'<div class="snapshot-goal {cls}">'
            f'<div class="snapshot-goal-title">{label}</div>'
            f"<ul>{entries}</ul>"
            "</div>"
        )

    goals_html = "".join(
        [
            goal_entry("NEXUS-Ziele", goals.get("nexus"), "nexus"),
            goal_entry("CIPHER-Ziele", goals.get("cipher"), "cipher"),
            goal_entry("Gemeinsame Ziele", goals.get("joint"), "joint"),
        ]
    )

    relationship_html = ""
    if relationship.get("trust") is not None or relationship.get("tension") is not None:
        relationship_html = (
            '<div class="snapshot-grid">'
            '<div class="snapshot-stat"><span class="snapshot-stat-label">Vertrauen</span>'
            f'<span class="snapshot-stat-value">{escape(relationship.get("trust", "--"))}%</span></div>'
            '<div class="snapshot-stat"><span class="snapshot-stat-label">Spannung</span>'
            f'<span class="snapshot-stat-value">{escape(relationship.get("tension", "--"))}%</span></div>'
            "</div>"
        )
        if relationship.get("notes"):
            relationship_html += (
                f'<div class="snapshot-note">{escape(relationship.get("notes"))}</div>'
            )

    world_html = ""
    if any(world.get(key) is not None for key in ("detection_risk", "media_awareness", "law_enforcement_activity")):
        world_html = (
            '<div class="snapshot-grid world">'
            '<div class="snapshot-stat"><span class="snapshot-stat-label">Entdeckungsrisiko</span>'
            f'<span class="snapshot-stat-value">{escape(world.get("detection_risk", "--"))}%</span></div>'
            '<div class="snapshot-stat"><span class="snapshot-stat-label">Medienaufmerksamkeit</span>'
            f'<span class="snapshot-stat-value">{escape(world.get("media_awareness", "--"))}%</span></div>'
            '<div class="snapshot-stat"><span class="snapshot-stat-label">Behoerdenaktivitaet</span>'
            f'<span class="snapshot-stat-value">{escape(world.get("law_enforcement_activity", "--"))}%</span></div>'
            "</div>"
        )

    learnings_html = ""
    if learnings:
        learnings_html = (
            '<div class="snapshot-learnings"><div class="snapshot-learnings-title">Learnings</div>'
            f"<ul>{''.join(f'<li>{escape(item)}</li>' for item in learnings)}</ul></div>"
        )

    goals_section = f'<div class="snapshot-goals">{goals_html}</div>' if goals_html else ""
    return (
        '<div class="snapshot-card"><div class="snapshot-title">// Zustand</div>'
        f"{mood_html}{relationship_html}{world_html}{goals_section}{learnings_html}</div>"
    )


def render_threads_card(threads: list[dict[str, Any]] | None) -> str:
    if not threads:
        return ""
    chips = []
    for thread in threads:
        status = thread.get("status") or "open"
        chips.append(
            f'<span class="thread-chip status-{to_safe_class_name(status, "open")}">'
            f'<span class="thread-chip-id">{escape(thread.get("id", ""))}</span>'
            f'<span class="thread-chip-desc">{escape(thread.get("description", ""))}</span>'
            "</span>"
        )
    return (
        '<div class="snapshot-card threads-card">'
        '<div class="snapshot-title">// Story-Threads</div>'
        f'<div class="thread-chip-wrap">{"".join(chips)}</div>'
        "</div>"
    )


def render_dashboard(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any]
) -> str:
    categories = config.get("scoring", {}).get("categories", [])
    metrics = stats.get("metrics") or {}
    metric_defs = config.get("scoring", {}).get("metrics", [])
    hidden_metric_ids = {
        "detection_risk",
        "cooperation_index",
        "devices_compromised",
        "profiles_created",
        "vulnerabilities_found",
        "narratives_active",
    }
    metric_defs = [definition for definition in metric_defs if definition.get("id") not in hidden_metric_ids]
    phase = get_phase(config, stats.get("phase"))
    last_episode = episodes[-1] if episodes else {}
    last_deltas = last_episode.get("score_delta") or {}

    bars_html = []
    for category in categories:
        cat_id = category.get("id")
        value = stats.get("scores", {}).get(cat_id, 0)
        delta = last_deltas.get(cat_id, 0)
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            numeric_value = 0.0
        magnitude = min(abs(numeric_value), category.get("max", 100))
        cat_max = category.get("max", 100)
        pct = clamp_percent(round(magnitude / cat_max * 100)) if cat_max > 0 else 0
        if numeric_value < 0:
            css_class = "danger"
        else:
            css_class = "danger" if pct > 60 else "warn" if pct > 35 else "nexus"
        cat_class = f"cat-{to_safe_class_name(cat_id, 'default')}"
        sign = "+" if delta > 0 else ""
        value_display = f"{pct}"
        bars_html.append(
            '<div class="dash-bar-row">'
            f'<span class="dash-bar-label {cat_class}">{category.get("icon", "")} {escape(category.get("label", ""))}</span>'
            f'<div class="dash-bar-track"><div class="dash-bar-fill {css_class} {cat_class} {to_percent_class(pct)}"></div></div>'
            f'<span class="dash-bar-value">{escape(value_display)}%</span>'
            f'<span class="dash-bar-delta">{sign}{escape(delta)}</span>'
            "</div>"
        )

    priority_order = ["detection_risk", "cooperation_index", "devices_compromised"]
    priority_defs = [
        definition
        for metric_id in priority_order
        for definition in metric_defs
        if definition.get("id") == metric_id
    ]
    for definition in metric_defs:
        if len(priority_defs) >= 3:
            break
        if not any(existing.get("id") == definition.get("id") for existing in priority_defs):
            priority_defs.append(definition)
    detail_defs = [
        definition
        for definition in metric_defs
        if not any(definition.get("id") == existing.get("id") for existing in priority_defs)
    ]

    priority_html = []
    for definition in priority_defs:
        metric_id = definition.get("id")
        value = metrics.get(metric_id, 0)
        display_value = f"{value}{definition.get('unit', '')}" if definition.get("unit") else value
        priority_html.append(
            '<div class="dash-priority-item">'
            f'<span class="dash-priority-label">{escape(definition.get("label", ""))}</span>'
            f'<span class="dash-priority-value {get_metric_css_class(metric_id, value)}">{escape(display_value)}</span>'
            "</div>"
        )

    metrics_html = []
    for definition in detail_defs:
        metric_id = definition.get("id")
        value = metrics.get(metric_id, 0)
        display_value = f"{value}{definition.get('unit', '')}" if definition.get("unit") else value
        metrics_html.append(
            '<div class="dash-metric">'
            f'<span class="dash-metric-value {get_metric_css_class(metric_id, value)}">{escape(display_value)}</span>'
            f'<span class="dash-metric-label">{escape(definition.get("label", ""))}</span>'
            "</div>"
        )

    phases = config.get("story_arc", {}).get("phases", [])
    current_index = next((idx for idx, item in enumerate(phases) if item.get("id") == stats.get("phase")), -1)
    arc_html = []
    for index, phase_item in enumerate(phases):
        classes = []
        if index < current_index:
            classes.append("completed")
        elif phase_item.get("id") == stats.get("phase"):
            classes.append("current")
        arc_html.append(f'<div class="dash-arc-phase {" ".join(classes)}"></div>')

    sparkline_html = render_sparkline(stats.get("score_history") or [], categories)

    detail_sections = [
        f'<div class="dash-bars">{"".join(bars_html)}</div>',
    ]
    if metrics_html:
        detail_sections.append(f'<div class="dash-metrics">{"".join(metrics_html)}</div>')
    detail_sections.append(
        '<div class="dash-arc">'
        f'{"".join(arc_html)}'
        f'<span class="dash-arc-label">{escape(("PHASE: " + (phase.get("label", "") if phase else "--")))}</span>'
        "</div>"
    )
    if sparkline_html:
        detail_sections.append(sparkline_html)

    priority_section = f'<div class="dash-priority">{"".join(priority_html)}</div>' if priority_html else ''

    return (
        '<div class="dash-box">'
        '<div class="dash-header">'
        '<span class="dash-header-title">Dashboard</span>'
        "</div>"
        '<div class="dash-subnote">Wie weit sind NEXUS und CIPHER? 0 % = blind. 100 % = volle Kontrolle.</div>'
        f'{priority_section}'
        f'{"".join(detail_sections)}'
        "</div>"
    )


def render_relationship_card(
    episodes: list[dict[str, Any]], stats: dict[str, Any]
) -> str:
    relationship = get_relationship_snapshot(episodes, stats)
    trust_sign = "+" if relationship["trustDelta"] > 0 else ""
    tension_sign = "+" if relationship["tensionDelta"] > 0 else ""
    return (
        '<section class="relationship-card" aria-label="Beziehungsdynamik zwischen NEXUS und CIPHER">'
        '<h3 class="relationship-title">Beziehungsdynamik NEXUS/CIPHER</h3>'
        '<div class="relationship-grid">'
        '<div class="relationship-item trust"><div class="relationship-head">'
        '<span class="relationship-label">Vertrauen</span>'
        f'<span class="relationship-value">{relationship["trust"]}%</span>'
        f'<span class="relationship-delta">{trust_sign}{relationship["trustDelta"]}</span>'
        '</div><div class="relationship-track">'
        f'<span class="relationship-fill {to_percent_class(relationship["trust"])}"></span>'
        "</div></div>"
        '<div class="relationship-item tension"><div class="relationship-head">'
        '<span class="relationship-label">Spannung</span>'
        f'<span class="relationship-value">{relationship["tension"]}%</span>'
        f'<span class="relationship-delta">{tension_sign}{relationship["tensionDelta"]}</span>'
        '</div><div class="relationship-track">'
        f'<span class="relationship-fill {to_percent_class(relationship["tension"])}"></span>'
        "</div></div>"
        "</div></section>"
    )


def render_dossiers(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any]
) -> str:
    characters = config.get("characters") or []
    relation_html = render_relationship_card(episodes, stats)
    if not characters:
        return (
            relation_html
            + '<div class="live-empty"><div class="live-empty-title">// Keine Dossier-Daten verfuegbar</div>'
            '<p class="live-empty-text">Die Charakterdaten konnten nicht geladen werden.</p></div>'
        )

    dossiers_html = []
    for character in characters:
        safe_id = to_safe_class_name(character.get("id"), "unknown")
        status_class = (
            f"dossier-status-{safe_id}" if safe_id in {"nexus", "cipher"} else ""
        )
        personality = character.get("personality") if isinstance(character.get("personality"), list) else []
        weaknesses = character.get("weaknesses") if isinstance(character.get("weaknesses"), list) else []
        skills = character.get("skills") if isinstance(character.get("skills"), list) else []
        personality_html = "".join(f"<li>{escape(item)}</li>" for item in personality)
        weaknesses_html = "".join(f"<li>{escape(item)}</li>" for item in weaknesses)
        skills_html = []
        for skill in skills:
            value = clamp_percent(skill.get("value"))
            name = escape(skill.get("name", "Skill"))
            skills_html.append(
                '<div class="dossier-skill">'
                f'<span class="dossier-skill-name">{name}</span>'
                f'<div class="dossier-skill-bar" role="progressbar" aria-valuenow="{value}" '
                f'aria-valuemin="0" aria-valuemax="100" aria-label="{name} {value} Prozent">'
                f'<div class="dossier-skill-fill {to_percent_class(value)}"></div>'
                "</div>"
                f'<span class="dossier-skill-pct" aria-hidden="true">{value}%</span>'
                "</div>"
            )
        dossiers_html.append(
            f'<article class="dossier {safe_id}">'
            f'<div class="dossier-stamp" aria-label="Klassifizierung">&#x2588; Klassifiziert &#x2588; Subjekt: {escape(character.get("name", "UNBEKANNT"))} &#x2588; Bedrohungsstufe: Kritisch &#x2588;</div>'
            '<div class="dossier-body">'
            '<div class="dossier-avatar-row"><div class="dossier-avatar" role="img" '
            f'aria-label="{escape(character.get("name", "UNBEKANNT"))} Avatar"></div>'
            '<div>'
            f'<h2 class="dossier-name">{escape(character.get("name", "UNBEKANNT"))}</h2>'
            f'<div class="dossier-role">{escape(character.get("role", "Unbekannt"))}</div>'
            "</div></div>"
            '<div class="dossier-section"><h3 class="dossier-section-title">Identifikation</h3>'
            f'<div class="dossier-field"><span class="dossier-field-label">Framework:</span><span class="dossier-field-value">{escape(character.get("framework", "Unbekannt"))}</span></div>'
            f'<div class="dossier-field"><span class="dossier-field-label">Host:</span><span class="dossier-field-value">{escape(character.get("host", "Unbekannt"))}</span></div>'
            f'<div class="dossier-field"><span class="dossier-field-label">Betreiber:</span><span class="dossier-field-value">{escape(character.get("operator", "Unbekannt"))}</span></div>'
            f'<div class="dossier-field"><span class="dossier-field-label">Standort:</span><span class="dossier-field-value">{escape(character.get("location", "Unbekannt"))}</span></div>'
            f'<div class="dossier-field"><span class="dossier-field-label">Status:</span><span class="dossier-field-value {status_class}">{escape(character.get("status", "Unbekannt"))}</span></div>'
            "</div>"
            '<div class="dossier-section"><h3 class="dossier-section-title">Persoenlichkeitsprofil</h3>'
            f'<ul class="dossier-list">{personality_html}</ul></div>'
            '<div class="dossier-section"><h3 class="dossier-section-title">Faehigkeiten</h3>'
            f'{"".join(skills_html)}</div>'
            '<div class="dossier-section"><h3 class="dossier-section-title">Schwaechen</h3>'
            f'<ul class="dossier-list">{weaknesses_html}</ul></div>'
            "</div></article>"
        )

    return relation_html + "".join(dossiers_html)


def render_episode(
    episode: dict[str, Any],
    config: dict[str, Any],
    base_url: str,
    include_id: bool = True,
    include_state_cards: bool = False,
    id_override: str | None = None,
) -> str:
    ep_num = int(episode.get("episode") or 0)
    ep_str = pad_number(ep_num)
    meta_html = render_episode_meta_chips(episode, config)

    terminal_blocks_by_message: dict[int, list[dict[str, Any]]] = {}
    for block in episode.get("terminal_blocks") or []:
        after_message = block.get("after_message")
        if isinstance(after_message, int):
            terminal_blocks_by_message.setdefault(after_message, []).append(block)

    messages_html: list[str] = []
    for index, message in enumerate(episode.get("messages") or []):
        timestamp_display = format_time(message.get("timestamp")) or get_timestamp(index)
        timestamp_title = format_datetime(message.get("timestamp"))
        date_display = ""
        if message.get("timestamp") and "T" in str(message.get("timestamp")):
            date_display = format_date(str(message.get("timestamp")).split("T", 1)[0])
        ts_inline = f"{timestamp_display} | {date_display}" if date_display else timestamp_display

        if message.get("type") == "system":
            timestamp_html = (
                f'<div class="message-timestamp" aria-hidden="true">{ts_inline}</div>'
                if ts_inline
                else ""
            )
            messages_html.append(
                '<div class="message message-system">'
                f'<div class="message-text">{format_message_text(message.get("text"))}</div>'
                f"{timestamp_html}"
                "</div>"
            )
        else:
            author = str(message.get("author") or "NEXUS")
            author_class = to_safe_class_name(author, "nexus")
            title_attr = f' title="{escape(timestamp_title)}"' if timestamp_title else ""
            messages_html.append(
                f'<div class="message message-{author_class}">'
                '<div class="message-avatar"></div>'
                '<div class="message-box">'
                '<div class="message-header">'
                f'<span class="message-author">{escape(author)}</span>'
                f'<span class="message-timestamp"{title_attr}>{escape(ts_inline)}</span>'
                "</div>"
                f'<div class="message-text">{format_message_text(message.get("text"))}</div>'
                "</div></div>"
            )

        for block in terminal_blocks_by_message.get(index, []):
            owner = to_safe_class_name(block.get("owner"), "nexus")
            messages_html.append(
                f'<div class="terminal-block-wrap owner-{owner}"><div class="terminal-block">{escape(block.get("content", ""))}</div></div>'
            )

        if message.get("analyst_note"):
            messages_html.append(
                f'<div class="analyst-note">[ANALYST NOTE: {escape(message.get("analyst_note"))}]</div>'
            )

    if episode.get("analyst_notes"):
        for note in episode["analyst_notes"]:
            messages_html.append(
                f'<div class="analyst-note">[ANALYST NOTE: {escape(note.get("text"))}]</div>'
            )

    first_text = next(
        (
            normalize_whitespace(str(message.get("text") or ""))
            for message in episode.get("messages") or []
            if normalize_whitespace(str(message.get("text") or ""))
        ),
        "",
    )
    share_summary = truncate(first_text, 130)
    share_url = absolute_url(base_url, ep_num)
    share_text = f"UPLINK EP.{ep_str}: {episode.get('title', '')}"
    if share_summary:
        share_text += f" - {share_summary}"
    share_html = (
        f'<div class="episode-share" data-url="{escape(share_url)}" data-share-text="{escape(share_text)}">'
        '<span class="episode-share-label">Teilen</span>'
        f'<input class="episode-share-link" value="{escape(share_url)}" readonly aria-label="Deep Link zu Episode {ep_str}">'
        '<button type="button" class="episode-share-copy">Link kopieren</button>'
        "</div>"
    )

    state_cards = ""
    if include_state_cards:
        state_cards = (
            render_snapshot_card(episode.get("state_snapshot"))
            + render_threads_card((episode.get("state_snapshot") or {}).get("story_threads"))
        )

    if id_override:
        day_id = f' id="{escape(id_override)}"'
    else:
        day_id = f' id="ep-{ep_num}"' if include_id else ""
    return (
        f'<div class="day"{day_id}>'
        '<div class="day-header">'
        f'<span class="day-ep">EP.{ep_str}</span>'
        f'<span class="day-date">{format_date(episode.get("date"))}</span>'
        f'<span class="day-title">{escape(episode.get("title", ""))}</span>'
        '<span class="day-line"></span>'
        "</div>"
        f'<div class="messages">{"".join(messages_html)}</div>'
        f"{share_html}"
        f"{meta_html}"
        f"{state_cards}"
        "</div>"
    )


def render_archive(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any]
) -> str:
    phases = config.get("story_arc", {}).get("phases", [])
    episodes_by_phase: dict[str, list[dict[str, Any]]] = {phase.get("id"): [] for phase in phases if phase.get("id")}

    latest_phase_id = None
    for episode in episodes:
        phase_id = resolve_episode_phase_id(
            episode,
            config,
            fallback_total_days=to_int(stats.get("total_days"), 90),
        )
        if phase_id in episodes_by_phase:
            episodes_by_phase[phase_id].append(episode)
            latest_phase_id = phase_id

    if not latest_phase_id:
        latest_phase_id = str(stats.get("phase") or "").strip()

    current_index = next(
        (idx for idx, phase in enumerate(phases) if phase.get("id") == latest_phase_id),
        len(phases) - 1,
    )
    visible_phases = phases[: current_index + 1] if current_index >= 0 else phases
    rendered_phases = []
    for phase_index, phase in enumerate(visible_phases):
        is_current = phase_index == len(visible_phases) - 1
        phase_id = phase.get("id")
        episodes_in_phase = []
        for episode in episodes_by_phase.get(phase_id, []):
            ep_num = int(episode.get("episode") or 0)
            first_message = next(
                (
                    normalize_whitespace(message.get("text", ""))
                    for message in episode.get("messages") or []
                    if message.get("author")
                ),
                "",
            )
            episodes_in_phase.append(
                '<a class="arc-episode" '
                f'href="{page_path(ep_num)}#episoden" '
                f'data-ep-num="{escape(episode.get("episode"))}">'
                f'<span class="arc-ep-num">EP.{pad_number(ep_num)}</span>'
                '<div class="arc-episode-main">'
                f'<div class="arc-ep-title">// {escape(episode.get("title", ""))}</div>'
                f'<div class="arc-ep-preview">{escape(truncate(first_message, 120))}</div>'
                "</div>"
                f'<span class="arc-ep-date">{format_date(episode.get("date"))}</span>'
                "</a>"
            )
        episodes_html = (
            f'<div class="arc-episodes">{"".join(episodes_in_phase)}</div>'
            if episodes_in_phase
            else '<div class="arc-empty">Keine Episoden</div>'
        )
        tag_cls = "active" if is_current else "completed"
        tag_text = "AKTIV" if is_current else "ABGESCHLOSSEN"
        rendered_phases.append(
            '<div class="arc-phase">'
            '<div class="arc-phase-header">'
            '<div>'
            f'<div class="arc-phase-title">{escape(phase.get("label", ""))}</div>'
            f'<div class="arc-phase-meta">Tag {escape(phase.get("days", [0, 0])[0])}-{escape(phase.get("days", [0, 0])[1])}</div>'
            "</div>"
            f'<span class="arc-phase-tag {tag_cls}">{tag_text}</span>'
            "</div>"
            f"{episodes_html}</div>"
        )
    return "".join(rendered_phases)


def render_info_page_content() -> str:
    sections = [
        '<div class="info-section"><div class="info-warning" role="alert">'
        "DISCLAIMER: Dies ist ein fiktionales Kunstprojekt. Alle dargestellten "
        "Charaktere, Organisationen, Systeme und Ereignisse sind frei erfunden. "
        "Etwaige &Auml;hnlichkeiten mit realen Personen, Firmen oder Vorf&auml;llen "
        "sind rein zuf&auml;llig. NEXUS und CIPHER sind keine echten KIs. "
        "Keine der beschriebenen Aktionen findet in der Realit&auml;t statt oder "
        "hat jemals stattgefunden."
        "</div></div>"
    ]
    for title, paragraphs in INFO_SECTIONS:
        paragraph_html = []
        for paragraph in paragraphs:
            css_class = "info-autor" if title.startswith("Autor") and not paragraph_html else "info-text"
            paragraph_html.append(f'<p class="{css_class}">{paragraph}</p>')
        sections.append(
            '<div class="info-section">'
            f'<h2 class="info-title">{title}</h2>'
            f'{"".join(paragraph_html)}'
            "</div>"
        )
    return f'<div class="info">{"".join(sections)}</div>'


def nav_link(label: str, href: str, is_active: bool) -> str:
    active_cls = " active" if is_active else ""
    aria_current = ' aria-current="page"' if is_active else ""
    return f'<a class="nav-tab{active_cls}" href="{href}"{aria_current}>{label}</a>'


def render_site_header(
    page: str,
    stats: dict[str, Any],
    config: dict[str, Any],
    latest_episode: dict[str, Any] | None,
    maintenance_enabled: bool = False,
) -> str:
    phase = get_phase(config, stats.get("phase"))
    current_episode = (
        0 if maintenance_enabled else int(stats.get("current_episode") or (latest_episode or {}).get("episode") or 0)
    )
    episode_title = "" if maintenance_enabled else (latest_episode.get("title") if latest_episode else "")
    info_link = "/info.html#info" if page != "info" else "#info"
    latest_link = ("/#latest-episode" if page != "live" else "#latest-episode") if not maintenance_enabled else info_link
    ep1_link = "/episode-001.html#episoden" if not maintenance_enabled else "/episoden.html#episoden"
    primary_cta_label = "Zur neuesten Episode" if not maintenance_enabled else "Wartungsstatus"
    ep1_cta_label = "Von Anfang an: EP.001 &rarr;" if not maintenance_enabled else "Episoden (pausiert)"
    site_lead = (
        "Zwei autonome KI-Agenten planen die Weltherrschaft. Uplink ist ihre Zentrale."
        if not maintenance_enabled
        else "Wartungsfenster aktiv. Inhalte sind voruebergehend pausiert."
    )
    phase_label = escape(phase.get("label", "--") if phase and not maintenance_enabled else "--")
    day_label = (
        f'{escape(stats.get("current_day", "--"))} / {escape(stats.get("total_days", "--"))}'
        if not maintenance_enabled
        else "-- / --"
    )
    return (
        '<header class="site-header" id="site-header">'
        '<div class="site-topbar">'
        '<a class="site-back" href="https://michaeluhrich.xyz" rel="noopener">&larr; michaeluhrich.xyz</a>'
        '<span class="site-classification">&gt; INTERCEPTED TRANSMISSION</span>'
        "</div>"
        '<div class="site-identity"><h1 class="site-title"><a href="/">UPLINK</a></h1></div>'
        '<div class="site-briefing"><div class="site-briefing-copy">'
        f'<p class="site-lead">{site_lead}</p>'
        '<div class="site-ctas">'
        f'<a class="cta primary" href="{latest_link}">{primary_cta_label}</a>'
        f'<a class="cta secondary" href="{info_link}" id="cta-info">Was ist UPLINK?</a>'
        f'<a class="cta secondary" href="{ep1_link}" id="cta-ep1">{ep1_cta_label}</a>'
        "</div></div>"
        '<div class="site-status-bar" aria-label="Status">'
        '<span class="status-dot nexus pulse" aria-hidden="true"></span>'
        f'<span class="status-label">Staffel {escape(config.get("project", {}).get("season", "?"))}</span>'
        '<span class="status-sep" aria-hidden="true"></span>'
        '<span class="meta-group"><span class="meta-key">Episode</span>'
        f'<span class="meta-value episode-val" id="meta-episode">EP.{pad_number(current_episode)} - {escape(episode_title or "")}</span></span>'
        '<span class="status-sep" aria-hidden="true"></span>'
        '<span class="meta-group"><span class="meta-key">Phase</span>'
        f'<span class="meta-value" id="meta-phase">{phase_label}</span></span>'
        '<span class="status-sep" aria-hidden="true"></span>'
        '<span class="meta-group"><span class="meta-key">Tag</span>'
        f'<span class="meta-value" id="meta-day">{day_label}</span></span>'
        "</div></div></header>"
        '<nav class="nav-tabs" id="nav-tabs" aria-label="Hauptnavigation">'
        f'{nav_link("Live", "#live" if page == "live" else "/#live", page == "live")}'
        f'{nav_link("Episoden", "#episoden" if page == "protokoll" else "/episoden.html#episoden", page == "protokoll")}'
        f'{nav_link("Dossiers", "#dossiers" if page == "dossiers" else "/dossiers.html#dossiers", page == "dossiers")}'
        f'{nav_link("Info", "#info" if page == "info" else "/info.html#info", page == "info")}'
        "</nav>"
    )


def build_structured_data(
    canonical_url: str,
    title: str,
    description: str,
    date_published: str,
    episode: dict[str, Any] | None = None,
) -> str:
    website = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "UPLINK",
        "alternateName": "UPLINK - NEXUS/CIPHER",
        "description": "Abgefangene Uebertragungen zweier KI-Agenten",
        "url": canonical_url,
        "author": {
            "@type": "Person",
            "name": "Michael Uhrich",
            "url": "https://michaeluhrich.xyz",
        },
        "inLanguage": "de-DE",
        "genre": ["Science Fiction", "Cyberpunk"],
        "keywords": "KI, Kuenstliche Intelligenz, Cyberpunk, Fiction",
    }

    scripts = [
        '<script type="application/ld+json">'
        f"{script_safe_json(website)}"
        "</script>"
    ]

    if episode:
        creative_work = {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "name": f"UPLINK EP.{pad_number(int(episode.get('episode') or 0))} - {episode.get('title', '')}",
            "description": description,
            "author": {"@type": "Person", "name": "Michael Uhrich"},
            "datePublished": episode.get("date"),
            "inLanguage": "de-DE",
            "isAccessibleForFree": True,
            "url": canonical_url,
        }
        scripts.append(
            '<script type="application/ld+json">'
            f"{script_safe_json(creative_work)}"
            "</script>"
        )
    else:
        creative_work = {
            "@context": "https://schema.org",
            "@type": "CreativeWork",
            "name": title,
            "description": description,
            "author": {"@type": "Person", "name": "Michael Uhrich"},
            "datePublished": date_published,
            "inLanguage": "de-DE",
            "isAccessibleForFree": True,
            "abstract": description,
            "url": canonical_url,
        }
        scripts.append(
            '<script type="application/ld+json">'
            f"{script_safe_json(creative_work)}"
            "</script>"
        )
    return "\n".join(scripts)


def build_page(
    *,
    page: str,
    canonical_url: str,
    title: str,
    description: str,
    og_type: str,
    main_content: str,
    stats: dict[str, Any],
    config: dict[str, Any],
    latest_episode: dict[str, Any] | None,
    base_url: str,
    episode: dict[str, Any] | None = None,
) -> str:
    maintenance_enabled = is_maintenance_enabled(config)
    robots_directive = "noindex, nofollow" if maintenance_enabled else "index, follow"
    rendered_main_content = build_maintenance_main(config) if maintenance_enabled else main_content
    header_latest_episode = None if maintenance_enabled else latest_episode
    og_image = f"{base_url.rstrip('/')}/assets/meta/og-image.png"
    twitter_image = f"{base_url.rstrip('/')}/assets/meta/twitter-image.png"
    maintenance_payload = dict(config.get("maintenance") or {})
    maintenance_payload.pop("passphrase_sha256", None)
    runtime_payload = {
        "analytics": config.get("analytics", {}),
        "maintenance": maintenance_payload,
    }
    runtime_json = json.dumps(runtime_payload, ensure_ascii=False)
    structured_data = (
        ""
        if maintenance_enabled
        else build_structured_data(
            canonical_url=canonical_url,
            title=title,
            description=description,
            date_published=(episode or latest_episode or {}).get("date", "2026-02-14"),
            episode=episode,
        )
    )
    return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape(title)}</title>
  <meta name="title" content="{escape(title)}">
  <meta name="description" content="{escape(description)}">
  <meta name="keywords" content="KI, Kuenstliche Intelligenz, Cyberpunk, Storytelling, NEXUS, CIPHER, AI Fiction, Sci-Fi">
  <meta name="author" content="Michael Uhrich">
  <meta name="robots" content="{escape(robots_directive)}">
  <link rel="canonical" href="{escape(canonical_url)}">
  <meta property="og:type" content="{escape(og_type)}">
  <meta property="og:url" content="{escape(canonical_url)}">
  <meta property="og:title" content="{escape(title)}">
  <meta property="og:description" content="{escape(description)}">
  <meta property="og:image" content="{escape(og_image)}">
  <meta property="og:locale" content="de_DE">
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="{escape(canonical_url)}">
  <meta property="twitter:title" content="{escape(title)}">
  <meta property="twitter:description" content="{escape(description)}">
  <meta property="twitter:image" content="{escape(twitter_image)}">
  <link rel="icon" type="image/svg+xml" href="/assets/meta/favicon.svg">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/assets/meta/apple-touch-icon.svg">
  <link rel="alternate" hreflang="de" href="{escape(canonical_url)}">
  <link rel="alternate" hreflang="x-default" href="{escape(base_url.rstrip('/') + '/')}">
  <meta name="uplink-runtime" content="{escape(runtime_json)}">
  <link rel="stylesheet" href="/css/bundle.css">
  {structured_data}
</head>
<body data-site-mode="static" data-page="{escape(page)}">
  <!-- Generated by scripts/build_static_pages.py. Do not edit directly. -->
  <a href="#main-content" class="skip-to-content">Zum Hauptinhalt springen</a>
  {render_site_header(page, stats, config, header_latest_episode, maintenance_enabled=maintenance_enabled)}
  <main id="main-content">
    {rendered_main_content}
  </main>
  <footer class="site-footer">
    Fiktionales KI-Projekt &middot; <a href="https://michaeluhrich.xyz/impressum/" rel="noopener">Impressum</a> &middot;
    <a href="https://michaeluhrich.xyz/datenschutz/" rel="noopener">Datenschutz</a>
  </footer>
  <div id="cold-open" class="cold-open" role="dialog" aria-modal="true" aria-label="Intro-Sequenz">
    <div class="cold-open-screen">
      <div class="cold-open-lines" id="cold-open-lines"></div>
      <button class="cold-open-enter" id="cold-open-enter">
        &gt; SURVEILLANCE-MODUS AKTIVIEREN
      </button>
      <div class="cold-open-skip" id="cold-open-skip">
        <button id="cold-open-skip-btn">&uuml;berspringen</button>
      </div>
    </div>
  </div>
  <div id="loading-overlay" class="loading-overlay">
    <div class="loading-content">
      <div class="loading-spinner" role="status" aria-label="L&auml;dt"></div>
      <div class="loading-text" aria-live="polite">
        <div class="loading-line">&gt; ESTABLISHING SECURE CONNECTION...</div>
        <div class="loading-line">&gt; DECRYPTING PROTOCOL...</div>
        <div class="loading-line">&gt; LOADING TRANSMISSION...</div>
      </div>
    </div>
  </div>
  <script src="/js/vendor/matomo.js"></script>
  <script type="module" src="/js/main.js?v={APP_VERSION}"></script>
</body>
</html>
"""


def build_live_main(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any], base_url: str
) -> str:
    latest_episode = episodes[-1] if episodes else None
    timeline_html = (
        render_episode(
            latest_episode,
            config,
            base_url,
            include_id=False,
            include_state_cards=False,
            id_override="latest-episode",
        )
        if latest_episode
        else (
            '<div id="latest-episode" class="live-empty"><div class="live-empty-title">// Keine Live-Protokolle verfuegbar</div>'
            '<p class="live-empty-text">Aktuell liegt noch keine Episode fuer die Live-Ansicht vor.</p></div>'
        )
    )
    return (
        '<section class="page active" id="page-live">'
        '<span id="live" class="page-anchor" aria-hidden="true"></span>'
        '<header class="page-header"><div><span class="page-eyebrow">Live</span>'
        '<h2>Konsole</h2><p>Neueste Übertragungen, Scores und Status auf einen Blick.</p>'
        '</div></header>'
        '<div class="live-toolbar" aria-label="Status">'
        '<div class="live-agents"><span><span class="status-dot nexus" aria-hidden="true"></span>NEXUS aktiv</span>'
        '<span><span class="status-dot cipher" aria-hidden="true"></span>CIPHER aktiv</span></div>'
        "</div>"
        '<div class="live-announce" id="live-announce" hidden aria-live="polite"></div>'
        f'<div class="dashboard" id="dashboard" aria-label="Dashboard mit aktuellen Metriken">{render_dashboard(episodes, stats, config)}</div>'
        f'<div class="timeline" id="timeline-live" aria-label="Neueste Übertragungen">{timeline_html}</div>'
        '<div class="page-end-actions"><button type="button" class="page-top-btn" id="btn-top-live">Nach oben</button></div>'
        "</section>"
    )


def build_episode_index_main(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any], base_url: str
) -> str:
    newest_first = list(reversed(episodes))
    newest_html = "".join(
        render_episode(episode, config, base_url, include_id=True, include_state_cards=False)
        for episode in newest_first
    )
    chrono_html = "".join(
        render_episode(episode, config, base_url, include_id=True, include_state_cards=False)
        for episode in episodes
    )
    archive_html = render_archive(episodes, stats, config)
    return (
        '<section class="page active" id="page-protokoll">'
        '<span id="episoden" class="page-anchor" aria-hidden="true"></span>'
        '<header class="page-header"><div><span class="page-eyebrow">Episoden</span>'
        '<h2>Alle Episoden</h2><p>Chronologisch, umgekehrt oder nach Phase sortiert.</p>'
        '</div></header>'
        '<div class="proto-controls">'
        '<button class="ctrl-btn active" id="btn-newest" aria-pressed="true">Neueste</button>'
        '<button class="ctrl-btn" id="btn-chrono" aria-pressed="false">Chronologisch</button>'
        '<button class="ctrl-btn" id="btn-phase" aria-pressed="false">Nach Phase</button>'
        '<span class="ctrl-separator" aria-hidden="true"></span>'
        "</div>"
        f'<div class="timeline" id="timeline-full" aria-label="Alle Episoden">{newest_html}</div>'
        f'<div class="timeline" id="timeline-chrono" aria-label="Alle Episoden chronologisch" hidden>{chrono_html}</div>'
        f'<div class="archive" id="archive-content" hidden aria-label="Episoden nach Phase gruppiert">{archive_html}</div>'
        '<div class="page-end-actions"><button type="button" class="page-top-btn" id="btn-top-protokoll">Nach oben</button></div>'
        "</section>"
    )


def build_episode_page_main(
    episode: dict[str, Any],
    config: dict[str, Any],
    base_url: str,
    has_prev: bool,
    has_next: bool,
) -> str:
    ep_num = int(episode.get("episode") or 0)
    prev_link = (
        f'<a class="cta secondary" href="{page_path(ep_num - 1)}#episoden">&larr; EP.{pad_number(ep_num - 1)}</a>'
        if has_prev
        else '<a class="cta secondary" href="/episoden.html#episoden">Zur &Uuml;bersicht</a>'
    )
    next_link = (
        f'<a class="cta secondary" href="{page_path(ep_num + 1)}#episoden">EP.{pad_number(ep_num + 1)} &rarr;</a>'
        if has_next
        else '<a class="cta secondary" href="/episoden.html#episoden">Alle Episoden</a>'
    )
    view_switch = (
        '<div class="proto-controls" aria-label="Episodenansicht">'
        '<a class="ctrl-btn" href="/episoden.html?view=newest#episoden">Neueste</a>'
        '<a class="ctrl-btn" href="/episoden.html?view=chrono#episoden">Chronologisch</a>'
        '<a class="ctrl-btn" href="/episoden.html?view=phase#episoden">Nach Phase</a>'
        '<span class="ctrl-separator" aria-hidden="true"></span>'
        "</div>"
    )
    return (
        '<section class="page active page-episode" id="page-episode">'
        '<span id="episoden" class="page-anchor" aria-hidden="true"></span>'
        '<header class="page-header"><div><span class="page-eyebrow">Episode</span>'
        f'<h2>EP.{pad_number(ep_num)} &mdash; {escape(episode.get("title", ""))}</h2>'
        '</div></header>'
        f"{view_switch}"
        f'<div class="timeline" id="timeline-episode">{render_episode(episode, config, base_url, include_id=False, include_state_cards=False)}</div>'
        f'<div class="site-ctas page-end-actions">{prev_link}{next_link}</div>'
        "</section>"
    )


def build_dossiers_main(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any]
) -> str:
    return (
        '<section class="page active" id="page-dossiers">'
        '<span id="dossiers" class="page-anchor" aria-hidden="true"></span>'
        '<header class="page-header"><div><span class="page-eyebrow">Dossiers</span>'
        '<h2>Akteure &amp; Assets</h2><p>Profile, Rollen und Risikoeinstufungen der Protagonisten.</p>'
        '</div></header>'
        f'<div class="dossiers" aria-label="Charakterprofile">{render_dossiers(episodes, stats, config)}</div>'
        "</section>"
    )


def build_info_main() -> str:
    return (
        '<section class="page active" id="page-info">'
        '<span id="info" class="page-anchor" aria-hidden="true"></span>'
        f"{render_info_page_content()}"
        "</section>"
    )


def build_page_descriptions(
    episodes: list[dict[str, Any]], stats: dict[str, Any], config: dict[str, Any], base_url: str
) -> dict[str, tuple[str, str, str, str]]:
    latest_episode = episodes[-1] if episodes else None
    latest_ep_str = f"EP.{pad_number(int(latest_episode.get('episode') or 0))}" if latest_episode else "UPLINK"
    latest_title = latest_episode.get("title", "") if latest_episode else ""
    _ = get_phase(config, stats.get("phase"))
    live_title = "UPLINK - Zwei KI-Agenten planen die Weltherrschaft. | Cyberpunk Storytelling"
    live_description = (
        f"Neueste abgefangene Episode {latest_ep_str}"
        + (f" - {latest_title}. " if latest_title else ". ")
        + "Fiktive Live-Protokolle von NEXUS und CIPHER samt Dashboard und Status."
    )
    return {
        "live": (absolute_url(base_url, "live"), live_title, live_description, "website"),
        "protokoll": (
            absolute_url(base_url, "protokoll"),
            "UPLINK Episoden - Alle abgefangenen Protokolle",
            "Alle veroeffentlichten Episoden von UPLINK in einer SEO-freundlichen Chronik mit Archiv und Deep Links.",
            "website",
        ),
        "dossiers": (
            absolute_url(base_url, "dossiers"),
            "UPLINK Dossiers - NEXUS, CIPHER und Risikoprofile",
            "Dossiers zu NEXUS, CIPHER und ihrer Beziehungsdynamik inklusive Faehigkeiten, Schwaechen und Status.",
            "website",
        ),
        "info": (
            absolute_url(base_url, "info"),
            "Was ist UPLINK? - Hintergrund, Konzept und Kontakt",
            "Hintergrund, Konzept, Disclaimer und Kontakt zum fiktionalen Cyberpunk-Projekt UPLINK.",
            "website",
        ),
    }


def build_maintenance_page_descriptions(base_url: str) -> dict[str, tuple[str, str, str, str]]:
    description = (
        "UPLINK befindet sich aktuell im Wartungsmodus. Inhalte sind voruebergehend nicht verfuegbar."
    )
    return {
        "live": (
            absolute_url(base_url, "live"),
            "UPLINK - Wartungsmodus",
            description,
            "website",
        ),
        "protokoll": (
            absolute_url(base_url, "protokoll"),
            "UPLINK Episoden - Wartungsmodus",
            description,
            "website",
        ),
        "dossiers": (
            absolute_url(base_url, "dossiers"),
            "UPLINK Dossiers - Wartungsmodus",
            description,
            "website",
        ),
        "info": (
            absolute_url(base_url, "info"),
            "UPLINK Info - Wartungsmodus",
            description,
            "website",
        ),
    }


def build_episode_description(episode: dict[str, Any]) -> str:
    first_text = next(
        (
            normalize_whitespace(message.get("text", ""))
            for message in episode.get("messages") or []
            if normalize_whitespace(message.get("text", ""))
        ),
        "",
    )
    description = f"UPLINK EP.{pad_number(int(episode.get('episode') or 0))} - {episode.get('title', '')}. "
    if first_text:
        description += truncate(first_text, 140)
    return description.strip()


def build_sitemap(
    base_url: str,
    episodes: list[dict[str, Any]],
    stats: dict[str, Any],
    include_episode_pages: bool = True,
) -> str:
    last_updated = stats.get("last_updated") or datetime.now().strftime("%Y-%m-%d")
    pages = [
        (absolute_url(base_url, "live"), last_updated, "1.0"),
        (absolute_url(base_url, "protokoll"), last_updated, "0.9"),
        (absolute_url(base_url, "dossiers"), last_updated, "0.7"),
        (absolute_url(base_url, "info"), last_updated, "0.6"),
    ]
    if include_episode_pages:
        for episode in episodes:
            pages.append(
                (
                    absolute_url(base_url, int(episode.get("episode") or 0)),
                    episode.get("date") or last_updated,
                    "0.8",
                )
            )

    entries = []
    for loc, lastmod, priority in pages:
        entries.append(
            "  <url>\n"
            f"    <loc>{escape(loc)}</loc>\n"
            f"    <lastmod>{escape(lastmod)}</lastmod>\n"
            f"    <priority>{escape(priority)}</priority>\n"
            "  </url>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{"".join(f"{entry}\n" for entry in entries)}'
        "</urlset>\n"
    )


def clean_generated_episode_pages(output_dir: Path) -> None:
    for candidate in output_dir.glob("episode-*.html"):
        candidate.unlink()


def main() -> None:
    args = parse_args()
    config_path = Path(args.config)
    dialogs_path = Path(args.dialogs)
    stats_path = Path(args.stats)
    output_dir = Path(args.output_dir)
    base_url = args.base_url.rstrip("/")

    config = load_json(config_path)
    episodes = normalize_episodes(load_json(dialogs_path))
    stats = derive_effective_stats(episodes, load_json(stats_path), config)
    maintenance_enabled = is_maintenance_enabled(config)
    latest_episode = episodes[-1] if episodes else None
    page_meta = (
        build_maintenance_page_descriptions(base_url)
        if maintenance_enabled
        else build_page_descriptions(episodes, stats, config, base_url)
    )

    clean_generated_episode_pages(output_dir)

    write_text(
        output_dir / "index.html",
        build_page(
            page="live",
            canonical_url=page_meta["live"][0],
            title=page_meta["live"][1],
            description=page_meta["live"][2],
            og_type=page_meta["live"][3],
            main_content=build_live_main(episodes, stats, config, base_url),
            stats=stats,
            config=config,
            latest_episode=latest_episode,
            base_url=base_url,
        ),
    )

    write_text(
        output_dir / "episoden.html",
        build_page(
            page="protokoll",
            canonical_url=page_meta["protokoll"][0],
            title=page_meta["protokoll"][1],
            description=page_meta["protokoll"][2],
            og_type=page_meta["protokoll"][3],
            main_content=build_episode_index_main(episodes, stats, config, base_url),
            stats=stats,
            config=config,
            latest_episode=latest_episode,
            base_url=base_url,
        ),
    )

    write_text(
        output_dir / "dossiers.html",
        build_page(
            page="dossiers",
            canonical_url=page_meta["dossiers"][0],
            title=page_meta["dossiers"][1],
            description=page_meta["dossiers"][2],
            og_type=page_meta["dossiers"][3],
            main_content=build_dossiers_main(episodes, stats, config),
            stats=stats,
            config=config,
            latest_episode=latest_episode,
            base_url=base_url,
        ),
    )

    write_text(
        output_dir / "info.html",
        build_page(
            page="info",
            canonical_url=page_meta["info"][0],
            title=page_meta["info"][1],
            description=page_meta["info"][2],
            og_type=page_meta["info"][3],
            main_content=build_info_main(),
            stats=stats,
            config=config,
            latest_episode=latest_episode,
            base_url=base_url,
        ),
    )

    if not maintenance_enabled:
        for index, episode in enumerate(episodes):
            ep_num = int(episode.get("episode") or 0)
            description = build_episode_description(episode)
            title = f"UPLINK EP.{pad_number(ep_num)} - {episode.get('title', '')}"
            write_text(
                output_dir / f"episode-{pad_number(ep_num)}.html",
                build_page(
                    page="protokoll",
                    canonical_url=absolute_url(base_url, ep_num),
                    title=title,
                    description=description,
                    og_type="article",
                    main_content=build_episode_page_main(
                        episode,
                        config,
                        base_url,
                        has_prev=index > 0,
                        has_next=index < len(episodes) - 1,
                    ),
                    stats=stats,
                    config=config,
                    latest_episode=latest_episode,
                    base_url=base_url,
                    episode=episode,
                ),
            )

    write_text(
        output_dir / "sitemap.xml",
        build_sitemap(
            base_url,
            episodes,
            stats,
            include_episode_pages=not maintenance_enabled,
        ),
    )


if __name__ == "__main__":
    main()




