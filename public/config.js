// Supabase → Project Settings → API. Both values are safe to publish:
// the publishable key only gets what row-level security allows.
window.HB_CONFIG = {
  supabaseUrl: 'https://noyvywdgqugdvsuvtwty.supabase.co',
  supabaseKey: 'sb_publishable_bRUkqd9hk_WeXjyecWSlng_fnydSie9',
  // Photo and video storage in Cloudflare R2 (worker/README.md). Leave it out to keep using Supabase storage.
  filesUrl: 'https://hammered-boilers-files.hicksrch.workers.dev',
}
