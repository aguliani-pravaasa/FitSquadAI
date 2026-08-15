// supabase/functions/calculate-points/index.ts
//
// Edge Function: calculate-points
//
// Given a user_goal_id and the raw amount of a scalable quantity the user
// says they completed (e.g. 5.0 km run), this function:
//   1. Loads the user_goal + parent goal row (target text, baseline points,
//      scalable_quantity unit).
//   2. Asks OpenAI to parse the goal's free-text description (e.g. "run 10km")
//      into a structured target { target_quantity, unit }.
//   3. Computes computed_value = (raw_value / target_quantity) * baseline_points,
//      clamped to a sane max so someone can't blow past baseline_points by an
//      absurd amount.
//   4. Inserts a row into `scores` and returns the computed points.
//   5. Adds the computed points onto the user's existing `profiles.score`
//      total and returns the updated value.
//   6. Adds the computed points onto the user's `squad_members.points`
//      total for the relevant squad and returns the updated value.
//
// Request body (JSON):
//   {
//     "user_goal_id": "uuid",
//     "raw_value": 5.0
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Max multiple of baseline_points a user can earn for a single submission,
// even if they wildly overachieve the goal. Prevents e.g. "run 10km" +
// raw_value 500 from awarding 5000% of baseline_points.
const MAX_OVERACHIEVEMENT_MULTIPLIER = 1.5;

interface ParsedGoal {
  target_quantity: number;
  unit: string;
  matches_scalable_quantity: boolean;
}

const SYSTEM_PROMPT = `You are a strict parser for fitness/habit goal descriptions.

You will be given:
- a free-text goal description written by a user or coach (e.g. "run 10km", "do 50 pushups", "meditate for 20 minutes")
- the expected unit of measurement for that goal (the "scalable_quantity"), e.g. "km", "reps", "minutes"

Your job is to extract the numeric target quantity implied by the text, and the unit it is expressed in.

Rules:
- Output ONLY valid JSON, no prose, no markdown fences.
- JSON shape exactly: {"target_quantity": number, "unit": string, "matches_scalable_quantity": boolean}
- "target_quantity" is the numeric goal amount (e.g. 10 for "run 10km").
- "unit" is the unit as it appears/implied in the text, normalized to lowercase (e.g. "km", "miles", "reps", "minutes").
- "matches_scalable_quantity" is true only if the unit you extracted is the same unit (or a trivially equivalent alias, e.g. "kilometers" == "km") as the provided expected scalable_quantity. If they differ in kind (e.g. text says "minutes" but expected unit is "km"), set this to false.
- If you truly cannot find a numeric target in the text, use target_quantity: 1 and matches_scalable_quantity: false.
- Never include any explanation, only the JSON object.`;

