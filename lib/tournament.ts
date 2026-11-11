/*
	tournament.ts

	Loads tournament.json and turns it into everything the pages render:
	group cross-tables, standings, the inverse-seeded bracket and match pages.

	(c) 2026 cio

	Implementation:

		- loadTournament reads and validates the JSON on every call (wrapped in
		  React's cache), so editing the file shows up on the next reload in dev.
		- Maps are resolved once per match: a map with a `dissect` file gets
		  its name, score and stats from the replay; `name` / `score` in the
		  JSON always win over what the replay says.
		- Standings: points, then wins, then head-to-head (only when exactly two
		  teams are level, so three-way circles can't happen), then round
		  difference, then rounds won, then the order teams are listed in.
		- Playoffs are double elimination for all 8 teams. Round 1 is inverse
		  seeded across the groups (A1-B4, B2-A3, B1-A4, A2-B3); winners stay in
		  the upper bracket, losers drop to the lower bracket. BRACKET lists
		  every slot and where its two teams come from (a seed, or the winner /
		  loser of an earlier slot), in an order where feeders always come first.
		- Lower-bracket quarterfinals cross over (UB-SF2 loser meets the
		  LB-R1-1 winner) so teams don't replay their Round 1 opponent.
		- The upper-bracket team starts the Grand Final with
		  `format.grandFinalAdvantage` maps already won.
		- Round 1 teams follow the live standings and are marked provisional
		  until every group match is finished; nothing later is filled in from
		  a provisional result.
*/

// Modules

import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { loadDissect, readMapName, readMapStats } from "./dissect";
import { getMapDisplayName, getMapImage, getMapKey } from "./maps";
import { isScoreboardFile, loadScoreboard, readScoreboardStats } from "./scoreboard";
import type {
	FfConfig,
	GroupConfig,
	MapConfig,
	MatchSlotTeam,
	PlayoffRound,
	PlayoffSlot,
	ResolvedMap,
	ResolvedMatch,
	ResolvedTeam,
	Side,
	StandingRow,
	TournamentConfig,
} from "./types";

// Constants

const TOURNAMENT_FILE = "tournament.json";

const TEAM_COUNT = 8;
const GROUP_COUNT = 2;
const GROUP_SIZE = 4;
const PLAYERS_PER_TEAM = 5;

// Muted, distinguishable team colours, assigned in team order
const TEAM_COLORS = ["#d9a441", "#4f9ed8", "#c8553d", "#58a55c", "#9b6dd6", "#d46a9f", "#3fb8b0", "#b8b8b8"];

// Where a bracket slot's team comes from: a group seed [group index, position],
// or the winner / loser of an earlier slot
type Feeder = { seed: [number, number] } | { from: PlayoffSlot; take: "winner" | "loser" };

interface SlotSpec {
	round: PlayoffRound;
	title: string;
	feeders: [Feeder, Feeder];
}

const winnerOf = (from: PlayoffSlot): Feeder => ({ from, take: "winner" });
const loserOf = (from: PlayoffSlot): Feeder => ({ from, take: "loser" });

// Insertion order matters: every feeder slot is listed before the slots it feeds
const BRACKET: Record<PlayoffSlot, SlotSpec> = {
	"R1-1": { round: "R1", title: "Round 1 · Match 1", feeders: [{ seed: [0, 0] }, { seed: [1, 3] }] },
	"R1-2": { round: "R1", title: "Round 1 · Match 2", feeders: [{ seed: [1, 1] }, { seed: [0, 2] }] },
	"R1-3": { round: "R1", title: "Round 1 · Match 3", feeders: [{ seed: [1, 0] }, { seed: [0, 3] }] },
	"R1-4": { round: "R1", title: "Round 1 · Match 4", feeders: [{ seed: [0, 1] }, { seed: [1, 2] }] },
	"UB-SF1": { round: "UB-SF", title: "Upper Semifinal 1", feeders: [winnerOf("R1-1"), winnerOf("R1-2")] },
	"UB-SF2": { round: "UB-SF", title: "Upper Semifinal 2", feeders: [winnerOf("R1-3"), winnerOf("R1-4")] },
	"LB-R1-1": { round: "LB-R1", title: "Lower Round 1 · Match 1", feeders: [loserOf("R1-1"), loserOf("R1-2")] },
	"LB-R1-2": { round: "LB-R1", title: "Lower Round 1 · Match 2", feeders: [loserOf("R1-3"), loserOf("R1-4")] },
	"LB-QF1": { round: "LB-QF", title: "Lower Quarterfinal 1", feeders: [loserOf("UB-SF2"), winnerOf("LB-R1-1")] },
	"LB-QF2": { round: "LB-QF", title: "Lower Quarterfinal 2", feeders: [loserOf("UB-SF1"), winnerOf("LB-R1-2")] },
	"UB-F": { round: "UB-F", title: "Upper Final", feeders: [winnerOf("UB-SF1"), winnerOf("UB-SF2")] },
	"LB-SF": { round: "LB-SF", title: "Lower Semifinal", feeders: [winnerOf("LB-QF1"), winnerOf("LB-QF2")] },
	"LB-F": { round: "LB-F", title: "Lower Final", feeders: [loserOf("UB-F"), winnerOf("LB-SF")] },
	"GF": { round: "GF", title: "Grand Final", feeders: [winnerOf("UB-F"), winnerOf("LB-F")] },
};

