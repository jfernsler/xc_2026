"""Extract race results from Beach to Boulders 2026 PDF into a pandas DataFrame."""

import re
import sys
from pathlib import Path
from dataclasses import dataclass, fields
from typing import Optional

import pandas as pd
import pdfplumber


# ---------------------------------------------------------------------------
# Domain model
# ---------------------------------------------------------------------------

RACE_NUMBER = 1

# Categories containing these keywords are middle school (grades 6-8)
_MS_KEYWORDS = {"Level 1", "Level 2", "Level 3", "Grades 6", "Grade 6", "Grade 7", "Grade 8"}


def classify_grade(category: str) -> str:
    """Return 'ms' for middle school categories, 'hs' for high school."""
    for kw in _MS_KEYWORDS:
        if kw in category:
            return "ms"
    return "hs"


@dataclass
class RaceResult:
    race: int
    grade: str
    category: str
    place: Optional[int]
    number: int
    name: str
    team: str
    points: Optional[int]
    lap: str
    lap1: Optional[str]
    lap2: Optional[str]
    lap3: Optional[str]
    la: Optional[str]
    penalty: Optional[str]
    time: str


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_pages(pdf_path: str) -> list[str]:
    """Return raw text for every page in the PDF."""
    with pdfplumber.open(pdf_path) as pdf:
        return [page.extract_text() or "" for page in pdf.pages]


# ---------------------------------------------------------------------------
# Category detection
# ---------------------------------------------------------------------------

_CATEGORY_PATTERNS: list[re.Pattern] = [
    re.compile(
        r"^(Varsity\s+(?:Boys|Girls)"
        r"|JV[12]\s+(?:Boys|Girls)(?:\s+\w+)?"
        r"|JV1\s+(?:Boys|Girls)(?:\s+\w+)?"
        r"|Freshman\s+(?:Boys|Girls)(?:\s+\w+)?"
        r"|(?:Boys|Girls)\s+Level\s+\d\s+Grade[s]?\s+[\d/]+(?:\s+(?:ALPHA|BRAVO))?)",
        re.IGNORECASE,
    ),
]


def detect_category(line: str) -> Optional[str]:
    """Return the category name if *line* is a category header, else None."""
    stripped = line.strip()
    for pat in _CATEGORY_PATTERNS:
        m = pat.match(stripped)
        if m:
            return m.group(0).strip()
    return None


# ---------------------------------------------------------------------------
# Row parsing
# ---------------------------------------------------------------------------

_HEADER_RE = re.compile(r"^PLC\s+NO\s+NAME", re.IGNORECASE)

# Matches a result row.  The key insight is:
#   PLC  NO  NAME ...  TEAM  PTS  LAP  LAP1  LAP2  [LAP3]  [-]  [-]  TIME
# DNF / PULL rows start with '*' instead of a numeric place.
_ROW_RE = re.compile(
    r"^(?P<place>\d+|\*)\s+"          # place or '*'
    r"(?P<number>\d+)\s+"             # bib number
    r"(?P<rest>.+)$"                  # everything else
)

# From the right side we can reliably pull structured fields because times
# and lap fractions have a very constrained format.
_TAIL_RE = re.compile(
    r"(?P<points>\d+)?\s+"
    r"(?P<lap>\d/\d)\s+"
    r"(?P<lap1>[\d:]+\.\d+?)?\s+"
    r"(?P<lap2>[\d:]+\.\d+?|PULL(?:ED)?)?\s*"
    r"(?P<lap3>[\d:]+\.\d*|PULL(?:ED)?)?\s*"
    r"-\s+-?\s*"
    r"(?P<time>[\d:]+\.\d+|DNF)\s*$"
)

# DNF lines (no lap times at all)
_DNF_TAIL_RE = re.compile(
    r"(?P<lap>\d/\d)\s+"
    r"(?P<lap1>[\d:]+\.\d*)?\s*"
    r"(?P<lap2>[\d:]+\.\d*)?\s*"
    r"-\s*-?\s*-?\s*"
    r"(?P<time>DNF)\s*$"
)


