# NCZoning Auto-Discovery

The map can automatically discover and display your mod without a GitHub submission, by reading a structured metadata block from your Nexus mod description.

> **Results may take up to 10 minutes to appear on the map** after tagging your mod and adding the block.

---

## How It Works

When the map loads, it queries the Nexus Mods API for all Cyberpunk 2077 mods tagged with **NCZoning**. For each result it finds, it looks for a `[NCZoning]` metadata block inside the mod description. If a valid block is found, the mod is automatically added to the map as a live pin — no GitHub account or pull request required.

Auto-discovered pins are identical to manually submitted ones, with a small amber **[ N ]** badge in the popup title and sidebar entry (tooltip: "Sourced automatically from Nexus Mods"). They are also automatically tagged with **nczoning**, which appears as a tag badge on their popup and can be used in the tag filter to show only auto-discovered mods.

---

## Step 1 — Tag Your Mod on Nexus

On your mod's Nexus page, go to **Tags** and add the tag: **NCZoning**

---

## Step 2 — Add the Metadata Block

Paste the following block into your mod description. The easiest way to generate it is to use the **[+] Submit** button on the map itself — it builds the block from a form and copies it to your clipboard.

### Block format

```
[code]
NCZoning:
coords=X,Y
category=new-location
tags=apartment,kitsch
credits=Optional attribution line
authors=SecondAuthor,ThirdAuthor
[/code]
```

If you want to hide the block from casual readers, wrap it in a `[spoiler]` tag:

```
[spoiler]
[code]
NCZoning:
coords=X,Y
category=new-location
[/code]
[/spoiler]
```

### Fields

| Field | Required | Format | Notes |
|---|---|---|---|
| `coords` | Yes | `X,Y` | CET float values — see [Getting Coordinates](#getting-coordinates) |
| `category` | Yes | enum | `location-overhaul`, `new-location`, or `other` |
| `tags` | No | comma-separated | Must match tags from the [Tag Registry](tags.md) — unknown tags are silently ignored |
| `credits` | No | free text | Optional — team name or secondary acknowledgments |
| `authors` | No | comma-separated names | Additional authors beyond the Nexus uploader |

The Nexus uploader is always included as the first author automatically. Use `authors=` only for co-authors.

### Parsing rules

- The block must start with `NCZoning:` on the first line inside `[code]`
- `coords` and `category` are required — mods missing either are skipped entirely
- `tags` that don't exist in the tag registry are silently dropped (the mod still appears)
- The `[spoiler]` wrapper is stripped before parsing — both formats work identically

---

## Getting Coordinates

1. Stand at the location in-game
2. Open the CET console
3. Run: `Game.GetPlayer():GetWorldPosition()`
4. Use the **X** and **Y** values — do not swap them, and ignore Z (height)

See [Coordinate System](coordinate-system.md) for more detail.

---

## Editing Your Entry

To update your mod's map data, edit the `[NCZoning]` block in your Nexus description and save. The map fetches live on every page load — your changes will be reflected within a few minutes.

There is no "Suggest Edit" button for auto-discovered mods. All edits go through the Nexus description directly.

If you want to update your **mod name**, **summary**, or **thumbnail**, those also come from Nexus and will update automatically.

---

## Removing Your Entry

To remove your mod from the map:

1. Remove the `[NCZoning]` block from your Nexus description, **or**
2. Remove the **NCZoning** tag from your mod on Nexus

Either action will cause the mod to be skipped on the next page load. There is nothing to delete from the repository — auto-discovered entries are never committed.

---

## Conflict Resolution

If a mod has both an auto-discovered entry (via this system) and a manually submitted entry (via GitHub), the **manual entry always wins**. The auto-discovered version is silently discarded.

This means maintainers can always override an auto-discovered pin with a corrected manual submission without any extra steps.

---

## Limitations

- The **Suggest Edit** button is not shown for auto-discovered mods — to correct the data, update the `[NCZoning]` block in your Nexus description directly
- Auto-discovered pins are not stored in the repository — they are fetched fresh on every page load
- Description text shown in the popup comes from your Nexus mod **summary** field (max 500 characters), not the `[NCZoning]` block
- The `nczoning` tag is applied automatically and is not part of `data/tags.json` — it cannot be added to manually submitted entries

---

## Misuse Policy

The **NCZoning** tag is provided by the Nexus Mods team specifically for this system. Maintainers reserve the right to request removal of the tag from mods that misuse it — including mods using the tag with incorrect or misleading coordinates, mods unrelated to Cyberpunk 2077 location content, or any use intended to spam or pollute the map.

---

## Using the BBCode Generator

The map includes a built-in generator to make adding the block easier:

1. Click **[+] Submit** in the map header (or the **Submit a New Mod Location** button in the sidebar)
2. Enter your CET coordinates, pick a category, and select any applicable tags
3. Optionally add credits, additional authors, and check the spoiler wrapper option
4. Click **Generate Block** — then **Copy to Clipboard**
5. Paste into your Nexus mod description and save