async function parseGoalWithOpenAI(
  goalText: string,
  scalableQuantity: string,
): Promise<ParsedGoal> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Goal text: "${goalText}"\nExpected scalable_quantity unit: "${scalableQuantity}"`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }

  let parsed: ParsedGoal;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned non-JSON content: ${content}`);
  }

  if (
    typeof parsed.target_quantity !== "number" ||
    typeof parsed.unit !== "string" ||
    typeof parsed.matches_scalable_quantity !== "boolean"
  ) {
    throw new Error(`OpenAI returned malformed JSON: ${content}`);
  }

  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.user_goal_id !== "string" ||
      typeof body.raw_value !== "number") {
      return json(
        { error: "Body must include { user_goal_id: string, raw_value: number }" },
        400,
      );
    }

    const { user_goal_id, raw_value } = body;

    if (raw_value < 0) {
      return json({ error: "raw_value must be >= 0" }, 400);
    }

    // 1. Verify caller identity using JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const authClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: `Unauthorized: ${userErr?.message ?? "Invalid token"}` }, 401);
    }
    const callingUserId = user.id;

    // Use service role client to bypass RLS since this is a backend service executing multi-table scoring logic
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pull the user_goal along with its parent goal in one query.
    const { data: userGoal, error: goalErr } = await db
      .from("user_goals")
      .select(
        `
        id,
        goal_id,
        user_id,
        user_baseline_points,
        text,
        goals (
          id,
          squad_id,
          type,
          baseline_points,
          scalable_quantity
        )
      `,
      )
      .eq("id", user_goal_id)
      .single();

    if (goalErr || !userGoal) {
      return json({ error: "user_goal not found" }, 404);
    }

    // Ensure the goal belongs to the user calling this function
    if (userGoal.user_id !== callingUserId) {
      return json({ error: "Unauthorized: Goal does not belong to this user" }, 403);
    }

    const goal = Array.isArray(userGoal.goals) ? userGoal.goals[0] : userGoal.goals;
    if (!goal) {
      return json({ error: "Parent goal record missing" }, 404);
    }

    const baselinePoints = userGoal.user_baseline_points ?? goal.baseline_points;
    if (baselinePoints == null) {
      return json({ error: "No baseline_points configured for this goal" }, 500);
    }

    // Ask OpenAI to parse the free-text goal (e.g. "run 10km") into a
    // structured target quantity + unit, validated against scalable_quantity.
    const parsedGoal = await parseGoalWithOpenAI(
      userGoal.text ?? "",
      goal.scalable_quantity ?? "",
    );

    if (!parsedGoal.matches_scalable_quantity) {
      return json(
        {
          error:
            "Could not confidently match the goal's unit to its scalable_quantity",
          parsedGoal,
        },
        422,
      );
    }

    if (parsedGoal.target_quantity <= 0) {
      return json({ error: "Parsed target_quantity must be > 0" }, 422);
    }

    const rawRatio = raw_value / parsedGoal.target_quantity;
    const cappedRatio = Math.min(rawRatio, MAX_OVERACHIEVEMENT_MULTIPLIER);
    const computedValue = Math.round(cappedRatio * baselinePoints);

    const { data: scoreRow, error: insertErr } = await db
      .from("scores")
      .insert({
        squad_id: goal.squad_id,
        user_id: callingUserId,
        user_goal_id: userGoal.id,
        raw_value,
        computed_value: computedValue,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      return json({ error: `Failed to insert score: ${insertErr.message}` }, 500);
    }

    // Add the newly computed points onto the user's running total in
    // `profiles.score`.
    const { data: profileRow, error: profileFetchErr } = await db
      .from("profiles")
      .select("id, score")
      .eq("id", callingUserId)
      .single();

    if (profileFetchErr || !profileRow) {
      return json(
        {
          error: `Score was recorded, but failed to load profile to update points: ${
            profileFetchErr?.message ?? "profile not found"
          }`,
          score: scoreRow,
          computed_points: computedValue,
        },
        500,
      );
    }

    const previousPoints = profileRow.score ?? 0;
    const newPoints = previousPoints + computedValue;

    const { data: updatedProfile, error: profileUpdateErr } = await db
      .from("profiles")
      .update({ score: newPoints })
      .eq("id", callingUserId)
      .select("id, score")
      .single();

    if (profileUpdateErr) {
      return json(
        {
          error: `Score was recorded, but failed to update profile points: ${profileUpdateErr.message}`,
          score: scoreRow,
          computed_points: computedValue,
        },
        500,
      );
    }

    // Also add the same points onto the user's row in `squad_members` for
    // the squad this goal belongs to.
    const { data: squadMemberRow, error: squadMemberFetchErr } = await db
      .from("squad_members")
      .select("id, points")
      .eq("user_id", callingUserId)
      .eq("squad_id", goal.squad_id)
      .single();

    if (squadMemberFetchErr || !squadMemberRow) {
      return json(
        {
          error: `Score and profile points were recorded, but failed to load squad_members row to update points: ${
            squadMemberFetchErr?.message ?? "squad_members row not found"
          }`,
          score: scoreRow,
          computed_points: computedValue,
          new_points: updatedProfile.score,
        },
        500,
      );
    }

    const previousSquadPoints = squadMemberRow.points ?? 0;
    const newSquadPoints = previousSquadPoints + computedValue;

    const { data: updatedSquadMember, error: squadMemberUpdateErr } = await db
      .from("squad_members")
      .update({ points: newSquadPoints })
      .eq("id", squadMemberRow.id)
      .select("id, points")
      .single();

    if (squadMemberUpdateErr) {
      return json(
        {
          error: `Score and profile points were recorded, but failed to update squad_members points: ${squadMemberUpdateErr.message}`,
          score: scoreRow,
          computed_points: computedValue,
          new_points: updatedProfile.score,
        },
        500,
      );
    }

    return json({
      success: true,
      score: scoreRow,
      computed_points: computedValue,
      previous_points: previousPoints,
      new_points: updatedProfile.score,
      previous_squad_points: previousSquadPoints,
      new_squad_points: updatedSquadMember.points,
      parsedGoal,
      target_quantity: parsedGoal.target_quantity,
      unit: parsedGoal.unit,
    });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
