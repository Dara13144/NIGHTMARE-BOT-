import { Router } from 'express';
import { ProductService } from '../services/product.service.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, productSchema } from '../utils/validation.js';

export const productRoutes = Router();

// Public: Get all active products
productRoutes.get('/', async (req, res, next) => {
  try {
    const products = await ProductService.getProducts({ is_active: true });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// Public: Get single product
productRoutes.get('/:id', async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Admin: Create product
productRoutes.post('/', requireAuth, async (req, res, next) => {
  try {
    const validation = validate(productSchema, req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const created = await ProductService.createProduct(validation.data);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Admin: Update product
productRoutes.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const validation = validate(productSchema.partial(), req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const updated = await ProductService.updateProduct(req.params.id, validation.data);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Admin: Delete product
productRoutes.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await ProductService.deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
