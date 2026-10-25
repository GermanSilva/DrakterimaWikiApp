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
| T1 | S1-S4 | inline, HIGH RISK (own commit, pgTAP written first, independent verify): migration `20261025120000_hub_owner_all_campaigns.sql` + `supabase/tests/database/16_hub_owner_all_campaigns.test.sql` | | [ ] |
| T2 | S5 | inline: `listMyCampaigns` returns every visible campaign with the membership role or a Hub Owner marker; hub tile badge; loader | | [ ] |
| T3 | S1-S5 | inline: docs (CLAUDE.md, hosting-and-cutover.md), browser check as owner | | [ ] |

## Log

- L1 (user, 2026-10-25): "Como Hub Owner, tengo que tener acceso a todas las campañas, sin necesariamente formar parte de ellas."
- L2 (user, 2026-10-25): asked which access level; chose "Control total (como DM)".
