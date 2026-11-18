import json, os, urllib.request

req = urllib.request.Request(
    f"https://api.www.root-me.org/auteurs/{os.environ['ROOTME_ID']}",
    headers={"Cookie": f"api_key={os.environ['ROOTME_KEY']}",
             "User-Agent": "dorianbrg.github.io"},
)
data = json.load(urllib.request.urlopen(req, timeout=15))

os.makedirs("data", exist_ok=True)
with open("data/rootme.json", "w") as f:
    json.dump({"points": int(data["score"]), "rang": data.get("position")}, f)