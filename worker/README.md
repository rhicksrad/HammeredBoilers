# File service (Cloudflare R2)

Stores the site's photos, videos, chat pics and avatars in Cloudflare R2 instead of the Supabase `gallery` bucket.
R2 has 10 GB free, then $0.015/GB a month, and downloads are always free. The rules are the same as before: only
crew members get in, you can only upload or delete your own files, and the site gets short-lived signed links.
It also pings Supabase every other day so the free project never pauses for inactivity.

Until `filesUrl` is set in `public/config.js`, the site keeps using Supabase storage, so this can be merged first.

## Set it up

1. **Cloudflare:** turn on R2 (sidebar → R2 Object Storage). Copy your **Account ID**. Create an API token from the
   **Edit Cloudflare Workers** template and check it includes **Workers R2 Storage: Edit**.
2. **GitHub** (repo → Settings → Secrets and variables → Actions → New repository secret), add:
   - `CLOUDFLARE_API_TOKEN`: the token
   - `CLOUDFLARE_ACCOUNT_ID`: the Account ID
   - `FILES_SIGNING_SECRET`: any long random string (it signs the photo links)
   - `FILES_MIGRATE_TOKEN`: another long random string (used once, to copy the old photos)
3. **Deploy:** Actions → **Deploy file service to Cloudflare** → Run workflow. It creates the
   `hammered-boilers-files` bucket and deploys to `https://hammered-boilers-files.<your subdomain>.workers.dev`.
   After that it redeploys on its own whenever `worker/` changes on `main`.
4. **Copy the old files over** (paths stay the same, so nothing in the database changes; safe to re-run):

   ```sh
   SUPABASE_SECRET_KEY=sb_secret_... \
   FILES_URL=https://hammered-boilers-files.<your subdomain>.workers.dev \
   MIGRATE_TOKEN=<the FILES_MIGRATE_TOKEN value> \
   node scripts/migrate-to-r2.mjs
   ```

   The secret key is in Supabase → Project Settings → API Keys.
5. **Switch the site over:** add `filesUrl: 'https://hammered-boilers-files.<your subdomain>.workers.dev'` to
   `public/config.js` and push. This can come before or after step 4: until a file is copied, the Worker signs a
   link to it in the old Supabase bucket instead, and deletes remove both copies.

Once everything's on R2, the old files can be deleted from the Supabase bucket to free its 1 GB.

## Routes

| Route | Who | What |
|---|---|---|
| `POST /sign` `{ paths, ttl?, download? }` | crew | Signed links, like Supabase's `createSignedUrls` |
| `PUT /o/<path>` | crew, own folder | Upload (photos and videos only, up to 100 MB); returns the file's MD5 |
| `POST /delete` `{ paths }` | crew, own folder | Delete |
| `GET /usage` | crew | Total bytes and files in the bucket, against the 10 GB free tier (shown on the Gallery page) |
| `POST /hashes` `{ paths }` | crew | Each file's MD5 (its R2 etag), so the site can stack duplicate uploads |
| `GET /f/<path>?e=…&s=…` | anyone with the link | The file, with range requests for video |
| `PUT /migrate/<path>` | `x-migrate-token` | One-time copy from Supabase |

"Crew" means a valid Supabase session whose email passes `public.is_member()`.
