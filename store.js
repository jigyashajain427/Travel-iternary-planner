import { createClient } from "@supabase/supabase-js"
const U = import.meta.env.VITE_SUPABASE_URL, K = import.meta.env.VITE_SUPABASE_ANON_KEY
export const sb = U && K ? createClient(U, K) : null   // null => local demo mode (browser storage)
let mem = null
const ls = () => { if (mem) return mem; try { mem = JSON.parse(localStorage.getItem("trips") || "[]") } catch { mem = [] } return mem }
const put = a => { mem = a; try { localStorage.setItem("trips", JSON.stringify(a)) } catch {} }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random())
const one = async q => { const { data, error } = await q; if (error) throw error; return data }
export const db = {
  async list() { return sb ? (await one(sb.from("trips").select("*").order("created_at", { ascending: false }))) || [] : ls() },
  async get(id) { return sb ? one(sb.from("trips").select("*").eq("id", id).single()) : ls().find(t => t.id === id) },
  async getShared(tk) { return sb ? one(sb.from("trips").select("*").eq("share_token", tk).single()) : ls().find(t => t.share_token === tk) },
  async save(t) {
    const row = { destination: t.destination, preferences: t.preferences, itinerary: t.itinerary }
    if (sb) {
      if (t.id) return one(sb.from("trips").update(row).eq("id", t.id).select().single())
      const { data: { user } } = await sb.auth.getUser()
      return one(sb.from("trips").insert({ ...row, user_id: user.id }).select().single())
    }
    const rec = { ...t, ...row, id: t.id || uid(), created_at: t.created_at || new Date().toISOString() }
    put(t.id ? ls().map(x => x.id === rec.id ? rec : x) : [rec, ...ls()]); return rec
  },
  async remove(id) { if (sb) await one(sb.from("trips").delete().eq("id", id)); else put(ls().filter(t => t.id !== id)) },
  async share(id) {
    const tk = uid().replace(/-/g, "")
    if (sb) await one(sb.from("trips").update({ share_token: tk }).eq("id", id)); else put(ls().map(t => t.id === id ? { ...t, share_token: tk } : t))
    return tk
  }
}
