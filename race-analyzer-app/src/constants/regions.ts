/** NICA region team lists — single source of truth for region mapping */

export const NORTH = [
  "Crescenta Valley High School",
  "Newbury Park High School",
  "Heritage Oak School MTN Bike Team",
  "Conejo Composite East",
  "Antelope Valley Composite",
  "Santa Clarita Valley Composite Private",
  "Santa Clarita Valley Composite Public",
  "Orcutt Mountain Bike Composite",
  "Santa Monica Mountains Composite",
  "Saugus High School",
  "St. Francis High School",
  "Tehachapi Composite MTN Bike Team",
];

export const CENTRAL = [
  "Foothill Composite",
  "Glendora MTB",
  "Woodcrest Christian High School",
  "North Orange County Composite",
  "Yucaipa High School",
  "Claremont High School",
  "Claremont Composite",
  "Damien High School",
  "Foothill High School",
  "San Gabriel Mountains Composite",
  "El Modena High School",
  "Santa Clarita Valley Composite Private",
  "Independent Central",
];

export const SOUTH = [
  "Murrieta Valley High School",
  "Temecula Valley High School",
  "Vista Murrieta High School",
  "Murrieta Mesa High School",
  "Temescal Canyon High School",
  "North County Composite",
  "Great Oak High School",
  "Independent South",
];

const map: Record<string, string> = {};
NORTH.forEach((t) => { map[t.toUpperCase()] = "North"; });
CENTRAL.forEach((t) => { map[t.toUpperCase()] = "Central"; });
SOUTH.forEach((t) => { map[t.toUpperCase()] = "South"; });

/** Team name (uppercase) -> region label */
export const REGION_MAP: Readonly<Record<string, string>> = map;
