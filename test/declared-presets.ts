// What each shipped preset declares itself to be (its parsed identity), read by src/presets.test.ts:
// a new preset adds its row here. Data only, so it sits apart from the test it feeds.

import type { PresetIdentity } from "../src/tex-requirements.ts";

export const DECLARED: Readonly<Record<string, PresetIdentity>> = {
  "aaai-press.jsonc": {
    type: "family",
    templateLabel: "article + \\usepackage[submission]{aaai2027}",
    anyConferenceOf: null,
  },
  "aaai-2027.jsonc": {
    type: "venue",
    name: "AAAI",
    url: "https://aaai.org/conference/aaai/aaai-27/main-technical-track-call/",
    field: "ml-ai",
  },
  "acl-latex.jsonc": {
    type: "family",
    templateLabel: "article + \\usepackage{acl}",
    anyConferenceOf: "ACL",
  },
  "acm-acmsmall.jsonc": {
    type: "family",
    templateLabel: "ACM acmart, acmsmall (one column)",
    anyConferenceOf: "ACM",
  },
  "acm-sigconf.jsonc": {
    type: "family",
    templateLabel: "ACM acmart, sigconf (two columns)",
    anyConferenceOf: "ACM",
  },
  "agenticdev-2026.jsonc": {
    type: "venue",
    name: "AgenticDev",
    url: "https://conf.researchr.org/home/ase-2026/agenticdev-2026",
    field: null,
  },
  "acsac-2026.jsonc": {
    type: "venue",
    name: "ACSAC",
    url: "https://www.acsac.org/2026/submissions/papers/",
    field: "security",
  },
  "agent-2027.jsonc": {
    type: "venue",
    name: "AGENT",
    url: "https://conf.researchr.org/home/icse-2027/agent-2027",
    field: null,
  },
  "agentverify-2027.jsonc": {
    type: "venue",
    name: "AGENTVERIFY",
    url: "https://agentverify2027.github.io/cfp.html",
    field: null,
  },
  "aidc-2026.jsonc": {
    type: "venue",
    name: "AIDC",
    url: "https://aidcworkshop.github.io/",
    field: null,
  },
  "aisec-2026.jsonc": {
    type: "venue",
    name: "AISec",
    url: "https://aisec.cc/",
    field: null,
  },
  "ase-2026.jsonc": {
    type: "venue",
    name: "ASE",
    url: "https://conf.researchr.org/track/ase-2026/ase-2026-research-track",
    field: "software-engineering",
  },
  "ccs-2026.jsonc": {
    type: "venue",
    name: "ACM CCS",
    url: "https://www.sigsac.org/ccs/CCS2026/call-for/call-for-papers.html",
    field: "security",
  },
  "emnlp-2026.jsonc": {
    type: "venue",
    name: "EMNLP",
    url: "https://2026.emnlp.org/calls/main_conference_papers/",
    field: "nlp",
  },
  "fse-2027.jsonc": {
    type: "venue",
    name: "FSE",
    url: "https://conf.researchr.org/track/fse-2027/fse-2027-papers",
    field: "software-engineering",
  },
  "icml-style.jsonc": {
    type: "family",
    templateLabel: "article + \\usepackage{icml2027}",
    anyConferenceOf: null,
  },
  "icml-2027.jsonc": {
    type: "venue",
    name: "ICML",
    url: "https://icml.cc/Conferences/2027/CallForPapers",
    field: "ml-ai",
  },
  "icse-2027.jsonc": {
    type: "venue",
    name: "ICSE",
    url: "https://conf.researchr.org/track/icse-2027/icse-2027-research-track",
    field: "software-engineering",
  },
  "icse-2028.jsonc": {
    type: "venue",
    name: "ICSE",
    url: "https://conf.researchr.org/track/icse-2028/icse-2028-papers",
    field: "software-engineering",
  },
  "ieee-conference.jsonc": {
    type: "family",
    templateLabel: "IEEE IEEEtran, conference",
    anyConferenceOf: "IEEE",
  },
  "langcode-2027.jsonc": {
    type: "venue",
    name: "LangCode",
    url: "https://langcode2027.github.io/",
    field: null,
  },
  "msr-2027.jsonc": {
    type: "venue",
    name: "MSR",
    url: "https://2027.msrconf.org/track/msr-2027-technical-papers",
    field: "software-engineering",
  },
  "naacl-2027.jsonc": {
    type: "venue",
    name: "NAACL",
    url: "https://2027.naacl.org/calls/main_conference_papers/",
    field: "nlp",
  },
  "neurips-style.jsonc": {
    type: "family",
    templateLabel: "article + \\usepackage{neurips_2026}",
    anyConferenceOf: null,
  },
  "neurips-2026.jsonc": {
    type: "venue",
    name: "NeurIPS",
    url: "https://neurips.cc/Conferences/2026/CallForPapers",
    field: "ml-ai",
  },
  "nlbse-2027.jsonc": {
    type: "venue",
    name: "NLBSE",
    url: "https://conf.researchr.org/home/icse-2027/nlbse-2027",
    field: null,
  },
  "realm-2026.jsonc": {
    type: "venue",
    name: "REALM",
    url: "https://realm-workshop.github.io/call_for_papers",
    field: null,
  },
  "sp-2027.jsonc": {
    type: "venue",
    name: "IEEE S&P",
    url: "https://sp2027.ieee-security.org/cfpapers.html",
    field: "security",
  },
  "tex-base.jsonc": { type: "base" },
};
