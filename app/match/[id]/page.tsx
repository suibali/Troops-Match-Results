/*
	page.tsx (match)

	Full match page: hero with series score, map cards, then tabs for the
	series overview and each map (round timeline + scoreboards)

	(c) 2026 cio

	Implementation:

		- Everything is resolved on the server from tournament.json and the
		  r6-dissect files; only MatchTabs and RoundTimeline run on the client.
		- The overview scoreboard sums raw counts across maps and rebuilds
		  each line, so its ratings are true series ratings, not averages.
		- Matches without replay data fall back to rosters (upcoming) or to
		  scores only (results typed into tournament.json by hand).
*/

// Modules

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchTabs, { type TabSpec } from "@/components/MatchTabs";
import RoundTimeline, { type TimelineTeam } from "@/components/RoundTimeline";
import Scoreboard from "@/components/Scoreboard";
import TeamMark from "@/components/TeamMark";
import { addCounts, buildLine, sortLines } from "@/lib/dissect";
import { formatDate } from "@/lib/format";
import { getMapImage } from "@/lib/maps";
import { getAllMatchIds, getMatch } from "@/lib/tournament";
import type { PlayerCounts, PlayerLine, ResolvedMap, ResolvedMatch, Side } from "@/lib/types";

// Constants

const FALLBACK_HERO_MAP = "Clubhouse";
const SIDES: Side[] = [0, 1];

export const dynamicParams = false;

// Data

export function generateStaticParams() {
	return getAllMatchIds().map((id) => ({ id }));
}

function getTeamLabel(match: ResolvedMatch, side: Side): string {
	return match.slots[side].team?.name ?? match.slots[side].label;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
	const { id } = await params;
	const match = getMatch(id);
	if (!match) return {};
	return { title: `${getTeamLabel(match, 0)} vs ${getTeamLabel(match, 1)} · ${match.title}` };
}

// Series rating is the rounds-weighted average of map ratings, so maps rated by a
// scoreboard export and maps rated from replays combine the same way
function aggregateLines(maps: ResolvedMap[]): [PlayerLine[], PlayerLine[]] {
	const totals = new Map<string, { side: Side; name: string; counts: PlayerCounts; weightedRating: number }>();
	for (const map of maps) {
		if (!map.stats) continue;
		for (const side of SIDES) {
			for (const line of map.stats.players[side]) {
				const key = `${side}:${line.username.toLowerCase()}`;
				const entry = totals.get(key) ?? { side, name: line.username, counts: emptyCounts(), weightedRating: 0 };
				addCounts(entry.counts, line);
				entry.weightedRating += line.rating * line.rounds;
				totals.set(key, entry);
			}
		}
	}
	const out: [PlayerLine[], PlayerLine[]] = [[], []];
	for (const { side, name, counts, weightedRating } of totals.values()) {
		const line = buildLine(name, side, counts);
		out[side].push({ ...line, rating: counts.rounds > 0 ? weightedRating / counts.rounds : line.rating });
	}
	return [sortLines(out[0]), sortLines(out[1])];
}

function emptyCounts(): PlayerCounts {
	return { rounds: 0, kills: 0, deaths: 0, assists: 0, headshots: 0, entryKills: 0, entryDeaths: 0, kostRounds: 0, survived: 0, trades: 0, clutches: 0, plants: 0, multiKills: 0, operators: {} };
}

function getVariant(maps: ResolvedMap[]): "replay" | "scoreboard" {
	return maps.some((map) => map.stats?.source === "scoreboard") ? "scoreboard" : "replay";
}

function getMvp(lines: [PlayerLine[], PlayerLine[]]): string | undefined {
	const all = [...lines[0], ...lines[1]];
	if (all.length === 0) return undefined;
	return all.reduce((best, line) => (line.rating > best.rating ? line : best)).username;
}

function getHalves(map: ResolvedMap, side: Side): { attack: number; defense: number } {
	const halves = { attack: 0, defense: 0 };
	for (const round of map.stats?.rounds ?? []) {
		if (round.winner !== side || round.attacker === null) continue;
		if (round.attacker === side) halves.attack += 1;
		else halves.defense += 1;
	}
	return halves;
}

