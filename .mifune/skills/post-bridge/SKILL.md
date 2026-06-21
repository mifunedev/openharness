---
name: post-bridge
description: |
  Interact with the Post Bridge social media post management API. Use when the user wants to publish posts, upload media, manage social accounts, schedule content, or retrieve analytics via the Post Bridge platform. Triggers on: post to instagram, upload media to post bridge, schedule a social post, list social accounts, create a post, publish video, post bridge api.
---

# Post Bridge API

Manage social media posts across connected accounts using the Post Bridge API. Authentication uses the `POST_BRIDGE_API_KEY` environment variable.

---

## Authentication

All requests require a Bearer token header. Verify the key is set before making calls:

```bash
echo "Key set: ${POST_BRIDGE_API_KEY:+yes}"
```

Use this header on every request:

```
Authorization: Bearer $POST_BRIDGE_API_KEY
```

---

## Core Workflow

Publishing a post follows four steps. Execute them in order — each step depends on the previous.

### Step 1: Retrieve Social Accounts

Identify which account(s) to publish to. Capture the account `id` values (these are **numbers**) for use in post creation.

```bash
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/social-accounts" | jq .
```

Filter by platform if needed:

```bash
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/social-accounts?platform=instagram" | jq .
```

### Step 2: Generate Upload URL (media posts only)

Skip this step for text-only posts. Also skip if using `media_urls` (publicly accessible URLs) instead of uploading files directly.

Request a signed upload URL for each media file. Note the `upload_url` and `media_id` from the response.

```bash
FILE_SIZE=$(stat -c%s "photo.jpg")
UPLOAD_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"photo.jpg\", \"mime_type\": \"image/jpeg\", \"size_bytes\": $FILE_SIZE}" \
  "https://api.post-bridge.com/v1/media/create-upload-url")

UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.upload_url')
MEDIA_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.media_id')
echo "Media ID: $MEDIA_ID"
```

### Step 3: Upload File to Signed URL

PUT the file directly to the signed URL. No authorization header is needed for this request.

```bash
curl -s -X PUT \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg \
  "$UPLOAD_URL"
```

Upload promptly — the signed URL expires after a short window. Unused media auto-deletes after 24 hours.

### Step 4: Create Post

Combine the account ID(s) and media ID(s) to create the post. Account IDs are **numbers**.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"social_accounts\": [$ACCOUNT_ID],
    \"caption\": \"Your caption here\",
    \"media\": [\"$MEDIA_ID\"]
  }" \
  "https://api.post-bridge.com/v1/posts" | jq .
```

**Alternative — use `media_urls` instead of uploading:**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"social_accounts\": [$ACCOUNT_ID],
    \"caption\": \"Your caption here\",
    \"media_urls\": [\"https://example.com/photo.jpg\"]
  }" \
  "https://api.post-bridge.com/v1/posts" | jq .
```

> `media_urls` accepts publicly accessible URLs. Ignored if `media` is also provided.

---

## Scheduling Options

**Immediate posting**: Omit both `scheduled_at` and `use_queue`.

**Specific time**:
```json
{ "scheduled_at": "2026-03-10T14:00:00Z" }
```

**Auto-queue** (next available slot):
```json
{ "use_queue": { "timezone": "America/New_York" } }
```

> `scheduled_at` and `use_queue` cannot be used together.

---

## Draft Mode

Save a post without publishing or scheduling:

```json
{ "is_draft": true }
```

---

## Platform Configurations

Override caption, media, or platform-specific settings per platform:

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
      "is_trial_reel": false
    },
    "tiktok": {
      "caption": "TikTok caption",
      "media": ["med_3"],
      "title": "Video title",
      "draft": false,
      "is_aigc": false
    },
    "youtube": { "caption": "Description", "media": ["med_4"], "title": "Video title" },
    "pinterest": {
      "caption": "Pin description",
      "media": ["med_5"],
      "board_ids": ["board_1"],
      "link": "https://example.com",
      "title": "Pin title"
    },
    "facebook": { "caption": "FB text", "media": ["med_6"], "placement": "reels" },
    "twitter": { "caption": "Tweet text", "media": ["med_7"] },
    "bluesky": { "caption": "Bluesky text", "media": ["med_8"] },
    "threads": { "caption": "Threads text", "media": ["med_9"], "location": "reels" }
  }
}
```

---

## Account Configurations

Override caption/media per social account in multi-account posts:

```json
{
  "account_configurations": {
    "account_configurations": [
      { "account_id": 42, "caption": "Custom text for this account", "media": ["med_1"] }
    ]
  }
}
```

---

## Examples

### Example 1: Publish an Image to Instagram Now

User: "Post this photo to my Instagram with the caption 'New arrivals just dropped.'"

```bash
# Step 1 - find the instagram account
ACCOUNT=$(curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/social-accounts?platform=instagram" | jq -r '.data[0].id')

# Step 2 - get upload URL
FILE_SIZE=$(stat -c%s "arrivals.jpg")
UPLOAD_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"arrivals.jpg\", \"mime_type\": \"image/jpeg\", \"size_bytes\": $FILE_SIZE}" \
  "https://api.post-bridge.com/v1/media/create-upload-url")
