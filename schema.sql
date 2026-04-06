-- ============================================================
-- R0YCL0UD — Supabase PostgreSQL Schema
-- Production-grade schema for millions of rows
-- Execute in Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- For accent-insensitive search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE album_type AS ENUM ('single', 'album', 'ep');
CREATE TYPE repeat_mode AS ENUM ('off', 'track', 'queue');
CREATE TYPE streaming_quality AS ENUM ('low', 'normal', 'high', 'lossless');
CREATE TYPE subscription_tier AS ENUM ('free', 'audiophile');

-- ============================================================
-- TABLE: users
-- ============================================================

CREATE TABLE public.users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 64),
    avatar_url    TEXT,
    is_artist     BOOLEAN NOT NULL DEFAULT FALSE,
    subscription  subscription_tier NOT NULL DEFAULT 'free',
    totp_secret   TEXT,            -- For 2FA; stored encrypted at app layer
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_is_artist ON public.users(is_artist) WHERE is_artist = TRUE;

-- ============================================================
-- TABLE: artists
-- ============================================================

CREATE TABLE public.artists (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    bio               TEXT CHECK (char_length(bio) <= 2000),
    verified          BOOLEAN NOT NULL DEFAULT FALSE,
    monthly_listeners BIGINT NOT NULL DEFAULT 0 CHECK (monthly_listeners >= 0),
    banner_url        TEXT,
    social_links      JSONB NOT NULL DEFAULT '{}',   -- { spotify, instagram, twitter, website }
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_artists_user UNIQUE (user_id)      -- One artist profile per user
);

CREATE INDEX idx_artists_user_id ON public.artists(user_id);
CREATE INDEX idx_artists_verified ON public.artists(verified) WHERE verified = TRUE;
CREATE INDEX idx_artists_monthly_listeners ON public.artists(monthly_listeners DESC);

-- ============================================================
-- TABLE: albums
-- ============================================================

CREATE TABLE public.albums (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    artist_id       UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 256),
    release_date    DATE NOT NULL,
    cover_image_url TEXT,
    type            album_type NOT NULL DEFAULT 'album',
    genre           TEXT,
    copyright       TEXT,
    upc             TEXT,           -- Universal Product Code
    is_published    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_albums_artist_id ON public.albums(artist_id);
CREATE INDEX idx_albums_release_date ON public.albums(release_date DESC);
CREATE INDEX idx_albums_is_published ON public.albums(is_published) WHERE is_published = TRUE;
-- Trigram index for fuzzy title search
CREATE INDEX idx_albums_title_trgm ON public.albums USING GIN (title gin_trgm_ops);

-- ============================================================
-- TABLE: tracks
-- ============================================================

CREATE TABLE public.tracks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id        UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 256),
    duration_ms     INTEGER NOT NULL CHECK (duration_ms > 0),
    audio_file_url  TEXT NOT NULL,    -- URL to storage (Supabase Storage / CDN)
    audio_lossless_url TEXT,          -- FLAC/WAV variant
    track_number    SMALLINT NOT NULL CHECK (track_number > 0),
    disc_number     SMALLINT NOT NULL DEFAULT 1,
    explicit        BOOLEAN NOT NULL DEFAULT FALSE,
    play_count      BIGINT NOT NULL DEFAULT 0 CHECK (play_count >= 0),
    isrc            TEXT,             -- International Standard Recording Code
    lyrics_url      TEXT,             -- URL to LRC timestamped lyrics file
    bpm             SMALLINT,
    key_signature   TEXT,             -- e.g. 'C#m', 'Bb'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_track_in_album UNIQUE (album_id, track_number, disc_number)
);

CREATE INDEX idx_tracks_album_id ON public.tracks(album_id);
CREATE INDEX idx_tracks_play_count ON public.tracks(play_count DESC);
CREATE INDEX idx_tracks_title_trgm ON public.tracks USING GIN (title gin_trgm_ops);

-- ============================================================
-- TABLE: track_credits
-- ============================================================

