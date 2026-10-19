import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["GEMINI_API_KEY"] = ""
os.environ["GROQ_API_KEY"] = ""
os.environ["UNSPLASH_ACCESS_KEY"] = ""
from fastapi.testclient import TestClient
from main import app
c = TestClient(app)
P = {"destination": "Goa", "start_date": "2026-11-01", "end_date": "2026-11-03", "interests": ["food", "nature"]}

def test_health():
    assert c.get("/health").json()["status"] == "ok"

def test_generate():
    r = c.post("/api/generate-itinerary", json=P)
    assert r.status_code == 200 and len(r.json()["days"]) == 3

def test_regen_and_bad_dates():
    assert c.post("/api/regenerate-day", json={"preferences": P, "day_number": 2}).json()["day_number"] == 2
    assert c.post("/api/generate-itinerary", json={**P, "end_date": "2026-10-01"}).status_code == 422

def test_image_and_trips():
    assert "url" in c.get("/api/image", params={"query": "Goa"}).json()
    t = c.post("/api/trips", json={"destination": "Goa"}).json()
    tk = c.post(f"/api/trips/{t['id']}/share").json()["share_token"]
    assert c.get(f"/api/shared/{tk}").json()["destination"] == "Goa"
