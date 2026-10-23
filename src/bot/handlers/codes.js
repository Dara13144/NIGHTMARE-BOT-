import { handleProducts } from './products.js';

export async function handleCodes(ctx) {
  return handleProducts(ctx, 'codes', 1);
}