function getFfNote(match: ResolvedMatch, map: ResolvedMap): string {
	return SIDES.filter((side) => map.ffRounds[side] > 0)
		.map((side) => `+${map.ffRounds[side]} FF ${match.slots[side].team?.tag ?? ""}`.trim())
		.join(" · ");
}

function getForfeitNote(match: ResolvedMatch, map: ResolvedMap): string {
	if (map.winner === null) return "Forfeit";
	const team = match.slots[map.winner].team;
	return `${team?.name ?? "Winner"} awarded the map by forfeit`;
}

function getOutcome(winner: Side | null, side: Side): "win" | "loss" | undefined {
	if (winner === null) return undefined;
	return winner === side ? "win" : "loss";
}

// UI

function StatusBadge({ match }: { match: ResolvedMatch }) {
	if (match.status === "live") return <span className="badge is-live">Live</span>;
	if (match.status === "finished" && match.isForfeit) return <span className="badge is-provisional">Forfeit</span>;
	if (match.status === "finished") return <span className="badge is-finished">Final</span>;
	return <span className="badge">Upcoming</span>;
}

function MatchHero({ match }: { match: ResolvedMatch }) {
	const image = match.maps.find((map) => map.image)?.image ?? getMapImage(FALLBACK_HERO_MAP);
	return (
		<section className="match-hero">
			{image && <div className="match-hero-bg" style={{ backgroundImage: `url(${image})` }} />}
			<div className="match-hero-inner">
				{SIDES.map((side) => {
					const slot = match.slots[side];
					const isLoser = match.winner !== null && match.winner !== side;
					const team = (
						<div key={side} className={`match-team${side === 1 ? " is-right" : ""}${isLoser ? " is-loser" : ""}`}>
							<TeamMark team={slot.team} size={64} />
							<div>
								<div className="match-team-name">{slot.team?.name ?? "TBD"}</div>
								<div className="match-team-sub">{slot.team ? slot.label || slot.team.tag : slot.label}</div>
							</div>
						</div>
					);
					if (side === 0) return team;
					return [
						<div key="score" className="match-score">
							<div className="match-score-value num">
								<span className={match.winner === 0 ? "is-winner" : ""}>{match.status === "upcoming" ? "–" : match.mapScore[0]}</span>
								<span className="sep">:</span>
								<span className={match.winner === 1 ? "is-winner" : ""}>{match.status === "upcoming" ? "–" : match.mapScore[1]}</span>
							</div>
							<div className="match-score-meta">
								<StatusBadge match={match} />
								<span className="badge">BO{match.bestOf}</span>
								{match.isProvisional && <span className="badge is-provisional">Provisional</span>}
								{SIDES.filter((side) => match.advantage[side] > 0).map((side) => (
									<span key={side} className="badge is-provisional" title="Upper-bracket finalist starts with a map advantage">
										{match.slots[side].team?.tag ?? "UB"} +{match.advantage[side]} map
									</span>
								))}
							</div>
						</div>,
						team,
					];
				})}
			</div>
			<div className="match-hero-foot">
				<span>{match.title}</span>
				<span>{match.subtitle}</span>
				<span>{formatDate(match.date)}</span>
				{match.vod && (
					<a href={match.vod} target="_blank" rel="noreferrer">
						Watch VOD ↗
					</a>
				)}
			</div>
		</section>
	);
}

function MapCard({ match, map, href }: { match: ResolvedMatch; map: ResolvedMap; href?: string }) {
	const ffNote = map.isForfeit ? "" : getFfNote(match, map);
	const body = (
		<>
			<div className={`map-card-bg${map.image ? "" : " map-fallback"}`} style={map.image ? { backgroundImage: `url(${map.image})` } : undefined} />
			<div className="map-card-body">
				<div>
					<div className="map-card-index">
						Map {map.index + 1}
						{map.isOvertime ? " · OT" : ""}
						{ffNote && <span className="ff-note"> · {ffNote}</span>}
					</div>
					<div className="map-card-name">{map.displayName}</div>
				</div>
				{map.score && (
					<div className="map-card-score num">
						<span className={map.winner === 0 ? "w" : "l"}>{map.score[0]}</span>
						<span className="dash">–</span>
						<span className={map.winner === 1 ? "w" : "l"}>{map.score[1]}</span>
					</div>
				)}
			</div>
		</>
	);
	if (!href) return <div className="map-card">{body}</div>;
	return (
		<a className="map-card" href={href}>
			{body}
		</a>
	);
}

