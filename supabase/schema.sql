-- Migration to add squad onboarding fields to the squads table

ALTER TABLE squads ADD COLUMN IF NOT EXISTS commitment_level TEXT DEFAULT 'medium';
ALTER TABLE squads ADD COLUMN IF NOT EXISTS experience TEXT DEFAULT 'intermediate';

-- Migration to add feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    squad_id UUID REFERENCES squads(id) ON DELETE SET NULL,
    feedback TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS content TEXT;


