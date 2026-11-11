# Siege Tourney

A minimal, Siege X–style tournament site built with Next.js. The homepage shows a cross-table for each group, then the playoff bracket below it. Every match opens a full page with maps, a round-by-round timeline, kill feeds, player ratings and the operators each player used, all read from r6-dissect replays.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in out/
```

## Hosting on GitHub Pages

1. Push this folder to a GitHub repo (branch `main`).
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` now rebuilds and deploys the site to `https://<user>.github.io/<repo>/` (see `.github/workflows/deploy.yml`).

To update the site, edit `tournament.json` and add replays, then commit and push. The site rebuilds in about a minute.

## Everything lives in `tournament.json`

| Key | What it is |
| --- | --- |
| `teams` | Exactly 8 teams, each with an `id`, `name`, `tag`, 5 `players` and an optional `logo` URL |
| `groups` | 2 groups of 4 team ids |
| `groupMatches` | Round-robin results. Any pair you leave out still appears in the grid as unplayed |
| `playoffs` | Results keyed by slot name (see the bracket below). You only enter results here; the teams are worked out for you |
| `format` | Group best-of, `playoffBestOf` per playoff round, `grandFinalAdvantage`, rounds to win, and points (win / OT win / OT loss / loss) |

**Player names must match the in-game usernames.** That is how a replay works out which team is which.

### Adding a result

Each match holds a list of `maps`. A map can have any of these fields:

```jsonc
{ "dissect": "replays/A-t1-t2/map1.json" }   // name, score and every stat come from the replay
{ "name": "Clubhouse", "score": [7, 5] }     // score only, typed by hand (no player stats)
{ "dissect": "...", "score": [7, 5] }        // a hand-typed score overrides the replay
```

### Forfeited (FF) rounds

Rounds given by forfeit never show up in a replay. `ff` always goes **on a map**, because round scores belong to a map:

```jsonc
// Partial: 2 FF rounds added on top of the replay score
"maps": [{ "dissect": "replays/A-t1-t2/map1.json", "ff": { "number": 2, "team": "t1" } }]

// Full forfeit of a map: no replay, the map is just the FF rounds (shows as 7–0 "Forfeit")
"maps": [{ "ff": { "number": 7, "team": "t1" } }]

// Full forfeit of a BO3: one forfeit map per map won
"maps": [{ "ff": { "number": 7, "team": "t6" } }, { "ff": { "number": 7, "team": "t6" } }]

// Both teams got some: use a list
"ff": [{ "number": 1, "team": "t1" }, { "number": 2, "team": "t2" }]
```

FF rounds count toward the map score, the map winner, overtime, round difference and points. If every map is a forfeit, the match is shown as a forfeit win (an "FF" tag in the grid, a "Forfeit" badge in the bracket). A hand-typed `score` should **not** already include FF rounds.

`score` is always in the same order as the match's teams. For a group match that is the order in its `teams` array. For a playoff match it is the bracket order shown on the homepage (top team first).

### Making replay files

1. Find the match folder in your Siege install: `MatchReplay/Match-YYYY-MM-DD_...`
2. Run [r6-dissect](https://github.com/redraskal/r6-dissect/releases) on it:
   `r6-dissect Match-2026-11-21_17-00-00-123 -o replays/A-t1-t2/map1.json`
3. Add the path to the map entry, as shown above.

## Playoffs: double elimination

All 8 teams play Round 1, inverse seeded across the groups. Winners stay in the upper bracket; losers drop to the lower bracket. Lose twice and you're out.

```
UPPER   R1-1  A1 v B4 ┐
        R1-2  B2 v A3 ┘ UB-SF1 ┐
        R1-3  B1 v A4 ┐        ├ UB-F ───────────────┐
        R1-4  A2 v B3 ┘ UB-SF2 ┘                     ├ GF
                                                     │
LOWER   LB-R1-1  loser R1-1 v loser R1-2 → LB-QF1 (v loser UB-SF2) ┐
        LB-R1-2  loser R1-3 v loser R1-4 → LB-QF2 (v loser UB-SF1) ┘ LB-SF → LB-F (v loser UB-F) ┘
```

- **Slot names** to use under `playoffs`: `R1-1`…`R1-4`, `UB-SF1`, `UB-SF2`, `UB-F`, `LB-R1-1`, `LB-R1-2`, `LB-QF1`, `LB-QF2`, `LB-SF`, `LB-F`, `GF`. A score's order is the order the bracket shows (top team first).
- **Lower-bracket quarterfinals cross over**, so a team dropping from upper semifinal 2 doesn't replay its Round 1 opponent.
- **Grand Final:** the upper-bracket finalist starts `grandFinalAdvantage` maps up (default 1). In a BO3 that means one more map wins it, while the lower-bracket team needs two in a row. There's no bracket reset.
- **Best-of per round** (`format.playoffBestOf`): Round 1, LB Round 1 and LB Quarterfinals default to BO1; semifinals onward in both brackets default to BO3. Change any round there.
- **Group standings** decide Round 1: points, then wins, then head-to-head (only for a two-way tie), then round difference, then rounds won. Until the group stage is finished, Round 1 follows the current standings and is marked **Provisional**.

## Stats

All stats are worked out from the r6-dissect kill feed.

| Stat | What it means |
| --- | --- |
| **Rating** | A blend of kills per round, survival, KOST and opening duels, plus a small bonus for clutches. 1.00 is an average game. It is a stand-in for SiegeGG's rating, and the weights are at the top of `lib/dissect.ts` |
| **KOST** | The share of rounds in which the player got a kill, completed an objective (plant or defuser disable), survived, or was traded |
| **Entry** | The round's first kill and first death |
| **Trades** | Killing an enemy within 10 seconds of that enemy killing a teammate |
| **1vX** | Clutch rounds won |

## Sample data

The repo ships with generated results and fake replays in `replays/sample/`, so every page has something to show.

To start fresh, delete `replays/sample/` and set every `maps` array in `tournament.json` back to `[]`. Running `npm run sample` regenerates the sample data and overwrites the results in `tournament.json`.

## Files

```
tournament.json          your data
replays/                 r6-dissect JSON files
lib/tournament.ts        loading, validation, standings, bracket
lib/dissect.ts           replay parsing, KOST, trades, rating
lib/maps.ts              map names and official Ubisoft map art
components/              group table, bracket, scoreboard, round timeline
app/page.tsx             homepage
app/match/[id]/page.tsx  match page
```

If r6-dissect names a map like `Map(407987100456)`, the replay is from a map its latest release doesn't know (the Siege X reworks). The site translates those IDs itself; you can also set `"name"` on the map.

Map art comes from Ubisoft's official map pages and loads from their CDN. Coastline, Emerald Plains, Fortress, Calypso Casino and Stadium Bravo have no art yet and fall back to a hatched pattern; add URLs in `lib/maps.ts`. Operator icons come from the `r6operators` package.
