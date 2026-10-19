import React, { useState, useEffect } from "react"
import { sb, db } from "./store.js"
const API = import.meta.env.VITE_API_URL || "http://localhost:8000"
const INTERESTS = ["food", "sightseeing", "adventure", "culture", "nightlife", "shopping", "nature"]
const card = "bg-white dark:bg-slate-800 rounded-xl shadow p-4"
const inp = "w-full border rounded p-2 mt-1 bg-transparent dark:border-slate-600"
const btn = "px-3 py-1 rounded border dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
const prim = "bg-indigo-600 text-white rounded px-4 py-2 font-semibold disabled:opacity-50"
const iso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const money = n => "$" + Math.round(n || 0)
const cost = d => d.activities.reduce((s, a) => s + (+a.estimated_cost || 0), 0)
const tripTotal = t => t.itinerary.days.reduce((s, d) => s + cost(d), 0) * (t.preferences?.group_size || 1)
const go = p => { location.hash = p }
let notify = () => {}
const call = async (path, body) => {
  const r = await fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined)
  if (!r.ok) { let m = "Request failed"; try { m = (await r.json()).detail || m } catch {} throw new Error(m) }
  return r.json()
}
const useHash = () => {
  const [h, setH] = useState(location.hash.slice(1) || "/")
  useEffect(() => { const f = () => setH(location.hash.slice(1) || "/"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f) }, [])
  return h
}
const Bars = ({ rows }) => { const max = Math.max(...rows.map(r => r[1]), 1); return (
  <div className="space-y-1">{rows.map(([l, v]) => (
    <div key={l} className="flex items-center gap-2 text-xs"><span className="w-20 shrink-0">{l}</span>
      <div className="h-3 bg-indigo-500 rounded" style={{ width: Math.max(v / max * 100, 2) + "%" }} /><span>{money(v)}</span></div>))}</div>) }

function Hero({ q }) {
  const [u, setU] = useState("")
  useEffect(() => { call("/api/image?query=" + encodeURIComponent(q)).then(r => setU(r.url)).catch(() => {}) }, [q])
  return <div className="h-40 rounded-xl bg-gradient-to-r from-indigo-500 to-pink-500 overflow-hidden mb-3">{u && <img src={u} alt={q} className="w-full h-full object-cover" onError={e => e.target.remove()} />}</div>
}

function Auth({ onDone }) {
  const [e, setE] = useState(""), [p, setP] = useState(""), [err, setErr] = useState("")
  const act = async up => {
    setErr("")
    const { error } = await (up ? sb.auth.signUp({ email: e, password: p }) : sb.auth.signInWithPassword({ email: e, password: p }))
    if (error) setErr(error.message); else if (up) setErr("Check your email to confirm, then log in."); else onDone()
  }
  if (!sb) return <div><p className="text-sm text-slate-500 mb-2">Demo mode: Supabase keys not set, trips are saved in this browser.</p><button className={prim} onClick={onDone}>Continue as guest</button></div>
  return (<div className="space-y-2">
    <input className={inp} placeholder="Email" value={e} onChange={x => setE(x.target.value)} />
    <input className={inp} type="password" placeholder="Password" value={p} onChange={x => setP(x.target.value)} />
    <div className="flex gap-2"><button className={prim} onClick={() => act(false)}>Log in</button><button className={btn} onClick={() => act(true)}>Sign up</button></div>
    {err && <p className="text-red-500 text-sm">{err}</p>}</div>)
}