def _split_name_team(blob: str, tail_start: int) -> tuple[str, str]:
    """Heuristically split the NAME + TEAM blob.

    Names are ALL-CAPS words (2-4 tokens).  Teams follow and are also
    ALL-CAPS but contain school / composite keywords.  We find the boundary
    by scanning for the first token that looks like it starts a team name
    (after at least two name tokens).
    """
    text = blob[:tail_start].strip()
    # Remove points-leader annotations in all forms:
    #   "(PTS LEADER)", "(PTS LEADER", "(PTS", "(PTS LEADER) TEAM", etc.
    # The annotation may lack a closing paren or contain extra words.
    text = re.sub(r"\(PTS[^)]*\)?\s*", "", text).strip()
    # Catch any leftover dangling parens from bad extraction
    text = re.sub(r"\(\s*\)", "", text).strip()
    tokens = text.split()

    if not tokens:
        return "", ""

    # Team keywords that signal the start of the team name
    team_kw = {
        "HIGH", "COMPOSITE", "INDEPENDENT", "MTB", "SCHOOL", "ACADEMY",
        "VALLEY", "OAK", "MESA", "CANYON", "CLARITA", "MONICA", "BAY",
        "MOUNTAINS", "CRESCENTA", "CLAREMONT", "BEAUMONT", "DAMIEN",
        "GLENDORA", "FOOTHILL", "SAUGUS", "NEWBURY", "ORCUTT", "FRANCIS",
        "TEHACHAPI", "ANTELOPE", "YUCAIPA", "MONROVIA", "LOYOLA", "CORONA",
        "WOODCREST", "CHRISTIAN", "RIDERS", "CHRIST", "MODENA", "MURRIETA",
        "TEMECULA", "TEMESCAL", "CONEJO", "CHAPARRAL", "EASTLAKE",
        "NORTH", "SOUTH", "MID", "CITY", "DEL", "NORTE", "PACIFIC",
        "CREST", "IDYLLWILD", "MOORPARK", "CLASSICAL", "VISTA", "RIM",
        "SAN", "GABRIEL", "JUAN", "LA", "ORANGE", "COUNTY", "HERITAGE",
        "SANTA", "COACHELLA", "DIEGO", "COASTAL",
    }

    # Strategy: names are 2-4 tokens (first + last, occasionally middle /
    # suffix).  Team names always contain at least one team_kw token.
    # We scan forward from index 2 to find the first team keyword.
    # As a fallback we scan backward from the end to find the last
    # non-team-keyword boundary, ensuring we never return an empty team.

    # Forward scan: first team keyword at index >= 2
    split_idx = None
    for i in range(2, len(tokens)):
        if tokens[i] in team_kw:
            split_idx = i
            break

    # If forward scan failed (no keyword found), check if the name has
    # 3+ tokens and the last token might be a team start we missed
    if split_idx is None:
        split_idx = min(2, len(tokens))

    name = " ".join(tokens[:split_idx])
    team = " ".join(tokens[split_idx:])

    # Safety: if team is empty but we have > 2 tokens, try split at 2
    if not team and len(tokens) > 2:
        name = " ".join(tokens[:2])
        team = " ".join(tokens[2:])

    return name, team


def parse_row(line: str, category: str) -> Optional[RaceResult]:
    """Parse a single result line into a RaceResult, or None if unparseable."""
    m = _ROW_RE.match(line.strip())
    if not m:
        return None

    place_str = m.group("place")
    number = int(m.group("number"))
    rest = m.group("rest")

    place: Optional[int] = None if place_str == "*" else int(place_str)

    # Try structured tail
    tail = _TAIL_RE.search(rest)
    if not tail:
        tail = _DNF_TAIL_RE.search(rest)

    if not tail:
        return None

    name, team = _split_name_team(rest, tail.start())

    points_str = tail.groupdict().get("points")
    points = int(points_str) if points_str else None

    def _clean_time(val: Optional[str]) -> Optional[str]:
        if val is None or val in ("", "-"):
            return None
        return val.strip().rstrip(".")

    return RaceResult(
        race=RACE_NUMBER,
        grade=classify_grade(category),
        category=category,
        place=place,
        number=number,
        name=name,
        team=team,
        points=points,
        lap=tail.group("lap"),
        lap1=_clean_time(tail.groupdict().get("lap1")),
        lap2=_clean_time(tail.groupdict().get("lap2")),
        lap3=_clean_time(tail.groupdict().get("lap3")),
        la=None,
        penalty=None,
        time=tail.group("time"),
    )


# ---------------------------------------------------------------------------
# Page processing pipeline
# ---------------------------------------------------------------------------

def is_header_line(line: str) -> bool:
    return bool(_HEADER_RE.match(line.strip()))


def is_noise(line: str) -> bool:
    """Lines to skip: page footers, blanks, protest headers, etc."""
    s = line.strip()
    if not s:
        return True
    if s.startswith("Race 1") or s.startswith("Individual Results"):
        return True
    if s.startswith("PROTEST") or s.startswith("RESULTS FINAL"):
        return True
    if s.isdigit():  # page numbers
        return True
    return False


def parse_page(text: str, current_category: str) -> tuple[list[RaceResult], str]:
    """Parse one page of text. Return (results, last_active_category)."""
    results: list[RaceResult] = []
    for line in text.splitlines():
        if is_noise(line) or is_header_line(line):
            continue
        cat = detect_category(line)
        if cat:
            current_category = cat
            continue
        row = parse_row(line, current_category)
        if row:
            results.append(row)
    return results, current_category


# ---------------------------------------------------------------------------
# DataFrame construction
# ---------------------------------------------------------------------------

def results_to_dataframe(results: list[RaceResult]) -> pd.DataFrame:
    """Convert a list of RaceResult dataclasses to a tidy DataFrame."""
    cols = [f.name for f in fields(RaceResult)]
    df = pd.DataFrame([{c: getattr(r, c) for c in cols} for r in results])
    df["place"] = df["place"].astype("Int64")
    df["points"] = df["points"].astype("Int64")
    return df


# ---------------------------------------------------------------------------
# Public API / orchestrator
# ---------------------------------------------------------------------------

def extract(pdf_path: str) -> pd.DataFrame:
    """End-to-end: PDF path → DataFrame."""
    pages = extract_pages(pdf_path)
    all_results: list[RaceResult] = []
    category = "Unknown"
    for text in pages:
        rows, category = parse_page(text, category)
        all_results.extend(rows)
    return results_to_dataframe(all_results)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python extract_results.py <path_to_pdf> [output.csv]")
        sys.exit(1)
    pdf_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "results.csv"

    df = extract(pdf_path)
    df.to_csv(out_path, index=False)
    print(f"Extracted {len(df)} rows across {df['category'].nunique()} categories → {out_path}")
    print(df.head(10).to_string())

    # Diagnostic: flag rows with empty team names
    empty_teams = df[df["team"].str.strip() == ""]
    if not empty_teams.empty:
        print(f"\n⚠ {len(empty_teams)} rows with empty team names:")
        print(empty_teams[["place", "number", "name", "team", "category"]].to_string())


if __name__ == "__main__":
    main()