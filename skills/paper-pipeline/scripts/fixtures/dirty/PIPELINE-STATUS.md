# PIPELINE-STATUS — fixture: every failure this checker exists for
Venue: Fixture Workshop · Deadline: 2026-08-06 · Blind: double · State: drafting
Updated: 2026-01-01

**Readiness verdict:** 88% accept probability, looking good.

The `structure` row is missing `arc` from its Requires cell **on purpose** — that is the planted
`undeclared-input`, copied from a defect found live on a real paper in August 2026. Every
other gate cell here is the canonical set from `../../pipeline-edges.mjs`, so exactly one edge is
undeclared and the finding cannot come from somewhere else.

### SETUP
| id | Work | Skill | Status | Date | Result | Open |
|----|------|-------|--------|------|--------|------|
| idea | Validate idea | research-ideate | ☑ | 2026-01-01 | go | — |
| priorwork | Map competitors | map-prior-work | ☑ | 2026-01-01 | 6 siblings | siblings/ |
| venue | Pick venue | find-venue | ☑ | 2026-01-01 | fixture | — |
| venuebar | Venue bar / levers | study-accepted-papers | ☐ | — | — | — |
| **access** | 🔴 **Can you physically submit?** | plan-paper-timeline | ☐ | — | profile pending moderation | — |
| schedule | Schedule + calendar | plan-paper-timeline | ☑ | 2026-01-01 | — | — |
| **frame** | **Claim stated before the runs** | argument-arc (frame) | ☐ | — | — | — |

### LOOP
| id | Work | Skill | Status | Date | Result | Open |
|----|------|-------|--------|------|--------|------|
| study | Study + artifact | build-benchmark | ☑ | 2026-01-01 | ran | — |
| draft | Draft | draft-paper | ☑ | 2026-01-01 | — | — |
| arc | Argument arc | argument-arc | ☐ | — | — | — |

### CONTINUOUS
| id | Trigger | Skill | Status | Date | Result | Open |
|----|---------|-------|--------|------|--------|------|
| cites | any cite added/moved | verify-citations | ☑ | 2026-01-01 | clean | — |
| siblings | a sibling surfaces | analyze-sibling-paper | ☑ | — | done | siblings/ |
| priordelta | framing moved | map-prior-work (delta) | ☐ | — | — | — |
| render | any source edit | render-paper + page count | ☑ | 2026-01-01 | 8 pages / limit 8 | — |

### GATES
| id | Gate | Skill | Requires | Status | Date | Result | Open |
|----|------|-------|----------|--------|------|--------|------|
| structure | Structure | tighten-paper | render | ☑ | 2026-01-01 | cut plan | — |
| writing | Writing craft | grade-paper-writing | draft, arc, structure | ☐ | — | — | — |
| panel | Review decision | pc-panel-review | structure, writing | ☑ | 2026-01-01 | borderline | — |
| claims | Claim preservation | Fable diff | draft, writing | ☐ | — | — | — |
| harden | Harden (all axes) | harden-paper | panel, structure, writing, cites, priordelta | ☐ | — | — | — |
| submit | Submit | submit-paper | harden, access | ☐ | — | — | — |

### AFTER
| id | Work | Skill | Status | Date | Result | Open |
|----|------|-------|--------|------|--------|------|
| cameraready | Camera-ready | camera-ready | n/a | — | pre-acceptance | — |
| extend | Extend | extend-paper | n/a | — | post-acceptance | — |
