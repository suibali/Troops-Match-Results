/*
	GroupTable

	One group panel: the cross-table (row team vs column team, diagonal
	blanked) followed by the standings with each team's playoff seed

	(c) 2026 cio

	Implementation:

		- Every cell reads the match from the row team's point of view, so a
		  row is that team's full record and the table mirrors across the
		  diagonal (7-5 win on one side, 5-7 loss on the other).
		- BO1 cells show the round score; longer series show the map score.
		- Each played or scheduled cell links to the match page.
*/

// Modules

import Link from "next/link";
import TeamMark from "./TeamMark";
import { formatSigned, getDiffTone } from "@/lib/format";
import { findGroupMatch, getStandings, getTeam } from "@/lib/tournament";
import type { GroupConfig, ResolvedMatch, Side } from "@/lib/types";

// Constants

const UPCOMING_DAY_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "Europe/London" };

// UI

function getCellScore(match: ResolvedMatch, side: Side): [number, number] | null {
	if (match.bestOf === 1) {
		const score = match.maps[0]?.score;
		if (!score) return null;
		return side === 0 ? score : [score[1], score[0]];
	}
	return side === 0 ? match.mapScore : [match.mapScore[1], match.mapScore[0]];
}

function CrossCell({ rowId, columnId }: { rowId: string; columnId: string }) {
	const match = findGroupMatch(rowId, columnId);
	if (!match) return <td />;

	const side: Side = match.slots[0].team?.id === rowId ? 0 : 1;
	const score = getCellScore(match, side);

	if (match.status === "upcoming" || !score) {
		const label = match.date ? new Intl.DateTimeFormat("en-GB", UPCOMING_DAY_FORMAT).format(new Date(match.date)) : "vs";
		return (
			<td>
				<Link href={`/match/${match.id}`} className="cross-cell is-upcoming" title="Not played yet">
					{label}
				</Link>
			</td>
		);
	}

	const tone = match.status === "live" ? "is-live" : match.winner === side ? "is-win" : "is-loss";
	const isOvertime = match.bestOf === 1 && match.maps[0]?.isOvertime;
	return (
		<td>
			<Link href={`/match/${match.id}`} className={`cross-cell ${tone}`} title={match.maps.map((map) => `${map.displayName}${map.ffRounds[0] + map.ffRounds[1] > 0 ? ` (incl. ${map.ffRounds[0] + map.ffRounds[1]} FF)` : ""}`).join(", ")}>
				<span className="num">
					{score[0]}–{score[1]}
				</span>
				{match.isForfeit ? <span className="ot">FF</span> : isOvertime && <span className="ot">OT</span>}
				{match.status === "live" && <span className="ot">LIVE</span>}
			</Link>
		</td>
	);
}

export default function GroupTable({ group }: { group: GroupConfig }) {
	const teams = group.teams.map((id) => getTeam(id));
	const standings = getStandings(group.id);
	const played = standings.reduce((total, row) => total + row.played, 0) / 2;
	const total = (group.teams.length * (group.teams.length - 1)) / 2;

	return (
		<section className="panel">
			<div className="panel-head">
				<div className="panel-title">{group.name}</div>
				<div className="panel-meta num">
					{played}/{total} played
				</div>
			</div>

			<table className="cross-table">
				<thead>
					<tr>
						<th className="corner">Team vs</th>
						{teams.map((team) => (
							<th key={team?.id}>
								<div className="cross-col">
									<TeamMark team={team} size={22} />
								</div>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{teams.map((rowTeam) => (
						<tr key={rowTeam?.id}>
							<th className="cross-row-head">
								<div className="team-cell">
									<TeamMark team={rowTeam} size={24} />
									<span className="team-name">{rowTeam?.name}</span>
								</div>
							</th>
							{teams.map((columnTeam) =>
								rowTeam?.id === columnTeam?.id ? (
									<td key={columnTeam?.id} className="cross-diagonal" />
								) : (
									<CrossCell key={columnTeam?.id} rowId={rowTeam?.id ?? ""} columnId={columnTeam?.id ?? ""} />
								),
							)}
						</tr>
					))}
				</tbody>
			</table>

			<table className="standings">
				<thead>
					<tr>
						<th>#</th>
						<th>Team</th>
						<th title="Wins – Losses">W–L</th>
						<th title="Overtime wins – overtime losses">OT</th>
						<th title="Round difference">RD</th>
						<th title="Points">Pts</th>
						<th title="Playoff seed">Seed</th>
					</tr>
				</thead>
				<tbody>
					{standings.map((row, index) => {
						const difference = row.roundsFor - row.roundsAgainst;
						return (
							<tr key={row.team.id}>
								<td className="pos">{index + 1}</td>
								<td>
									<div className="team-cell">
										<TeamMark team={row.team} size={22} />
										<span className="team-name">{row.team.name}</span>
									</div>
								</td>
								<td className="num">
									{row.wins}–{row.losses}
								</td>
								<td className="num muted">
									{row.otWins}–{row.otLosses}
								</td>
								<td className={`num tone-${getDiffTone(difference)}`}>{formatSigned(difference)}</td>
								<td className="pts num">{row.points}</td>
								<td>
									<span className="seed-chip">
										{group.id}
										{index + 1}
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</section>
	);
}