const ALL_SLOTS = Object.keys(BRACKET) as PlayoffSlot[];

// Early rounds are single maps; semis and later are BO3 in both brackets
const DEFAULT_BEST_OF: Record<PlayoffRound, number> = {
	"R1": 1,
	"LB-R1": 1,
	"LB-QF": 1,
	"UB-SF": 3,
	"LB-SF": 3,
	"UB-F": 3,
	"LB-F": 3,
	"GF": 3,
};

const DEFAULT_GRAND_FINAL_ADVANTAGE = 1;

// `merge` marks columns whose matches pair up into the next column (draws the joining line)
export const BRACKET_LAYOUT: { name: string; columns: { name: string; round: PlayoffRound; slots: PlayoffSlot[]; merge: boolean }[] }[] = [
	{
		name: "Upper bracket",
		columns: [
			{ name: "Round 1", round: "R1", slots: ["R1-1", "R1-2", "R1-3", "R1-4"], merge: true },
			{ name: "Semifinals", round: "UB-SF", slots: ["UB-SF1", "UB-SF2"], merge: true },
			{ name: "Upper Final", round: "UB-F", slots: ["UB-F"], merge: false },
			{ name: "Grand Final", round: "GF", slots: ["GF"], merge: false },
		],
	},
	{
		name: "Lower bracket",
		columns: [
			{ name: "Round 1", round: "LB-R1", slots: ["LB-R1-1", "LB-R1-2"], merge: false },
			{ name: "Quarterfinals", round: "LB-QF", slots: ["LB-QF1", "LB-QF2"], merge: true },
			{ name: "Semifinal", round: "LB-SF", slots: ["LB-SF"], merge: false },
			{ name: "Lower Final", round: "LB-F", slots: ["LB-F"], merge: false },
		],
	},
];

export function getRoundBestOf(round: PlayoffRound): number {
	const setting = loadTournament().format.playoffBestOf;
	// A bare number (older tournament.json files) applies to every round
	if (typeof setting === "number") return setting;
	return setting?.[round] ?? DEFAULT_BEST_OF[round];
}

export function getGrandFinalAdvantage(): number {
	return loadTournament().format.grandFinalAdvantage ?? DEFAULT_GRAND_FINAL_ADVANTAGE;
}

// Checks

function fail(message: string): never {
	throw new Error(`[tournament.json] ${message}`);
}

function validate(config: TournamentConfig): void {
	if (!Array.isArray(config.teams) || config.teams.length !== TEAM_COUNT) fail(`Expected exactly ${TEAM_COUNT} teams`);
	const ids = new Set<string>();
	for (const team of config.teams) {
		if (!team.id || ids.has(team.id)) fail(`Team ids must be unique and non-empty (${team.id})`);
		ids.add(team.id);
		if (!Array.isArray(team.players) || team.players.length !== PLAYERS_PER_TEAM) fail(`${team.id} needs exactly ${PLAYERS_PER_TEAM} players`);
	}

	if (!Array.isArray(config.groups) || config.groups.length !== GROUP_COUNT) fail(`Expected exactly ${GROUP_COUNT} groups`);
	const grouped = new Set<string>();
	for (const group of config.groups) {
		if (group.teams.length !== GROUP_SIZE) fail(`${group.name} needs exactly ${GROUP_SIZE} teams`);
		for (const id of group.teams) {
			if (!ids.has(id)) fail(`${group.name} lists unknown team "${id}"`);
			if (grouped.has(id)) fail(`Team "${id}" is in more than one group`);
			grouped.add(id);
		}
	}

	// `ff` belongs on a map; catch it at match level so it isn't silently ignored
	const matchEntries: [string, unknown][] = [
		...(config.groupMatches ?? []).map((match) => [`Group match ${match.teams.join(" vs ")}`, match] as [string, unknown]),
		...Object.entries(config.playoffs ?? {}),
	];
	for (const [label, entry] of matchEntries) {
		if (entry && typeof entry === "object" && "ff" in entry) fail(`${label}: move "ff" into the map it belongs to, e.g. "maps": [{ "ff": { "number": 7, "team": "t1" } }]`);
	}

	for (const key of Object.keys(config.playoffs ?? {})) {
		if (!(key in BRACKET)) fail(`Unknown playoff match "${key}". Valid names: ${ALL_SLOTS.join(", ")}`);
	}

	for (const match of config.groupMatches ?? []) {
		const [a, b] = match.teams;
		const group = config.groups.find((entry) => entry.teams.includes(a));
		if (!group || !group.teams.includes(b)) fail(`Group match ${a} vs ${b} must be between two teams of the same group`);
	}
}

