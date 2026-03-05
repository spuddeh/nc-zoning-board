# Automated Mod Submission Pipeline

To make it as easy as possible for modders to add their locations to the map, we allow submissions via a simple GitHub Issue form.

This document explains what happens under the hood when a user submits that form.

---

## 🏗️ High-Level Flow

1. **User Submission:** Mod author fills out the "Submit a New Mod Location" Issue form.
2. **Issue Parsing (Bot):** GitHub Actions extracts the data from the issue and merges it into `mods.json`.
3. **PR Creation (Bot):** The bot creates a pull request on behalf of the user.
4. **Discord Notification (Bot):** A webhook sends an "Awaiting Review" embed to the Discord server.
5. **Validation (CI):** The PR is automatically validated against `mods.schema.json`.
6. **Maintainer Review:** A human reviews the data, ensures it isn't malicious, and clicks Merge.
7. **Resolution (Bot):** The issue automatically closes, and the Discord embed updates to ✅ Approved.

---

## 🔍 Stage 1: The Issue Form

[**.github/ISSUE_TEMPLATE/mod_submission.yml**](../.github/ISSUE_TEMPLATE/mod_submission.yml)

This is a YAML-defined GitHub Issue form. It guarantees that users submit data in a strict layout with Markdown headers (e.g., `### Mod Name` or `### Category`). This structured format is critical for the bot to parse the data reliably.

## ⚙️ Stage 2: `auto-pr-submission.yml`

[**.github/workflows/auto-pr-submission.yml**](../.github/workflows/auto-pr-submission.yml)

This workflow triggers whenever an issue labeled `mod-submission` is opened. It runs a custom JavaScript script using `actions/github-script`.

**Step-by-step logic:**

1. **Regex Extraction:** The script reads the raw Markdown body of the issue and uses Regex to locate the `###` headers and extract the values for Name, Author, Coordinates, Link, Category, and Description.
2. **Data Type Casting:** Validates that X and Y coordinates are floats (numbers).
3. **Latest State Check:** It runs `git fetch origin main` and checks out the absolute latest `mods.json`. This prevents merge conflicts and data loss if multiple people submit issues at the exact same time.
4. **Append Data:** Generates a random completely unique `UUID v4` for the mod's ID, builds a JSON object with the user's data, and appends it to the `mods.json` array.
5. **Create PR:** Uses a Personal Access Token (`ACTIONS_PAT`) to open a Pull Request. *(A PAT is used instead of default permissions so that the PR automatically triggers the validation workflow. See Architecture docs for details.)*
6. **Comment:** The bot replies to the issue confirming it has created the PR.

## 💬 Stage 3: Discord Webhook Integration

Within the same `auto-pr-submission.yml` workflow, the bot reaches out to a Discord channel (using the `DISCORD_WEBHOOK_URL` secret) with an embedded message noting that a PR is awaiting review.

**The Clever Part:**
To allow the bot to update this exact discord message later on, the webhook returns a unique `message_id`. The bot saves this ID as a hidden HTML comment at the bottom of the original GitHub Issue `<!-- discord_message_id: XXXXX -->`.

## 🛡️ Stage 4: `validate-mods.yml`

[**.github/workflows/validate-mods.yml**](../.github/workflows/validate-mods.yml)

When the PR is opened, GitHub Actions launches this workflow. It uses the `ajv-cli` (A Node.js JSON validator) to compare the newly updated `mods.json` against the strict rules established in `mods.schema.json`.

If the user typed a string instead of a number for a coordinate, or left out a required field, this pipeline will fail (❌ red cross on the PR), alerting the maintainer to manually fix it before merging.

## 🎉 Stage 5: Finalization & Merge

When a maintainer reviews the PR and hits Merge, the newly added mod goes live on the `main` branch.

Because the PR body contains the text `Closes #XXX` (referencing the original issue), merging the PR automatically closes the user's opened Issue.

This Issue closure triggers [**`notify-discord-pr-status.yml`**](../.github/workflows/notify-discord-pr-status.yml), which reads the hidden `discord_message_id`, makes a `PATCH` request to the Discord API, and switches the embed to a green checkmark indicating the mod is now live!
