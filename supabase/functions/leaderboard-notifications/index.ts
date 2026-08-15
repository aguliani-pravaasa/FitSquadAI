import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    
    const newRecord = payload.record
    const oldRecord = payload.old_record 
    const eventType = payload.type // 'INSERT', 'UPDATE', or 'DELETE'

    // 1. COLUMN CHECK LOGIC
    // Only proceed if it's an update AND the specific column (e.g., 'score') changed
    if (eventType === 'UPDATE' && oldRecord && newRecord) {
      if (oldRecord.score === newRecord.score) {
        // The score didn't change (maybe they just updated their avatar). 
        // Exit early and don't send a push notification.
        return new Response(
          JSON.stringify({ message: "Score did not change. Skipping notification." }), 
          { status: 200, headers: corsHeaders }
        )
      }
    }

    // (If it's an INSERT, or if the score DID change, the code continues down here...)

    if (!newRecord || !newRecord.id) {
       return new Response(JSON.stringify({ message: "No relevant data" }), { status: 200 })
    }

    const targetUserId = newRecord.id 
    const newScore = newRecord.score 

    // 2. Initialize Supabase & Fetch Push Token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: userProfile, error: dbError } = await supabaseClient
      .from('profiles')
      .select('expo_push_token')
      .eq('id', targetUserId)
      .single()

    if (dbError || !userProfile?.expo_push_token) {
      return new Response(JSON.stringify({ message: 'No push token found' }), { status: 200 })
    }

    // 3. Send Notification via Expo
    const pushMessage = {
      to: userProfile.expo_push_token,
      sound: 'default',
      title: '🏆 Score Updated!',
      body: `Your score just updated to ${newScore}!`,
    }

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pushMessage),
    })

    const expoData = await expoResponse.json()

    return new Response(JSON.stringify({ success: true, data: expoData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
