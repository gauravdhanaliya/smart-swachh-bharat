import Icon from "./Icon";
import { iconForEmoji } from "../utils/emojiIcons";

/**
 * Draws a value that some data still holds as an emoji (complaint types,
 * building kinds, the eco guide) as the matching outline icon. Never puts
 * the emoji itself on screen.
 */
export default function Glyph({ value, className = "h-5 w-5" }) {
  return <Icon name={iconForEmoji(value)} className={className} />;
}
