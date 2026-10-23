import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export async function userMiddleware(ctx, next) {
  if (!ctx.from) return next();

  const telegramId = ctx.from.id;
  const username = ctx.from.username || null;
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';

  try {
    // 1. Fetch existing profile
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (existingUser) {
      if (existingUser.is_blocked) {
        return ctx.reply('⛔ <b>Your account has been restricted. Please contact support.</b>', { parse_mode: 'HTML' });
      }

      ctx.state.profile = existingUser;
      ctx.state.lang = existingUser.language_code || 'km';

      // Update info if changed
      if (existingUser.username !== username || existingUser.first_name !== firstName) {
        await supabase
          .from('profiles')
          .update({ username, first_name: firstName, last_name: lastName, updated_at: new Date().toISOString() })
          .eq('telegram_id', telegramId);
      }
    } else {
      // 2. Create profile for new user idempotently
      const { data: newUser } = await supabase
        .from('profiles')
        .upsert([{
          telegram_id: telegramId,
          username,
          first_name: firstName,
          last_name: lastName,
          language_code: 'km'
        }], { onConflict: 'telegram_id' })
        .select()
        .single();

      ctx.state.profile = newUser;
      ctx.state.lang = 'km';
    }
  } catch (err) {
    logger.error({ err, telegramId }, 'Error in userMiddleware');
    ctx.state.lang = 'km';
  }

  return next();
}
