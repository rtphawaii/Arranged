# Table matching

`backend/src/modules/matching/algorithm.ts` turns the confirmed bookings of one dinner event into tables.
It is pure and deterministic for a given seed, so results can be reproduced and unit-tested.

## Inputs

For each confirmed booking: age, gender, languages, personality vector (6 dimensions from the
questionnaire), budget preference, dietary needs, "keep my table close in age" flag, the set of people
they have already dined with, the set of people they have blocked (or been blocked by), and booking time.

## Steps

1. **Table sizes.** `planTableSizes(n, min=4, max=6)` prefers full tables of six, then five, then four.
   If no exact split exists (e.g. 7 people), the earliest bookings are seated and the rest are waitlisted.
2. **Baseline.** Sort by age and chunk into tables, which already gives tight age bands.
3. **Hill climbing.** Repeatedly pick two tables and swap one member each; keep the swap if the summed
   table cost goes down. Runs `max(2000, 60 × people)` iterations.
4. **Restaurants.** `pickRestaurant` chooses the venue whose price level best fits the table's budget
   preferences and still has tables left (`restaurants.max_tables`).

## Cost function (`tableCost`)

Lower is better. Weights are in `DEFAULT_WEIGHTS` and can be overridden per run.

| Signal | Cost |
| --- | --- |
| Age spread | 1.0 per year beyond 8 years; +2.0 per year beyond 5 when anyone asked for a tight age band |
| Gender balance | 1.5 per person of imbalance beyond one; +4.0 if exactly one woman (or man) sits with 3+ of the other |
| Common language | 25 per member who doesn't speak the table's most common language |
| Budget clash | 3.0 if the table mixes "low" and "high" budgets |
| Repeat tablemate | 6.0 per pair that already shared a table |
| Blocked pair | 1000 (effectively a hard constraint) |
| Personality: align | 6.0 × standard deviation on openness, depth and humour (similar is better) |
| Personality: mix | 4.0 × shortfall below 0.2 standard deviation on energy and warmth (some spread is better) |

## Tuning

- Change `DEFAULT_WEIGHTS` or pass `weights` to `matchTables` (the admin `match` endpoint accepts a `seed`;
  wire weights through if you want per-city tuning).
- Change `minSize`/`maxSize` for different table sizes.
- The questionnaire's dimension order is `energy, openness, depth, humor, structure, warmth`
  (`modules/personality/questions.ts`); `ALIGN_DIMS` and `MIX_DIMS` index into it.
- To experiment, write candidates in a test (see `backend/test/matching.test.ts`) and compare `totalCost`.