// Loading

export const loadTournament = cache((): TournamentConfig => {
	const raw = fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), TOURNAMENT_FILE), "utf8");
	const config = JSON.parse(raw) as TournamentConfig;
	config.groupMatches ??= [];
	config.playoffs ??= {};
	validate(config);
	return config;
});

const getTeams = cache((): Map<string, ResolvedTeam> => {
	const config = loadTournament();
	return new Map(config.teams.map((team, index) => [team.id, { ...team, color: TEAM_COLORS[index % TEAM_COLORS.length] }]));
});

export function getTeam(id: string): ResolvedTeam | null {
	return getTeams().get(id) ?? null;
}

// Maps & matches

function toList(ff?: FfConfig | FfConfig[]): FfConfig[] {
	if (!ff) return [];
	return Array.isArray(ff) ? ff : [ff];
}

function getFfRounds(entries: FfConfig[], teamIds: [string, string], where: string): [number, number] {
	const rounds: [number, number] = [0, 0];
	for (const entry of entries) {
		const side = teamIds.indexOf(entry.team);
		if (side === -1) fail(`${where}: ff team "${entry.team}" is not playing this match (${teamIds.join(" vs ")})`);
		if (!Number.isInteger(entry.number) || entry.number < 1) fail(`${where}: ff number must be a whole number of rounds, got ${entry.number}`);
		rounds[side] += entry.number;
	}
	return rounds;
}

function resolveMap(config: MapConfig, index: number, rosters: [string[], string[]], teamIds: [string, string], roundsToWin: number, where: string): ResolvedMap {
	let stats: ResolvedMap["stats"] = null;
	let name = config.name ?? null;
	let error: string | undefined;

	// `dissect` takes a replay or a scoreboard export; `scoreboard` is the explicit form
	const statsPath = config.dissect ?? config.scoreboard;
	if (statsPath) {
		try {
			if (isScoreboardFile(statsPath)) {
				const file = loadScoreboard(statsPath);
				stats = readScoreboardStats(file, rosters);
				name ??= file.map ?? null;
			} else {
				const match = loadDissect(statsPath);
				stats = readMapStats(match, rosters);
				name ??= readMapName(match);
			}
		} catch (cause) {
			error = `Could not read ${statsPath}: ${(cause as Error).message}`;
		}
		// A scoreboard has no round results, so the score has to come from the JSON
		if (stats?.source === "scoreboard" && !config.score) error = `${statsPath} has player stats but no score: add "score": [x, y] to this map`;
	}

	const ffRounds = getFfRounds(toList(config.ff), teamIds, `${where} map ${index + 1}`);
	const hasFf = ffRounds[0] + ffRounds[1] > 0;
	const isForfeit = hasFf && !config.dissect && !config.scoreboard && !config.score;
	const playedScore = config.score ?? stats?.score ?? (hasFf ? [0, 0] : null);
	const score: [number, number] | null = playedScore ? [playedScore[0] + ffRounds[0], playedScore[1] + ffRounds[1]] : null;
	const winner: Side | null = score && score[0] !== score[1] ? (score[0] > score[1] ? 0 : 1) : null;
	const displayName = name ? getMapDisplayName(name) : isForfeit ? "Forfeit" : `Map ${index + 1}`;

	return {
		index,
		key: name ? getMapKey(name) : `map${index + 1}`,
		displayName,
		image: name ? getMapImage(name) : null,
		score,
		ffRounds,
		isForfeit,
		winner,
		// Overtime means the winner needed more than the regulation rounds (8–6, not 7–6
		// from FF rounds topping up a 7–4)
		isOvertime: score !== null && Math.max(score[0], score[1]) > roundsToWin,
		stats,
		error,
	};
}

