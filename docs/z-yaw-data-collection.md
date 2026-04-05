# Z & Yaw Data Collection

We're collecting the missing **Z (height)** and **Yaw (facing direction)** coordinates for all registered NC Zoning Board locations. This data is tracked in the [migration GitHub Project](https://github.com/users/spuddeh/projects/3).

---

## What you need

- **Cyber Engine Tweaks (CET)** — to run the teleport command and read coordinates
- **[Simple Location Manager](https://www.nexusmods.com/cyberpunk2077/mods/26454) (optional)** — use the **Print Coordinates** button in the Settings tab instead of the console command below
- **Freefly mod** — **strongly recommended**, the teleport puts you ~690 units above the location

---

## Steps

1. **Assign yourself a card** in the [migration project](https://github.com/users/spuddeh/projects/3) — pick any unassigned location with Status: **Todo**
2. **Copy the Teleport Command** from the card
3. **Open CET in-game** and paste the command — this teleports you above the location
4. **Fly straight down** (hold Ctrl in Freefly) until you reach the right height
5. **Disable Freefly** to land naturally and avoid being clipped into the floor
6. **Run the CET command** to print your coordinates:
   ```lua
   local p,r = GetPlayer():GetWorldPosition(), GetPlayer():GetWorldOrientation():ToEulerAngles(); print(string.format("x=%.4f  y=%.4f  z=%.4f  yaw=%.4f", p.x, p.y, p.z, r.yaw))
   ```
7. **Record the values** — fill in the **Z Coordinate** and **Yaw** fields on the card
8. **Set Status to Done**

> **Yaw is optional** — if the location doesn't have a meaningful facing direction, leave it blank.

---

## Notes

- **Z** is the height/elevation — the third value from the CET output
- **Yaw** is the facing direction in degrees — useful for teleport scripts and future features
- If a card already has Z filled in, it was updated by the mod author and can be skipped
- Cards with **Source: registry** will be automatically written to `data/locations/*.json` once marked Done
- Cards with **Source: nexus-auto** cannot be updated by us — the mod author needs to add Z/Yaw to their Nexus description block

---

## Automated processing

Once cards are marked **Done**, they are processed automatically by a daily GitHub Action (`apply-z-from-project.yml`) that:

1. Reads all **Done** items from the migration project
2. Writes Z and Yaw into the corresponding `data/locations/*.json` files
3. Rebuilds `mods.json`
4. Commits the changes directly to `main`
5. Sets the card status to **Processed**

You can also trigger it manually from the [Actions tab](https://github.com/spuddeh/nc-zoning-board/actions/workflows/apply-z-from-project.yml).

### Nexus-auto entries

Cards with **Source: nexus-auto** are tracked for author outreach. They will remain at **Done** status (not Processed) until the mod author updates their Nexus description block with Z and Yaw data. See [nczoning-auto-discovery.md](nczoning-auto-discovery.md) for the BBCode format.

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/populate_migration_project.js` | Seeds the GitHub Project with all locations missing Z. Safe to re-run — skips existing cards. |
| `scripts/apply_z_from_project.js` | Reads Done cards and backfills JSON files. Run manually or via the daily workflow. |

Both scripts require a GitHub token with `project` scope:
```bash
GITHUB_TOKEN=<your_projects_token> node scripts/populate_migration_project.js
GITHUB_TOKEN=<your_projects_token> node scripts/apply_z_from_project.js
```
