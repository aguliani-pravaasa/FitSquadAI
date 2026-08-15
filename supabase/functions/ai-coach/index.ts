// supabase/functions/ai-coach/index.ts
//
// Edge Function: ai-coach
//
// Lets a user ask a free-text question ("How should I pace my long run this
// week?", "I'm sore, should I still do my goal today?") and get back a
// personalized coaching response, grounded in:
//   - their profile (fitness_level, age, height/weight/bmi, gender,
//     ai_coach_preference)
//   - their current active user_goals (+ parent goal's scalable_quantity)
//   - their recent chat history with the coach, for conversational memory
//   - their squad membership, the squad's goal, and their teammates' progress
//
// Flow: the client inserts the user's message into `chat` itself (type:
// 'user') as soon as they send it, then immediately calls this function
// with that row's id. This function looks up user_id + message text from
// that row, generates a reply, and inserts ONE new row (type: 'assistant').
//
// Request body (JSON):
//   {
//     "chat_id": "uuid"
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

const CHAT_HISTORY_LIMIT = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type SquadContext = {
  name: string;
  goal: string | null;
  teammates: { username: string; points: number; streak: number }[];
};

function buildSystemPrompt(
  profile: Record<string, unknown> | null,
  activeGoals: { instruction: string; unit: string | null }[],
  squadContext: SquadContext | null
): string {
  const lines: string[] = [
    "You are an encouraging, knowledgeable fitness and goal-achievement coach embedded in a group fitness app.",
    "Your job is to help this specific user figure out how to accomplish their current goals — pacing, technique, motivation, recovery, scheduling, adjustments when they're struggling, etc.",
    "Be concrete and practical. Prefer specific numbers (paces, reps, rest days) over vague encouragement. Keep responses focused and conversational — a few short paragraphs at most, not an essay.",
    "Only give safety-conscious advice: if something they describe sounds like it risks injury or overtraining, say so plainly and suggest a safer alternative. Additionally, you are a fitness coach and a fitness coach only. Please refrain from helping a user with tasks that one typically would not do while exercising, such as coding, writing, doing arithmetic, etc. Recognize when a user is asking for non fitness tasks, and refuse them.",
  ];

  if (profile) {
    const facts: string[] = [];
    if (profile.username) facts.push(`username: ${profile.username}`);
    if (profile.fitness_level) facts.push(`self-reported fitness level: ${profile.fitness_level}`);
    if (profile.age) facts.push(`age: ${profile.age}`);
    if (profile.gender) facts.push(`gender: ${profile.gender}`);
    if (profile.height_cm) facts.push(`height: ${profile.height_cm}cm`);
    if (profile.weight_kg) facts.push(`weight: ${profile.weight_kg}kg`);
    if (profile.bmi) facts.push(`BMI: ${profile.bmi}`);
    if (facts.length > 0) {
      lines.push(`Known facts about this user: ${facts.join(", ")}.`);
    }
    if (profile.ai_coach_preference) {
      lines.push(
        `The user has requested this coaching style/tone preference: "${profile.ai_coach_preference}". Adapt your tone accordingly.`
      );
    }
  }

  // Injecting Squad & Teammate Context
  if (squadContext) {
    lines.push(`The user is currently an active member of the squad "${squadContext.name}".`);
    if (squadContext.goal) {
      lines.push(`The squad's overarching collective goal is: "${squadContext.goal}".`);
    }
    
    if (squadContext.teammates.length > 0) {
      const matesList = squadContext.teammates
        .map((t) => `- ${t.username} (Points: ${t.points}, Active Streak: ${t.streak} days)`)
        .join("\n");
      lines.push(
        `For context, here is the current progress of their active teammates:\n${matesList}\n\nFeel free to occasionally reference teammate progress to foster friendly competition, motivate the user, or suggest they encourage a teammate who is doing well.`
      );
    } else {
      lines.push("The user is currently the only active member in this squad.");
    }
  }

  if (activeGoals.length > 0) {
    const goalLines = activeGoals
      .map((g) => `- ${g.instruction}${g.unit ? ` (measured in ${g.unit})` : ""}`)
      .join("\n");
    lines.push(`The user's current active personal goal(s):\n${goalLines}`);
  } else {
    lines.push("The user does not currently have any active personal goals assigned.");
  }

  return lines.join("\n\n");
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
    if (!body || typeof body.chat_id !== "string") {
      return json({ error: "Body must include { chat_id: string }" }, 400);
    }

    const chatId: string = body.chat_id;

    // Verify authentication of the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseClient = createClient(
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

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: `Unauthorized: ${userErr?.message ?? "Invalid token"}` }, 401);
    }
    const callingUserId = user.id;

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 0. Look up the user's just-inserted chat row to get user_id + message.
    const { data: triggerRow, error: triggerErr } = await db
      .from("chat")
      .select("id, user_id, type, message")
      .eq("id", chatId)
      .single();

    if (triggerErr || !triggerRow) {
      return json({ error: `Could not load chat row: ${triggerErr?.message ?? "not found"}` }, 404);
    }

    if (triggerRow.type !== "user") {
      return json({ error: "chat_id must reference a row with type 'user'" }, 400);
    }

    // Ensure the chat row belongs to the authenticated user calling this function
    if (triggerRow.user_id !== callingUserId) {
      return json({ error: "Unauthorized: Chat row does not belong to this user" }, 403);
    }

    const userId: string = triggerRow.user_id;
    const userMessage: string = triggerRow.message.trim();

    // 1. Load profile for personalization.
    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select(
        "id, username, fitness_level, ai_coach_preference, gender, height_cm, weight_kg, age, bmi"
      )
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return json({ error: `Could not load profile: ${profileErr?.message ?? "not found"}` }, 404);
    }

    // 2. Load this user's active goals
    const { data: userGoalsRaw, error: userGoalsErr } = await db
      .from("user_goals")
      .select(`
        id,
        text,
        goal_id,
        goals ( scalable_quantity )
      `)
      .eq("user_id", userId);

    if (userGoalsErr) {
      return json({ error: `Could not load goals: ${userGoalsErr.message}` }, 500);
    }

    const activeGoals = (userGoalsRaw ?? [])
      .map((ug) => {
        const goal = Array.isArray(ug.goals) ? ug.goals[0] : ug.goals;
        return {
          instruction: ug.text ?? "",
          unit: goal?.scalable_quantity ?? null,
        };
      })
      .filter((g) => g.instruction.length > 0);

    // 2.5 Load squad context and teammates' progress based on schema
    const { data: squadMembership, error: squadErr } = await db
      .from("squad_members")
      .select(`
        squad_id,
        squads ( name, squad_goal )
      `)
      .eq("user_id", userId)
      .eq("is_active", true) // Ensure they are active in the squad
      .limit(1)
      .single();

    let squadContext: SquadContext | null = null;
    
    if (!squadErr && squadMembership && squadMembership.squads) {
      const squadId = squadMembership.squad_id;
      const squadInfo = Array.isArray(squadMembership.squads) 
        ? squadMembership.squads[0] 
        : squadMembership.squads;
      
      squadContext = { 
        name: squadInfo.name,
        goal: squadInfo.squad_goal,
        teammates: []
      };

      // 2.6 Fetch progress of OTHER active members in the same squad
      const { data: teammatesData } = await db
        .from("squad_members")
        .select(`
          points,
          streak,
          profiles ( username )
        `)
        .eq("squad_id", squadId)
        .neq("user_id", userId)
        .eq("is_active", true);

      if (teammatesData) {
        squadContext.teammates = teammatesData.map((tm) => {
          const tmProfile = Array.isArray(tm.profiles) ? tm.profiles[0] : tm.profiles;
          return {
            username: tmProfile?.username || "A teammate",
            points: tm.points ?? 0,
            streak: tm.streak ?? 0,
          };
        });
      }
    }

    // 3. Load recent chat history
    const { data: recentChatDesc, error: chatErr } = await db
      .from("chat")
      .select("id, type, message, created_at")
      .eq("user_id", userId)
      .neq("id", chatId)
      .order("created_at", { ascending: false })
      .limit(CHAT_HISTORY_LIMIT);

    if (chatErr) {
      return json({ error: `Could not load chat history: ${chatErr.message}` }, 500);
    }

    const recentChat = [...(recentChatDesc ?? [])].reverse();
    const historyMessages = recentChat
      .filter((row) => row.type === "user" || row.type === "assistant")
      .map((row) => ({
        role: row.type as "user" | "assistant",
        content: row.message,
      }));

    const systemPrompt = buildSystemPrompt(profile, activeGoals, squadContext);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return json({ error: `OpenAI request failed: ${errText}` }, 502);
    }

    const openaiData = await openaiRes.json();
    const assistantMessage: string | undefined = openaiData.choices?.[0]?.message?.content;
    const totalTokens: number = openaiData.usage?.total_tokens ?? 0;

    if (!assistantMessage) {
      return json({ error: "OpenAI returned no content" }, 502);
    }

    // 4. Log the assistant's reply
    const { data: assistantRow, error: logAssistantErr } = await db
      .from("chat")
      .insert({
        user_id: userId,
        type: "assistant",
        message: assistantMessage,
        token_used: totalTokens,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logAssistantErr) {
      console.error(`Failed to log assistant chat message: ${logAssistantErr.message}`);
    }

    return json({
      success: true,
      reply: assistantMessage,
      chat_row: assistantRow ?? null,
      tokens_used: totalTokens,
      context: {
        active_goals: activeGoals,
        squad_context: squadContext,
        history_length: historyMessages.length,
      },
    });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