function buildMatch(input: {
	id: string;
	stage: ResolvedMatch["stage"];
	title: string;
	subtitle: string;
	bestOf: number;
	slots: [MatchSlotTeam, MatchSlotTeam];
	maps: MapConfig[];
	date?: string;
	vod?: string;
	isProvisional?: boolean;
	advantage?: [number, number];
}): ResolvedMatch {
	const config = loadTournament();
	const teamA = input.slots[0].team;
	const teamB = input.slots[1].team;
	const maps = teamA && teamB
		? input.maps.map((map, index) =>
			resolveMap(map, index, [teamA.players, teamB.players], [teamA.id, teamB.id], config.format.roundsToWin, `Match ${input.id}`),
		)
		: [];

	const advantage: [number, number] = input.advantage ?? [0, 0];
	const mapScore: [number, number] = [...advantage];
	for (const map of maps) {
		if (map.winner !== null) mapScore[map.winner] += 1;
	}
	const needed = Math.floor(input.bestOf / 2) + 1;
	const winner: Side | null = mapScore[0] >= needed ? 0 : mapScore[1] >= needed ? 1 : null;
	const status = winner !== null ? "finished" : maps.length > 0 ? "live" : "upcoming";

	return {
		id: input.id,
		stage: input.stage,
		title: input.title,
		subtitle: input.subtitle,
		bestOf: input.bestOf,
		date: input.date,
		vod: input.vod,
		slots: input.slots,
		maps,
		mapScore,
		advantage,
		status,
		winner,
		isForfeit: maps.length > 0 && maps.every((map) => map.isForfeit),
		isProvisional: input.isProvisional ?? false,
	};
}

function slotFor(teamId: string, label = ""): MatchSlotTeam {
	return { team: getTeam(teamId), label };
}

// Groups

export function getGroupMatchId(groupId: string, a: string, b: string): string {
	return `${groupId}-${a}-${b}`;
}

export const getGroupMatches = cache((): ResolvedMatch[] => {
	const config = loadTournament();
	const matches: ResolvedMatch[] = [];

	for (const group of config.groups) {
		for (let i = 0; i < group.teams.length; i++) {
			for (let j = i + 1; j < group.teams.length; j++) {
				const a = group.teams[i];
				const b = group.teams[j];
				const entry = config.groupMatches.find((match) => match.teams.includes(a) && match.teams.includes(b));
				// The JSON's team order wins so its `score` arrays read naturally
				const order: [string, string] = entry ? entry.teams : [a, b];
				matches.push(
					buildMatch({
						id: getGroupMatchId(group.id, order[0], order[1]),
						stage: "group",
						title: group.name,
						subtitle: `Group stage · BO${config.format.groupBestOf}`,
						bestOf: config.format.groupBestOf,
						slots: [slotFor(order[0]), slotFor(order[1])],
						maps: entry?.maps ?? [],
						date: entry?.date,
						vod: entry?.vod,
					}),
				);
			}
		}
	}
	return matches;
});

export function findGroupMatch(a: string, b: string): ResolvedMatch | null {
	return getGroupMatches().find((match) => {
		const ids = match.slots.map((slot) => slot.team?.id);
		return ids.includes(a) && ids.includes(b);
	}) ?? null;
}

function getPerspective(match: ResolvedMatch, teamId: string): Side {
	return match.slots[0].team?.id === teamId ? 0 : 1;
}

function compareHeadToHead(a: string, b: string): number {
	const match = findGroupMatch(a, b);
	if (!match || match.winner === null) return 0;
	return match.winner === getPerspective(match, a) ? -1 : 1;
}

