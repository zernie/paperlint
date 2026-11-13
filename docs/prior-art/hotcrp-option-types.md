# HotCRP's submission-form field types, and which ones `submission_fields` can carry

**Question this file answers:** which kinds of field can a HotCRP submission form hold, what JSON
does the paper API take for each, and which of them does a venue preset's `submission_fields` (and a
paper's `fields`) support? Issue #411 hit a required "Submission Type" field that no kind could
carry.

**Read from** `github.com/kohler/hotcrp`, branch `master`, commit
`0c03b263e3b401d6464eef9b0189333a654a8d32` (committed 2026-11-12), by cloning it and reading the
files below. Nothing was sent to any portal.

| source file                                                  | what it settles                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `etc/optiontypes.json`                                       | the list of option types (`name`) and the class that implements each                                                                                                                                              |
| `etc/submissionfieldlibrary.json`                            | the types the settings page offers to add, with a sample each                                                                                                                                                     |
| `src/paperoption.php`                                        | `parse_json_user` of `Checkbox`, `Selector`, `Document`, `Text`; the `required` levels (`REQ_NO`, `REQ_SUBMIT`, `REQ_REGISTER`, lines 162-173) and the message «Entry required to complete submission» (line 784) |
| `src/options/o_checkboxesbase.php`                           | `parse_json_user` of the topic and checkbox-list options                                                                                                                                                          |
| `src/options/o_numeric.php`, `o_realnumber.php`              | whole and decimal numbers, `min_value` / `max_value` checks                                                                                                                                                       |
| `src/options/o_pcconflicts.php`                              | `parse_json_user` of PC conflicts                                                                                                                                                                                 |
| `src/options/o_attachments.php`, `o_authorcertification.php` | attachments; the author certification                                                                                                                                                                             |
| `devel/apidoc/submissions.md`                                | `POST /paper`: the submission object, `dry_run`, uploads                                                                                                                                                          |

## The types (`etc/optiontypes.json`, verbatim `name` → class)

| `name`                      | class                             | JSON the API takes (`parse_json_user`)                                                                                                                                   | settable by an author's token                             |
| --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `checkbox`                  | `Checkbox_PaperOption`            | `true`, `false` or `null`; anything else: «Option should be ‘true’ or ‘false’»                                                                                           | yes                                                       |
| `dropdown`                  | `Selector_PaperOption`            | a string equal to one of the `values`, or the 1-based integer index; `null` or `0` clears; else «Value doesn’t match any of the options»                                 | yes                                                       |
| `radio`                     | `Selector_PaperOption`            | the same as `dropdown` (the class tests `type === "dropdown"` only to draw the control)                                                                                  | yes                                                       |
| `checkboxes`                | `Checkboxes_PaperOption`          | a list of option names (or integer ids); an object of name → `true`; a single string; `false` clears; else «Validation error»; a name not in the list is kept as nothing | yes                                                       |
| `numeric`                   | `Numeric_PaperOption`             | a JSON integer (`is_int`), within `min_value` / `max_value`; `null` or `false` clears; else «Whole number required»                                                      | yes                                                       |
| `realnumber`                | `RealNumber_PaperOption`          | a JSON integer or float, within `min_value` / `max_value`, rounded to `precision`; `null` or `false` clears; else «Number required»                                      | yes                                                       |
| `text`                      | `Text_PaperOption`                | a string (`parse_json_string`); `null` leaves it; a non-string: «Expected string»; `wordlimit` / `hard_wordlimit` apply                                                  | yes                                                       |
| `mtext`                     | `Text_PaperOption`                | the same as `text` (only `display_space`, the rows drawn, differs)                                                                                                       | yes                                                       |
| `pdf`, `slides`, `document` | `Document_PaperOption`            | an object with `content_file` (the name of a multipart file part), `content` or `content_base64`, optionally `hash`; `false` clears                                      | yes, but needs a file upload                              |
| `attachments`               | `Attachments_PaperOption`         | one such document object or a list of them (at most `MAX_PARSE_COUNT` for a non-chair)                                                                                   | yes, but needs file uploads                               |
| `topics`                    | `Topics_PaperOption`              | the same as `checkboxes`, over the conference's global topic list; a name written without its group is kept as nothing                                                   | yes                                                       |
| `author_certification`      | `AuthorCertification_PaperOption` | a list of entries `{ "email", "value" }` (or bare emails); `authorlike: true` in `optiontypes.json`                                                                      | the API takes it, but it is each author's own attestation |
| `separator`                 | `Separator_PaperOption`           | none: a section heading, `only-form`, holds no value                                                                                                                     | nothing to set                                            |

