/*
	scoreboard.ts

	Reads end-of-map scoreboard exports (per-player totals, no rounds) as an
	alternative to an r6-dissect replay. Accepts the CSV as exported or the
	JSON form produced from it.

	(c) 2026 cio

	Implementation:

		- Both formats are normalised to ScoreboardFile. Percentages may come
		  as fractions (0.27) or percents (36.36); getFraction handles both.
		- The round count isn't in the export, so it's worked out from
		  kills / kills-per-round (the most common answer across players).
		- Players are matched to the match's two teams by roster names, the
		  same way replays are; with no matches, the first team in the file
		  is taken as the first team in the match.
		- Lines keep the export's own rating and percentages. Counts such as
		  KOST rounds are rebuilt from them so series totals still add up.
*/

// Modules

import fs from "node:fs";
import path from "node:path";
import { buildLine, sortLines } from "./dissect";
import type { MapStats, PlayerCounts, PlayerLine, Side } from "./types";

// Constants

const PERCENT_THRESHOLD = 1;

const CSV_COLUMNS = {
	TEAM: "team",
	PLAYER: "player",
	RATING: "rating",
	KILLS: "kills",
	DEATHS: "deaths",
	ENTRY_KILLS: "entry_kills",
	ENTRY_DEATHS: "entry_deaths",
	KOST: "kost_percentage",
	KPR: "kills_per_round",
	SRV: "survival_percentage",
	HS: "headshot_percentage",
	CLUTCHES: "one_v_x_wins",
	OBJECTIVE: "objective_plays",
};

// Types

export interface ScoreboardPlayer {
	username: string;
	rating?: number;
	kills: number;
	deaths: number;
	entryKills: number;
	entryDeaths: number;
	kost: number;
	kpr: number;
	srv: number;
	hsPct: number;
	clutches: number;
	objectivePlays: number;
}

export interface ScoreboardFile {
	source: "scoreboard";
	map?: string;
	rounds: number;
	teams: { name: string; players: ScoreboardPlayer[] }[];
}

// Util

function getFraction(value: number): number {
	return value > PERCENT_THRESHOLD ? value / 100 : value;
}

function toNumber(value: string | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseName(name: string): string {
	return name.trim().toLowerCase();
}

export function getRoundCount(players: ScoreboardPlayer[]): number {
	const votes = new Map<number, number>();
	for (const player of players) {
		if (player.kills === 0 || player.kpr === 0) continue;
		const rounds = Math.round(player.kills / player.kpr);
		votes.set(rounds, (votes.get(rounds) ?? 0) + 1);
	}
	let best = 0;
	let bestVotes = 0;
	for (const [rounds, count] of votes) {
		if (count > bestVotes) {
			best = rounds;
			bestVotes = count;
		}
	}
	return best;
}

// Parsing

export function parseScoreboardCsv(text: string): ScoreboardFile {
	const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
	if (lines.length < 2) throw new Error("Scoreboard CSV has no rows");
	const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
	const column = (row: string[], name: string) => row[header.indexOf(name)];
	if (!header.includes(CSV_COLUMNS.PLAYER) || !header.includes(CSV_COLUMNS.TEAM)) throw new Error("Scoreboard CSV needs team and player columns");

	const teams: ScoreboardFile["teams"] = [];
	for (const line of lines.slice(1)) {
		const row = line.split(",").map((cell) => cell.trim());
		const teamName = column(row, CSV_COLUMNS.TEAM);
		let team = teams.find((entry) => entry.name === teamName);
		if (!team) {
			team = { name: teamName, players: [] };
			teams.push(team);
		}
		const hasRating = header.includes(CSV_COLUMNS.RATING) && column(row, CSV_COLUMNS.RATING) !== "";
		team.players.push({
			username: column(row, CSV_COLUMNS.PLAYER),
			rating: hasRating ? toNumber(column(row, CSV_COLUMNS.RATING)) : undefined,
			kills: toNumber(column(row, CSV_COLUMNS.KILLS)),
			deaths: toNumber(column(row, CSV_COLUMNS.DEATHS)),
			entryKills: toNumber(column(row, CSV_COLUMNS.ENTRY_KILLS)),
			entryDeaths: toNumber(column(row, CSV_COLUMNS.ENTRY_DEATHS)),
			kost: getFraction(toNumber(column(row, CSV_COLUMNS.KOST))),
			kpr: toNumber(column(row, CSV_COLUMNS.KPR)),
			srv: getFraction(toNumber(column(row, CSV_COLUMNS.SRV))),
			hsPct: getFraction(toNumber(column(row, CSV_COLUMNS.HS))),
			clutches: toNumber(column(row, CSV_COLUMNS.CLUTCHES)),
			objectivePlays: toNumber(column(row, CSV_COLUMNS.OBJECTIVE)),
		});
	}

	return {
		source: "scoreboard",
		rounds: getRoundCount(teams.flatMap((team) => team.players)),
		teams,
	};
}

// Scoreboards are .csv, or JSON with `teams[].players` (replays have `rounds[]` of objects)
export function isScoreboardFile(relativePath: string): boolean {
	if (relativePath.toLowerCase().endsWith(".csv")) return true;
	try {
		const fullPath = path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath);
		const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
		return parsed?.source === "scoreboard" || (Array.isArray(parsed?.teams) && Array.isArray(parsed.teams[0]?.players) && !Array.isArray(parsed?.rounds));
	} catch {
		return false;
	}
}

