## Advisor Agent -- 02:37 UTC
- **Result**: OP
- **Task**: Blog-from-openharness-demo advisor briefing
- **Action**: Produced implementation briefing and 3-delegate read-only plan for openharness-web blog.
- **Observation**: Advisor flagged key corrections (.oh casing, Hermes spelling, overlap with July 6 auth post) and target repo conventions.
## Site-Conventions Delegate -- 02:42 UTC
- **Result**: OP
- **Task**: openharness-web blog conventions audit
- **Action**: Identified Docusaurus frontmatter/style, image-localization path, and validation commands.
- **Observation**: Existing posts have no inline images; localized screenshots under static/img/blog/<date-slug>/ are safest for the demo blog.
## Narrative-Fact-Check Delegate -- 02:43 UTC
- **Result**: OP
- **Task**: openharness-demo blog narrative and fact-check
- **Action**: Produced positioning, title/meta/tags, outline, and factual corrections against current docs.
- **Observation**: The demo post should focus on fresh-sandbox-to-first-PR workflow and link to the July 6 auth post instead of duplicating credential persistence details.
## Photo-Alignment Delegate -- 02:43 UTC
- **Result**: OP
- **Task**: openharness-demo screenshot and text alignment audit
- **Action**: Audited 18 source sections and 17 Loom screenshots; flagged mismatches, missing section 15 image, and sensitive UI risks.
- **Observation**: Final blog should include only selected/cropped-safe screenshots and must correct raw notes that overstate optional installs, health-check success, and PR readiness.
## Retro -- 02:53 UTC
- **Result**: OP
- **Subsystems**: reinforcement learning, docs, memory scaffolding, context compression, wiki
- **Hypotheses**: 5 (supported 3 / refuted 1 / inconclusive 1)
- **Promoted**: 0 to MEMORY.md, 0 to IDENTITY.md
- **Observation**: Loom-to-blog work benefited from advisor-led delegates, but the reusable lesson is being encoded in the requested /blog skill rather than duplicated into MEMORY.md.
## skill-builder -- 02:57 UTC
- **Result**: OP
- **Skill**: blog
- **Path**: .oh/skills/blog/SKILL.md
- **Reference**: .oh/skills/blog/references/loom-to-blog.md
- **Validation**: PASS blog skill validation; SKILL.md 86 lines; reference 218 lines
- **Observation**: The Loom-to-blog workflow is now proceduralized as a manual /blog skill instead of remaining only in session memory.
## PR Completion -- 03:19 UTC
- **Result**: OP
- **PRs**: openharness-web#11, openharness#622
- **Action**: Updated web blog PR to use local screenshots downloaded from exact Loom demo URLs; updated /blog skill PR to support source-faithful image handling with local fallback.
- **Verification**: web local typecheck/build pass; openharness PR #622 GitHub checks pass.
- **Observation**: Loom hotlinks may render inconsistently in PR/site previews, so source-faithful local assets are safer when exact remote links break.
## Social Promo Artifact -- 03:31 UTC
- **Result**: OP
- **PRs**: openharness-web#11, openharness#622
- **Action**: Added tracked promo artifact for LinkedIn/X and updated /blog skill with --promo artifact generation workflow.
- **Verification**: web typecheck/build pass; X draft lengths checked; openharness PR #622 CI green.
- **Observation**: Blog workflows need a non-published promotion artifact so launch copy and target-profile context are reviewable without auto-publishing.
## Post Bridge Promo Drafts -- 03:46 UTC
- **Result**: OP
- **Posts**: X/JohnEggz draft 30214ff7-7b37-4b9c-878b-5e5b26df7fb9; LinkedIn page draft 8eff3f37-3d41-454f-b084-b63018324647
- **Action**: Sourced POST_BRIDGE_API_KEY from ~/.zshenv, selected social accounts, created Post Bridge drafts only.
- **Verification**: GET /v1/posts/<id> read-back returned is_draft=true for both; caption lengths checked.
- **Observation**: Draft status reports as scheduled with scheduled_at=null, so is_draft is the reliable guard before live publishing.
## Grounded Social Visual -- 03:55 UTC
- **Result**: OP
- **PRs**: openharness-web#11, openharness#622
- **Action**: Created a grounded social card from blog post copy and screenshot; attached it to Post Bridge X/LinkedIn drafts; updated /blog guidance for post-derived feedback-oriented promo visuals.
- **Verification**: web typecheck/build pass; Post Bridge read-back shows drafts still is_draft=true with media attached; openharness PR #622 CI green.
- **Observation**: For technical launch posts, feed visuals should show the concrete workflow and invite practitioner feedback instead of using hyperbolic claims.
## Deterministic Blog Banner Workflow -- 04:09 UTC
- **Result**: OP
- **PRs**: openharness-web#11, openharness#622
- **Action**: Replaced one-off promo-card generation with a source-controlled banner recipe workflow: JSON recipe, deterministic renderer, SVG/JPG outputs, promo docs, and /blog guidance.
- **Verification**: web render/typecheck/build pass; openharness PR #622 CI green; Post Bridge read-back shows X/LinkedIn drafts still is_draft=true and attached to recipe-rendered media.
- **Observation**: Technical blog promo banners should be editable design recipes with explicit slots/crops/checklists, not opaque image-generation outputs.
## Advisor Agent -- 04:11 UTC
- **Result**: OP
- **Task**: Token-count skill creation briefing
- **Action**: Attempted advisor sub-agent handoff; Pi fell back to general-purpose and returned a skill/delegate plan.
- **Observation**: The provider did not discover .oh/agents/advisor.md as a Pi agent type, so advisor handoffs may need a .pi/agents bridge or explicit prompt fallback.