export const getStandings = cache((groupId: string): StandingRow[] => {
	const config = loadTournament();
	const group = config.groups.find((entry) => entry.id === groupId) as GroupConfig;
	const { points } = config.format;

	const rows = new Map<string, StandingRow>(
		group.teams.map((id) => [id, {
			team: getTeam(id) as ResolvedTeam,
			played: 0,
			wins: 0,
			losses: 0,
			otWins: 0,
			otLosses: 0,
			points: 0,
			roundsFor: 0,
			roundsAgainst: 0,
		}]),
	);

	for (const match of getGroupMatches()) {
		if (match.status !== "finished" || match.winner === null) continue;
		const ids = match.slots.map((slot) => slot.team?.id ?? "");
		if (!rows.has(ids[0])) continue;
		// OT only changes points for single-map matches, as in pro league formats
		const isOvertime = match.maps.length === 1 && match.maps[0].isOvertime;

		ids.forEach((id, side) => {
			const row = rows.get(id) as StandingRow;
			const won = match.winner === side;
			row.played += 1;
			if (won) row.wins += 1;
			else row.losses += 1;
			if (won && isOvertime) row.otWins += 1;
			if (!won && isOvertime) row.otLosses += 1;
			row.points += won ? (isOvertime ? points.otWin : points.win) : (isOvertime ? points.otLoss : points.loss);
			for (const map of match.maps) {
				if (!map.score) continue;
				row.roundsFor += map.score[side];
				row.roundsAgainst += map.score[1 - side];
			}
		});
	}

	// Head-to-head only settles a straight two-way tie; in a three-way tie it can go in a circle
	const tieSizes = new Map<string, number>();
	const tieKey = (row: StandingRow) => `${row.points}:${row.wins}`;
	for (const row of rows.values()) tieSizes.set(tieKey(row), (tieSizes.get(tieKey(row)) ?? 0) + 1);

	return [...rows.values()].sort((a, b) =>
		b.points - a.points ||
		b.wins - a.wins ||
		(tieSizes.get(tieKey(a)) === 2 ? compareHeadToHead(a.team.id, b.team.id) : 0) ||
		(b.roundsFor - b.roundsAgainst) - (a.roundsFor - a.roundsAgainst) ||
		b.roundsFor - a.roundsFor ||
		group.teams.indexOf(a.team.id) - group.teams.indexOf(b.team.id),
	);
});

export function isGroupStageComplete(): boolean {
	return getGroupMatches().every((match) => match.status === "finished");
}

// Playoffs

function feederLabel(feeder: Feeder, groupIds: string[]): string {
	if ("seed" in feeder) return `${groupIds[feeder.seed[0]]}${feeder.seed[1] + 1}`;
	return `${feeder.take === "winner" ? "Winner" : "Loser"} ${feeder.from}`;
}

export const getPlayoffMatches = cache((): Map<PlayoffSlot, ResolvedMatch> => {
	const config = loadTournament();
	const groupIds = config.groups.map((group) => group.id);
	const standings = config.groups.map((group) => getStandings(group.id));
	const isProvisional = !isGroupStageComplete();
	const resolved = new Map<PlayoffSlot, ResolvedMatch>();

	const resolveFeeder = (feeder: Feeder): MatchSlotTeam => {
		const label = feederLabel(feeder, groupIds);
		if ("seed" in feeder) return { team: standings[feeder.seed[0]][feeder.seed[1]]?.team ?? null, label };
		const source = resolved.get(feeder.from) as ResolvedMatch;
		if (source.winner === null || source.isProvisional) return { team: null, label };
		const side = feeder.take === "winner" ? source.winner : ((1 - source.winner) as Side);
		return { team: source.slots[side].team, label };
	};

	for (const slot of ALL_SLOTS) {
		const spec = BRACKET[slot];
		const entry = config.playoffs[slot];
		const bestOf = getRoundBestOf(spec.round);
		const isRoundOne = spec.round === "R1";
		resolved.set(slot, buildMatch({
			id: slot,
			stage: "playoff",
			title: spec.title,
			subtitle: `Playoffs · BO${bestOf}`,
			bestOf,
			slots: spec.feeders.map(resolveFeeder) as [MatchSlotTeam, MatchSlotTeam],
			maps: entry?.maps ?? [],
			date: entry?.date,
			vod: entry?.vod,
			isProvisional: isRoundOne && isProvisional,
			// The upper-bracket finalist (first feeder) starts the Grand Final ahead
			advantage: spec.round === "GF" ? [getGrandFinalAdvantage(), 0] : undefined,
		}));
	}

	return resolved;
});

// Lookup

export function getAllMatchIds(): string[] {
	return [...getGroupMatches().map((match) => match.id), ...ALL_SLOTS];
}

export function getMatch(id: string): ResolvedMatch | null {
	const playoff = getPlayoffMatches().get(id as PlayoffSlot);
	if (playoff) return playoff;
	return getGroupMatches().find((match) => match.id === id) ?? null;
}

export function getTournamentProgress(): { played: number; total: number } {
	const all = [...getGroupMatches(), ...getPlayoffMatches().values()];
	return { played: all.filter((match) => match.status === "finished").length, total: all.length };
}
