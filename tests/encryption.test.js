import { describe, it, expect } from 'vitest';
import { encryptPayload, decryptPayload, hashSecret } from '../src/utils/encryption.js';

describe('Encryption & Hashing Utilities', () => {
  it('encrypts and decrypts an object payload successfully using AES-256-GCM', () => {
    const payload = {
      email: 'gamer@example.com',
      password: 'SuperSecretPassword123!',
      recovery_code: '99482103'
    };

    const cipherText = encryptPayload(payload);
    expect(cipherText).toBeDefined();
    expect(cipherText.split(':')).toHaveLength(3); // iv:tag:cipher

    const decrypted = decryptPayload(cipherText);
    expect(decrypted).toEqual(payload);
  });

  it('fails decryption if cipherText is tampered with', () => {
    const cipherText = encryptPayload('SecretGameCode1234');
    const parts = cipherText.split(':');
    // Tamper with the ciphertext byte
    const tamperedCipher = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -2) + 'ff';

    expect(() => decryptPayload(tamperedCipher)).toThrow();
  });

  it('computes deterministic SHA-256 hash for codes regardless of whitespace or casing', () => {
    const code1 = 'nmgt-test-8492-rock';
    const code2 = '  NMGT-TEST-8492-ROCK  ';

    const hash1 = hashSecret(code1);
    const hash2 = hashSecret(code2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
