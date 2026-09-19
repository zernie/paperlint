---
title: "Paper review — round 3"
created: 2026-09-01
---

# Findings

| # | what | where |
|---|---|---|
| 1 | the number in the abstract does not match table 2 | §1 |
| 2 | a reference to a withdrawn work | §4 |
| 3 | a past-tense promise about something unpublished | §6 |

## Analysis

Cause: the numbers gate read only `paper.md` and never opened `.tex`, so the table
and the abstract were compared in different files. Fix the gate, not the paragraph.
