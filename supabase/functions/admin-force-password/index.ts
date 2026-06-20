/**
 * P!CKLE — super 전용: 대상 Auth 유저 비밀번호 즉시 강제 변경
 * Deploy: supabase functions deploy admin-force-password
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ ok: false, reason: 'unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ ok: false, reason: 'unauthorized' }, 401);
    }

    const { data: roleData, error: roleErr } = await userClient.rpc('pickle_get_my_user_role');
    if (roleErr || !roleData?.ok || roleData.role !== 'super') {
      return json({ ok: false, reason: 'forbidden', detail: 'super_required' }, 403);
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || email.indexOf('@') === -1) {
      return json({ ok: false, reason: 'invalid_email' }, 400);
    }
    if (password.length < 8) {
      return json({ ok: false, reason: 'invalid_password', detail: 'min_8_chars' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) {
      return json({ ok: false, reason: 'auth_list_failed', error: listErr.message }, 500);
    }

    const target = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!target) {
      return json({ ok: false, reason: 'user_not_found', email }, 404);
    }

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(target.id, {
      password,
      email_confirm: true,
    });
    if (updateErr) {
      return json({ ok: false, reason: 'auth_password_update_failed', error: updateErr.message }, 500);
    }

    return json({
      ok: true,
      email,
      user_id: target.id,
      method: 'auth_admin_api',
    });
  } catch (err) {
    return json({ ok: false, reason: 'server_error', error: String(err) }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
