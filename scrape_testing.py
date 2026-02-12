import requests
import json

event_id = 376410
headers = {
    "accept": "*/*",
    "origin": "https://www.socalyouthcycling.org",
    "referer": "https://www.socalyouthcycling.org/",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}

# Get config
config_url = f"https://my.raceresult.com/{event_id}/RRPublish/data/config"
config = requests.get(config_url, params={"lang": "en", "page": "results", "noVisitor": "1", "v": "1"}, headers=headers).json()
key = config["key"]
server = config["server"]

# Get results
results_url = f"https://{server}/{event_id}/RRPublish/data/list"
params = {
    "key": key,
    "listname": "02 - Result Lists|01-Individual Results - ALL",
    "page": "results",
    "contest": "0",
    "r": "leaders",
    "l": "5"
}
raw = requests.get(results_url, params=params, headers=headers).json()

# Debug: show structure
print("Top-level keys:", raw.keys())
print("\n'list' keys:", raw.get("list", {}).keys())
print("\n'data' type:", type(raw.get("list", {}).get("data")))
print("\n'data' keys:", raw.get("list", {}).get("data", {}).keys() if isinstance(raw.get("list", {}).get("data"), dict) else "NOT A DICT")

# Show a sample
data = raw.get("list", {}).get("data", {})
if data:
    first_key = list(data.keys())[0]
    print(f"\nFirst status group: {first_key}")
    print(f"Categories in it: {list(data[first_key].keys())[:3]}")