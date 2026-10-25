# Hub Owner access to every campaign

The Hub Owner gets full access (DM-level) to every campaign without being a member. Branch: feat/campaign-hub.
Classification: large and HIGH RISK (item 2, security: authorization helpers behind every RLS policy): the migration is its
own commit with pgTAP and an independent read-only verification.

## Specs

- S1: "Como Hub Owner, tengo que tener acceso a todas las campañas, sin necesariamente formar parte de ellas."
- S2 (decision, user): access level = "Control total (como DM)": sees and edits everything in any campaign (secrets, DM notes, branding, members) and can delete it.
- S3 (design): the hub owner is NOT added to `campaign_members`; `is_campaign_member()` and `is_campaign_dm()` also return true for a hub owner, so every policy, trigger and realtime filter that uses them follows. Nobody else gains anything.
- S4 (design): the owner does not leave traces as a member: presence is recorded only for real members (the DM's "last connection" list is not polluted), and the roster only lists real members.
- S5 (design): the hub home and the campaign loader list every campaign for the owner (role shown as "Hub Owner" when not a member); ordinary users see exactly what they saw before.

## Tasks

| ID | Specs | Route | Commit | Done |
|----|-------|-------|--------|------|
| T1 | S1-S4 | inline, HIGH RISK (own commit, pgTAP written first, independent verify): migration `20261025120000_hub_owner_all_campaigns.sql` + `supabase/tests/database/16_hub_owner_all_campaigns.test.sql` | 36b4145, e3d645d | [x] |
| T2 | S5 | inline: `listMyCampaigns` returns every visible campaign with the membership role or a Hub Owner marker; hub tile badge; loader | 91f6444 | [x] |
| T3 | S1-S5 | inline: docs (CLAUDE.md, hosting-and-cutover.md), browser check as owner | | [x] |

## Log

- L1 (user, 2026-10-25): "Como Hub Owner, tengo que tener acceso a todas las campañas, sin necesariamente formar parte de ellas."
- L2 (user, 2026-10-25): asked which access level; chose "Control total (como DM)".

## Evidence

- 2026-10-25: pgTAP 16_hub_owner_all_campaigns 47 assertions (RED observed first: 25 failing before the migration), full `supabase test db` 16 files PASS, integration 92/92, vitest src 1691 + 525 re-run of one load flake, tsc clean, eslint 0 errors. The existing outsider checks of 01_identity_membership used a user who is also a hub owner: they now use `extra`; the invites integration test drops the other DM's hub owner row before asserting isolation.
- Independent verification (gentle-ai-verify, read-only): no privilege escalation for non-owners; findings applied: F1 (campaign availability now readable by the owner via campaign_has_member), F2 (shares_campaign_with reverted; profiles through a dedicated policy so the owner cannot read personal calendars), missing negative tests added. Left as documented advisories: F3 the owner can still write player notes / availability pinned to a campaign (deliberate actions, only the author and the DM see them), F4 members cannot read the owner's profile (author name of owner-created rows is not shown), F5 is_campaign_member(<random uuid>) is true for the owner (no exploit found), F6 the owner has no daily limit on the pot lottery (as DMs).
- Browser (local stack, Playwright, dm@example.test = seeded hub owner): the hub lists a campaign the owner is not in with the label "Hub Owner", opening it shows a draft PNJ of that campaign and Ajustes. Not verified: deletion from the UI, mobile.
- Choice to confirm: where the owner is also a member (e.g. player in "Port Azure") the UI keeps the membership role (player); the database already gives DM-level power there.
