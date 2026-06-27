const { json } = require('./_supabase');

exports.handler = async () => {
  return json(200, {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT || 5)
  });
};
