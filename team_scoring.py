import pandas as pd
from collections import defaultdict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CSV_FILE = "results.csv"  # <-- change to your file path

# Division definitions — map team names to their division.
# Update this dict with your actual team→division mapping.
# Teams not listed default to Division II.
DIVISION_I_TEAMS = set()   # Add team names here if known
DIVISION_III_TEAMS = set() # Add team names here if known

# Scoring matrix limits per division
# (max_total_scorers, max_per_gender)
DIV_RULES = {
    1: (8, 6),
    2: (4, 3),
    3: (4, 3),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_division(team_name: str) -> int:
    if team_name in DIVISION_I_TEAMS:
        return 1
    if team_name in DIVISION_III_TEAMS:
        return 3
    return 2  # default


def detect_gender(category: str) -> str:
    """Return 'boys' or 'girls' based on category name."""
    cat = category.lower()
    if "girl" in cat:
        return "girls"
    return "boys"


def load_and_clean(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    # Normalise column names
    df.columns = df.columns.str.strip().str.lower()

    # Drop DNFs / riders with no points
    df = df.dropna(subset=["points"])
    df["points"] = pd.to_numeric(df["points"], errors="coerce")
    df = df.dropna(subset=["points"])
    df["points"] = df["points"].astype(int)

    # Clean up team names
    df["team"] = df["team"].fillna("INDEPENDENT / UNKNOWN").str.strip()

    # Add gender column derived from category
    df["gender"] = df["category"].apply(detect_gender)

    return df


# ---------------------------------------------------------------------------
# Single-category team ranking
#   Within one category all riders share the same gender, so the constraint
#   is simply "top N riders per team" where N = max_per_gender (since they
#   are all the same gender, the cross-gender cap doesn't further restrict).
# ---------------------------------------------------------------------------
def rank_teams_in_category(cat_df: pd.DataFrame) -> pd.DataFrame:
    """Return a DataFrame of teams ranked by sum of their top scorers."""
    records = []
    for team, grp in cat_df.groupby("team"):
        div = get_division(team)
        max_total, max_per_gender = DIV_RULES[div]

        # Within a single-gender category the binding limit is
        # min(max_total, max_per_gender) since all riders are same gender.
        limit = min(max_total, max_per_gender)

        top = grp.nlargest(limit, "points")
        records.append({
            "team": team,
            "division": div,
            "num_scorers": len(top),
            "team_points": top["points"].sum(),
            "scoring_riders": list(
                top[["name", "place", "points"]].itertuples(index=False, name=None)
            ),
        })

    result = (
        pd.DataFrame(records)
        .sort_values("team_points", ascending=False)
        .reset_index(drop=True)
    )
    result.index += 1  # 1-based rank
    result.index.name = "rank"
    return result


# ---------------------------------------------------------------------------
# Cross-category (overall) team ranking
#   Combines boys + girls categories for each team using the scoring matrix.
#   For a single race this picks the best combo per the div rules.
# ---------------------------------------------------------------------------
def rank_teams_overall(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build overall team scores across all categories by choosing the
    optimal boy/girl combination per the division rules.
    """
    # Collect every rider's best single-race points per team+gender
    team_gender = (
        df.sort_values("points", ascending=False)
        .groupby(["team", "gender"])
    )

    # Build pool: team -> gender -> sorted list of points + names
    pool = defaultdict(lambda: defaultdict(list))
    for (team, gender), grp in team_gender:
        for _, row in grp.iterrows():
            pool[team][gender].append((row["points"], row["name"], row["category"]))

    records = []
    for team in sorted(pool):
        div = get_division(team)
        max_total, max_per_gender = DIV_RULES[div]

        boys = pool[team].get("boys", [])[:max_per_gender]
        girls = pool[team].get("girls", [])[:max_per_gender]

        # Try every valid split: b boys + g girls where b+g <= max_total,
        # b <= max_per_gender, g <= max_per_gender
        best_score = 0
        best_combo = ([], [])
        for b in range(min(len(boys), max_per_gender) + 1):
            g_allowed = min(max_total - b, max_per_gender, len(girls))
            if g_allowed < 0:
                continue
            score = sum(p for p, *_ in boys[:b]) + sum(p for p, *_ in girls[:g_allowed])
            if score > best_score:
                best_score = score
                best_combo = (boys[:b], girls[:g_allowed])

        scoring_riders = []
        for pts, name, cat in best_combo[0] + best_combo[1]:
            scoring_riders.append((name, cat, pts))

        records.append({
            "team": team,
            "division": div,
            "boys_count": len(best_combo[0]),
            "girls_count": len(best_combo[1]),
            "team_points": best_score,
            "scoring_riders": scoring_riders,
        })

    result = (
        pd.DataFrame(records)
        .sort_values("team_points", ascending=False)
        .reset_index(drop=True)
    )
    result.index += 1
    result.index.name = "rank"
    return result


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
OUTPUT_FILE = "team_rankings.txt"  # <-- change if desired


def write_category_ranking(f, category: str, ranking: pd.DataFrame):
    f.write(f"\n{'='*70}\n")
    f.write(f"  TEAM RANKING — {category}\n")
    f.write(f"{'='*70}\n")
    for rank, row in ranking.iterrows():
        f.write(f"\n  #{rank}  {row['team']}  "
                f"(Div {row['division']})  —  {row['team_points']} pts  "
                f"({row['num_scorers']} scoring riders)\n")
        for name, place, pts in row["scoring_riders"]:
            place_str = f"P{int(place)}" if pd.notna(place) else "   "
            f.write(f"        {place_str:>4}  {name:<35} {pts} pts\n")


def write_overall_ranking(f, ranking: pd.DataFrame):
    f.write(f"\n{'#'*70}\n")
    f.write(f"  OVERALL TEAM RANKING (cross-category)\n")
    f.write(f"{'#'*70}\n")
    for rank, row in ranking.iterrows():
        f.write(f"\n  #{rank}  {row['team']}  "
                f"(Div {row['division']})  —  {row['team_points']} pts  "
                f"[{row['boys_count']}B + {row['girls_count']}G]\n")
        for name, cat, pts in row["scoring_riders"]:
            f.write(f"        {name:<35} {cat:<30} {pts} pts\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    df = load_and_clean(CSV_FILE)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        # --- Per-category team rankings ---
        for category in df["category"].unique():
            cat_df = df[df["category"] == category].copy()
            ranking = rank_teams_in_category(cat_df)
            write_category_ranking(f, category, ranking)

        # --- Overall cross-category team ranking ---
        overall = rank_teams_overall(df)
        write_overall_ranking(f, overall)

    print(f"Results written to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()