function Rosters({ match }: { match: ResolvedMatch }) {
	return (
		<div className="rosters">
			{SIDES.map((side) => {
				const team = match.slots[side].team;
				return (
					<section key={side} className="panel">
						<div className="team-bar" style={{ boxShadow: `inset 3px 0 0 ${team?.color ?? "var(--line-strong)"}` }}>
							<div className="team-cell">
								<TeamMark team={team} size={26} />
								<span className="team-name">{team?.name ?? match.slots[side].label}</span>
							</div>
						</div>
						<ul className="roster-list">
							{(team?.players ?? ["TBD", "TBD", "TBD", "TBD", "TBD"]).map((player, index) => (
								<li key={`${player}-${index}`}>
									<span className="slot">{index + 1}</span>
									{player}
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

function Glossary({ variant = "replay" }: { variant?: "replay" | "scoreboard" }) {
	return (
		<p className="stat-glossary">
			{variant === "scoreboard" ? (
				<>
					<b>Rating</b> as exported with the scoreboard (series ratings are averaged by rounds played).{" "}
				</>
			) : (
				<>
					<b>Rating</b> blends kills per round, survival, KOST and opening duels against fixed baselines (1.00 = average game).{" "}
				</>
			)}
			<b>KOST</b> rounds with a kill, objective (plant / disable), survival or trade. <b>Entry</b> opening kill – opening death.{" "}
			{variant === "replay" && (
				<>
					<b>Trades</b> kills on a player who killed a teammate within the previous 10 seconds.
				</>
			)}
			{variant === "scoreboard" && (
				<>
					<b>Obj</b> objective plays (plants and disables).
				</>
			)}
		</p>
	);
}

function MapPanel({ match, map }: { match: ResolvedMatch; map: ResolvedMap }) {
	const teams = SIDES.map((side) => match.slots[side].team);
	const timelineTeams = SIDES.map((side) => ({
		name: teams[side]?.name ?? match.slots[side].label,
		tag: teams[side]?.tag ?? `S${side}`,
		color: teams[side]?.color ?? "#888",
	})) as [TimelineTeam, TimelineTeam];

	return (
		<div>
			<div className="map-banner">
				<div className={`map-banner-bg${map.image ? "" : " map-fallback"}`} style={map.image ? { backgroundImage: `url(${map.image})` } : undefined} />
				<div className="map-banner-body">
					<div>
						<div className="map-card-index">
							Map {map.index + 1}
							{map.isOvertime ? " · Overtime" : ""}
						</div>
						<div className="map-banner-name">{map.displayName}</div>
						{map.isForfeit && <div className="ff-banner">{getForfeitNote(match, map)}</div>}
						{!map.isForfeit && map.ffRounds[0] + map.ffRounds[1] > 0 && (
							<div className="ff-banner">
								Score includes {getFfNote(match, map)} — forfeited rounds aren't in the replay, so the timeline and stats below don&apos;t include them
							</div>
						)}
					</div>
					{map.score && (
						<div className="map-banner-score">
							{map.stats && map.stats.rounds.length > 0 && (
								<div className="halves">
									<span />
									<span className="atk">ATK</span>
									<span className="def">DEF</span>
									{SIDES.map((side) => {
										const halves = getHalves(map, side);
										return [
											<span key={`n${side}`}>{teams[side]?.tag}</span>,
											<span key={`a${side}`} className="atk num">{halves.attack}</span>,
											<span key={`d${side}`} className="def num">{halves.defense}</span>,
										];
									})}
								</div>
							)}
							<span className="big num">
								<span style={{ color: map.winner === 0 ? "var(--accent)" : "var(--muted)" }}>{map.score[0]}</span>
								<span style={{ color: "var(--dim)" }}> – </span>
								<span style={{ color: map.winner === 1 ? "var(--accent)" : "var(--muted)" }}>{map.score[1]}</span>
							</span>
						</div>
					)}
				</div>
			</div>

			{map.error && <div className="error-note">{map.error}</div>}

			{map.stats ? (
				<>
					{map.stats.source === "scoreboard" ? (
						<div className="source-note">Stats from a scoreboard export: no round-by-round data, operators or trades for this map.</div>
					) : (
						<RoundTimeline rounds={map.stats.rounds} teams={timelineTeams} />
					)}
					<div className="scoreboards">
						{SIDES.map((side) => (
							<Scoreboard key={side} team={teams[side]} lines={map.stats!.players[side]} outcome={getOutcome(map.winner, side)} mvp={getMvp(map.stats!.players)} variant={map.stats!.source} />
						))}
					</div>
					<Glossary variant={map.stats.source} />
				</>
			) : map.isForfeit ? (
				<div className="empty-state">
					<div className="display">{getForfeitNote(match, map)}</div>
					No rounds were played on this map, so there are no stats.
				</div>
			) : (
				!map.error && (
					<div className="empty-state">
						<div className="display">No replay attached</div>
						Add an r6-dissect file to this map in tournament.json to see rounds and player stats.
					</div>
				)
			)}
		</div>
	);
}

function OverviewPanel({ match }: { match: ResolvedMatch }) {
	const lines = aggregateLines(match.maps);
	const hasStats = lines[0].length + lines[1].length > 0;
	const teams = SIDES.map((side) => match.slots[side].team);

	if (match.maps.length === 0) {
		return (
			<>
				<div className="section-head">
					<h2 style={{ fontSize: 22 }}>Rosters</h2>
					<span className="rule" />
				</div>
				<Rosters match={match} />
				<div className="empty-state">
					<div className="display">{match.slots[0].team && match.slots[1].team ? "Not played yet" : "Waiting on earlier results"}</div>
					{formatDate(match.date)}
				</div>
			</>
		);
	}

	if (match.isForfeit && match.winner !== null) {
		return (
			<>
				<div className="empty-state" style={{ marginTop: 0, marginBottom: 20 }}>
					<div className="display">{match.slots[match.winner].team?.name} win by forfeit</div>
					No rounds were played in this match.
				</div>
				<Rosters match={match} />
			</>
		);
	}

	return (
		<>
			<div className="overview-maps">
				{match.maps.map((map) => (
					<MapCard key={map.index} match={match} map={map} href={`#map-${map.index + 1}`} />
				))}
			</div>
			{hasStats ? (
				<>
					<div className="scoreboards">
						{SIDES.map((side) => (
							<Scoreboard key={side} team={teams[side]} lines={lines[side]} outcome={getOutcome(match.winner, side)} mvp={getMvp(lines)} variant={getVariant(match.maps)} />
						))}
					</div>
					<Glossary variant={getVariant(match.maps)} />
				</>
			) : (
				<div style={{ marginTop: 20 }}>
					<Rosters match={match} />
				</div>
			)}
		</>
	);
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const match = getMatch(id);
	if (!match) notFound();

	const tabs: TabSpec[] = [
		{ id: "overview", label: "Overview" },
		...match.maps.map((map) => ({
			id: `map-${map.index + 1}`,
			label: map.displayName,
			sub: map.score ? `${map.score[0]}–${map.score[1]}` : undefined,
		})),
	];
	const panels = [<OverviewPanel key="overview" match={match} />, ...match.maps.map((map) => <MapPanel key={map.index} match={match} map={map} />)];

	return (
		<div className="container">
			<nav className="breadcrumb">
				<Link href="/">Home</Link>
				<span>/</span>
				<Link href={match.stage === "group" ? "/#groups" : "/#playoffs"}>{match.stage === "group" ? "Group stage" : "Playoffs"}</Link>
				<span>/</span>
				<span>{match.title}</span>
			</nav>
			<MatchHero match={match} />
			<MatchTabs tabs={tabs} panels={panels} />
		</div>
	);
}
