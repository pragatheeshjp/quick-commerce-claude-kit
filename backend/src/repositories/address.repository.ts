import type { PostgrestError } from "@supabase/supabase-js";
import { badRequest, conflict, notFoundError } from "../lib/errors.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Address, AddressInput, ServiceablePincode } from "../types/commerce.js";

export interface AddressRepository {
  list(userId: string): Promise<Address[]>;
  count(userId: string): Promise<number>;
  create(userId: string, input: AddressInput): Promise<Address>;
  update(userId: string, id: string, patch: Partial<AddressInput>): Promise<Address>;
  remove(userId: string, id: string): Promise<void>;
  setDefault(userId: string, id: string): Promise<boolean>;
  findPincode(pincode: string): Promise<ServiceablePincode | null>;
}

function fail(error: PostgrestError): never {
  switch (error.code) {
    case "23505": throw conflict("Conflicting change, please retry");
    case "23514": throw badRequest("A value violates a data constraint");
    default: throw error;
  }
}

const COLUMNS = "id, user_id, label, line1, line2, landmark, city, state, pincode, is_default";

// Every query is scoped by user_id taken from the verified token. The service role bypasses RLS,
// so this scoping IS the authorization.
export const supabaseAddressRepository: AddressRepository = {
  async list(userId) {
    const { data, error } = await supabaseAdmin
      .from("addresses").select(COLUMNS).eq("user_id", userId)
      .order("is_default", { ascending: false }).order("created_at", { ascending: false });
    if (error) fail(error);
    return data as Address[];
  },

  async count(userId) {
    const { count, error } = await supabaseAdmin
      .from("addresses").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) fail(error);
    return count ?? 0;
  },

  async create(userId, input) {
    const { is_default, ...rest } = input;
    const { data, error } = await supabaseAdmin
      .from("addresses").insert({ ...rest, user_id: userId, is_default: false }).select(COLUMNS).single();
    if (error) fail(error);
    const address = data as Address;
    if (is_default) {
      await this.setDefault(userId, address.id);
      address.is_default = true;
    }
    return address;
  },

  async update(userId, id, patch) {
    const { is_default, ...rest } = patch;
    if (Object.keys(rest).length > 0) {
      const { data, error } = await supabaseAdmin
        .from("addresses").update(rest).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
      if (error) fail(error);
      if (!data) throw notFoundError("Address not found");
    }
    if (is_default && !(await this.setDefault(userId, id))) throw notFoundError("Address not found");
    const { data, error } = await supabaseAdmin
      .from("addresses").select(COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) fail(error);
    if (!data) throw notFoundError("Address not found");
    return data as Address;
  },

  async remove(userId, id) {
    const { data, error } = await supabaseAdmin
      .from("addresses").delete().eq("id", id).eq("user_id", userId).select("id").maybeSingle();
    if (error) fail(error);
    if (!data) throw notFoundError("Address not found");
  },

  async setDefault(userId, id) {
    const { data, error } = await supabaseAdmin.rpc("set_default_address", { p_user_id: userId, p_address_id: id });
    if (error) fail(error);
    return data === true;
  },

  async findPincode(pincode) {
    const { data, error } = await supabaseAdmin
      .from("serviceable_pincodes").select("*").eq("pincode", pincode).eq("is_active", true).maybeSingle();
    if (error) fail(error);
    return (data as ServiceablePincode | null) ?? null;
  },
};
