import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const MEMBERSHIP_PLANS = {
  monthly: { id: 'monthly', title: '1 Month VIP', price: 4.99, durationDays: 30, discount: 5.0 },
  quarterly: { id: 'quarterly', title: '3 Months VIP', price: 12.99, durationDays: 90, discount: 7.0 },
  annual: { id: 'annual', title: '1 Year VIP', price: 39.99, durationDays: 365, discount: 10.0 }
};

export class MembershipService {
  /**
   * Check active membership for a profile
   */
  static async getActiveMembership(profileId) {
    if (!profileId) return null;

    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString())
      .order('end_date', { ascending: false })
      .maybeSingle();

    if (error) {
      logger.error({ error, profileId }, 'Error checking active membership');
      return null;
    }
    return data;
  }

  /**
   * Activate or extend membership after verified payment
   */
  static async activateMembership({ profileId, planKey = 'monthly', tier = 'VIP' }) {
    const plan = MEMBERSHIP_PLANS[planKey] || MEMBERSHIP_PLANS.monthly;
    const now = new Date();
    const endDate = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('memberships')
      .insert([{
        profile_id: profileId,
        tier,
        status: 'active',
        discount_percentage: plan.discount,
        start_date: now.toISOString(),
        end_date: endDate.toISOString()
      }])
      .select()
      .single();

    if (error) {
      logger.error({ error, profileId }, 'Failed to activate membership');
      throw new Error(`Membership activation failed: ${error.message}`);
    }

    logger.info({ profileId, tier, endDate }, 'Membership activated successfully');
    return data;
  }

  /**
   * List all memberships for Admin
   */
  static async getAllMemberships({ limit = 50, offset = 0 } = {}) {
    const { data, count, error } = await supabase
      .from('memberships')
      .select(`
        *,
        profiles (telegram_id, username, first_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error }, 'Failed to fetch memberships');
      return { memberships: [], total: 0 };
    }
    return { memberships: data || [], total: count || 0 };
  }
}