function Dashboard() {
  const [trips, setTrips] = useState(null), [q, setQ] = useState("")
  const load = () => db.list().then(setTrips).catch(e => notify(e.message))
  useEffect(() => { load() }, [])
  if (!trips) return <div className="grid md:grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className={card + " h-24 animate-pulse"} />)}</div>
  const list = trips.filter(t => t.destination.toLowerCase().includes(q.toLowerCase()))
  const dup = async t => { await db.save({ destination: t.destination + " (copy)", preferences: t.preferences, itinerary: t.itinerary }); notify("Duplicated"); load() }
  const del = async t => { await db.remove(t.id); notify("Deleted"); load() }
  return (<div>
    <h1 className="text-2xl font-bold mb-3">Dashboard</h1>
    <div className="grid md:grid-cols-3 gap-3 mb-4">
      {[["Total trips", trips.length], ["Upcoming trips", trips.filter(t => (t.preferences?.start_date || "") >= iso(0)).length], ["Estimated spend", money(trips.reduce((s, t) => s + tripTotal(t), 0))]].map(([l, v]) => (
        <div key={l} className={card}><div className="text-sm text-slate-500">{l}</div><div className="text-2xl font-bold">{v}</div></div>))}</div>
    <input className={inp + " mb-3"} placeholder="Search trips…" value={q} onChange={e => setQ(e.target.value)} />
    {!list.length && <p className="text-slate-500">No trips yet. Click “New trip” to create one.</p>}
    <div className="space-y-2">{list.map(t => (
      <div key={t.id} className={card + " flex flex-wrap items-center gap-2 justify-between"}>
        <div><b>{t.destination}</b><div className="text-sm text-slate-500">{t.preferences?.start_date} → {t.preferences?.end_date} · {money(tripTotal(t))}</div></div>
        <div className="flex gap-2"><button className={btn} onClick={() => go("/trip/" + t.id)}>Open</button><button className={btn} onClick={() => dup(t)}>Duplicate</button><button className={btn + " text-red-500"} onClick={() => del(t)}>Delete</button></div>
      </div>))}</div></div>)
}

const Sel = ({ label, value, set, opts }) => (
  <label className="text-sm">{label}<select className={inp} value={value} onChange={e => set(e.target.value)}>{opts.map(o => <option key={o} className="text-black">{o}</option>)}</select></label>)

function Builder() {
  const [f, setF] = useState({ destination: "", start_date: iso(7), end_date: iso(10), budget_level: "medium", budget_amount: 1000, group_size: 2, traveler_type: "couple", interests: ["food", "sightseeing"], pace: "balanced", accommodation: "hotel", transport: "mixed" })
  const [busy, setBusy] = useState(false)
  const up = (k, v) => setF({ ...f, [k]: v })
  const gen = async () => {
    if (!f.destination.trim()) return notify("Enter a destination")
    setBusy(true)
    try { const it = await call("/api/generate-itinerary", f); const t = await db.save({ destination: f.destination, preferences: f, itinerary: it }); go("/trip/" + t.id) }
    catch (e) { notify(e.message) }
    setBusy(false)
  }
  return (<div><h1 className="text-2xl font-bold mb-3">Smart Trip Builder</h1>
    <div className={card + " grid md:grid-cols-3 gap-3"}>
      <label className="text-sm">Destination<input className={inp} placeholder="e.g. Goa" value={f.destination} onChange={e => up("destination", e.target.value)} /></label>
      <label className="text-sm">Start<input type="date" className={inp} value={f.start_date} onChange={e => up("start_date", e.target.value)} /></label>
      <label className="text-sm">End<input type="date" className={inp} value={f.end_date} onChange={e => up("end_date", e.target.value)} /></label>
      <Sel label="Budget" value={f.budget_level} set={v => up("budget_level", v)} opts={["low", "medium", "premium"]} />
      <label className="text-sm">Budget amount ($)<input type="number" className={inp} value={f.budget_amount} onChange={e => up("budget_amount", +e.target.value)} /></label>
      <label className="text-sm">Group size<input type="number" min="1" className={inp} value={f.group_size} onChange={e => up("group_size", +e.target.value)} /></label>
      <Sel label="Traveler" value={f.traveler_type} set={v => up("traveler_type", v)} opts={["solo", "couple", "friends", "family"]} />
      <Sel label="Pace" value={f.pace} set={v => up("pace", v)} opts={["relaxed", "balanced", "packed"]} />
      <Sel label="Stay" value={f.accommodation} set={v => up("accommodation", v)} opts={["hostel", "hotel", "resort", "homestay"]} />
      <Sel label="Transport" value={f.transport} set={v => up("transport", v)} opts={["mixed", "walking", "public transit", "car"]} />
      <div className="text-sm md:col-span-2">Interests<div className="flex flex-wrap gap-1 mt-1">{INTERESTS.map(i => (
        <button key={i} onClick={() => up("interests", f.interests.includes(i) ? f.interests.filter(x => x !== i) : [...f.interests, i])}
          className={"px-2 py-1 rounded-full border text-xs " + (f.interests.includes(i) ? "bg-indigo-600 text-white" : "dark:border-slate-600")}>{i}</button>))}</div></div>
      <button onClick={gen} disabled={busy} className={prim + " md:col-span-3"}>{busy ? "Generating…" : "Generate itinerary"}</button>
    </div></div>)
}

