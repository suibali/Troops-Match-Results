/*
	Scoreboard

	Per-team stat table for one map or the whole series, sorted by rating

	(c) 2026 cio
*/

// Modules

import OperatorIcon from "./OperatorIcon";
import TeamMark from "./TeamMark";
import { formatPercent, formatSigned, getDiffTone, getRatingTone, getTopOperators } from "@/lib/format";
import type { PlayerLine, ResolvedTeam } from "@/lib/types";

// Constants

const OPERATORS_SHOWN = 3;

const COLUMNS = [
	{ label: "Player", title: "Player" },
	{ label: "Operators", title: "Most played operators", replayOnly: true },
	{ label: "Rating", title: "Rating — 1.00 is an average game" },
	{ label: "K–D", title: "Kills – deaths" },
	{ label: "+/−", title: "Kill/death difference" },
	{ label: "Entry", title: "Opening kills – opening deaths" },
	{ label: "KOST", title: "% of rounds with a kill, objective, survival or trade" },
	{ label: "KPR", title: "Kills per round" },
	{ label: "SRV", title: "% of rounds survived" },
	{ label: "HS%", title: "Headshot percentage" },
	{ label: "1vX", title: "Clutches won" },
	{ label: "Plants", title: "Defuser plants", scoreboardLabel: "Obj", scoreboardTitle: "Objective plays (plants and disables)" },
	{ label: "Trades", title: "Trade kills", replayOnly: true },
];

// Scoreboard imports have no operators or kill feed, so those columns are dropped
type Variant = "replay" | "scoreboard";

// UI

export default function Scoreboard({
	team,
	lines,
	outcome,
	mvp,
	variant = "replay",
}: {
	team: ResolvedTeam | null;
	lines: PlayerLine[];
	outcome?: "win" | "loss";
	mvp?: string;
	variant?: Variant;
}) {
	const isReplay = variant === "replay";
	const columns = COLUMNS.filter((column) => isReplay || !column.replayOnly);
	return (
		<section className="panel">
			<div className="team-bar" style={{ boxShadow: `inset 3px 0 0 ${team?.color ?? "var(--line-strong)"}` }}>
				<div className="team-cell">
					<TeamMark team={team} size={26} />
					<span className="team-name">{team?.name ?? "Unknown team"}</span>
				</div>
				{outcome && <span className={`outcome is-${outcome}`}>{outcome === "win" ? "Victory" : "Defeat"}</span>}
			</div>
			<div className="scoreboard-wrap">
				<table className={`scoreboard is-${variant}`}>
					<thead>
						<tr>
							{columns.map((column) => (
								<th key={column.label} title={(!isReplay && column.scoreboardTitle) || column.title}>
									{(!isReplay && column.scoreboardLabel) || column.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{lines.map((line) => {
							const difference = line.kills - line.deaths;
							const entryDifference = line.entryKills - line.entryDeaths;
							return (
								<tr key={line.username}>
									<td className="player">
										{line.username}
										{mvp === line.username && <span className="mvp">MVP</span>}
									</td>
									{isReplay && (
										<td>
											<span className="op-list">
												{getTopOperators(line.operators, OPERATORS_SHOWN).map((operator) => (
													<OperatorIcon key={operator} name={operator} rounds={line.operators[operator]} />
												))}
											</span>
										</td>
									)}
									<td className="rating">
										<span className={`rating-cell tone-${getRatingTone(line.rating)}`}>{line.rating.toFixed(2)}</span>
									</td>
									<td>
										{line.kills}–{line.deaths}
									</td>
									<td className={`tone-${getDiffTone(difference)}`}>{formatSigned(difference)}</td>
									<td>
										{line.entryKills}–{line.entryDeaths}{" "}
										<span className={`tone-${getDiffTone(entryDifference)}`}>({formatSigned(entryDifference)})</span>
									</td>
									<td>{formatPercent(line.kost)}</td>
									<td>{line.kpr.toFixed(2)}</td>
									<td>{formatPercent(line.srv)}</td>
									<td>{formatPercent(line.hsPct)}</td>
									<td>{line.clutches}</td>
									<td>{line.plants}</td>
									{isReplay && <td>{line.trades}</td>}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</section>
	);
}
