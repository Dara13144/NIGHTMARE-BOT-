import bcrypt from 'bcryptjs';
import { supabase } from '../src/config/supabase.js';
import { encryptPayload, hashSecret } from '../src/utils/encryption.js';
import { logger } from '../src/utils/logger.js';

async function seed() {
  logger.info('Starting NIGHTMARE STORE database seeding...');

  try {
    // 1. Seed Categories
    const categoriesData = [
      { name: 'Rockstar Codes', slug: 'rockstar-codes', description: 'Authorized Rockstar Games activation keys', display_order: 1, is_active: true },
      { name: 'Rockstar Accounts', slug: 'rockstar-accounts', description: 'Authorized transferable Rockstar accounts', display_order: 2, is_active: true }
    ];

    const { data: categories, error: catErr } = await supabase
      .from('categories')
      .upsert(categoriesData, { onConflict: 'slug' })
      .select();

    if (catErr) logger.warn({ catErr }, 'Categories seed notice');
    logger.info('Categories seeded');

    // 2. Seed Default Admin User
    const adminPasswordHash = await bcrypt.hash('AdminNightmare2026!', 10);
    const { error: adminErr } = await supabase
      .from('admin_users')
      .upsert([{
        username: 'admin',
        email: 'admin@nightmare.store',
        password_hash: adminPasswordHash,
        role: 'superadmin',
        is_active: true
      }], { onConflict: 'username' });

    if (adminErr) logger.warn({ adminErr }, 'Admin user seed notice');
    logger.info('Default admin user seeded (admin / AdminNightmare2026!)');

    // 3. Seed Products
    const productsData = [
      {
        type: 'rockstar_code',
        title: 'Grand Theft Auto V — Premium Edition (PC Key)',
        description: 'Complete GTAV story mode, Grand Theft Auto Online, and Criminal Enterprise Starter Pack with $1,000,000 bonus cash.',
        price: 14.99,
        platform: 'PC / Rockstar Games Launcher',
        region: 'Global',
        features: ['Full Story Mode & GTA Online', 'Criminal Enterprise Pack', 'Instant Digital Delivery', 'Rockstar Launcher Activation'],
        limitations: 'Requires a PC running Windows 10/11 and Rockstar Games Launcher.',
        image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
        is_active: true
      },
      {
        type: 'rockstar_code',
        title: 'Red Dead Redemption 2 — Standard Edition (PC Key)',
        description: 'Winner of over 175 Game of the Year Awards. The epic tale of outlaw Arthur Morgan and the Van der Linde gang.',
        price: 19.99,
        platform: 'PC / Rockstar Games Launcher',
        region: 'Global',
        features: ['Full RDR2 Story Mode', 'Red Dead Online Access', 'Rockstar Social Club Activation', 'Authorized Key'],
        image_url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
        is_active: true
      },
      {
        type: 'rockstar_account',
        title: 'Grand Theft Auto V — Level 120 + $50M Bank Account',
        description: 'Authorized transferable PC Rockstar account with Level 120, maxed stats, luxury apartments, and $50,000,000 in-game bank balance.',
        price: 29.99,
        platform: 'PC',
        region: 'Global',
        features: ['Rank 120 Character', '$50M Legit In-game Bank', 'Clean Non-Banned History', 'Full Email Access Transfer'],
        limitations: 'Email and password should be changed immediately following delivery.',
        image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
        is_active: true
      }
    ];

    for (const prod of productsData) {
      const { data: createdProd, error: prodErr } = await supabase
        .from('products')
        .insert([prod])
        .select()
        .maybeSingle();

      if (createdProd) {
        logger.info({ id: createdProd.id, title: createdProd.title }, 'Seeded product');

        // Seed sample encrypted inventory items
        if (createdProd.type === 'rockstar_code') {
          const sampleCode = 'NMGT-TEST-8492-ROCK';
          const codeHash = hashSecret(sampleCode);
          await supabase.from('code_inventory').insert([{
            product_id: createdProd.id,
            status: 'available',
            code_hash: codeHash,
            encrypted_payload: encryptPayload({ code: sampleCode, added_at: new Date().toISOString() })
          }]);
        } else {
          await supabase.from('account_inventory').insert([{
            product_id: createdProd.id,
            status: 'available',
            encrypted_payload: encryptPayload({
              email: 'nightmare_test_acc@rockstargames.com',
              password: 'SecureTransferPassword99!',
              email_password: 'EmailAccessSecret123!',
              recovery_info: 'Backup recovery code: 99482103'
            })
          }]);
        }
      }
    }

    // 4. Seed Promo Code
    await supabase.from('promotions').upsert([{
      code: 'NIGHTMARE10',
      description: 'Grand opening 10% discount on all Rockstar activation codes & accounts',
      discount_percent: 10.0,
      max_uses: 100,
      is_active: true
    }], { onConflict: 'code' });

    logger.info('Database seeding completed successfully!');
  } catch (err) {
    logger.error({ err }, 'Error during database seed');
  }
}

seed().then(() => process.exit(0)).catch(() => process.exit(1));
