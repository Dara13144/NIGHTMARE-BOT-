import { describe, it, expect, beforeEach } from 'vitest';
import { WalletService } from '../src/services/wallet.service.js';
import { supabase } from '../src/config/supabase.js';

describe('WalletService', () => {
  const testTelegramId = 8361673413;

  beforeEach(async () => {
    // Ensure profile exists with $0 balance
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', testTelegramId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('profiles').insert([{
        telegram_id: testTelegramId,
        first_name: 'Test',
        username: 'darazzdev',
        balance: 0.00
      }]);
    } else {
      await supabase.from('profiles').update({ balance: 0.00 }).eq('telegram_id', testTelegramId);
    }
  });

  it('retrieves initial zero balance', async () => {
    const balance = await WalletService.getBalance(testTelegramId);
    expect(balance).toBe(0.00);
  });

  it('creates a top-up session with reference and amount', async () => {
    const session = await WalletService.createTopupSession({
      telegramId: testTelegramId,
      amount: 5.00
    });

    expect(session.topupRef).toMatch(/^TOPUP-\d+-[A-F0-9]+/);
    expect(session.amount).toBe(5.00);
    expect(session.checkoutUrl).toBeDefined();
  });

  it('finalizes top-up and credits customer balance atomically', async () => {
    const session = await WalletService.createTopupSession({
      telegramId: testTelegramId,
      amount: 10.00
    });

    const finalizeResult = await WalletService.finalizeTopup(session.topupRef, 10.00);
    expect(finalizeResult.success).toBe(true);

    const newBalance = await WalletService.getBalance(testTelegramId);
    expect(newBalance).toBe(10.00);
  });

  it('admin can adjust balance up and down', async () => {
    await WalletService.adminAdjustBalance({
      telegramId: testTelegramId,
      amount: 25.50,
      reason: 'Test Promotion'
    });

    let balance = await WalletService.getBalance(testTelegramId);
    expect(balance).toBe(25.50);

    await WalletService.adminAdjustBalance({
      telegramId: testTelegramId,
      amount: -5.50,
      reason: 'Test Deduction'
    });

    balance = await WalletService.getBalance(testTelegramId);
    expect(balance).toBe(20.00);
  });
});
