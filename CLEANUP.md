# Codebase Cleanup Backlog

Generated after session on 2026-06-02. No regressions, no UX changes — maintainability only.

---

## Bugs (do first)

### 7. Home page serves unapproved sandwiches ✅ fixed 2026-06-02
`src/app/page.tsx` queries without an `approved` filter — a pending sandwich could be randomly surfaced.
**Fix:** add `.eq("approved", true)` to the sandwiches query.

### 8. `signInWithGoogle` ignores the `next` param set by middleware ✅ fixed 2026-06-02
Middleware redirects blocked admin requests to `/sign-in?next=/admin/review`, but `signInWithGoogle` hardcodes `next=/`. After signing in from an admin-blocked page, the user lands on `/` instead of going back where they came from.
**Fix:** sign-in page reads `searchParams.get("next")` and threads it through to `signInWithGoogle`.

---

## Duplicated code

### 2. `Point` interface defined in 4 files ✅ fixed 2026-06-02
Defined identically in `BiteCanvas.tsx`, `PolygonEditor.tsx`, `StaticHeatmap.tsx`, `TimelapseExporter.tsx`.
**Fix:** move to `src/lib/types.ts` (clearing its dead content first — see #1) and import everywhere.

### 3. `drawHeatmap` duplicated in 3 files ✅ fixed 2026-06-02
Byte-for-byte identical in `BiteCanvas.tsx` and `StaticHeatmap.tsx`; same algorithm with hardcoded dimensions in `TimelapseExporter.tsx`.
**Fix:** extract to `src/lib/draw-heatmap.ts` with signature `(canvas, bites, width, height)`.

### 5. `ProfileViewTracker` and `SandwichViewTracker` are the same pattern ✅ fixed 2026-06-02
Both are client components that fire one `track()` call on mount and return null.
**Fix:** replace both with a single `src/components/ViewTracker.tsx` that accepts `event` and `properties` props.

---

## Dead / redundant code

### 1. `src/lib/types.ts` — never imported
`Sandwich` and `Bite` interfaces defined but imported nowhere. Natural home for the shared `Point` type (see #2).
**Fix:** clear current contents; add `Point` export.

### 4. `src/app/admin/upload/actions.ts` — one-line re-export
The entire file is `export { getSignedUploadUrl, saveSandwich } from "@/lib/sandwich-actions"`. Pure indirection with no value.
**Fix:** delete the file; have `admin/upload/page.tsx` import directly from `@/lib/sandwich-actions`.

---

## File too large

### 6. `BiteCanvas.tsx` is ~800 lines, mostly pure utilities
The following have no component dependencies and can be extracted:

| Function | Destination |
|---|---|
| `pointInPolygon` | `src/lib/geometry.ts` |
| `computePercentile`, `outlierLabel`, `ordinal` | `src/lib/percentile.ts` |
| `pickNextSandwichId` | `src/lib/sandwich-actions.ts` |
| `generateShareImage` | `src/lib/share-image.ts` |
| `drawHeatmap` | `src/lib/draw-heatmap.ts` (see #3) |

After extraction, `BiteCanvas.tsx` drops to ~400 lines of actual React.

---

## Type safety

### 9. `saveBounds` uses `(supabase as any)` — and broader type gap
Root cause: Supabase types have never been generated. Run `npx supabase gen types` and commit the output to `src/lib/supabase/database.types.ts`, then type all three Supabase clients with `SupabaseClient<Database>`. Eliminates the cast and catches any other silent column mismatches.

---

## Small code quality

### 10. `checkBiteMilestones` error handling is fragile
`Promise.all` over mixed return types forces `r as { error?: unknown }`. Each job should catch its own errors inline with `.catch(console.error)`.

### 11. `AmplitudeProvider` initializes with potentially-undefined key
`layout.tsx` passes `process.env.AMPLITUDE_API_KEY!`. If absent, `amplitude.init(undefined!, ...)` runs silently. Add a guard: `if (!apiKey) return <>{children}</>`.

---

## Priority order

| Item | Risk | Effort | Value |
|---|---|---|---|
| #7, #8 | Bugs | Low | High |
| #3, #6 | Biggest maintainability wins | Medium | High |
| #1, #2, #4, #5 | Safe deletes/consolidations | Low | Medium |
| #9 | Proper Supabase types | Medium | High (long-term) |
| #10, #11 | Small code quality | Low | Low |
