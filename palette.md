# Bitemap — Color Palette

Accent is Tailwind `orange-500`. Neutrals are warm greys (Tailwind `stone`) so they harmonize with the orange rather than clashing. Two product-specific colors round it out: a heatmap ramp and a cool "your bite" pin.

## Accent

| Swatch | Name | Hex | Usage |
|---|---|---|---|
| 🟧 | Orange 500 | `#f97316` | Primary brand color, buttons, links, logo |
| 🟧 | Orange 600 | `#ea580c` | Hover / pressed states |
| 🟨 | Orange 100 | `#ffedd5` | Tinted backgrounds, banners, highlights |

## Neutrals — warm (stone)

| Swatch | Name | Hex | Usage |
|---|---|---|---|
| ⬛ | Stone 900 | `#1c1917` | Primary text, dark-mode background |
| ⬜ | Stone 500 | `#78716c` | Secondary text, captions, metadata |
| ⬜ | Stone 200 | `#e7e5e4` | Borders, dividers |
| ⬜ | Stone 100 | `#f5f5f4` | Light surfaces, cards |
| ⬜ | White | `#ffffff` | Photo cards, share card background |

## Semantic — for approve / reject flows

| Swatch | Name | Hex | Usage |
|---|---|---|---|
| 🟩 | Emerald 500 | `#10b981` | Approved / live / success |
| 🟥 | Red 600 | `#dc2626` | Rejected / error (keep in toasts & text, not on imagery) |

## Product — heatmap + your-bite pin

| Swatch | Name | Hex | Usage |
|---|---|---|---|
| 🟨 | Heat · low | `#fde047` | Low bite density |
| 🟧 | Heat · mid | `#fb923c` | Medium bite density |
| 🟥 | Heat · high | `#ef4444` | High bite density |
| 🟦 | Your bite · pin | `#2563eb` | The user's own bite — cool, to pop against the warm crowd |

## Notes

- **Warm greys on purpose.** Stone (slightly brown) sits naturally beside orange; cool greys (slate/zinc) make the orange look harsh.
- **Brand orange vs. heatmap.** Both are warm, so keep them separated by context: flat brand orange for UI chrome (buttons, logo), the heatmap ramp only for data on photos. Don't place a solid-orange UI element inside a heatmap.
- **The "you" pin is cool by design.** Blue is the opposite of the warm crowd, so the user's own bite stands out. Not arbitrary — keep it cool.
- **Dark mode.** Neutrals invert (Stone 900 becomes background, Stone 100 becomes text). Orange, blue, green, and red all hold on dark surfaces without adjustment — just map the neutrals instead of hardcoding white backgrounds.
- **Open decision.** Whether the heatmap's hot end leans redder (more "contested!") or stays orange-gold (friendlier) is a tone call — that's yours.