UPLOAD_URL=$(echo "$UPLOAD_RESP" | jq -r '.upload_url')
MEDIA_ID=$(echo "$UPLOAD_RESP" | jq -r '.media_id')

# Step 3 - upload file
curl -s -X PUT -H "Content-Type: image/jpeg" \
  --data-binary @arrivals.jpg "$UPLOAD_URL"

# Step 4 - create post (no scheduled_at = publish immediately)
curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"social_accounts\": [$ACCOUNT],
    \"caption\": \"New arrivals just dropped.\",
    \"media\": [\"$MEDIA_ID\"]
  }" \
  "https://api.post-bridge.com/v1/posts" | jq .
```

### Example 2: Post with a Public Image URL (no upload needed)

User: "Post this image to LinkedIn: https://example.com/banner.png"

```bash
ACCOUNT=$(curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/social-accounts?platform=linkedin" | jq -r '.data[0].id')

curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"social_accounts\": [$ACCOUNT],
    \"caption\": \"Check out our new banner!\",
    \"media_urls\": [\"https://example.com/banner.png\"]
  }" \
  "https://api.post-bridge.com/v1/posts" | jq .
```

### Example 3: Schedule a Video Reel with Custom Cover

User: "Schedule this reel for Friday at 9am EST with a custom thumbnail."

```bash
# Step 1 - get account
ACCOUNT=$(curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/social-accounts?platform=instagram" | jq -r '.data[0].id')

# Step 2+3 - upload reel video
REEL_SIZE=$(stat -c%s "reel.mp4")
REEL_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"reel.mp4\", \"mime_type\": \"video/mp4\", \"size_bytes\": $REEL_SIZE}" \
  "https://api.post-bridge.com/v1/media/create-upload-url")
REEL_URL=$(echo "$REEL_RESP" | jq -r '.upload_url')
REEL_ID=$(echo "$REEL_RESP" | jq -r '.media_id')
curl -s -X PUT -H "Content-Type: video/mp4" --data-binary @reel.mp4 "$REEL_URL"

# Step 2+3 - upload cover image
COVER_SIZE=$(stat -c%s "cover.jpg")
COVER_RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"cover.jpg\", \"mime_type\": \"image/jpeg\", \"size_bytes\": $COVER_SIZE}" \
  "https://api.post-bridge.com/v1/media/create-upload-url")
COVER_URL=$(echo "$COVER_RESP" | jq -r '.upload_url')
COVER_ID=$(echo "$COVER_RESP" | jq -r '.media_id')
curl -s -X PUT -H "Content-Type: image/jpeg" --data-binary @cover.jpg "$COVER_URL"

# Step 4 - create scheduled post with cover image
curl -s -X POST \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"social_accounts\": [$ACCOUNT],
    \"caption\": \"Check this out!\",
    \"media\": [\"$REEL_ID\"],
    \"scheduled_at\": \"2026-03-06T14:00:00Z\",
    \"platform_configurations\": {
      \"instagram\": {
        \"cover_image\": \"$COVER_ID\"
      }
    }
  }" \
  "https://api.post-bridge.com/v1/posts" | jq .
```

### Example 4: List and Update a Scheduled Post

User: "Show me my scheduled posts and push the next one back by a day."

```bash
# List scheduled posts
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/posts?status=scheduled" | jq .

# Update the scheduled time (always include scheduled_at to prevent immediate processing)
curl -s -X PATCH \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"scheduled_at": "2026-03-11T14:00:00Z"}' \
  "https://api.post-bridge.com/v1/posts/post_def456" | jq .
```

### Example 5: Check Analytics

User: "Pull the latest analytics for my posts."

```bash
# Sync first to get fresh data (optionally filter by platform)
curl -s -X POST -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/analytics/sync" | jq .

# Retrieve analytics (with optional timeframe filter)
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/analytics?timeframe=30d" | jq .

# Check post-level publish results
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/post-results" | jq .
```

### Example 6: Verify a Post Was Published Successfully

```bash
POST_ID="post_abc123"
curl -s -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  "https://api.post-bridge.com/v1/post-results?post_id=$POST_ID" | jq .
# Check .data[].success and .data[].platform_data.url for the live post link
```

---

## Guidelines

- Always verify `POST_BRIDGE_API_KEY` is set before making API calls.
- Complete media uploads promptly after generating the signed URL — it expires quickly.
- Reference the full endpoint list and request/response shapes in `references/api-endpoints.md`.
- Use `jq .` to pretty-print JSON responses; adapt field access (`.data[0].id`) to actual response shape.
- When the user does not specify a time, ask whether they want immediate posting, a specific time, or queue scheduling.
- For multi-platform posts, include all target account IDs in the `social_accounts` array in a single post creation call.
- Use `media_urls` when the user provides public image/video URLs — avoids the upload flow.
- After publishing, check post results via `GET /v1/post-results?post_id=X` to confirm success.
- On 429 errors, wait before retrying. On 500 errors, retry once after a brief delay.
