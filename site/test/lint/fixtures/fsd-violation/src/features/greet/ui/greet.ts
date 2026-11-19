// PLANTED: a deep import past the user slice's index.ts, its public API.
import { userName } from "../../../entities/user/model/user.ts";

export const greet = (name: string): string => `hello, ${userName(name)}`;
