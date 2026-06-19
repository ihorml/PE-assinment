// Reads email + merchant-client-id from the URL.
//
// The shop's link can carry these as GET parameters. When the
// merchant-client-id arrives this way it's an internal id the user shouldn't
// see or edit, so we hide that field (see `merchantClientIdLocked`).

export type Prefill = {
  email: string
  merchantClientId: string
  // True when the id came from the URL → hide the field from the user.
  merchantClientIdLocked: boolean
}

export function readPrefill(): Prefill {
  const params = new URLSearchParams(window.location.search)
  const merchantClientId =
    params.get('merchant_client_id') ?? params.get('mcid') ?? ''

  return {
    email: params.get('email') ?? '',
    merchantClientId,
    merchantClientIdLocked: merchantClientId.trim() !== '',
  }
}
