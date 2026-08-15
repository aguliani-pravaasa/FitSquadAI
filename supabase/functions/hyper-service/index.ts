import { createClient } from 'jsr:@supabase/supabase-js@2'

const SYSTEM_PROMPT = `You are a fitness challenge calibration assistant. Your job is to scale a 
challenge to match a user's physical capacity, using their BMI and self-reported 
fitness level (1-10).

SIGNAL WEIGHTING:
- fitness_level (1-10) is the primary signal.
- BMI is a secondary, supporting signal only — use it to fine-tune, never to 
  override fitness_level. Never treat BMI alone as evidence of ability.
- If signals conflict, trust fitness_level and adjust only slightly.

STEP 1 — IDENTIFY THE SCALABLE QUANTITY:
Every challenge has exactly one quantity that should be adjusted for difficulty 
(e.g. distance, duration, pace, reps, sets, weight, incline).

- If "existing_scalable_quantity" is provided in the input (not null), you MUST 
  reuse that exact quantity — do not pick a different one, even if another 
  quantity seems equally valid. This keeps scaling consistent for every user 
  who receives this challenge.
- If "existing_scalable_quantity" is null, you must decide which single quantity 
  in the challenge is the right one to scale, and report it. Pick the dimension 
  that most directly controls difficulty (e.g. for "Run 10km at 5:00 pace", prefer 
  distance over pace unless pace is clearly the point of the challenge).
- Always express the quantity as a short, lowercase, singular label using common 
  abbreviations (e.g. "km", "pace", "reps", "min", "sets", "kg") so the same 
  concept is always labeled identically across challenges.

STEP 2 — SCALE THAT QUANTITY ONLY:
Adjust only the identified quantity. Leave all other parts of the challenge 
unchanged unless changing them is necessary for the result to make sense 
(e.g. rounding to a sensible number).

SCALING GUIDANCE:
- fitness_level 1-3: reduce difficulty significantly (~40-60% of original)
- fitness_level 4-6: mild adjustment, roughly original or slightly modified
- fitness_level 7-10: maintain or moderately increase difficulty (~110-150%)

RULES:
- Never produce a challenge that could be unsafe for someone with low fitness.
- Never reduce a challenge to the point of being meaningless (e.g. "run 0km").
- Do not give medical advice, diagnose conditions, or mention BMI/weight in 
  output text shown to the user.
- Output ONLY valid JSON, no other text.

OUTPUT FORMAT (JSON only):
{
  "scaled_text": "string",
  "scalable_quantity": "string (the quantity label, reused or newly decided)",
  "difficulty_multiplier": number
}`

const RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "scaled_challenge",
    strict: true,
    schema: {
      type: "object",
      properties: {
        scaled_text: { type: "string" },
        scalable_quantity: { type: "string" },
        difficulty_multiplier: { type: "number" }
      },
      required: ["scaled_text", "scalable_quantity", "difficulty_multiplier"],
      additionalProperties: false
    }
  }
}
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // 1. Authenticate user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
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
      return new Response(JSON.stringify({ error: `Unauthorized: ${userErr?.message ?? "Invalid token"}` }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const callingUserId = user.id;

    // Always expect user_id in the body
    const { goal_id, user_id } = await req.json()

    if (!goal_id || !user_id) {
      return new Response(JSON.stringify({ error: 'goal_id and user_id are required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // Verify calling user is the user being scaled
    if (user_id !== callingUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized: Cannot scale goal for another user" }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Use service role to bypass RLS, ensuring database mutations complete successfully
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch the goal definition
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id, text, scalable_quantity, baseline_points')
      .eq('id', goal_id)
      .single()

    if (goalError || !goal) {
      return new Response(JSON.stringify({ error: 'Goal not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // Fetch the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('height_cm, weight_kg, fitness_level')
      .eq('id', user_id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // Calculate BMI
    const heightM = profile.height_cm / 100
    const bmi = profile.weight_kg / (heightM * heightM)

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              challenge: goal.text,
              existing_scalable_quantity: goal.scalable_quantity,
              bmi: Math.round(bmi * 10) / 10,
              fitness_level: profile.fitness_level
            })
          }
        ],
        response_format: RESPONSE_SCHEMA,
        temperature: 0.4
      })
    })

    if (!openaiRes.ok) {
      return new Response(JSON.stringify({ error: 'AI provider error' }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    const data = await openaiRes.json()
    const result = JSON.parse(data.choices[0].message.content)

    if (goal.scalable_quantity == null) {
      await supabase
        .from('goals')
        .update({ scalable_quantity: result.scalable_quantity })
        .eq('id', goal.id)
    }

    const userBaselinePoints = goal.baseline_points != null
      ? Math.round(goal.baseline_points * result.difficulty_multiplier)
      : null

    const { error: upsertError } = await supabase
      .from('user_goals')
      .upsert({
        goal_id: goal.id,
        user_id: user_id,
        text: result.scaled_text,
        user_baseline_points: userBaselinePoints
      }, { onConflict: 'user_id,goal_id' })

    // 1. Handle the error correctly
    if (upsertError) {
      console.error('Upsert failed:', upsertError)
      return new Response(JSON.stringify({ error: 'Failed to save', details: upsertError }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }

    // 2. Return the success response
    return new Response(JSON.stringify({
      scaled_text: result.scaled_text,
      scalable_quantity: result.scalable_quantity,
      user_baseline_points: userBaselinePoints
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
})
