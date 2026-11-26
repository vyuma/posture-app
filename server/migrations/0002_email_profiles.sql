CREATE TABLE IF NOT EXISTS analysis_profiles (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 analysis_id TEXT NOT NULL UNIQUE,
 revision INTEGER NOT NULL DEFAULT 0,
 adult_confirmed INTEGER NOT NULL DEFAULT 0,
 survey_status TEXT NOT NULL DEFAULT 'pending',
 language TEXT NOT NULL DEFAULT 'ja'
);
INSERT OR IGNORE INTO analysis_profiles(user_id,analysis_id)
SELECT id,lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-8'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) FROM user;
CREATE TABLE IF NOT EXISTS survey_responses (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 observed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 sex_at_birth TEXT, age_years INTEGER, sex_source TEXT, age_source TEXT,
 language TEXT NOT NULL, skipped INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS survey_user_time ON survey_responses(user_id,observed_at);
CREATE INDEX IF NOT EXISTS survey_expiry ON survey_responses(expires_at);
CREATE TABLE IF NOT EXISTS mail_quotas (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
