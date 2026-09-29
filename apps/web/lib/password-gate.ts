// Middleware caches a passed password-setup check in this cookie (value = the
// user id). Having a password is one-way, so a cached "passed" can't go stale
// in a way that lets someone skip setup.
export const PW_OK_COOKIE = "cs_pw_ok";

export function needsPasswordCheck(cookieValue: string | undefined, userId: string): boolean {
  return cookieValue !== userId;
}
