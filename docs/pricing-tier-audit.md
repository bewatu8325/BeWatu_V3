# Pricing tiers: what each plan promises versus what exists

Audited against BeWatu_V3 (this repo) and `bewatu-factory` on the day the redesigned pricing page was built. There was no roadmap document in either repo, so this file is the baseline: every feature the page lists, whether it exists, where it lives, and what it would take to make the claim true.

**Status key.** Built: it exists and does what the label says. Partial: something real exists but it is narrower or different from the label. Not built: nothing behind the label.

**Headline numbers.** Of the 28 features the four plans list (leaving out the "Everything in …" lines): **12 built, 11 partial, 5 not built.**

## What is actually gated today

Nothing, by tier. `TierGate`, `hasAccess`, `canAccessExpertMarketplace` and `canFormTeams` exist in `lib/subscription.ts` and `components/TierGate.tsx` but no screen uses them. What exists instead:

- A new account cannot buy Factory or Investor until it has a week of activity (`lib/engagementGate.ts`); the buttons show the reason.
- The Factory app decides access from the account's `factoryUnlocked` flag or tier (`lib/hooks/use-bewatu-profile.ts`). I found no route in Factory that refuses an account without it.
- Recruiters have a cap of 3 active listings on the free recruiter tier (a separate subscription, not these plans).

So after a purchase, only the tier value changes. That matches your plan not to enforce tiers in Beta.

## Explorer (Free)

| Feature | Status | What exists | To make it true |
|---|---|---|---|
| Full network access | Built | Connections, follows, messaging, communities | Define "full" so it is not a vague promise |
| Unlimited pod memberships | Built | No cap exists anywhere | Nothing |
| Browse ideas & arenas | **Partial** | Arenas: built. Ideas live only in Factory (`bewatu-factory/app/ideas`); V3's `IdeaNetwork` component is not routed | Decide: open Factory's Ideas to every signed-in member, show a read-only ideas list in BeWatu, or drop "ideas" from Explorer |
| Basic profile | Built | Profile, skills, reels, portfolio | Nothing |
| Follow people & organizations | Built | Person follow requests; organization follows | Nothing |

## Pro ($20 / month)

| Feature | Status | What exists | To make it true |
|---|---|---|---|
| Expert marketplace access | **Not built** | Only a helper function and a code comment mentioning an `<ExpertMarketplace />` that does not exist | Build it, or remove the line until it is on the roadmap |
| Advanced people discovery | Partial | People page and Algolia search exist for everyone | Define what "advanced" adds (filters, skill and goal matching, saved searches) and gate that |
| Arena priority access | **Not built** | Arenas have no priority, queue or early-access concept | Define it (early view of new challenges? priority review?) or remove |
| Idea analytics | Partial | Factory: upvotes, comments, trending sort, and an "idea traction" score on the founder dashboard; no per-idea analytics view | Build a per-idea analytics view. It also sits in Factory, not Pro |
| Team formation tools | Built, but in Factory | Factory teams: team posts, open roles, search and role filters | Move it into Pro's reach, or list it under Factory |
| Cofounder matching | Partial | Team posts with open roles; no matching logic | Build matching (skills, stage, availability) or reword to "Find cofounders" |
| Profile verification badge | Partial | A verified-work-email badge exists for every member; company and recruiter verification exist | Decide whether Pro gets a distinct badge, and what is verified |

## Factory ($49 / month)

| Feature | Status | What exists | To make it true |
|---|---|---|---|
| Factory workspace | Built | `factory.bewatu.com`: ideas, teams, pipeline, arena | Nothing |
| Idea validation suite | Partial | Idea submission, upvotes, discussion; an "idea validation" score shown to investors | Build validation tools (surveys, waitlist, experiments) or reword to "Idea feedback" |
| Startup pipeline tools | Built | `/pipeline`: projects, startups, teams, graduate to startup | Nothing |
| Incubator program access | Built | Programs list and applications | Needs programs created in the data |
| Investor discovery | Built | `/investors` with search, type and stage filters, verified badge | Nothing |
| Traction dashboard | Built | Founder dashboard: overview, scores (idea traction, collaboration, team formation, arena), offer inbox, demos | Nothing |
| Up to 3 team members included | **Not built** | No seat or member-limit concept, and no billing for extra members | Build seats, or remove "included" |
| Factory leaderboard visibility | Built | `/leaderboard` | Nothing |

## Investor ($199 / month)

| Feature | Status | What exists | To make it true |
|---|---|---|---|
| Curated deal flow | Built | Investor dashboard: deal flow with hot, rising, early and watch signals | "Curated" is scoring, not human curation |
| Startup assessments | Partial | Automatic scores: team reputation, idea validation, prototype readiness, market potential | Build written assessments, or reword to "Startup scoring" |
| Founder direct messaging | Partial | Structured funding offers (notify the founder) and demo scheduling; no free-form message from Factory | Connect Factory to BeWatu messaging for investors |
| Portfolio tracking | Partial | Watchlist, activity and stats; an investor profile can show a portfolio | Build tracking of invested startups (stage, updates) |
| Early access to Factory startups | **Not built** | No early-visibility window | Build a time-limited visibility rule, or remove |
| Arena winner notifications | Partial | An "Arena Winners" tab to browse | Send a notification when a winner is chosen |
| Verified investor badge | Partial | Badge exists, granted through a reviewed application whose form lives in Factory | See the conflict below |
| Monthly curated report | **Not built** | No job, template or email | Build it, or remove |

**Conflict to settle first.** The page sells Investor as an instant, self-serve purchase, but the verified badge and the investor role are meant to come from a reviewed application. Buying only sets the tier (`subscriptionTier: 'investor'`; the webhook sets nothing else), and Factory treats that tier as unlocked. So a buyer gets Factory access, but not the investor role or the badge, until they are approved. The page promises investor features the purchase alone does not deliver.

## Enterprise

| Item | Status | Notes |
|---|---|---|
| Arena sponsorship | Built | Request, admin approval, branding, dates |
| Talent scouting | Built | Recruiter console, talent pool, outreach templates |
| Startup pipeline | Built | Factory pipeline |
| API access | **Not built** | No public API or keys |
| Dedicated support | Manual | Ops console tickets exist; no support entitlement |

## About the page itself

- **Annual billing is display only.** Checkout has one Stripe price per plan and no billing interval (`api/create-subscription.ts`). A member who picks Annual is still charged monthly. Hide the toggle until annual prices exist in Stripe, or add them.
- **"Save 17%" is wrong for Pro.** Pro's annual price is $190 against $240 monthly, a 21% saving. Factory and Investor are 16.7%. Pro would be $200 to match.
- **Trials.** Pro gets 30 days and Factory and Investor 14 days (server side). The redesigned cards no longer print this; the upgrade dialog still states it before payment.
- **Prices.** Pro's $20 is confirmed against Stripe. Factory $49 and Investor $199 are not confirmed in code.

## Suggested order

1. **Fix what misleads today:** the Investor self-serve conflict, annual billing, the Pro saving figure, and "Browse ideas" for Explorer.
2. **Reword the partial ones** where the honest name is smaller (Idea feedback, Startup scoring, Find cofounders).
3. **Build or cut the five not built:** Expert marketplace, Arena priority access, 3 team members included, Early access to Factory startups, Monthly curated report. Plus API access for Enterprise.
