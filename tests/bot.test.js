import { describe, it, expect, beforeAll } from 'vitest';
import { escapeHtml, t, messages } from '../src/utils/telegram.js';
import { getMainMenuKeyboard, getProductDetailKeyboard, getProductListKeyboard } from '../src/bot/keyboards.js';

describe('Telegram Bot UI & Security', () => {
  beforeAll(async () => {
    const { supabase } = await import('../src/config/supabase.js');
    await supabase.from('products').upsert([
      {
        id: 'prod-01',
        title: 'Grand Theft Auto V — Premium Edition (PC Key)',
        type: 'rockstar_code',
        description: 'Complete GTAV story mode and Rockstar Launcher Activation Key.',
        price: 14.99,
        platform: 'PC / Rockstar Games Launcher',
        region: 'Global',
        is_active: true
      },
      {
        id: 'prod-03',
        title: 'Rockstar account',
        type: 'rockstar_account',
        description: 'Full access transferable account.',
        price: 4.50,
        platform: 'PC',
        region: 'Global',
        is_active: true
      }
    ], { onConflict: 'id' });
  });
  it('safely escapes HTML in user-supplied strings to prevent markup injection', () => {
    const maliciousInput = '<script>alert("hack")</script> & <b>bold</b> "quotes"';
    const escaped = escapeHtml(maliciousInput);

    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
    expect(escaped).toContain('&amp;');
    expect(escaped).toContain('&quot;');
  });

  it('provides complete Khmer and English translations for critical shop keys', () => {
    expect(messages.km.welcome).toBeDefined();
    expect(messages.en.welcome).toBeDefined();
    expect(t('km', 'btn_shop')).toBe('🛒 ទិញទំនិញ');
    expect(t('en', 'btn_shop')).toBe('🛒 Shop Products');
  });

  it('builds valid Telegram inline keyboards with functional callback buttons', () => {
    const menuKb = getMainMenuKeyboard('km');
    expect(menuKb.reply_markup.inline_keyboard.length).toBeGreaterThanOrEqual(4);

    const detailKb = getProductDetailKeyboard('prod-123', true, 'km');
    expect(detailKb.reply_markup.inline_keyboard[0][0].callback_data).toBe('buy_prod_prod-123');
  });

  it('correctly identifies admin users and shows admin dashboard button', async () => {
    const { isAdmin } = await import('../src/bot/handlers/admin.js');
    const { getPersistentReplyKeyboard } = await import('../src/bot/keyboards.js');

    expect(isAdmin(8361673413)).toBe(true);
    expect(isAdmin(9999999999)).toBe(false);

    const adminKb = getPersistentReplyKeyboard('km', true);
    const userKb = getPersistentReplyKeyboard('km', false);

    const adminHasButton = adminKb.reply_markup.keyboard.some(row => row.some(btn => btn.text.includes('Admin Dashboard')));
    const userHasButton = userKb.reply_markup.keyboard.some(row => row.some(btn => btn.text.includes('Admin Dashboard')));

    expect(adminHasButton).toBe(true);
    expect(userHasButton).toBe(false);
  });

  it('allows adding and encrypting Rockstar codes and accounts into inventory', async () => {
    const { InventoryService } = await import('../src/services/inventory.service.js');
    const { supabase } = await import('../src/config/supabase.js');

    const testCode = `TEST-CODE-${Date.now()}`;
    const addedCode = await InventoryService.addCodeItem({
      product_id: 'prod-01',
      code: testCode
    });

    expect(addedCode.id).toBeDefined();
    expect(addedCode.status).toBe('available');

    const addedAccount = await InventoryService.addAccountItem({
      product_id: 'prod-03',
      email: `test-${Date.now()}@rockstar.store`,
      password: 'StrongPassword123!',
      recovery_info: 'recovery@rockstar.store',
      notes: 'Test Account'
    });

    expect(addedAccount.id).toBeDefined();
    expect(addedAccount.status).toBe('available');
  });

  it('handles admin slash commands /addcode and /addaccount', async () => {
    const { handleAddCodeCommand, handleAddAccountCommand, handleBulkCodesCommand } = await import('../src/bot/handlers/admin.js');

    let replyMessage = '';
    const uid = Date.now();
    const mockCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      message: { text: `/addcode prod-01 ROCK-${uid}-CODE` },
      reply: (text) => { replyMessage = text; return Promise.resolve({ text }); }
    };

    await handleAddCodeCommand(mockCtx);
    expect(replyMessage).toContain('Code Added Successfully');

    mockCtx.message.text = `/bulkcodes prod-01 BULK-A-${uid}, BULK-B-${uid}`;
    await handleBulkCodesCommand(mockCtx);
    expect(replyMessage).toContain('Bulk Import Complete');

    mockCtx.message.text = `/addaccount prod-03 user_${uid}@test.com SuperSecretPass123!`;
    await handleAddAccountCommand(mockCtx);
    expect(replyMessage).toContain('Rockstar Account Added Successfully');
  });

  it('provides product editor interface for admins and supports price/title editing', async () => {
    const { getProductDetailKeyboard } = await import('../src/bot/keyboards.js');
    const { handleEditPriceCommand, handleEditTitleCommand } = await import('../src/bot/handlers/admin.js');
    const { ProductService } = await import('../src/services/product.service.js');

    // Admin detail keyboard has edit button, buyer keyboard does not
    const userDetail = getProductDetailKeyboard('prod-01', true, 'km', false);
    const hasAdminEditBtnUser = userDetail.reply_markup.inline_keyboard.some(row => row.some(b => b.callback_data?.includes('admin_edit_prod')));
    expect(hasAdminEditBtnUser).toBe(false);

    const adminDetail = getProductDetailKeyboard('prod-01', true, 'km', true);
    const hasAdminEditBtnAdmin = adminDetail.reply_markup.inline_keyboard.some(row => row.some(b => b.callback_data === 'admin_edit_prod_prod-01'));
    expect(hasAdminEditBtnAdmin).toBe(true);

    // Test /editprice command
    let replyMsg = '';
    const mockCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      message: { text: '/editprice prod-01 16.99' },
      reply: (text) => { replyMsg = text; return Promise.resolve({ text }); }
    };

    await handleEditPriceCommand(mockCtx);
    expect(replyMsg).toContain('Product Price Updated');
    expect(replyMsg).toContain('16.99');

    const updatedProd = await ProductService.getProductById('prod-01');
    expect(Number(updatedProd.price)).toBe(16.99);

    // Test /edittitle command
    mockCtx.message.text = '/edittitle prod-01 Grand Theft Auto V Premium (PC Edition)';
    await handleEditTitleCommand(mockCtx);
    expect(replyMsg).toContain('Product Title Updated');

    const updatedProdTitle = await ProductService.getProductById('prod-01');
    expect(updatedProdTitle.title).toBe('Grand Theft Auto V Premium (PC Edition)');
  });

  it('supports permanent product and inventory code deletion via admin handlers', async () => {
    const { ProductService } = await import('../src/services/product.service.js');
    const { InventoryService } = await import('../src/services/inventory.service.js');
    const { handleAdminPromptDeleteProduct, handleAdminConfirmDeleteProduct, handleDeleteCodeCommand } = await import('../src/bot/handlers/admin.js');

    // 1. Create a dummy product for deletion test
    const dummyProduct = await ProductService.createProduct({
      id: 'prod-delete-test',
      title: 'Temporary Product For Deletion',
      price: 9.99,
      type: 'rockstar_code',
      is_active: true
    });
    expect(dummyProduct.id).toBe('prod-delete-test');

    // 2. Prompt deletion
    let promptMsg = '';
    let promptKb = null;
    const promptCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      reply: (text, extra) => { promptMsg = text; promptKb = extra; return Promise.resolve({ text }); }
    };
    await handleAdminPromptDeleteProduct(promptCtx, 'prod-delete-test');
    expect(promptMsg).toContain('CONFIRM PERMANENT PRODUCT DELETION');
    expect(promptKb.reply_markup.inline_keyboard[0][0].callback_data).toBe('admin_delete_prod_confirm_prod-delete-test');

    // 3. Confirm deletion
    let confirmMsg = '';
    const confirmCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      reply: (text) => { confirmMsg = text; return Promise.resolve({ text }); }
    };
    await handleAdminConfirmDeleteProduct(confirmCtx, 'prod-delete-test');
    expect(confirmMsg).toContain('PRODUCT PERMANENTLY DELETED');

    const checkDeleted = await ProductService.getProductById('prod-delete-test');
    expect(checkDeleted).toBeNull();

    // 4. Test code deletion
    const testCode = `DEL-CODE-${Date.now()}`;
    await InventoryService.addCodeItem({ product_id: 'prod-01', code: testCode });

    let delCodeMsg = '';
    const delCodeCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      message: { text: `/deletecode ${testCode}` },
      reply: (text) => { delCodeMsg = text; return Promise.resolve({ text }); }
    };
    await handleDeleteCodeCommand(delCodeCtx);
    expect(delCodeMsg).toContain('Code Deleted Successfully');
  });

  it('adds stock for Rockstar accounts and codes and shows real-time stock on bot', async () => {
    const {
      handleAdminStock,
      handleAdminTextInput,
      adminInputState
    } = await import('../src/bot/handlers/admin.js');
    const { InventoryService } = await import('../src/services/inventory.service.js');
    const { ProductService } = await import('../src/services/product.service.js');

    // 1. Check handleAdminStock reports live inventory
    let stockMsg = '';
    let stockExtra = null;
    const stockCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      reply: (text, extra) => { stockMsg = text; stockExtra = extra; return Promise.resolve({ text }); }
    };
    await handleAdminStock(stockCtx);
    expect(stockMsg).toContain('REAL-TIME INVENTORY & STOCK REPORT');
    expect(stockMsg).toContain('Rockstar Accounts');
    expect(stockMsg).toContain('Rockstar Codes');
    expect(stockExtra.reply_markup.inline_keyboard.length).toBeGreaterThanOrEqual(3);

    // 2. Add Code via interactive state
    adminInputState.set(8361673413, {
      action: 'awaiting_code',
      productId: 'prod-01',
      title: 'Grand Theft Auto V PC Key'
    });
    const newCode = `LIVE-TEST-${Date.now()}`;
    let addCodeReply = '';
    const codeInputCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      message: { text: newCode },
      reply: (text) => { addCodeReply = text; return Promise.resolve({ text }); }
    };
    await handleAdminTextInput(codeInputCtx);
    expect(addCodeReply).toContain('ROCKSTAR CODE ADDED');

    // 3. Add Account via interactive state
    adminInputState.set(8361673413, {
      action: 'awaiting_account',
      productId: 'prod-03',
      title: 'GTA V Level 120 Account'
    });
    const newEmail = `user${Date.now()}@rockstar.test`;
    let addAccReply = '';
    const accInputCtx = {
      from: { id: 8361673413, first_name: 'Admin' },
      message: { text: `${newEmail}:SecretPass123:recovery@test.com` },
      reply: (text) => { addAccReply = text; return Promise.resolve({ text }); }
    };
    await handleAdminTextInput(accInputCtx);
    expect(addAccReply).toContain('ROCKSTAR ACCOUNT(S) ADDED');
    expect(addAccReply).toContain('Successfully Added: <b>1 accounts</b>');

    // Verify stock count increased
    const updatedProd = await ProductService.getProductById('prod-03');
    expect(updatedProd.stock).toBeGreaterThanOrEqual(1);
  });
});



