import os, json, logging, uuid, urllib.request, urllib.parse
from datetime import date, timedelta
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("planner")
app = FastAPI(title="Personalized Travel Itinerary Planner")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class Prefs(BaseModel):
    destination: str
    start_date: date
    end_date: date
    budget_level: str = "medium"
    budget_amount: float = 1000
    group_size: int = Field(1, ge=1)
    traveler_type: str = "solo"
    interests: List[str] = []
    pace: str = "balanced"

class Activity(BaseModel):
    time: str
    title: str
    description: str = ""
    category: str = "sightseeing"
    location: str = ""
    estimated_cost: float = 0
    duration: str = ""

class Day(BaseModel):
    day_number: int
    date: str
    theme: str
    activities: List[Activity]
    meals: List[str] = []
    accommodation: str = ""
    transport_tips: str = ""
    day_cost: float = 0

class Itinerary(BaseModel):
    trip_title: str
    summary: str
    days: List[Day]
    total_estimated_cost: float = 0
    packing_tips: List[str] = []
    local_tips: List[str] = []

class RegenReq(BaseModel):
    preferences: Prefs
    day_number: int

SYSTEM = ("You are an expert travel planner. Reply with ONLY valid JSON, no markdown. "
          "Schema: {trip_title,summary,days:[{day_number,date,theme,activities:[{time,title,"
          "description,category,location,estimated_cost,duration}],meals:[],accommodation,"
          "transport_tips,day_cost}],total_estimated_cost,packing_tips:[],local_tips:[]}. "
          'Example activity: {"time":"09:00","title":"Old Town walk","description":"Guided stroll",'
          '"category":"sightseeing","location":"Old Town","estimated_cost":10,"duration":"2h"}')

def provider():
    return os.getenv("LLM_PROVIDER", "groq").lower()

def has_key():
    return bool(os.getenv("GROQ_API_KEY" if provider() == "groq" else "GEMINI_API_KEY"))

def call_llm(prompt: str) -> str:
    if provider() == "groq":
        from groq import Groq
        r = Groq(api_key=os.environ["GROQ_API_KEY"]).chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}])
        return r.choices[0].message.content
    from google import genai
    r = genai.Client(api_key=os.environ["GEMINI_API_KEY"]).models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), contents=SYSTEM + "\n\n" + prompt,
        config={"response_mime_type": "application/json"})
    return r.text

def mock_day(p: Prefs, n: int) -> Day:
    d = p.start_date + timedelta(days=n - 1)
    interest = (p.interests or ["sightseeing"])[(n - 1) % max(len(p.interests), 1)]
    m = {"low": 0.6, "medium": 1.0, "premium": 2.0}.get(p.budget_level, 1.0)
    acts = [Activity(time="09:00", title=f"{p.destination} {interest} highlight", description=f"Morning {interest} experience", category=interest, location=p.destination, estimated_cost=round(20 * m), duration="3h"),
            Activity(time="13:00", title="Local lunch spot", description="Popular local cuisine", category="food", location=p.destination, estimated_cost=round(15 * m), duration="1h"),
            Activity(time="16:00", title="Scenic walk / landmark", description="Relaxed afternoon exploring", category="sightseeing", location=p.destination, estimated_cost=round(10 * m), duration="2h")]
    if p.pace == "packed":
        acts.append(Activity(time="19:30", title="Evening market or show", category="culture", location=p.destination, estimated_cost=round(25 * m), duration="2h"))
    cost = sum(a.estimated_cost for a in acts) + round(60 * m)
    return Day(day_number=n, date=str(d), theme=f"Day {n}: {interest.title()}", activities=acts, meals=["Breakfast at hotel", "Local lunch", "Dinner nearby"],
               accommodation=f"{p.budget_level.title()} stay in {p.destination}", transport_tips="Use local transit or walk", day_cost=cost)

def mock_trip(p: Prefs) -> Itinerary:
    n = (p.end_date - p.start_date).days + 1
    days = [mock_day(p, i) for i in range(1, n + 1)]
    return Itinerary(trip_title=f"{n}-Day {p.destination} Trip", summary=f"A {p.pace} {p.traveler_type} trip to {p.destination}.",
                     days=days, total_estimated_cost=sum(d.day_cost for d in days) * p.group_size,
                     packing_tips=["Comfortable shoes", "Power bank"], local_tips=["Book popular spots early"])

def llm_json(prompt: str, model_cls):
    for attempt in range(2):
        try:
            return model_cls(**json.loads(call_llm(prompt).strip().strip("`").removeprefix("json")))
        except Exception as e:
            log.warning("LLM attempt %s failed: %s", attempt + 1, e)
    raise HTTPException(502, "LLM returned invalid output")

def check(p: Prefs):
    if p.end_date < p.start_date:
        raise HTTPException(422, "end_date must be after start_date")

@app.get("/health")
def health():
    return {"status": "ok", "llm_mode": "live" if has_key() else "mock"}

@app.post("/api/generate-itinerary", response_model=Itinerary)
def generate(p: Prefs):
    check(p)
    if not has_key():
        return mock_trip(p)
    it = llm_json("Plan a trip: " + p.model_dump_json(), Itinerary)
    it.total_estimated_cost = sum(d.day_cost for d in it.days)
    return it

@app.post("/api/regenerate-day", response_model=Day)
def regenerate(r: RegenReq):
    check(r.preferences)
    if not has_key():
        return mock_day(r.preferences, r.day_number)
    return llm_json(f"Regenerate ONLY day {r.day_number} as one Day JSON object. Preferences: " + r.preferences.model_dump_json(), Day)

TRIPS: dict = {}  # in-memory store; swap for Supabase (see supabase/schema.sql)

@app.get("/api/trips")
def list_trips():
    return list(TRIPS.values())

@app.post("/api/trips")
def save_trip(body: dict):
    tid = str(uuid.uuid4()); TRIPS[tid] = {"id": tid, **body}
    return TRIPS[tid]

@app.delete("/api/trips/{tid}")
def delete_trip(tid: str):
    if not TRIPS.pop(tid, None):
        raise HTTPException(404, "Trip not found")
    return {"deleted": tid}

@app.post("/api/trips/{tid}/share")
def share(tid: str):
    if tid not in TRIPS:
        raise HTTPException(404, "Trip not found")
    TRIPS[tid]["share_token"] = TRIPS[tid].get("share_token") or uuid.uuid4().hex
    return {"share_token": TRIPS[tid]["share_token"]}

@app.get("/api/shared/{token}")
def shared(token: str):
    for t in TRIPS.values():
        if t.get("share_token") == token:
            return t
    raise HTTPException(404, "Not found")

@app.get("/api/image")
def image(query: str):
    """Destination photo from Unsplash (needs UNSPLASH_ACCESS_KEY); empty url if unavailable."""
    key = os.getenv("UNSPLASH_ACCESS_KEY")
    if key:
        try:
            u = "https://api.unsplash.com/search/photos?per_page=1&orientation=landscape&query=" + urllib.parse.quote(query + " travel")
            r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"Authorization": "Client-ID " + key}), timeout=8))
            if r["results"]:
                return {"url": r["results"][0]["urls"]["regular"], "credit": r["results"][0]["user"]["name"]}
        except Exception as e:
            log.warning("unsplash failed: %s", e)
    return {"url": "", "credit": ""}
