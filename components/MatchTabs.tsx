/*
	MatchTabs

	Tab bar for a match page (Overview, Map 1, Map 2, ...). Panels are
	rendered on the server and passed in; this only toggles which one shows.
	The active tab is mirrored to the URL hash (#map-2) so it can be linked.

	(c) 2026 cio
*/

"use client";

// Modules

import { useEffect, useState } from "react";

// Types

export interface TabSpec {
	id: string;
	label: string;
	sub?: string;
}

// UI

export default function MatchTabs({ tabs, panels }: { tabs: TabSpec[]; panels: React.ReactNode[] }) {
	const [activeId, setActiveId] = useState(tabs[0]?.id);

	useEffect(() => {
		const syncFromHash = () => {
			const hash = window.location.hash.slice(1);
			if (tabs.some((tab) => tab.id === hash)) setActiveId(hash);
		};
		syncFromHash();
		window.addEventListener("hashchange", syncFromHash);
		return () => window.removeEventListener("hashchange", syncFromHash);
	}, [tabs]);

	const select = (id: string) => {
		setActiveId(id);
		history.replaceState(null, "", `#${id}`);
	};

	return (
		<div className="tabs">
			<div className="tab-list" role="tablist">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={tab.id === activeId}
						className={`tab${tab.id === activeId ? " is-active" : ""}`}
						onClick={() => select(tab.id)}
					>
						{tab.label}
						{tab.sub && <span className="tab-sub num">{tab.sub}</span>}
					</button>
				))}
			</div>
			{tabs.map((tab, index) => (
				<div key={tab.id} role="tabpanel" className="tab-panel" hidden={tab.id !== activeId}>
					{panels[index]}
				</div>
			))}
		</div>
	);
}
