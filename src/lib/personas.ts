import { MAX_ACTIVE_PERSONAS } from "./constants";

export const PERSONA_LIMIT_MESSAGE = `You can have at most ${MAX_ACTIVE_PERSONAS} active personas. Switch one off first.`;

/** Can one more persona be switched on? */
export function canActivateAnother(activeCount: number): boolean {
  return activeCount < MAX_ACTIVE_PERSONAS;
}

/** New personas start active only while there is room; otherwise they're saved switched off. */
export function activeStateForNewPersona(activeCount: number): boolean {
  return canActivateAnother(activeCount);
}

/** Postgres "check_violation" — raised by the database trigger when the limit is hit. */
export function isPersonaLimitError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23514";
}
