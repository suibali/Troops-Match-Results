/*
	labels.ts

	Plain lookup tables safe to import from client components

	(c) 2026 cio
*/

// Constants

export const WIN_CONDITION_LABEL: Record<string, string> = {
	KilledOpponents: "Elimination",
	DefusedBomb: "Defuser detonated",
	DisabledDefuser: "Defuser disabled",
	Time: "Time ran out",
	SecuredArea: "Area secured",
	ExtractedHostage: "Hostage extracted",
};
