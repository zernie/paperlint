/**
 * Why a row's study folder may not be entered, and how a message says it: a decision and its wording
 * in the paper's vocabulary (`StudyFolder.refusal` in `src/ports/study-folder.ts` makes the decision).
 */
import { REPRO_DIR } from "./repro-layout.ts";

/** Why a row's folder may not be entered: it is no one folder inside `repro/`, or it is a link. */
export type FolderRefusal = "not-a-folder" | "symbolic-link";

/** What a refusal says of the folder a row names: `which <reason>`, and the fix without its full stop. */
export const folderRefusalText = (
  why: FolderRefusal,
  shown: string,
): { readonly reason: string; readonly fix: string } =>
  why === "not-a-folder"
    ? {
        reason: `is not one folder inside ${shown}/${REPRO_DIR}/`,
        fix: "Give the row its own folder's name",
      }
    : {
        reason: "is a symbolic link",
        fix: `Give the row a real folder inside ${shown}/${REPRO_DIR}/`,
      };