export function loadScoreboard(relativePath: string): ScoreboardFile {
	const fullPath = path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath);
	const text = fs.readFileSync(fullPath, "utf8");
	if (relativePath.toLowerCase().endsWith(".csv")) return parseScoreboardCsv(text);
	const parsed = JSON.parse(text) as ScoreboardFile;
	if (!Array.isArray(parsed?.teams)) throw new Error("Not a scoreboard file (missing teams)");
	parsed.rounds ||= getRoundCount(parsed.teams.flatMap((team) => team.players));
	return parsed;
}

// Stats

function getSideMapping(file: ScoreboardFile, rosters: [string[], string[]]): [Side, Side] {
	const rosterSets = rosters.map((roster) => new Set(roster.map(normaliseName)));
	const overlap = file.teams.slice(0, 2).map((team) =>
		([0, 1] as const).map((side) => team.players.filter((player) => rosterSets[side].has(normaliseName(player.username))).length),
	);
	if (overlap.length < 2) return [0, 1];
	const straight = overlap[0][0] + overlap[1][1];
	const crossed = overlap[0][1] + overlap[1][0];
	return crossed > straight ? [1, 0] : [0, 1];
}

function toLine(player: ScoreboardPlayer, side: Side, rounds: number): PlayerLine {
	const counts: PlayerCounts = {
		rounds,
		kills: player.kills,
		deaths: player.deaths,
		assists: 0,
		headshots: Math.round(player.hsPct * player.kills),
		entryKills: player.entryKills,
		entryDeaths: player.entryDeaths,
		kostRounds: Math.round(player.kost * rounds),
		survived: Math.round(player.srv * rounds),
		trades: 0,
		clutches: player.clutches,
		plants: player.objectivePlays,
		multiKills: 0,
		operators: {},
	};
	const line = buildLine(player.username, side, counts);
	// Keep the export's own figures rather than the rebuilt approximations
	return {
		...line,
		rating: player.rating ?? line.rating,
		kpr: player.kpr || line.kpr,
		kost: player.kost,
		srv: player.srv,
		hsPct: player.hsPct,
	};
}

export function readScoreboardStats(file: ScoreboardFile, rosters: [string[], string[]]): MapStats {
	const mapping = getSideMapping(file, rosters);
	const players: [PlayerLine[], PlayerLine[]] = [[], []];
	file.teams.slice(0, 2).forEach((team, index) => {
		const side = mapping[index];
		for (const player of team.players) players[side].push(toLine(player, side, file.rounds));
	});
	return {
		source: "scoreboard",
		rounds: [],
		players: [sortLines(players[0]), sortLines(players[1])],
		score: null,
	};
}
