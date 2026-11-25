import type { PostgrestError } from "@supabase/supabase-js";
import { AppError } from "../lib/errors.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AdminUser {
  user_id: string;
  email: string;
  created_at: string;
}

export interface AdminUsersRepository {
  list(): Promise<AdminUser[]>;
  findUserIdByEmail(email: string): Promise<string | null>;
  grant(userId: string): Promise<void>;
  /** Returns false if the user was not an admin. Throws AppError for self-revoke / last admin. */
  revoke(userId: string, actorId: string): Promise<boolean>;
}

function fail(error: PostgrestError): never {
  if (error.message === "CANNOT_REVOKE_SELF") throw new AppError(409, "CANNOT_REVOKE_SELF", "You cannot remove your own admin access");
  if (error.message === "LAST_ADMIN") throw new AppError(409, "LAST_ADMIN", "At least one admin must remain");
  throw error;
}

export const supabaseAdminUsersRepository: AdminUsersRepository = {
  async list() {
    const { data, error } = await supabaseAdmin.rpc("list_admins");
    if (error) fail(error);
    return data as AdminUser[];
  },
  async findUserIdByEmail(email) {
    const { data, error } = await supabaseAdmin.rpc("find_user_id_by_email", { p_email: email });
    if (error) fail(error);
    return (data as string | null) ?? null;
  },
  async grant(userId) {
    const { error } = await supabaseAdmin
      .from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (error) fail(error);
  },
  async revoke(userId, actorId) {
    const { data, error } = await supabaseAdmin.rpc("revoke_admin", { p_user_id: userId, p_actor_id: actorId });
    if (error) fail(error);
    return data === true;
  },
};

