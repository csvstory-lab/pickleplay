/**
 * P!CKLE — 신규 관리자 Supabase Auth 계정 + user_roles 발급
 * Deploy: supabase functions deploy admin-provision-user
 * Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (자동)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ ok: false, reason: 'unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ ok: false, reason: 'unauthorized' }, 401);
    }

    const { data: roleData, error: roleErr } = await userClient.rpc('pickle_get_my_user_role');
    if (roleErr || !roleData?.ok || roleData.role !== 'super') {
      return jsonResponse({ ok: false, reason: 'forbidden', detail: 'super_required' }, 403);
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const displayName = String(body.display_name || '').trim();
    const department = String(body.department || '').trim();
    const roleRaw = String(body.role || 'marketer').trim().toLowerCase();
    const role = roleRaw === 'advertiser' ? 'sponsor' : roleRaw;
    const status = String(body.status || 'active');
    const mode = String(body.mode || 'create');

    if (!email || email.indexOf('@') === -1) {
      return jsonResponse({ ok: false, reason: 'invalid_email' }, 400);
    }

    if (!['super', 'marketer', 'cs', 'account', 'sponsor'].includes(role)) {
      return jsonResponse({ ok: false, reason: 'invalid_role' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: upsertErr } = await adminClient.from('user_roles').upsert(
      {
        email,
        display_name: displayName || email,
        department: department || '',
        role,
        status,
        is_protected: role === 'super',
      },
      { onConflict: 'email' }
    );

    if (upsertErr) {
      return jsonResponse({ ok: false, reason: 'role_upsert_failed', error: upsertErr.message }, 500);
    }

    let authResult: {
      created?: boolean;
      updated?: boolean;
      skipped?: boolean;
      message?: string;
      user_id?: string;
      oauth_compatible?: boolean;
    } = {};

    if (mode === 'create') {
      if (!password || password.length < 8) {
        return jsonResponse({ ok: false, reason: 'invalid_password', detail: 'min_8_chars' }, 400);
      }

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, admin_role: role, role: role },
      });

      if (createErr) {
        if (createErr.message?.toLowerCase().includes('already')) {
          authResult = { skipped: true, message: 'auth_user_exists' };
        } else {
          return jsonResponse(
            {
              ok: false,
              reason: 'auth_create_failed',
              error: createErr.message,
              role_saved: true,
            },
            500
          );
        }
      } else {
        authResult = { created: true, user_id: created.user?.id };
      }
    } else if (password && password.length >= 8) {
      const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listErr) {
        return jsonResponse({ ok: false, reason: 'auth_list_failed', error: listErr.message }, 500);
      }

      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        const { error: updateErr } = await adminClient.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
        if (updateErr) {
          return jsonResponse(
            { ok: false, reason: 'auth_password_update_failed', error: updateErr.message },
            500
          );
        }
        authResult = { updated: true, user_id: existing.id, oauth_compatible: true };
      } else {
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName, admin_role: role, role: role },
        });
        if (createErr) {
          return jsonResponse({ ok: false, reason: 'auth_create_failed', error: createErr.message }, 500);
        }
        authResult = { created: true, user_id: created.user?.id };
      }
    } else {
      authResult = { skipped: true, message: 'role_only_update' };
    }

    return jsonResponse({ ok: true, email, role, status, auth: authResult });
  } catch (err) {
    return jsonResponse({ ok: false, reason: 'server_error', error: String(err) }, 500);
  }
});
