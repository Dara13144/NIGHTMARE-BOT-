import { z } from 'zod';

export const adminLoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100)
});

export const productSchema = z.object({
  category_id: z.string().uuid().optional().nullable(),
  type: z.enum(['rockstar_account', 'rockstar_code']),
  title: z.string().min(2).max(150),
  description: z.string().optional().default(''),
  price: z.coerce.number().positive(),
  currency: z.string().default('USD'),
  platform: z.string().default('PC'),
  region: z.string().default('Global'),
  features: z.array(z.string()).optional().default([]),
  limitations: z.string().optional().default(''),
  image_url: z.string().url().or(z.string().startsWith('/')).optional().nullable(),
  is_active: z.boolean().default(true)
});

export const accountItemSchema = z.object({
  product_id: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(4),
  email_password: z.string().optional(),
  recovery_info: z.string().optional(),
  notes: z.string().optional()
});

export const codeItemSchema = z.object({
  product_id: z.string().uuid(),
  code: z.string().min(4).max(64)
});

export const bulkCodeSchema = z.object({
  product_id: z.string().uuid(),
  codes: z.array(z.string().min(4).max(64)).nonempty()
});

export const supportTicketSchema = z.object({
  telegram_id: z.coerce.number().positive(),
  subject: z.string().min(3).max(150),
  message: z.string().min(5).max(2000)
});

export const promotionSchema = z.object({
  code: z.string().min(2).max(30).toUpperCase(),
  description: z.string().optional(),
  discount_percent: z.coerce.number().min(0.1).max(100),
  max_uses: z.coerce.number().int().positive().optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
  is_active: z.boolean().default(true)
});

/**
 * Validates data against a Zod schema safely
 * @param {z.ZodSchema} schema 
 * @param {unknown} data 
 * @returns {{ success: boolean, data?: any, error?: string }}
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorMsg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { success: false, error: errorMsg };
  }
  return { success: true, data: result.data };
}
