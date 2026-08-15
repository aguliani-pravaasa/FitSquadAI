// supabase/functions/generate-weekly-goals/index.ts
//
// Edge Function: generate-weekly-goals
//
// This function asks OpenAI to turn a squad's high-level `squad_goal`
// into ONE concrete, actionable weekly goal and inserts it as a new row in `goals`.
//
// Env vars required (set via `supabase secrets set`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   OPENAI_API_KEY

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

interface GeneratedGoal {
  type: string;
  scalable_quantity: string;
  baseline_points: number;
}

const SYSTEM_PROMPT = `You are a coaching assistant that converts a group's stated fitness goal into ONE concrete, actionable goal for the upcoming week.

You will be given a free-text goal description written by a squad/team (e.g. "We want to get our mile times down for a track meet in 20 days").

Turn it into a single, specific, measurable weekly action step appropriate for someone training toward that goal right now. Consider how much time is likely left (if a deadline is mentioned) and pick an appropriately challenging but achievable step for THIS week.

Output ONLY valid JSON, no prose, no markdown fences, in exactly this shape:
{"type": string, "scalable_quantity": string, "baseline_points": number}

Field rules:
- "type": a short, specific, actionable instruction a user could log progress against, written as an imperative sentence. It MUST include a concrete numeric target and unit inline (e.g. "Run 3 miles at a 5:00/mile pace", "Do 100 pushups this week", "Bike 20 miles"). This is the single source of truth for the target quantity — a downstream system will parse the number back out of this sentence, so always include it explicitly and unambiguously.
- "scalable_quantity": the unit of measurement used in "type", lowercase, normalized (e.g. "miles", "km", "reps", "minutes").
- "baseline_points": an integer point value (typically between 50 and 200) representing how much this goal is worth if fully completed, scaled to the goal's difficulty. Harder/longer goals are worth more points.

Never include any explanation, only the JSON object.`;

async function generateGoalWithOpenAI(
  squadGoalText: string,
): Promise<GeneratedGoal> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Squad goal: "${squadGoalText}"` },
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

  let parsed: GeneratedGoal;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned non-JSON content: ${content}`);
  }

  if (
    typeof parsed.type !== "string" ||
    typeof parsed.scalable_quantity !== "string" ||
    typeof parsed.baseline_points !== "number"
  ) {
    throw new Error("OpenAI returned malformed JSON");
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
    // Parse the request body to see if a specific squad_id was provided
    let requestData: { squad_id?: string } = {};
    if (req.body) {
      try {
        requestData = await req.json();
      } catch (e) {
        // Body is either empty or invalid JSON; fallback to empty object
      }
    }
    const { squad_id } = requestData;

    // Check authorization: allow service_role key OR verify user is a squad member
    const authHeader = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);

    let callingUserId: string | null = null;
    if (!isServiceRole) {
      if (!authHeader) {
        return json({ error: "Unauthorized: Missing Authorization header" }, 401);
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
      callingUserId = user.id;

      if (!squad_id) {
        return json({ error: "squad_id is required for user-initiated goal generation" }, 400);
      }

      // Verify user is an active member of the squad
      const dbTemp = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: membership, error: memErr } = await dbTemp
        .from("squad_members")
        .select("id")
        .eq("squad_id", squad_id)
        .eq("user_id", callingUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (memErr || !membership) {
        return json({ error: "Unauthorized: User is not an active member of this squad" }, 403);
      }
    }

    // Use service role client to bypass RLS
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build the query
    let query = db
      .from("squads")
      .select("id, name, squad_goal")
      .not("squad_goal", "is", null)
      .neq("squad_goal", "");

    // If a squad_id was passed, filter the query
    if (squad_id) {
      query = query.eq("id", squad_id);
    }

    const { data: squads, error: squadsErr } = await query;

    if (squadsErr) {
      return json({ error: `Failed to load squads: ${squadsErr.message}` }, 500);
    }

    if (!squads || squads.length === 0) {
      return json({ success: true, message: "No applicable squads found", results: [] });
    }

    const results = await Promise.all(
      squads.map(async (squad) => {
        try {
          const generated = await generateGoalWithOpenAI(squad.squad_goal);

          const { data: insertedGoal, error: insertErr } = await db
            .from("goals")
            .insert({
              squad_id: squad.id,
              type: generated.type,
              scalable_quantity: generated.scalable_quantity,
              baseline_points: generated.baseline_points,
            })
            .select()
            .single();

          if (insertErr) {
            return {
              squad_id: squad.id,
              squad_name: squad.name,
              success: false,
              error: `Failed to insert goal: ${insertErr.message}`,
            };
          }

          return {
            squad_id: squad.id,
            squad_name: squad.name,
            success: true,
            goal: insertedGoal,
          };
        } catch (err) {
          return {
            squad_id: squad.id,
            squad_name: squad.name,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }),
    );

    const failures = results.filter((r) => !r.success);

    return json({
      success: failures.length === 0,
      processed: results.length,
      failed: failures.length,
      results,
    });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
