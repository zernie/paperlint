---
title: "AgenticDev @ ASE — venue card (data)"
---

# AgenticDev @ ASE venue card

> **This is a venue DATA file, not a skill.** Follow the `submit-paper` skill for the end-to-end
> mechanics; the facts below are the venue-specific data. (Formerly the `submit-paper-agenticdev` skill;
> demoted to a reference doc so venue data doesn't proliferate the skill namespace.) **Re-verify the
> CFP each year** (`conf.researchr.org/home/ase-2026/agenticdev-2026`).

## The facts (2026 edition)
- **Venue**: Workshop on Agentic AI for Next-Generation Software Development, co-located with **ASE**
  (Automated Software Engineering), Munich, Oct 2026.
- **HotCRP**: `https://agenticdev2026.hotcrp.com/paper/new`.
- **Deadline**: **July 15, 2026, AoE** (≈ 9 AM July 16 at UTC+5). Notify Aug 21, camera-ready Aug 28.
- **Types / limits**: Full ≤10pp (mature); **Short ≤5pp** (WIP / vision / position); Demo/Tool ≤5pp.
  Up to **2 extra pages of references** on top.
- **Format**: ACM `\documentclass[sigconf,review,anonymous]{acmart}` → **double-blind**. Build:
  `pdflatex; bibtex; pdflatex; pdflatex`; add `\microtypesetup{expansion=false}` (the #1 acmart crash).
- **Archival**: accepted papers → **ASE workshop proceedings, DOI**. 🔴 **Поправка 2026-08-26: прежняя
  формулировка «ACM DL / IEEE Xplore» ЛОЖНА — двойной публикации нет.** Издатель у ASE **чередуется
  по годам**: ASEW '24 — ACM (`10.1145/3691621.*`, ISBN 979-8-4007-1249-4), ASE 2025 Workshops —
  **IEEE** (`csdl/proceedings/asew/2025`, ISBN 979-8-3315-8503-7). Основной трек так же: '22 ACM,
  '23 IEEE, '24 ACM, '25 IEEE. Префикс `10.5555` в ACM DL — это каталожная запись Guide, а НЕ
  публикация ACM. По чередованию **2026 ожидается ACM**, что сходится с тем, что APC вообще
  выставлен, — но ⚠️ дословного заявления ASE 2026 об издателе НЕ НАЙДЕНО. Если окажется IEEE,
  вопрос про ACM-APC вообще не тот. Подтверждать у чейров до оплаты; selected papers
  invited to a **journal special issue**. This is real authorship-criterion evidence.
- **⚠️ No supplementary-material upload field** on the HotCRP form (fields are just Title, Submission,
  Abstract, Authors, ACM corresponding, Contacts, PC conflicts). → **Host the artifact externally** (OSF
  anonymized view-only link) and `\url{}` it in the paper's Availability. See `submit-paper` §2.
- **Remote presentation**: CFP doesn't state a policy; what counts is the indexed
  publication, not attendance. Only ask organizers about remote *after* acceptance (don't draw attention
  pre-decision under double-blind).

## 🔴 Как называть площадку — что заявлять МОЖНО и чего НЕЛЬЗЯ

Вопрос всплыл 2026-08-24 и будет всплывать каждый раз (пост, сайт, резюме, заявка). Проверено по
первоисточникам, а не по пересказу поисковика.

**Факты:**
- **ASE — CORE A\*** (высший тир), вместе с ICSE и FSE это «большая тройка» программной инженерии.
- **AgenticDev — воркшоп ASE 2026**, официально числится на странице *Co-Located Events* самой ASE
  (`conf.researchr.org/track/ase-2026/ase-2026-workshops`). Это не сторонняя конференция, снявшая
  зал рядом, и не «спонсорство» — воркшоп идёт под зонтиком ASE.
- **Труды:** принятые статьи входят в **ASE 2026 Workshop Proceedings** (ACM DL, DOI).
- **Но это НЕ основной трек ASE.** У основного трека своя программа, свой PC и своя жёсткость
  отбора; воркшоп рецензируется отдельно и мягче.

| ✅ так писать можно | ❌ так нельзя |
|---|---|
| «accepted at AgenticDev 2026, a workshop of ASE 2026» | «accepted at ASE 2026» |
| «workshop paper, ASE 2026 workshop proceedings (ACM DL)» | «published at a CORE A\* conference» |
| «ASE is CORE A\*; AgenticDev is one of its workshops» | «my paper is CORE A\*» |

⚠️ **Почему это не занудство:** несостыковка в том, как подан нарратив, — записанная причина отказов
у проверяющих любые заявленные заслуги. Разницу «воркшоп vs основной трек» проверяющий видит за одну
минуту по программе конференции, а цена — доверие ко всей заявке, не к одной строке. Формула «a workshop of ASE 2026»
не слабее: она сама несёт вес ASE и при этом точна.

## Присутствие, регистрация и труды — что на что влияет

- **Приезд на зачёт работы НЕ влияет.** Засчитывается *authorship of scholarly articles* — то есть
  **публикация**, а не присутствие. «Выступил на конференции» в перечень зачитываемых достижений
  вообще не входит.
- 🔴 **Влияет другое: не станет ли оплата условием ПОПАДАНИЯ в труды.** Многие площадки требуют,
  чтобы хотя бы один автор зарегистрировался, иначе статью снимают из proceedings. Тогда исчезает не
  поездка, а само доказательство. Это и есть вопрос, заданный чейрам 2026-08-24, и он важнее денег.
- Деньги на 2026: **APC $350** (ACM полностью перешёл на open access с 01.01.2026) + регистрация
  €350 (ранний тариф до 31.08). Разбор переписки с чейрами — в приватных заметках автора
  (`<paper>/reviews/2026-08-24-perepiska-cheyry.md`).

## PC members (for the "PC conflicts" field) — 2026
Andrea Rosani (Free U Bozen/Bolzano) · Giuseppe Di Fatta (Free U Bozen/Bolzano) · Jean Marie Mottu
(Nantes U) · Paolo Papotti (Eurecom) · Simos Gerasimou (Cyprus U of Technology). An independent author
with no ties to any of them checks **none**. (List grows year to year — read the current PC page.)

## Topic fit (foreground these in the framing)
Trustworthiness / verification / validation of AI agents; benchmarking & empirical evaluation;
integration into developer workflows; agent-based coding/testing. A cost-aware, correctness-gated
*validation* paper is dead-center — name those keywords in the abstract/intro.

## After acceptance — the prestige upgrade
AgenticDev is a workshop (lightest authorship tier, but it counts). Extend the accepted paper (≥30% new
material) into a higher-prestige indexed venue as a **second** publication: **MSR 2027** (deadline
~Oct 23, 2026) or **NeurIPS 2027 Evaluations & Datasets** (~May 2027). AgenticDev explicitly invites
journal extensions. Don't dual-submit the same paper — extend it.

## Provenance
"Measuring the Wrong Number" submitted here 2026-07-13 (#20, ready-for-review), 4pp short paper, OSF
anonymized artifact linked in Availability, PC-panel estimate ~85–90% accept.

## Camera-ready (2026 edition)

**Механика ACM — общая, живёт этажом выше: `../publishers/acm.md`** (eRights первым, преамбула,
copyright-блок, CCS, Source files). Здесь — только то, что своё у AgenticDev:

- **Дедлайн camera-ready**: **28 Aug 2026, 2 PM AoE** (≈ 7 утра 29 августа при UTC+5).
- **DOI**: `10.1145/3843282.3843715` · **ACM ISBN**: `979-8-4007-2985-0/26/10`.
- **Copyright-блок**: `AgenticDev '26, October 12–16, 2026, Munich, Germany`.
- **Больше не double-blind.** Сабмит был `[sigconf,review,anonymous]`; в финале обе опции уходят.
- **Page limit тот же**: тело ≤5 стр + до 2 стр только под ссылки. Шестая страница, занятая
  библиографией, — в лимите.
- **Смена названия разрешена** — портал прямо просит «exactly as it should appear in the ACM DL».
  Но решать до eRights (см. публишер-карточку).

## Присутствие / регистрация

CFP молчит про удалённое участие, и **это не значит «можно не приезжать»**: у ACM нет общей
no-show-политики, у IEEE она есть и допускает «qualified proxy» плюс исключения по обстоятельствам вне
контроля автора. Какая применяется к воркшопу ASE — **из публичных источников не выводится**, только
письмом чейрам.

- Регистрация на день воркшопа (non-member): **€350** до 31.08, €410 до 20.09, €460 на месте.
  Это **гейт публикации**, а не расходы на поездку.
- Если для въезда нужна виза, срок на неё реален → спрашивать чейров сразу после принятия, не тянуть.

## 🤖 Машиночитаемый профиль формата

Читается правилами ESLint над `<paper>/_build/paper.facts.json` (факты снимает `extract-pdf-facts.mjs`). **Числа тут, а не в коде** — у площадки они свои, у следующей будут
другие. Источник — инструкция для авторов Conference Publishing (2026-08-25) и требования ACM.

**Профиль формата — в [`agenticdev.yaml`](agenticdev.yaml)** рядом. Там данные, здесь проза.