function TripView({ id, token }) {
  const ro = !!token
  const [t, setT] = useState(null), [d, setD] = useState(0), [busy, setBusy] = useState(false), [ed, setEd] = useState(-1)
  useEffect(() => { (token ? db.getShared(token) : db.get(id)).then(x => x ? setT(x) : notify("Trip not found")).catch(e => notify(e.message)) }, [id, token])
  if (!t) return <div className={card + " animate-pulse h-64"} />
  const it = t.itinerary, day = it.days[d]
  const setDay = nd => setT({ ...t, itinerary: { ...it, days: it.days.map((x, i) => i === d ? nd : x) } })
  const setActs = a => setDay({ ...day, activities: a })
  const upd = (i, k, v) => setActs(day.activities.map((a, j) => j === i ? { ...a, [k]: v } : a))
  const run = async fn => { setBusy(true); try { await fn() } catch (e) { notify(e.message) } setBusy(false) }
  const regen = () => run(async () => setDay(await call("/api/regenerate-day", { preferences: t.preferences, day_number: d + 1 })))
  const save = () => run(async () => { setT(await db.save(t)); notify("Saved ✓") })
  const share = () => run(async () => {
    let tk = t.share_token
    if (!tk) { tk = await db.share(t.id); setT({ ...t, share_token: tk }) }
    const url = location.href.split("#")[0] + "#/shared/" + tk
    try { await navigator.clipboard.writeText(url) } catch {}
    notify("Share link copied: " + url)
  })
  const cats = {}; it.days.forEach(x => x.activities.forEach(a => { cats[a.category] = (cats[a.category] || 0) + (+a.estimated_cost || 0) }))
  return (<div>
    <Hero q={t.destination} />
    <h1 className="text-2xl font-bold">{it.trip_title}</h1><p className="text-slate-500">{it.summary}</p>
    <p className="font-semibold mt-1">Estimated total for {t.preferences?.group_size || 1}: {money(tripTotal(t))}{t.preferences?.budget_amount ? ` (budget ${money(t.preferences.budget_amount)})` : ""}</p>
    <div className="flex gap-2 my-3 flex-wrap print:hidden">{it.days.map((x, i) => <button key={i} onClick={() => { setD(i); setEd(-1) }} className={"px-3 py-1 rounded " + (i === d ? "bg-indigo-600 text-white" : "bg-slate-200 dark:bg-slate-700")}>Day {x.day_number}</button>)}</div>
    <div className={card}>
      <h3 className="font-bold text-lg">{day.theme} <span className="text-sm text-slate-400">{day.date}</span></h3>
      <ul className="border-l-2 border-indigo-300 pl-4 my-3 space-y-3">{day.activities.map((a, i) => (
        <li key={i}>{ed === i && !ro ? (
          <div className="grid grid-cols-6 gap-1"><input className={inp} value={a.time} onChange={e => upd(i, "time", e.target.value)} />
            <input className={inp + " col-span-3"} value={a.title} onChange={e => upd(i, "title", e.target.value)} />
            <input type="number" className={inp} value={a.estimated_cost} onChange={e => upd(i, "estimated_cost", +e.target.value)} />
            <button className={btn} onClick={() => setEd(-1)}>Done</button>
            <input className={inp + " col-span-6"} placeholder="Description" value={a.description} onChange={e => upd(i, "description", e.target.value)} /></div>
        ) : (<div><b>{a.time}</b> · {a.title} <span className="text-xs bg-slate-100 dark:bg-slate-700 rounded px-1">{a.category}</span> <span className="text-slate-500">{money(a.estimated_cost)} · {a.duration}</span>
          {!ro && <span className="print:hidden"><button onClick={() => setEd(i)} className="ml-2 text-indigo-500 text-xs">edit</button><button onClick={() => setActs(day.activities.filter((_, j) => j !== i))} className="ml-2 text-red-500 text-xs">remove</button></span>}
          <div className="text-sm text-slate-500">{a.description}</div></div>)}</li>))}</ul>
      <p className="text-sm">🏨 {day.accommodation} · 🚌 {day.transport_tips}</p><p className="text-sm">🍽️ {(day.meals || []).join(" · ")}</p>
      {!ro && <div className="mt-3 flex gap-2 flex-wrap print:hidden">
        <button className={btn} onClick={() => { setActs([...day.activities, { time: "12:00", title: "New activity", description: "", category: "sightseeing", location: t.destination, estimated_cost: 0, duration: "1h" }]); setEd(day.activities.length) }}>＋ Add activity</button>
        <button className={btn} disabled={busy} onClick={regen}>🔄 Regenerate this day</button></div>}
    </div>
    <div className="grid md:grid-cols-2 gap-3 mt-3">
      <div className={card}><h4 className="font-semibold mb-2">Cost per day</h4><Bars rows={it.days.map(x => ["Day " + x.day_number, cost(x)])} /></div>
      <div className={card}><h4 className="font-semibold mb-2">Cost by category</h4><Bars rows={Object.entries(cats)} /></div></div>
    <p className="mt-3 text-sm text-slate-500">Tips: {[...(it.packing_tips || []), ...(it.local_tips || [])].join(" · ")}</p>
    <div className="mt-3 flex gap-2 flex-wrap print:hidden">
      {!ro && <><button className={prim} disabled={busy} onClick={save}>💾 Save</button><button className={btn} disabled={busy} onClick={share}>🔗 Share</button></>}
      <button className={btn} onClick={() => window.print()}>📄 Export PDF</button>
      {ro && <button className={btn} onClick={() => go("/")}>Plan your own trip</button>}</div></div>)
}