## Post Bridge Draft Update -- 04:14 UTC
- **Result**: OP
- **Posts**: X/JohnEggz draft 30214ff7-7b37-4b9c-878b-5e5b26df7fb9; LinkedIn page draft 8eff3f37-3d41-454f-b084-b63018324647
- **Action**: Updated draft captions to include feedback ask and attached the latest deterministic banner media a4d2ec71-5853-4fa9-8e58-a1e84ee4fcff; synced promo artifact in web PR.
- **Verification**: Post Bridge read-back returned is_draft=true for both drafts; X caption 267 chars; web promo artifact pushed in commit 0e17425.
- **Observation**: Keeping promo artifact copy in sync with Post Bridge draft state avoids drift between reviewed source and external drafts.
## skill-builder -- 04:18 UTC
- **Result**: OP
- **Skill**: token-count
- **Path**: .oh/skills/token-count/SKILL.md
- **Script**: .oh/skills/token-count/scripts/token-count.mjs
- **Validation**: PASS token-count script smoke tests; PASS pnpm test (447 tests); PASS frozen lockfile install.
- **Observation**: A tiktoken-backed skill needs an explicit project dependency plus a skill-local script because provider skill surfaces are symlinks to .oh/skills.

## New Post Bridge Draft Variants -- 04:23 UTC
- **Result**: OP
- **Posts**: new cross-platform drafts 7a4f81a9-6a37-4d46-89c1-be8c054a9747, c7b08db4-1714-4b95-be02-921e35d52ce0, d6ba458c-c665-4b8b-95b4-4fdc4c62c702
- **Action**: Created a distinct v2 checklist banner from the deterministic recipe workflow, uploaded media 79aa8dea-c4bd-49ad-938a-ff71a5886155, and created 3 new draft variants targeting X JohnEggz + LinkedIn page with platform-specific captions.
- **Verification**: Post Bridge read-back returned is_draft=true for all 3; X captions 252/269/245 chars; web render/typecheck/build passed; web PR #11 updated in commit beba5fa.
- **Observation**: When draft-media replacement is unclear in an external platform UI, creating fresh draft variants is safer than repeatedly patching existing drafts.
## skill-builder -- 04:25 UTC
- **Result**: OP
- **Skill**: token-count
- **Path**: .oh/skills/token-count/SKILL.md
- **Action**: Extended token-count for multi-file, glob, directory, top-N, JSON reports, and documented caveman compaction loop.
- **Validation**: PASS token-count direct/stdin/file/glob/dir smoke tests; PASS pnpm test (447 tests).
- **Observation**: Token compaction should audit files first, then route only safe prose targets through /caveman-compress; vague over-time intent should not auto-create a recurring loop.

