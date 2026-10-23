import { describe, it, expect } from 'vitest';
import { validate, productSchema, adminLoginSchema, codeItemSchema, accountItemSchema } from '../src/utils/validation.js';

describe('Zod Input Validation', () => {
  it('validates a valid Rockstar product', () => {
    const validProduct = {
      type: 'rockstar_code',
      title: 'Grand Theft Auto V',
      price: 14.99,
      platform: 'PC',
      region: 'Global',
      features: ['Story Mode', 'Online Access']
    };

    const result = validate(productSchema, validProduct);
    expect(result.success).toBe(true);
    expect(result.data.title).toBe('Grand Theft Auto V');
  });

  it('rejects a product with a negative price', () => {
    const invalidProduct = {
      type: 'rockstar_code',
      title: 'Invalid Product',
      price: -5.00
    };

    const result = validate(productSchema, invalidProduct);
    expect(result.success).toBe(false);
  });

  it('validates admin login credentials correctly', () => {
    const validLogin = { username: 'admin', password: 'SecretPassword123' };
    const invalidLogin = { username: 'a', password: '12' }; // too short

    expect(validate(adminLoginSchema, validLogin).success).toBe(true);
    expect(validate(adminLoginSchema, invalidLogin).success).toBe(false);
  });

  it('validates account inventory item structure', () => {
    const validAccount = {
      product_id: 'a0000000-0000-0000-0000-000000000001',
      email: 'rockstar@example.com',
      password: 'SecurePassword123!'
    };

    expect(validate(accountItemSchema, validAccount).success).toBe(true);
  });
});
