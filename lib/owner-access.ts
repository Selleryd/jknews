// Platform identity, never a browser-supplied identity claim.
export const OWNER_ACCOUNT_ID = '594336d6-dc2d-44dc-8b7c-be2aa7391c7c';
export function isOwnerIdentity(id: string | null | undefined, email: string | null | undefined, configuredEmail: string | null | undefined) {
  return id === OWNER_ACCOUNT_ID && !!configuredEmail?.trim() && email?.trim().toLowerCase() === configuredEmail.trim().toLowerCase();
}
