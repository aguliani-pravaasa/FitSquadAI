-- Enable Row Level Security on all tables

-- 1. squads
ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read squads" ON public.squads;
CREATE POLICY "Allow authenticated users to read squads" 
ON public.squads 
FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to create squads" ON public.squads;
CREATE POLICY "Allow authenticated users to create squads" 
ON public.squads 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = creator);

DROP POLICY IF EXISTS "Allow creators to update squads" ON public.squads;
CREATE POLICY "Allow creators to update squads" 
ON public.squads 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = creator)
WITH CHECK (auth.uid() = creator);

-- 2. squad_members
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read squad members" ON public.squad_members;
CREATE POLICY "Allow authenticated users to read squad members" 
ON public.squad_members 
FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow users to join squads as themselves" ON public.squad_members;
CREATE POLICY "Allow users to join squads as themselves" 
ON public.squad_members 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to update their own membership" ON public.squad_members;
CREATE POLICY "Allow users to update their own membership" 
ON public.squad_members 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. goals
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Squad members can read squad goals" ON public.goals;
CREATE POLICY "Squad members can read squad goals"
ON public.goals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.squad_members 
    WHERE squad_members.squad_id = goals.squad_id 
      AND squad_members.user_id = auth.uid()
  )
);

-- 4. user_goals
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own user goals" ON public.user_goals;
CREATE POLICY "Users can read own user goals"
ON public.user_goals
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own user goals" ON public.user_goals;
CREATE POLICY "Users can insert own user goals"
ON public.user_goals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own user goals" ON public.user_goals;
CREATE POLICY "Users can update own user goals"
ON public.user_goals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. scores
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own scores or teammates scores" ON public.scores;
CREATE POLICY "Users can read own scores or teammates scores"
ON public.scores
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id 
  OR EXISTS (
    SELECT 1 FROM public.squad_members 
    WHERE squad_members.squad_id = scores.squad_id 
      AND squad_members.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert own scores" ON public.scores;
CREATE POLICY "Users can insert own scores"
ON public.scores
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own scores" ON public.scores;
CREATE POLICY "Users can update own scores"
ON public.scores
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 6. chat
ALTER TABLE public.chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read squad chat or personal chat" ON public.chat;
CREATE POLICY "Users can read squad chat or personal chat"
ON public.chat
FOR SELECT
TO authenticated
USING (
  (squad_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.squad_members 
    WHERE squad_members.squad_id = chat.squad_id 
      AND squad_members.user_id = auth.uid()
  ))
  OR (squad_id IS NULL AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat;
CREATE POLICY "Users can insert own chat messages"
ON public.chat
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
