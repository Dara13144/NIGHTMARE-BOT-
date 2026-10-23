import { handleProducts } from './products.js';

export async function handleAccounts(ctx) {
  return handleProducts(ctx, 'accounts', 1);
}