**Intrinsic options, not in `optiontypes.json`:** `pc_conflicts` (`src/options/o_pcconflicts.php`)
takes an object of PC member email → `true`, a conflict-type number or a conflict-type name (else
«Invalid conflict type»), or a bare list of emails (each `true`; a non-string entry: «Validation
error»). The title, abstract, authors and the PDF are intrinsic too, and paperlint sends them itself.

**There is no date type.** `etc/optiontypes.json` and `etc/submissionfieldlibrary.json` list none; a
date is a `text` field.

**Is a field "required"?** `required` is `false`, `"submit"` (`REQ_SUBMIT`) or anything else true
(`REQ_REGISTER`) (`src/paperoption.php`, lines 166-173). A missing `"submit"` field is only a
**warning** while the paper is a draft («Entry required to complete submission», line 784), so the
portal accepts the creation and keeps the paper a draft — what #411 measured. A missing
`REQ_REGISTER` field is an error: «Entry required». A preset's `"required": true` stands for both.

## What `submission_fields` carries

| paperlint kind            | HotCRP type(s)                                        | the paper's value (`fields`)                       | notes                                                                                           |
| ------------------------- | ----------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `checkbox`                | `checkbox`                                            | `true` / `false`                                   | a required one must be `true` (an attestation)                                                  |
| `choice`                  | `dropdown`, `radio`                                   | one of `options`, spelled as listed                | the integer index the API also takes is not accepted: a position drifts when the form is edited |
| `checkboxes`              | `checkboxes`, `topics`                                | a list of `options`, none twice                    | as before                                                                                       |
| `integer`                 | `numeric`                                             | a whole number, within `min` / `max`               |                                                                                                 |
| `number`                  | `realnumber`                                          | a number, within `min` / `max`                     | HotCRP rounds to its `precision`; paperlint does not check it                                   |
| `text`                    | `text`                                                | a string                                           | word limits are not recorded                                                                    |
| `multiline_text`          | `mtext`                                               | a string, line breaks kept                         |                                                                                                 |
| `email`                   | an author selector the API takes by an author's email | an email address                                   | measured on `msr` (`ACMCorAut`, 2026-10-20); not a type in `optiontypes.json`                   |
| `pc_conflicts`            | the intrinsic PC-conflicts option                     | PC member's email → `true` or a conflict-type name | as before                                                                                       |
| `document`, `attachments` | `pdf`, `slides`, `document`; `attachments`            | none: **paperlint does not send files for them**   | recorded so the preset says the form has them; the command lists them under "on the site"       |

**Not supported, and why**

- **File uploads** (`pdf`, `slides`, `document`, `attachments`). The API takes them (a multipart
  file part named by `content_file`), but sending one needs the paper to name more files, the port
  to read them and the adapter to add parts beside the PDF — a change of its own. Until then the
  preset may declare the field (`document`, `attachments`) and the command says it stays on the site.
- **`author_certification`.** It is every author's own attestation; a tool that sets it on their
  behalf attests for them.
- **`separator`.** It holds no value.
- **A date.** HotCRP has no such type.
- **An integer index for a choice, a number-keyed topic id.** A position changes when the form is
  edited; a name does not.