export default function App() {
  const h = useHash()
  const [authed, setAuthed] = useState(false), [ready, setReady] = useState(!sb), [dark, setDark] = useState(false), [toast, setToast] = useState("")
  notify = m => { setToast(m); setTimeout(() => setToast(""), 3500) }
  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data }) => { setAuthed(!!data.session); setReady(true) })
    const { data } = sb.auth.onAuthStateChange((_, s) => setAuthed(!!s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => { document.documentElement.classList.toggle("dark", dark) }, [dark])
  const shared = h.match(/^\/shared\/(.+)/), trip = h.match(/^\/trip\/(.+)/)
  const wrap = c => <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">{c}
    {toast && <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-2 rounded shadow print:hidden">{toast}</div>}</div>
  if (!ready) return wrap(<div className="p-8">Loading…</div>)
  if (shared) return wrap(<main className="max-w-4xl mx-auto p-4"><TripView token={shared[1]} /></main>)
  if (!authed) return wrap(<div className="max-w-md mx-auto p-6 pt-16"><h1 className="text-3xl font-bold">✈️ Travel Itinerary Planner</h1>
    <p className="text-slate-500 mb-4">AI-powered, personalized day-by-day trips.</p><div className={card}><Auth onDone={() => setAuthed(true)} /></div></div>)
  const nav = "block w-full text-left px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
  return wrap(<div className="md:flex">
    <aside className="md:w-56 p-4 bg-white dark:bg-slate-800 md:min-h-screen print:hidden space-y-1">
      <div className="font-bold mb-3">✈️ Trip Planner</div>
      <button className={nav} onClick={() => go("/")}>📊 Dashboard</button><button className={nav} onClick={() => go("/new")}>➕ New trip</button>
      <button className={nav} onClick={() => setDark(!dark)}>{dark ? "☀️ Light mode" : "🌙 Dark mode"}</button>
      <button className={nav} onClick={() => sb ? sb.auth.signOut() : setAuthed(false)}>🚪 Log out</button></aside>
    <main className="flex-1 p-4 max-w-5xl">{h === "/new" ? <Builder /> : trip ? <TripView key={trip[1]} id={trip[1]} /> : <Dashboard />}</main></div>)
}