## Dark Site-Themed Promo Drafts -- 04:30 UTC
- **Result**: OP
- **Posts**: preferred dark drafts 3fa6c77b-5cd8-4931-83da-71fecb9cbcbc, f5e267ca-8afb-4c18-8f0f-4a2c5c31da4d, 269aad21-e16a-43a7-9bba-b61a3dbbfed4
- **Action**: Replaced the light checklist banner with a deterministic dark site-themed banner matching Open Harness/mifune.dev style and created fresh Post Bridge draft variants with media 9a615b9f-433d-440d-8551-b4baefc18af1.
- **Verification**: Post Bridge read-back returned is_draft=true for all 3; web render/typecheck/build passed; web PR #11 updated in commit 987fddb.
- **Observation**: Promo assets for Open Harness should inherit the site theme tokens directly (black surface, terminal chrome, green accent) instead of inventing alternate editorial palettes.
## Blog Promo HTML-Layout Renderer -- 04:49 UTC
- **Result**: OP
- **Action**: Replaced the promo-card renderer's hand-positioned SVG assembly with a browserless HTML/CSS-like Satori + Sharp layout pipeline, regenerated the dark site-themed social card, created fresh Post Bridge draft variants, and updated /blog guidance to prefer this pattern over Chromium screenshots.
- **Web PR**: mifunedev/openharness-web#11 pushed commit 06627a8.
- **Skill PR**: mifunedev/openharness#622 pushed commit 8abb1f86; CI checks passed.
- **Preferred drafts**: e4771829-fdb9-422f-895f-5ac660ca3fe2, dff682c4-f7b4-4370-8ec4-05df2bce37c0, 8e634328-a218-4565-9a1a-5b1316d2c8e7 using media 938a2e4e-163d-4f7b-a42e-ab99cab01868.
- **Observation**: For deterministic blog promo images, Satori-style layout gives precise alignment without introducing a heavyweight Chromium dependency.
## Blog Promo Star CTA Refresh -- 04:57 UTC
- **Result**: OP
- **Action**: Removed feedback-welcome framing from the preferred 3 Post Bridge drafts, added tasteful emoji structure plus LinkedIn bold/italic emphasis, and added a light GitHub star CTA.
- **Drafts**: e4771829-fdb9-422f-895f-5ac660ca3fe2, dff682c4-f7b4-4370-8ec4-05df2bce37c0, 8e634328-a218-4565-9a1a-5b1316d2c8e7.
- **Verification**: Post Bridge read-back confirmed all remain is_draft=true, scheduled_at=null, media 938a2e4e-163d-4f7b-a42e-ab99cab01868 attached; X captions are <=280 chars and include star CTA.
- **Web PR**: mifunedev/openharness-web#11 pushed commit 311c189.
## Blog Promo Published -- 05:04 UTC
- **Result**: OP
- **Action**: Published the three preferred Open Harness demo promo variants after exact confirmation phrase POST BRIDGE LIVE CONFIRMED; all Post Bridge posts moved to status=posted/is_draft=false.
- **X URLs**: https://twitter.com/user/status/2074720526920978909 ; https://twitter.com/user/status/2074720521682309307 ; https://twitter.com/user/status/2074720530951770230
- **LinkedIn URLs**: https://www.linkedin.com/feed/update/urn:li:share:7480486215687999490 ; https://www.linkedin.com/feed/update/urn:li:share:7480486213603217408 ; https://www.linkedin.com/feed/update/urn:li:share:7480486223669821440
- **Verification**: Blog URL returned 200 before publish; Post Bridge result records reported success=true/error=null for all six platform results.
- **Follow-up PR**: openharness-web#12 records deterministic renderer/promo artifacts and publication URLs because PR #11 had already merged before the late promo commits.
- **Preference update**: /blog playbook updated in openharness#622; CI green.
## Blog Promo Replacement Draft -- 05:25 UTC
- **Result**: OP
- **Signal**: X suppressed URLs that were final in the rendered tweet, leaving visible labels like Guide:/Star: without the link text. User added cadence preference: max 1 post per account per day.
- **Action**: Updated /blog playbook to keep visible text after URLs and default to one post per account per day; rerendered promo card with star CTA instead of feedback CTA; created one replacement Post Bridge draft targeting X JohnEggz and LinkedIn Ruska AI.
- **Draft**: 74655ecc-3aba-493d-bb87-0111a0ce42c8; media 1e400998-adb7-4edb-aaba-ff9e02840cbd; is_draft=true; scheduled_at=null.
- **Verification**: X caption 271 chars; final token is useful, not a URL; Post Bridge readback confirms target accounts [41738,41732] and media attached.
- **PRs**: openharness#622 updated; openharness-web#13 opened because #12 merged before replacement artifacts landed.
## Protocol-less Separate Promo Drafts -- 05:37 UTC
- **Result**: OP
- **Signal**: User prefers social post links without https:// because they tend to render better; platform formatting differs, so keep X and LinkedIn drafts separate.
- **Action**: Updated /blog playbook for protocol-less social links, separate platform/account drafts, no markdown-bold assumptions, one post per account per day, and non-final X URLs.
- **Drafts**: X draft 94f87ae9-185d-4e7c-b79e-16935f7a4efd; LinkedIn draft bae96c7b-f8ec-46ef-bdd2-f3c7689b673d; media aeb1ed6c-92fc-4a82-9e01-9c26970e1e89.
- **Verification**: Both read back is_draft=true/scheduled_at=null; X caption 255 chars, no https://, final token useful; LinkedIn no markdown **bold** syntax and no https://.
- **PRs**: openharness-web#13 and openharness#622 updated; #622 CI monitor started.
## No-Link X Promo Drafts -- 05:42 UTC
- **Result**: OP
- **Signal**: User observed Twitter/X links always disappear after posting/checking, even after moving links and using protocol-less domains.
- **Action**: Updated /blog playbook to treat X caption links as unreliable in this flow and default to no URL-like tokens in X captions; keep direct links in LinkedIn. Created fresh separate drafts.
- **Drafts**: X 98c67ed5-5a5e-489b-b051-acc6aad79e93; LinkedIn 3c0f224a-2f03-4b99-9520-eac889376c8c; media fb9b7be4-3caf-4dbc-8d08-2da5941f7d5f.
- **Verification**: Both read back is_draft=true/scheduled_at=null; X caption 234 chars and contains no http/oh.mifune.dev/github.com tokens; LinkedIn keeps https links and no markdown **bold** syntax.
- **PRs**: openharness-web#13 and openharness#622 updated; #622 CI monitor started.
## Clickable Link-Card Promo Drafts -- 05:55 UTC
- **Result**: OP
- **Signal**: User identified the optimal X/LinkedIn flow: use the direct blog URL with site-rendered banner metadata and no uploaded image, so the platform card/banner is clickable.
- **Action**: Added blog frontmatter image for the deterministic promo card; verified built Docusaurus HTML emits summary_large_image plus og:image/twitter:image; created fresh no-media Post Bridge drafts with direct blog URL as the only link; updated /blog playbook to prefer link-card/no-media promos.
- **Drafts**: X c2d45d22-bdfa-4c76-b37b-35222f728849; LinkedIn dee89070-6df1-4339-b13f-66fbb413762a; both media=null, is_draft=true, scheduled_at=null.
- **Verification**: Web typecheck/build passed; built HTML points og:image/twitter:image to https://oh.mifune.dev/img/blog/2026-07-07-open-harness-demo-guide/social-promo-card.jpg. Publish should wait until web PR #13 is deployed so live metadata is current.
- **PRs**: openharness-web#13 and openharness#622 updated; #622 CI monitor started.
## Published Link-Card Promo Posts -- 06:02 UTC
- **Result**: OP
- **Signal**: User confirmed with exact phrase POST BRIDGE LIVE CONFIRMED after PR #13 deployment served correct promo-card og:image/twitter:image metadata.
- **Action**: Published no-media/direct-blog-link X and LinkedIn posts. X draft c2d45d22-bdfa-4c76-b37b-35222f728849 was already posted on readback; LinkedIn draft dee89070-6df1-4339-b13f-66fbb413762a returned 500 on PATCH and remained draft, so created equivalent live LinkedIn post 05f06363-7027-4aad-b6f4-5e187c9ab455.
- **Verification**: X result success=true url=https://twitter.com/user/status/2074734574584705499; LinkedIn result success=true url=https://www.linkedin.com/feed/update/urn:li:share:7480501537111191552; both live posts media=null and scheduled_at=null.
- **Follow-up**: Old LinkedIn draft dee89070-6df1-4339-b13f-66fbb413762a remains draft; delete only with explicit approval.
## Channel Blast Blog Artifacts -- 06:17 UTC
- **Result**: OP
- **Signal**: User wants Slack/Discord/Telegram channel blasts included alongside LinkedIn/X promo preferences and visible in merge-request artifacts.
- **Action**: Updated /blog to support --promo linkedin,x,channels, require channel-native Slack/Discord/Telegram blasts, and require PR/MR bodies to list generated promo artifacts. Added Slack/Discord/Telegram copy for the Open Harness demo guide promo artifact and opened openharness-web#14.
- **Verification**: git diff --check passed for both repos; web PR #14 body includes generated artifact inventory; openharness#622 CI monitor started after guidance update.
## GitHub Star CTA for Channel Blasts -- 06:21 UTC
- **Result**: OP
- **Signal**: User noticed channel blast artifacts lacked a CTA to star GitHub repo mifunedev/openharness.
- **Action**: Added non-URL star CTA to Slack/Discord/Telegram blasts so the blog URL remains the only actual link for unfurl/card previews. Updated /blog guidance to include repo-slug star CTAs for open-source channel blasts.
- **Verification**: Channel blasts each contain mifunedev/openharness, exactly one blog URL, and no GitHub URL; git diff --check passed. Web PR #14 clean; openharness#622 CI monitor started.

## prompt-miner -- 11:01 UTC
- **Result**: NO-CORPUS
- **Sessions scanned**: 2
- **Markers found**: 0
- **Top marker**: none (corpus too thin: 2 sessions, 1 per stratum; floor is 10)
- **Observation**: prompt-miner run completed with result NO-CORPUS.

## spec-plan + spec-critique (advisor-orchestrated) -- prime-rl-integration
- **Result**: OP
- **Slug**: prime-rl-integration (issue #623, draft PR #624)
- **Artifacts**: prd.md / prd.json / prompt.md / progress.txt + critique.md (five files, committed via git add -f on feat/623-prime-rl-integration worktree)
- **Wiki impact**: REQUIRED (prime-rl-training.md + reciprocal backlink)
- **Observation**: Advisor→triad(pm/implementer/critic)→author→2-critic gate loop caught a real security gap (secrets.env/configs/endpoints.toml bypass all three secret-guard layers by dot-prefix construction) AND a bug in the first fix (regex $-anchor valid for path-context hook but wrong for command-string-context deny-env-dump.sh — needs \b). Two full FAIL→revise rounds before PASS/PASS; the second round's finding was inside the first round's mitigation, validating the re-verify pass.
