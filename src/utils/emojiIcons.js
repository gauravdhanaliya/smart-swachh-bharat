// Emoji some data still holds, mapped to the app's outline icons
// (components/Icon.jsx). Kept out of the component file for Fast Refresh.

const MAP = {
  "🗑️": "bin",
  "🗑": "bin",
  "🚻": "toilet",
  "🚛": "truck",
  "♻️": "recycle",
  "♻": "recycle",
  "✅": "checkCircle",
  "✉️": "mail",
  "✓": "check",
  "❓": "help",
  "🌐": "globe",
  "🌱": "leaf",
  "🌳": "tree",
  "🌿": "leaf",
  "🍽️": "utensils",
  "🎓": "graduation",
  "🏛️": "landmark",
  "🏢": "building",
  "🏫": "building",
  "💡": "lightbulb",
  "💧": "droplet",
  "💬": "message",
  "📋": "clipboard",
  "📍": "pin",
  "📚": "book",
  "📝": "note",
  "📞": "phone",
  "📣": "megaphone",
  "🔔": "bell",
  "🗂️": "folder",
  "🗺️": "map",
  "🙂": "user",
  "🚪": "door",
  "🛍️": "bag",
  "🛏️": "bed",
  "🧰": "toolbox",
  "🧹": "broom",
};

/** The outline icon name for an emoji (or for an icon name already). Unknown values get a neutral icon. */
export function iconForEmoji(value) {
  const v = String(value ?? "").trim();
  return MAP[v] ?? MAP[v.replace(/️/g, "")] ?? (/^[a-z][a-zA-Z]*$/.test(v) ? v : "info");
}

export const EMOJI_ICON_MAP = MAP;
