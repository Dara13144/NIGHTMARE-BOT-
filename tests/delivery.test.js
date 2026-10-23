import { describe, it, expect } from 'vitest';
import { supabase } from '../src/config/supabase.js';
import { ProductService } from '../src/services/product.service.js';
import { InventoryService } from '../src/services/inventory.service.js';
import { OrderService } from '../src/services/order.service.js';
import { WalletService } from '../src/services/wallet.service.js';
import { DeliveryService } from '../src/services/delivery.service.js';
import { NotificationService } from '../src/services/notification.service.js';

describe('Automatic Delivery System (Rockstar Codes & Accounts)', () => {
  const testTelegramId = 999111222333;
  let sentMessages = [];

  // Mock NotificationService.sendTelegram to intercept delivered messages
  NotificationService.sendTelegram = async (chatId, text, options) => {
    sentMessages.push({ chatId, text, options });
    return { success: true, messageId: Date.now() };
  };

  it('automatically delivers Rockstar Code with 1-tap copyable key and redemption steps upon purchase', async () => {
    sentMessages = [];
    const uid = Date.now();
    const testProdId = `prod-code-${uid}`;
    const testCode = `ROCKSTAR-KEY-${uid}-TEST`;

    // 1. Create dedicated product
    await ProductService.createProduct({
      id: testProdId,
      title: 'Grand Theft Auto V — PC Activation Key',
      price: 14.99,
      type: 'rockstar_code',
      is_active: true
    });

    // 2. Add Code to inventory
    const addedCode = await InventoryService.addCodeItem({
      product_id: testProdId,
      code: testCode
    });
    expect(addedCode.id).toBeDefined();

    // 3. Fund user wallet
    await WalletService.adminAdjustBalance({
      telegramId: testTelegramId,
      amount: 100.00,
      reason: 'Delivery Test Code Fund'
    });

    // 4. Create Order
    const { order, product } = await OrderService.createOrder({
      telegramId: testTelegramId,
      productId: testProdId
    });
    expect(order.id).toBeDefined();
    expect(order.status).toBe('pending');

    // 5. Pay with wallet (which triggers instant automatic delivery)
    const payResult = await WalletService.payWithBalance({
      telegramId: testTelegramId,
      orderId: order.id
    });
    expect(payResult.success).toBe(true);

    // 6. Verify order is now marked delivered in database
    const updatedOrder = await OrderService.getOrderById(order.id);
    expect(updatedOrder.status).toBe('delivered');
    expect(updatedOrder.delivered_at).toBeDefined();

    // 7. Verify inventory item is now permanently marked sold
    const { data: invCode } = await supabase
      .from('code_inventory')
      .select('status, sold_at')
      .eq('id', addedCode.id)
      .single();
    expect(invCode.status).toBe('sold');
    expect(invCode.sold_at).toBeDefined();

    // 8. Verify intercepted Telegram message delivered to customer
    expect(sentMessages.length).toBeGreaterThan(0);
    const deliveryMsg = sentMessages.find(m => m.text.includes(testCode));
    expect(deliveryMsg).toBeDefined();
    expect(deliveryMsg.chatId).toBe(testTelegramId);
    expect(deliveryMsg.text).toContain('DIGITAL DELIVERY SUCCESSFUL');
    expect(deliveryMsg.text).toContain(`<code>${testCode}</code>`);
    expect(deliveryMsg.text).toContain('Rockstar Games Launcher');
    expect(deliveryMsg.text).toContain('Redeem Code');
    expect(deliveryMsg.options?.reply_markup?.inline_keyboard).toBeDefined();
  });

  it('automatically delivers Rockstar Account with 1-tap copyable credentials and security steps upon purchase', async () => {
    sentMessages = [];
    const uid = Date.now();
    const testProdId = `prod-acc-${uid}`;
    const testEmail = `gta_acc_${uid}@rockstar.store`;
    const testPass = `MegaPass_${uid}!`;
    const testMailPass = `MailPass_${uid}!`;

    // 1. Create dedicated product
    await ProductService.createProduct({
      id: testProdId,
      title: 'Grand Theft Auto V — Level 120 + $50M',
      price: 24.99,
      type: 'rockstar_account',
      is_active: true
    });

    // 2. Add Rockstar Account to inventory
    const addedAcc = await InventoryService.addAccountItem({
      product_id: testProdId,
      email: testEmail,
      password: testPass,
      email_password: testMailPass,
      recovery_info: 'Clean / First Mail / Level 120 / $50M',
      notes: 'FiveM Ready'
    });
    expect(addedAcc.id).toBeDefined();

    // 3. Create Order
    const { order } = await OrderService.createOrder({
      telegramId: testTelegramId,
      productId: testProdId
    });
    expect(order.id).toBeDefined();

    // 4. Pay with wallet
    const payResult = await WalletService.payWithBalance({
      telegramId: testTelegramId,
      orderId: order.id
    });
    expect(payResult.success).toBe(true);

    // 5. Verify order is delivered
    const updatedOrder = await OrderService.getOrderById(order.id);
    expect(updatedOrder.status).toBe('delivered');

    // 6. Verify account inventory marked sold
    const { data: invAcc } = await supabase
      .from('account_inventory')
      .select('status, sold_at')
      .eq('id', addedAcc.id)
      .single();
    expect(invAcc.status).toBe('sold');
    expect(invAcc.sold_at).toBeDefined();

    // 7. Verify Telegram message contents
    const deliveryMsg = sentMessages.find(m => m.text.includes(testEmail));
    expect(deliveryMsg).toBeDefined();
    expect(deliveryMsg.chatId).toBe(testTelegramId);
    expect(deliveryMsg.text).toContain('DIGITAL DELIVERY SUCCESSFUL');
    expect(deliveryMsg.text).toContain(`<code>${testEmail}</code>`);
    expect(deliveryMsg.text).toContain(`<code>${testPass}</code>`);
    expect(deliveryMsg.text).toContain(`<code>${testMailPass}</code>`);
    expect(deliveryMsg.text).toContain('Clean / First Mail / Level 120 / $50M');
    expect(deliveryMsg.text).toContain('socialclub.rockstargames.com');
    expect(deliveryMsg.text).toContain('2-Step Verification (2FA)');

    // 8. Verify customer can retrieve their delivered credentials anytime from order history
    const pastMessages = await DeliveryService.getOrderDeliveryMessages(order.id, testTelegramId);
    expect(pastMessages).toBeDefined();
    expect(pastMessages.length).toBeGreaterThan(0);
    expect(pastMessages[0]).toContain(testEmail);
    expect(pastMessages[0]).toContain(testPass);
  });
});
