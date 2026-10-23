import { Router } from 'express';
import { OrderService } from '../services/order.service.js';
import { DeliveryService } from '../services/delivery.service.js';
import { requireAuth } from '../middleware/auth.js';

export const orderRoutes = Router();

// Admin: List orders
orderRoutes.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query;
    const result = await OrderService.getAllOrders({
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Admin: Get single order
orderRoutes.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const order = await OrderService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

// Admin: Retry delivery for failed delivery order
orderRoutes.post('/:id/retry-delivery', requireAuth, async (req, res, next) => {
  try {
    const result = await DeliveryService.retryDelivery(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
