// Clean: every answer to *where* comes from the port.
import { consumerRoot } from "../../skills/paper-pipeline/scripts/consumer.mjs";
export const LEDGER = (env, cwd) => `${consumerRoot({ env, cwd })}/runs.jsonl`;
