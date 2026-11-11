/*
	maps.ts

	Map name normalisation and artwork. r6-dissect reports names like
	`ClubHouseY10` or `KafeDostoyevskyY10`; everything is keyed on a
	lowercase alphanumeric form with the season suffix stripped.

	(c) 2026 cio
*/

// Constants

const STATIC_CTF = "https://staticctf.ubisoft.com/J3yJr34U2pZ2Ieem48Dwy9uqj5PNUQTn";

// Artwork from the official Ubisoft map pages (ubisoft.com/.../game-info/maps)
const MAP_INFO: Record<string, { name: string; image?: string }> = {
	bank: { name: "Bank", image: `${STATIC_CTF}/4mjO2UYo1gqwhess6Mi5gb/a08a0b4886d73742e4d60315b9f21106/R6S_Maps_Bank_INT.jpg` },
	border: { name: "Border", image: `${STATIC_CTF}/5vsJsf9T6r7aFBLJX8dJOG/dafc156a04d0a488768bb67f4571ee9e/R6S_Maps_Border_INT.jpg` },
	chalet: { name: "Chalet", image: `${STATIC_CTF}/4M17EQjgQCJOy2NpZM08OT/36c6b2db0da388d851a5c518335c9145/R6S_Maps_Chalet_INT.jpg` },
	clubhouse: { name: "Clubhouse", image: `${STATIC_CTF}/2ljlmbIAzZyVPSxOIcnlBn/da345d768d59f205b55ebae07c9f5ab1/R6S_Maps_Clubhouse_INT.jpg` },
	consulate: { name: "Consulate", image: `${STATIC_CTF}/2dWfAAHlvdqfl9IXq6uSTe/134a32a05f18126548da90571e5d7323/ModernizedMap_Consulate_keyart.jpg` },
	kafedostoyevsky: { name: "Kafe Dostoyevsky", image: `${STATIC_CTF}/2fFapm8NXcr8tVPK5wKvAw/7badc6f2631b4954e11acb087b5cf24d/R6S_Maps_RussianCafe_INT.jpg` },
	kafe: { name: "Kafe Dostoyevsky", image: `${STATIC_CTF}/2fFapm8NXcr8tVPK5wKvAw/7badc6f2631b4954e11acb087b5cf24d/R6S_Maps_RussianCafe_INT.jpg` },
	lair: { name: "Lair", image: `${STATIC_CTF}/2bKyUztyfsi7HfL9RGtPb9/b34c837688b2b4db51ce1e97520d61ef/ModernizedMap_Lair_keyart.jpg` },
	nighthavenlabs: { name: "Nighthaven Labs", image: `${STATIC_CTF}/2gMeZHxuUrUzHTTBdxqGJJ/3bb639dc291983d825cbde80c15efbad/ModernizedMap_Nighthaven_keyart.jpg` },
	skyscraper: { name: "Skyscraper", image: `${STATIC_CTF}/7vblsbhmSPLsI3pQJ5Dqx9/addc0558833504849fe5ebeafe5fbd5a/skycraper_modernized_keyart.jpg` },
	oregon: { name: "Oregon", image: `${STATIC_CTF}/1FoLr9Hf4oucDtzyQ48uFD/45ed70b771671e73871fd7d3378bbeb6/r6s_maps_oregon_main.jpg` },
	villa: { name: "Villa", image: `${STATIC_CTF}/6unM0FYNkxPsr7BSiKLPR5/1a3e9cf2565be709e993a809457e595a/r6s-maps-villa-main.jpg` },
	kanal: { name: "Kanal", image: `${STATIC_CTF}/4VHR8uZRGkHqvtZxtmibtc/da988c2cab37f1cb186535fc9ba40bea/r6-maps-kanal.jpg` },
	themepark: { name: "Theme Park", image: `${STATIC_CTF}/2immPCOZj6tTHMM9zeBg5B/ba237774ba7d2b1e069b6b6065a60207/themepark_modernized_keyart.jpg` },
	outback: { name: "Outback", image: `${STATIC_CTF}/1vqGVW6pqBZlLKp4h86NnB/08a7e337c0cfa604cde79e755fedb397/r6-maps-outback.jpg` },
	coastline: { name: "Coastline" },
	emeraldplains: { name: "Emerald Plains" },
	fortress: { name: "Fortress" },
	calypsocasino: { name: "Calypso Casino" },
	stadiumbravo: { name: "Stadium Bravo" },
};

// r6-dissect's map IDs (dissect/header.go on its main branch). The latest
// release predates the Siege X reworks and prints those as "Map(<id>)"
const MAP_IDS: Record<string, string> = {
	"837214085": "ClubHouse",
	"1378191338": "KafeDostoyevsky",
	"1460220617": "Kanal",
	"1767965020": "Yacht",
	"2609218856": "PresidentialPlane",
	"2609221242": "ConsulateY7",
	"2697268122": "BartlettU",
	"42090092951": "Coastline",
	"53627213396": "Tower",
	"88107330328": "Villa",
	"126196841359": "Fortress",
	"127951053400": "HerefordBase",
	"199824623654": "ThemePark",
	"231702797556": "Oregon",
	"237873412352": "House",
	"259816839773": "Chalet",
	"276279025182": "Skyscraper",
	"305979357167": "Border",
	"329867321446": "Favela",
	"355496559878": "Bank",
	"362605108559": "Outback",
	"365284490964": "EmeraldPlains",
	"270063334510": "StadiumBravo",
	"378595635123": "NighthavenLabs",
	"379218689149": "Consulate",
	"388073319671": "Lair",
	"405306299908": "Stadium2020",
	"413779563590": "BankY10",
	"407987100456": "BorderY10",
	"407558616688": "ChaletY10",
	"407193663917": "ClubHouseY10",
	"413845419788": "KafeDostoyevskyY10",
	"417890697769": "LairY10",
	"418119057546": "NighthavenLabsY10",
	"418126004176": "ConsulateY10",
};

const UNKNOWN_MAP_PATTERN = /^Map\((\d+)\)$/;

// Util

function resolveName(name: string): string {
	const id = UNKNOWN_MAP_PATTERN.exec(name.trim())?.[1];
	return id ? MAP_IDS[id] ?? name : name;
}

export function getMapKey(name: string): string {
	return resolveName(name)
		.replace(/Y\d+$/i, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

export function getMapDisplayName(name: string): string {
	const info = MAP_INFO[getMapKey(name)];
	if (info) return info.name;
	// Unknown map: split CamelCase so "EmeraldPlains" still reads well
	return resolveName(name).replace(/Y\d+$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function getMapImage(name: string): string | null {
	return MAP_INFO[getMapKey(name)]?.image ?? null;
}
