# Post Bridge API Endpoint Reference

Base URL: `https://api.post-bridge.com`

Authentication: `Authorization: Bearer $POST_BRIDGE_API_KEY`

All list endpoints return a paginated envelope: `{ "data": [...], "total": N, "offset": N, "limit": N, "next": "url|null" }`

---

## Table of Contents

1. [Social Accounts](#social-accounts)
2. [Media Management](#media-management)
3. [Posts](#posts)
4. [Post Results](#post-results)
5. [Analytics](#analytics)
6. [Error Codes](#error-codes)
7. [Media Constraints](#media-constraints)

---

## Social Accounts

### List Social Accounts

```
GET /v1/social-accounts
```

Query parameters:
- `offset` (number, default: 0) — items to skip
- `limit` (number, default: 10) — items to return
- `platform` (string[]) — filter by platform (OR logic). Enum: bluesky, facebook, instagram, linkedin, pinterest, threads, tiktok, twitter, youtube
- `username` (string[]) — filter by username (OR logic)

Response item shape:
```json
{ "id": 42, "platform": "linkedin", "username": "ryan-eggleston" }
```

> **Note:** `id` is a **number**, not a string.

Example:
```bash
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/social-accounts?platform=linkedin" | jq .
```

### Get Social Account

```
GET /v1/social-accounts/{id}
```

Path parameters:
- `id` (number, required)

---

## Media Management

### Create Upload URL

```
POST /v1/media/create-upload-url
```

Request body:
```json
{
  "mime_type": "image/jpeg",
  "size_bytes": 204800,
  "name": "photo.jpg"
}
```

Fields:
- `mime_type` (required) — `image/png`, `image/jpeg`, `video/mp4`, or `video/quicktime`
- `size_bytes` (required, minimum: 1) — file size in bytes
- `name` (required) — filename

Response:
```json
{
  "media_id": "med_abc123",
  "upload_url": "https://storage.example.com/signed-url...",
  "name": "photo.jpg"
}
```

Upload the file with a PUT to the `upload_url` (no auth header needed):
```bash
curl -s -X PUT \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg \
  "$UPLOAD_URL"
```

Upload promptly — the signed URL expires after a short window. Unused media auto-deletes after 24 hours.

### List Media

```
GET /v1/media
```

Query parameters:
- `offset` (number, default: 0)
- `limit` (number, default: 10)
- `post_id` (string[]) — filter by post IDs (OR logic)
- `type` (string[]) — filter by type: `image` or `video` (OR logic)

### Get Media

```
GET /v1/media/{id}
```

### Delete Media

```
DELETE /v1/media/{id}
```

Response: `{ "success": true }`

---

## Posts

### Create Post

```
POST /v1/posts
```

Request body:
```json
{
  "caption": "Your post caption here",
  "social_accounts": [42],
  "media": ["med_abc123"],
  "media_urls": ["https://example.com/photo.jpg"],
  "scheduled_at": "2026-03-10T14:00:00Z",
  "use_queue": { "timezone": "America/New_York" },
  "is_draft": false,
  "processing_enabled": true,
  "platform_configurations": {},
  "account_configurations": {}
}
```

Fields:
- `caption` (required) — post text
- `social_accounts` (required) — array of account IDs (**numbers**)
- `media` (optional) — array of uploaded media IDs
- `media_urls` (optional) — array of publicly accessible URLs; ignored if `media` is provided
- `scheduled_at` (optional) — ISO 8601 datetime; omit for immediate posting; **cannot combine with `use_queue`**
- `use_queue` (optional) — object `{ "timezone": "IANA_timezone" }` for auto-queue; **cannot combine with `scheduled_at`**
- `is_draft` (optional) — save as draft without publishing
- `processing_enabled` (optional, default: true)
- `platform_configurations` (optional) — per-platform overrides (see below)
- `account_configurations` (optional) — per-account overrides (see below)

#### Platform Configurations

Per-platform caption, media, and settings overrides:

```json
{
  "platform_configurations": {
    "linkedin": { "caption": "LinkedIn-specific text", "media": ["med_1"] },
    "instagram": {
      "caption": "IG caption",
      "media": ["med_2"],
      "cover_image": "med_cover",
      "video_cover_timestamp_ms": 5000,
      "placement": "reels",
      "is_trial_reel": false,
      "trial_graduation": "MANUAL"
    },
    "tiktok": {
      "caption": "TikTok caption",
      "media": ["med_3"],
      "title": "Video title",
      "video_cover_timestamp_ms": 3000,
      "draft": false,
      "is_aigc": false
    },
    "youtube": { "caption": "Description", "media": ["med_4"], "title": "Video title" },
    "pinterest": {
      "caption": "Pin description",
      "media": ["med_5"],
      "board_ids": ["board_1"],
      "link": "https://example.com",
      "title": "Pin title",
      "video_cover_timestamp_ms": 2000
    },
    "facebook": { "caption": "FB text", "media": ["med_6"], "placement": "reels" },
    "twitter": { "caption": "Tweet text", "media": ["med_7"] },
    "bluesky": { "caption": "Bluesky text", "media": ["med_8"] },
    "threads": { "caption": "Threads text", "media": ["med_9"], "location": "reels" }
  }
}
```

#### Account Configurations

Per-account caption/media overrides for multi-account posts:

```json
{
  "account_configurations": {
    "account_configurations": [
      { "account_id": 42, "caption": "Custom caption for this account", "media": ["med_1"] }
    ]
  }
}
```

#### Scheduling Examples

**Immediate** — omit both `scheduled_at` and `use_queue`.

**Specific time**:
```json
{ "scheduled_at": "2026-03-10T14:00:00Z" }
```

**Auto-queue**:
```json
{ "use_queue": { "timezone": "America/New_York" } }
```

### List Posts

```
GET /v1/posts
```

Query parameters:
- `offset` (number, default: 0)
- `limit` (number, default: 10)
- `platform` (string[]) — filter by platform (OR logic)
- `status` (string[]) — filter by status (OR logic). Enum: `posted`, `scheduled`, `processing`

### Get Post

```
GET /v1/posts/{id}
```

### Update Post

```
PATCH /v1/posts/{id}
```

Request body: same shape as Create Post, all fields optional.

> **Important:** Always pass `scheduled_at` when updating scheduled posts to prevent immediate processing.

### Delete Post

```
DELETE /v1/posts/{id}
```

Response: `{ "success": true }`

---

## Post Results

### List Post Results

```
GET /v1/post-results
```

Query parameters:
- `offset` (number, default: 0)
- `limit` (number, default: 10)
- `post_id` (string[]) — filter by post IDs (OR logic)
- `platform` (string[]) — filter by platform (OR logic)

### Get Post Result

```
GET /v1/post-results/{id}
```

Response:
```json
{
  "id": "pr_abc123",
  "post_id": "post_def456",
  "success": true,
  "social_account_id": 42,
  "error": null,
  "platform_data": {
    "id": "li_post_789",
    "url": "https://linkedin.com/feed/update/...",
    "username": "ryan-eggleston"
  }
}
```

---

## Analytics

### Get Analytics

```
GET /v1/analytics
```

Query parameters:
- `offset` (number, default: 0)
- `limit` (number, default: 10)
- `platform` (string) — filter by platform
- `post_result_id` (string[]) — filter by post result IDs (OR logic)
- `timeframe` (string, default: "all") — `7d`, `30d`, `90d`, or `all`

### Sync Analytics

```
POST /v1/analytics/sync
```

Query parameters:
- `platform` (string, optional) — sync specific platform; omit for all. Enum: tiktok, youtube, instagram

### Get Analytics Record

```
GET /v1/analytics/{id}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400  | Invalid request — check body/params |
| 404  | Resource not found |
| 429  | Rate limit exceeded — back off and retry |
| 500  | Server error — retry after delay |

---

## Media Constraints

| Property | Value |
|----------|-------|
| Supported types | `image/png`, `image/jpeg`, `video/mp4`, `video/quicktime` |
| Upload expiry | Short window after URL generation — upload promptly |
| Auto-deletion | 24 hours after upload if not attached to a post |
