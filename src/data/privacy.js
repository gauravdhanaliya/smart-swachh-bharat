// What EcoSetu collects, where each piece goes, and how long it is kept.
// Audited against the code (server/src, src/services), not guessed. Used by
// the privacy notice (/privacy) and the consent screen. Keep both in step
// with the code; raise ECOSETU_CONSENT_VERSION when this changes materially.

// ---- fill these in before going live ----------------------------------------
export const PRIVACY_CONTACT = "Gaurav Kumar, Team EcoSetu (gauravgk2177@gmail.com)";
export const ATLAS_REGION = "AWS Mumbai (ap-south-1), India";

/** Shown at the top of the privacy notice: how accounts work. */
export const ACCOUNT_SUMMARY =
  "Nothing is created until you agree on the start screen. You use EcoSetu with an email account (or the demo): your complaints and history stay with it on any device. Your email address and password stay at Firebase (Google); EcoSetu never stores either.";

/** What the app collects. */
export const COLLECTED = [
  {
    data: "Account ID",
    why: "So your complaints, ratings and notifications stay yours. Made when you create an account, after you agree; no phone number, no name needed.",
    where: "Firebase Authentication (Google) and EcoSetu's database.",
    required: "Yes, to use the app",
  },
  {
    data: "Email address and password",
    why: "To log in on any device and keep your history; to confirm the address and reset a forgotten password; and so an official or worker role given to that email reaches you once it is confirmed.",
    where: "Firebase Authentication holds the address and your password (EcoSetu never sees the password). EcoSetu's database keeps only a keyed one-way hash and a masked copy (as***@g***.com), never the address.",
    required: "Yes, to use the app",
  },
  {
    data: "Worker's email, added by an official",
    why: "An official adds a sanitation worker by name and email. When that person creates an account with the same email and confirms it, they become a worker.",
    where: "EcoSetu's database keeps only a keyed one-way hash (to recognise the account) and a masked copy (an***@g***.com) shown in the worker directory, never the address. Removing the worker cancels it.",
    required: "Staff only",
  },
  {
    data: "Your agreement on the start screen",
    why: "So nothing is created before you agree, and you aren't asked twice.",
    where: "This browser only, until you sign in; then it is recorded with your account on EcoSetu's server. Logging out forgets it on this device, so the next person is asked again.",
    required: "Yes, to use the app",
  },
  {
    data: "Location (GPS or a pin you place)",
    why: "To show where a complaint is. Asked for only when you report, never when the app opens.",
    where: "EcoSetu's database, with the complaint. Its street address is looked up at OpenStreetMap Nominatim.",
    required: "Only when reporting",
  },
  {
    data: "Place searches on the map",
    why: "To find a place you type and press Search for.",
    where: "Sent to OpenStreetMap Nominatim. Not stored with your account.",
    required: "Optional",
  },
  {
    data: "Photos",
    why: "Evidence for a complaint.",
    where: "Private Vercel Blob storage. Never at a public link.",
    required: "Optional",
  },
  {
    data: "Complaints (category, description, status)",
    why: "So officials and workers can fix the problem and you can follow it.",
    where: "EcoSetu's database.",
    required: "Only when reporting",
  },
  {
    data: "Name / display name",
    why: "Shown on complaints you report and to officials handling them.",
    where: "EcoSetu's database.",
    required: "A default is used if you don't set one",
  },
  {
    data: "Toilet ratings and comments",
    why: "Toilet quality feedback. Comments are shown to everyone without your name.",
    where: "EcoSetu's database.",
    required: "Optional",
  },
  {
    data: "Votes, notifications, consent record, sign-in session",
    why: "To run the app: your votes on complaints, updates about your complaints, what you agreed to, and keeping you signed in.",
    where: "EcoSetu's database (the session also in a secure cookie on your device).",
    required: "Yes, while you use the app",
  },
];

