/*
	layout.tsx

	Root layout: fonts, global styles, header and footer

	(c) 2026 cio
*/

// Modules

import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { loadTournament } from "@/lib/tournament";

// Metadata

export function generateMetadata(): Metadata {
	const tournament = loadTournament();
	return {
		title: { default: tournament.name, template: `%s · ${tournament.name}` },
		description: `${tournament.name} — Rainbow Six Siege tournament: groups, playoffs and match stats.`,
	};
}

// UI

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<SiteHeader />
				<main>{children}</main>
				<SiteFooter />
			</body>
		</html>
	);
}
