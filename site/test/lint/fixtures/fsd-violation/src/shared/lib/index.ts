// PLANTED: Shared, the lowest layer, imports from Entities, a layer above it.
import { userName } from "../../entities/user/index.ts";

export const shout = (s: string): string => s.toUpperCase();
export const admin = (): string => userName("admin");
