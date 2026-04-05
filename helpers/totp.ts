import * as OTPAuth from 'otpauth';

/**
 * Generiert den aktuellen TOTP-Code aus dem Secret Key.
 * Den Secret Key bekommst du einmalig beim Einrichten der Authenticator-App
 * (als Base32-String, z.B. "JBSWY3DPEHPK3PXP").
 */
export function generateTOTP(secret: string): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}
