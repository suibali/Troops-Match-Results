/*
	SiteChrome

	Sticky header and footer shared by every page

	(c) 2026 cio
*/

// Modules

import Link from "next/link";
import { loadTournament } from "@/lib/tournament";

// Constants

const NAV_LINKS = [
	{ href: "/#groups", label: "Groups" },
	{ href: "/#playoffs", label: "Playoffs" },
];

// UI

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

export function SiteHeader() {
	const tournament = loadTournament();
	return (
		<header className="site-header">
			<div className="container">
				<Link href="/" className="brand">
					<span className="brand-mark">{getInitials(tournament.name)}</span>
					<span className="brand-name">{tournament.name}</span>
				</Link>
				<nav className="site-nav">
					{NAV_LINKS.map((link) => (
						<Link key={link.href} href={link.href}>
							{link.label}
						</Link>
					))}
				</nav>
			</div>
		</header>
	);
}

export function SiteFooter() {
	const tournament = loadTournament();
	return (
		<footer className="site-footer">
			<div className="container">
				<span>
					{tournament.name}
					{tournament.edition ? ` · ${tournament.edition}` : ""}
				</span>
				<span>Match data from r6-dissect · Map art © Ubisoft · Operator icons by r6operators</span>
			</div>
		</footer>
	);
}
