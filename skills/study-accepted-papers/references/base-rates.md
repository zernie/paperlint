# What "strong accept" can be measured by — proxies and base rates

Review scores are not public at most software-engineering venues, so this skill always names a
**proxy** for "strong accept" and its **base rate**: how rare the target is by construction. A report
that names neither cannot be checked. Every figure below was re-read in its source on 2026-10-12; the
quotes are verbatim.

## The proxy most venues allow: a distinguished-paper award

ACM SIGSOFT caps the award by the size of the accepted set
([rule](https://www2.sigsoft.org/awards/distinguishedpaper/)):

> "In cases where the number of accepted papers is less than or equal to ten, one paper can be
> designated; in cases where the number of accepted papers is 11 through 20 inclusive, two papers can be
> designated; otherwise, 10% of the papers can be designated."

So at a SIGSOFT venue the award proxy is **at most about 10% of accepted papers**, and a venue may
designate fewer. Count the venue's own winners per year against its accepted count; do not assume the
cap was used.

How winners are chosen, where it is documented at all, is a nomination by a reviewer and a vote. The
ICSE 2019 PC report
([PDF](http://www.icse-conferences.org/sc/ICSE/2019/ICSE2019-PC-Chairs-Report.pdf)) quotes ACM's text
("will take a weighted vote … will use the results of the weighted votes as a primary basis for
selecting the award papers") and adds:

> "There appears to be no standard process for selecting Best Paper awardees at ICSE."

## The only public score data found for SE venues

**ICSE 2018 PC report**
([PDF](http://www.icse-conferences.org/sc/ICSE/2018/ICSE2018-PC-Chairs-Report.pdf)): mean structured
scores (1–5) of rejected papers, accepted papers, and papers nominated for best paper.

| criterion     | rejected | accepted | nominated | nominated − accepted |
| ------------- | -------: | -------: | --------: | -------------------: |
| Significance  |    3.025 |    3.797 |     4.548 |               +0.751 |
| Soundness     |    2.891 |    3.719 |     4.381 |               +0.662 |
| Novelty       |    3.137 |    3.753 |     4.357 |               +0.604 |
| Replicability |    2.926 |    3.559 |     4.095 |               +0.536 |
| Presentation  |    3.234 |    3.925 |     4.452 |               +0.527 |

The last column is computed from the report's table. The report also says that "Of the 1487 reviews,
42 nominated a paper for best paper", and that the structured scores "were not used during the
discussion phase".

**ICSE 2019 PC report** (the PDF linked in the award section above): papers whose every review was weak accept or strong
accept (the range [1; 2] on a −2…+2 scale) were **40 of 494 submissions (8.1%)**, all 40 accepted;
the same row for ICSE 2018 is 50 of 489 (9.9%). This is the nearest public figure to "every reviewer
said accept", and it is a share of **submissions**, not of accepted papers.

## What reviewers say they reward and punish

Ernst, Carver, Mendez, Torchiano, _Understanding Peer Review of Software Engineering Papers_, EMSE 2021
([arXiv 2009.01209](https://arxiv.org/abs/2009.01209)), 175 surveyed reviewers:

> "The most important features of papers that result in positive reviews are clear and supported
> validation, an interesting problem, and novelty. Conversely, negative reviews tend to result from
> papers that have a mismatch between the method and the claims and from those with overly grandiose
> claims."

## How to state them in a report

- Name the proxy ("a distinguished-paper award at <venue>, <k> of <n> accepted papers over <years>")
  and the base rate it implies, before any probability.
- A probability for the author's paper is stated against those base rates, as a band, and marked as
  judgement. Simulated review panels run hot; read the band, not the digit.
- Do not quote an acceptance rate unless the venue published the number of submissions.
- Say which conclusions rest on fewer than ten papers.