/** Every place user data goes: what, why, and how long it is kept. */
export const DESTINATIONS = [
  {
    service: "Firebase Authentication (Google)",
    data: "Your account ID, email address and password (Google stores the password hashed).",
    why: "To sign you in (Log in, Create account). Google sends the email that confirms an address and the one that resets a password.",
    kept: "Until you delete your data: “Delete my data” deletes your Firebase account as its last step.",
  },
  {
    service: `MongoDB Atlas (EcoSetu's database, region: ${ATLAS_REGION})`,
    data: "Your account (account ID, role, display name if you set one, and the email only as a keyed one-way hash and a masked copy), the worker directory (a worker's email only hashed and masked), complaints with their locations, ratings and comments, votes, notifications, your consent record and sign-in sessions.",
    why: "To run the app.",
    kept: "Until you delete your data. Complaints are then kept anonymised: they show “Deleted user”, with no link to you and no photo you attached. Sign-in sessions expire after 7 days; request counters within an hour.",
  },
  {
    service: "Vercel Blob (private file storage)",
    data: "Photos attached to complaints.",
    why: "Evidence for the worker and officials handling the complaint.",
    kept: "Until you delete your data, or officials delete the complaint. Photos are private: only you, the assigned worker and officials can open them, through the app.",
  },
  {
    service: "Vercel hosting (request logs)",
    data: "For each request: the method, the page path without its query, the status, the time taken, your role and a random request id. Never emails, passwords, tokens, locations, search words or photos.",
    why: "To keep the service running and find faults.",
    kept: "Vercel keeps these logs for 1 hour on the Hobby plan (1 day on Pro).",
  },
  {
    service: "OpenStreetMap Nominatim (third party: OpenStreetMap Foundation)",
    data: "Complaint locations (rounded to about 11 m) to look up the street address, and the words you type in map search when you press Search.",
    why: "To turn a location into an address, and to find places.",
    kept: "Sent by EcoSetu's server, so Nominatim sees our server rather than your device (in the browser-only demo build, your browser sends them). The OpenStreetMap Foundation handles them under its own privacy policy. EcoSetu caches the answers for 7 days, with no user id.",
  },
  {
    service: "OpenStreetMap map tiles (third party: OpenStreetMap Foundation)",
    data: "Your browser downloads map images, which shows the OpenStreetMap servers your IP address and the area you are looking at.",
    why: "To draw the map.",
    kept: "Under the OpenStreetMap Foundation's privacy policy.",
  },
  {
    service: "Google Fonts",
    data: "Your browser downloads the app's font, which shows Google your IP address.",
    why: "The app's typeface.",
    kept: "Under Google's privacy policy.",
  },
];

/** What "Delete my data" removes, and what it keeps (server/src/civic.js, deleteUserData). */
export const DELETED_ITEMS = [
  "Your account, and the hashed and masked copies of your email",
  "Your Firebase sign-in account (and the email and password Google holds), removed as the last step",
  "Photos you attached to complaints or facility requests",
  "Your toilet ratings and comments (they stop counting towards averages)",
  "Your notifications",
  "Your votes on complaints",
  "Your consent record and your profile",
  "Every signed-in session, on every device",
  "What this device remembers for you (settings, seen notifications)",
];

export const KEPT_ITEMS = [
  "Complaints you reported, anonymised: they show “Deleted user”, without your photo, and can't be traced back to you. The municipality keeps them in its municipal records so the work done stays on file.",
  "Facility requests you raised as a worker, and records you created or reviewed as an official, anonymised the same way.",
  "Photos a worker took to show the finished job stay with the complaint.",
];

/** The two privacy actions, side by side, so nobody confuses them. */
export const WITHDRAW_SUMMARY =
  "Withdraw consent: signs you out everywhere and stops new collection. Your account, complaints and ratings are kept. Sign in and accept again to continue.";
export const DELETE_SUMMARY =
  "Delete my data: permanently deletes your account and personal data, including your Firebase sign-in. Complaints are kept anonymised. This can't be undone.";

export const OSMF_PRIVACY_URL = "https://osmfoundation.org/wiki/Privacy_Policy";