CREATE TABLE public.track_credits (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    track_id    UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,    -- e.g. 'Producer', 'Mix Engineer', 'Songwriter'
    name        TEXT NOT NULL,
    user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_track_credits_track_id ON public.track_credits(track_id);

-- ============================================================
-- TABLE: playlists
-- ============================================================

CREATE TABLE public.playlists (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description TEXT CHECK (char_length(description) <= 1000),
    is_public   BOOLEAN NOT NULL DEFAULT FALSE,
    cover_url   TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,       -- Denormalized for performance
    total_duration_ms BIGINT NOT NULL DEFAULT 0,  -- Denormalized for performance
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX idx_playlists_is_public ON public.playlists(is_public) WHERE is_public = TRUE;

-- ============================================================
-- TABLE: playlist_tracks
-- ============================================================

CREATE TABLE public.playlist_tracks (
    playlist_id     UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    track_id        UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    position_index  INTEGER NOT NULL CHECK (position_index >= 0),
    PRIMARY KEY (playlist_id, track_id),
    CONSTRAINT unique_position_in_playlist UNIQUE (playlist_id, position_index) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_playlist_tracks_playlist_id ON public.playlist_tracks(playlist_id, position_index);
CREATE INDEX idx_playlist_tracks_track_id ON public.playlist_tracks(track_id);

-- ============================================================
-- TABLE: user_libraries (Liked Songs)
-- ============================================================

CREATE TABLE public.user_libraries (
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    track_id    UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX idx_user_libraries_user_id ON public.user_libraries(user_id, saved_at DESC);
CREATE INDEX idx_user_libraries_track_id ON public.user_libraries(track_id);

-- ============================================================
-- TABLE: user_eq_presets
-- ============================================================

CREATE TABLE public.user_eq_presets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
    preamp_db   REAL NOT NULL DEFAULT 0 CHECK (preamp_db BETWEEN -12 AND 12),
    -- 10 bands: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz
    bands       REAL[10] NOT NULL DEFAULT '{0,0,0,0,0,0,0,0,0,0}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_eq_presets_user_id ON public.user_eq_presets(user_id);

-- ============================================================
-- TABLE: user_settings
-- ============================================================

CREATE TABLE public.user_settings (
    user_id               UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    streaming_quality     streaming_quality NOT NULL DEFAULT 'high',
    cellular_quality      streaming_quality NOT NULL DEFAULT 'normal',
    normalize_volume      BOOLEAN NOT NULL DEFAULT TRUE,
    crossfade_seconds     SMALLINT NOT NULL DEFAULT 0 CHECK (crossfade_seconds BETWEEN 0 AND 12),
    gapless_playback      BOOLEAN NOT NULL DEFAULT TRUE,
    cache_size_gb         SMALLINT NOT NULL DEFAULT 5 CHECK (cache_size_gb BETWEEN 1 AND 50),
    active_eq_preset_id   UUID REFERENCES public.user_eq_presets(id) ON DELETE SET NULL,
    preferred_output_device TEXT,
    keyboard_shortcuts    JSONB NOT NULL DEFAULT '{}',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: play_events (Analytics — append-only, time-series)
-- ============================================================

CREATE TABLE public.play_events (
    id          BIGSERIAL PRIMARY KEY,
    track_id    UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_played_ms INTEGER,    -- How long the user actually listened
    source      TEXT,              -- 'library', 'playlist', 'radio', 'album'
    source_id   UUID,              -- ID of the playlist/album
    country     TEXT               -- Derived from IP, 2-char ISO
) PARTITION BY RANGE (played_at);

-- Create monthly partitions (example: create via cron job in production)
CREATE TABLE play_events_2025_01 PARTITION OF public.play_events
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE play_events_2025_06 PARTITION OF public.play_events
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE INDEX idx_play_events_track_id ON public.play_events(track_id, played_at DESC);
CREATE INDEX idx_play_events_user_id ON public.play_events(user_id, played_at DESC);

-- ============================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_artists_updated_at
    BEFORE UPDATE ON public.artists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_albums_updated_at
    BEFORE UPDATE ON public.albums
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tracks_updated_at
    BEFORE UPDATE ON public.tracks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_playlists_updated_at
    BEFORE UPDATE ON public.playlists
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: Maintain playlist track_count & total_duration_ms
-- ============================================================

CREATE OR REPLACE FUNCTION sync_playlist_stats()
RETURNS TRIGGER AS $$
DECLARE
    v_playlist_id UUID;
BEGIN
    v_playlist_id := COALESCE(NEW.playlist_id, OLD.playlist_id);
    UPDATE public.playlists p
    SET
        track_count = (SELECT COUNT(*) FROM public.playlist_tracks pt WHERE pt.playlist_id = v_playlist_id),
        total_duration_ms = (
            SELECT COALESCE(SUM(t.duration_ms), 0)
            FROM public.playlist_tracks pt
            JOIN public.tracks t ON t.id = pt.track_id
            WHERE pt.playlist_id = v_playlist_id
        ),
        updated_at = NOW()
    WHERE p.id = v_playlist_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_playlist_tracks_sync
    AFTER INSERT OR DELETE ON public.playlist_tracks
    FOR EACH ROW EXECUTE FUNCTION sync_playlist_stats();

-- ============================================================
-- TRIGGER: Increment track play_count on play_events insert
-- ============================================================

CREATE OR REPLACE FUNCTION increment_play_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.duration_played_ms IS NULL OR NEW.duration_played_ms > 30000 THEN
        UPDATE public.tracks SET play_count = play_count + 1 WHERE id = NEW.track_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_increment_play_count
    AFTER INSERT ON public.play_events
    FOR EACH ROW EXECUTE FUNCTION increment_play_count();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_eq_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_events ENABLE ROW LEVEL SECURITY;

-- USERS: Read own profile; update own profile
CREATE POLICY "users_select_self" ON public.users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_self" ON public.users
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ARTISTS: Public read; artists manage own profile
CREATE POLICY "artists_select_all" ON public.artists
    FOR SELECT USING (TRUE);
CREATE POLICY "artists_update_own" ON public.artists
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ALBUMS: Published albums are public; artists manage own
CREATE POLICY "albums_select_published" ON public.albums
    FOR SELECT USING (is_published = TRUE OR artist_id IN (
        SELECT id FROM public.artists WHERE user_id = auth.uid()
    ));
CREATE POLICY "albums_insert_own" ON public.albums
    FOR INSERT WITH CHECK (artist_id IN (
        SELECT id FROM public.artists WHERE user_id = auth.uid()
    ));
CREATE POLICY "albums_update_own" ON public.albums
    FOR UPDATE USING (artist_id IN (
        SELECT id FROM public.artists WHERE user_id = auth.uid()
    ));
CREATE POLICY "albums_delete_own" ON public.albums
    FOR DELETE USING (artist_id IN (
        SELECT id FROM public.artists WHERE user_id = auth.uid()
    ));

-- TRACKS: Public read for published albums; artists manage own
CREATE POLICY "tracks_select_published" ON public.tracks
    FOR SELECT USING (album_id IN (
        SELECT id FROM public.albums WHERE is_published = TRUE
    ) OR album_id IN (
        SELECT a.id FROM public.albums a
        JOIN public.artists ar ON ar.id = a.artist_id
        WHERE ar.user_id = auth.uid()
    ));
CREATE POLICY "tracks_manage_own" ON public.tracks
    FOR ALL USING (album_id IN (
        SELECT a.id FROM public.albums a
        JOIN public.artists ar ON ar.id = a.artist_id
        WHERE ar.user_id = auth.uid()
    ));

-- PLAYLISTS: Public playlists visible to all; private only to owner
CREATE POLICY "playlists_select" ON public.playlists
    FOR SELECT USING (is_public = TRUE OR user_id = auth.uid());
CREATE POLICY "playlists_insert_own" ON public.playlists
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "playlists_update_own" ON public.playlists
    FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "playlists_delete_own" ON public.playlists
    FOR DELETE USING (user_id = auth.uid());

-- PLAYLIST_TRACKS: Visibility follows playlist; insert/delete by playlist owner
CREATE POLICY "playlist_tracks_select" ON public.playlist_tracks
    FOR SELECT USING (playlist_id IN (
        SELECT id FROM public.playlists WHERE is_public = TRUE OR user_id = auth.uid()
    ));
CREATE POLICY "playlist_tracks_manage_own" ON public.playlist_tracks
    FOR ALL USING (playlist_id IN (
        SELECT id FROM public.playlists WHERE user_id = auth.uid()
    ));

-- USER LIBRARIES: Strictly private
CREATE POLICY "user_libraries_own" ON public.user_libraries
    FOR ALL USING (user_id = auth.uid());

-- USER EQ PRESETS: Strictly private
CREATE POLICY "user_eq_presets_own" ON public.user_eq_presets
    FOR ALL USING (user_id = auth.uid());

-- USER SETTINGS: Strictly private
CREATE POLICY "user_settings_own" ON public.user_settings
    FOR ALL USING (user_id = auth.uid());

-- PLAY EVENTS: Insert own; select own (artists see aggregate via views)
CREATE POLICY "play_events_insert_own" ON public.play_events
    FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "play_events_select_own" ON public.play_events
    FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- ANALYTICS VIEW: Artist stream counts (bypasses RLS via SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE VIEW public.artist_analytics AS
SELECT
    ar.id AS artist_id,
    ar.user_id,
    t.id AS track_id,
    t.title AS track_title,
    COUNT(pe.id) AS total_streams,
    COUNT(DISTINCT pe.user_id) AS unique_listeners,
    DATE_TRUNC('day', pe.played_at) AS stream_date,
    pe.country
FROM public.play_events pe
JOIN public.tracks t ON t.id = pe.track_id
JOIN public.albums a ON a.id = t.album_id
JOIN public.artists ar ON ar.id = a.artist_id
GROUP BY ar.id, ar.user_id, t.id, t.title, DATE_TRUNC('day', pe.played_at), pe.country;

-- Artists can only see their own analytics
CREATE POLICY "artist_analytics_own" ON public.play_events
    FOR SELECT USING (
        track_id IN (
            SELECT t.id FROM public.tracks t
            JOIN public.albums a ON a.id = t.album_id
            JOIN public.artists ar ON ar.id = a.artist_id
            WHERE ar.user_id = auth.uid()
        )
    );

-- ============================================================
-- FULL TEXT SEARCH: Combined search index
-- ============================================================

CREATE MATERIALIZED VIEW public.search_index AS
SELECT
    t.id,
    'track' AS entity_type,
    t.title AS name,
    ar.id AS artist_id,
    (SELECT display_name FROM public.users u WHERE u.id = ar.user_id) AS artist_name,
    a.cover_image_url AS image_url,
    t.duration_ms,
    t.play_count,
    to_tsvector('english', unaccent(t.title) || ' ' ||
        unaccent(COALESCE((SELECT display_name FROM public.users u WHERE u.id = ar.user_id), ''))) AS search_vector
FROM public.tracks t
JOIN public.albums a ON a.id = t.album_id
JOIN public.artists ar ON ar.id = a.artist_id
WHERE a.is_published = TRUE
UNION ALL
SELECT
    a.id, 'album', a.title,
    ar.id,
    (SELECT display_name FROM public.users u WHERE u.id = ar.user_id),
    a.cover_image_url, NULL, NULL,
    to_tsvector('english', unaccent(a.title))
FROM public.albums a
JOIN public.artists ar ON ar.id = a.artist_id
WHERE a.is_published = TRUE;

CREATE INDEX idx_search_index_vector ON public.search_index USING GIN(search_vector);
CREATE UNIQUE INDEX idx_search_index_id_type ON public.search_index(id, entity_type);

-- Refresh periodically via pg_cron:
-- SELECT cron.schedule('refresh-search-index', '*/15 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY public.search_index');
