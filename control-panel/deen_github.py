"""GitHub access for the DEEN control panel.

Everything the panel shows or changes goes through the GitHub API with a
personal access token the user pastes in. Nothing is stored server-side: in
the browser build (stlite) this runs inside the page's WebAssembly Python.

Two clients share one interface:
  GitHubClient  real repo (REST + GraphQL)
  DemoClient    sample data; actions are recorded, nothing is changed
"""
from __future__ import annotations

import base64
import json
import os
import re
from datetime import datetime, timezone

try:  # In the browser, route `requests` through the browser's fetch.
    import pyodide_http  # type: ignore

    pyodide_http.patch_all()
except ImportError:
    pass

import requests

APP = "deen-content"
QUEUE_DIR = f"{APP}/data/queue"
REELS_DIR = f"{APP}/src/content/reels"
ARCHIVE_DIR = f"{APP}/archive"

WORKFLOWS = {
    "daily": ("deen-daily-reel.yml", "Daily reel"),
    "publish": ("deen-publish.yml", "Approve & publish"),
    "weekly": ("deen-weekly.yml", "Weekly insights"),
    "check": ("deen-check-instagram.yml", "Check Instagram setup"),
    "token": ("deen-token-refresh.yml", "Refresh Instagram token"),
    "edit": ("deen-reel-edit.yml", "Re-render after edit"),
}

# Repo variables the panel can change: name -> (default, help)
VARIABLES = {
    "DEEN_POST_TIME": ("19:00", "Earliest local posting time (HH:MM). Checked every hour."),
    "DEEN_TZ": ("Asia/Kolkata", "Time zone for the posting time and the daily cap."),
    "DEEN_MAX_PER_DAY": ("1", "Maximum posts per day."),
    "DEEN_MAX_OPEN_REVIEWS": ("3", "Skip making a new reel while this many wait for review."),
    "DEEN_QUEUE_LOW": ("5", "Open a 'queue-low' issue at this many drafts left."),
    "DEEN_WRITER": ("queue", "queue = free. subscription / api = paid writers (need their secret)."),
    "IG_LOGIN": ("instagram", "instagram or facebook (which Instagram API login you set up)."),
}
WRITERS = ["queue", "subscription", "api"]
FORMATS = ["", "heart-reminder", "before-you-scroll", "ayah-reflection", "hadith-practice", "dua", "habit-checklist", "heart-check",
           "ayah-lesson", "hadith-explained", "check-in", "dua-card", "story-check-in", "story-question"]
PILLARS = ["", "A", "B", "C", "D", "E", "F"]

# Which fine-grained token permission each action needs (for error hints).
PERMISSION_HINT = {
    "read": "Contents: Read, Pull requests: Read, Actions: Read, Issues: Read",
    "dispatch": "Actions: Read and write",
    "merge": "Contents: Read and write + Pull requests: Read and write",
    "close": "Pull requests: Read and write",
    "variables": "Variables: Read and write",
    "workflows": "Actions: Read and write",
    "upload": "Contents: Read and write",
}


class GitHubError(Exception):
    def __init__(self, status: int, message: str, action: str = "read"):
        self.status = status
        self.action = action
        hint = ""
        if status == 401:
            hint = " The token is invalid or expired; create a new one."
        elif status in (403, 404):
            hint = f" The token may be missing a permission for this ({PERMISSION_HINT.get(action, 'see setup')}), or not include this repository."
        super().__init__(f"GitHub said {status}: {message}.{hint}")


def parse_json(text: str | None):
    try:
        return json.loads(text) if text else None
    except (ValueError, TypeError):
        return None


def hook_of(reel: dict | None) -> str:
    if not reel:
        return ""
    hooks = reel.get("hooks") or []
    i = reel.get("selectedHook", 0) or 0
    return hooks[i]["text"] if 0 <= i < len(hooks) and isinstance(hooks[i], dict) else ""


def reel_id_from_branch(ref: str) -> str:
    return ref[len("reel/"):] if ref.startswith("reel/") else ref


def ago(iso: str | None, now: datetime | None = None) -> str:
    if not iso:
        return ""
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    s = int(((now or datetime.now(timezone.utc)) - t).total_seconds())
    if s < 0:
        return "just now"
    for unit, n in (("d", 86400), ("h", 3600), ("m", 60)):
        if s >= n:
            return f"{s // n}{unit} ago"
    return "just now"


def validate_draft(text: str) -> list[str]:
    """Light checks before committing a queue draft. The daily run does the
    full copy/layout validation and skips drafts that fail it."""
    d = parse_json(text)
    if not isinstance(d, dict):
        return ["Not valid JSON."]
    problems = []
    for key in ("brief", "coreInsight", "hooks", "scenes", "cover", "caption", "primaryCta", "claims"):
        if key not in d:
            problems.append(f"Missing '{key}'.")
    scenes = d.get("scenes") or []
    kind = d.get("kind") or "reel"
    if kind not in ("reel", "carousel", "story"):
        problems.append("'kind' must be reel, carousel or story.")
    if kind == "story":
        if len(scenes) != 1:
            problems.append("A story has exactly one scene.")
        if not d.get("replyPrompt"):
            problems.append("A story needs a 'replyPrompt'.")
    elif scenes and scenes[0].get("type") != "hook":
        problems.append("The first scene must be the hook.")
    if kind != "story" and scenes and scenes[-1].get("type") != "takeaway":
        problems.append("The last scene must be the takeaway.")
    tags = (d.get("caption") or {}).get("hashtags") or []
    if tags and not 3 <= len(tags) <= 8:
        problems.append("Use 3–8 hashtags.")
    return problems


def next_queue_name(existing: list[str], slug: str) -> str:
    nums = [int(m.group(1)) for f in existing if (m := re.match(r"q(\d+)-", f))]
    slug = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")[:48] or "draft"
    return f"q{(max(nums) + 1) if nums else 1:03d}-{slug}.json"


def build_snapshot(*, repo, queue_files, reel_files, states, prs, variables, workflows, runs, issues, secrets):
    """Pure function: raw API data -> what the panel shows."""
    used = {}
    for f, reel in reel_files.items():
        q = ((reel or {}).get("brief") or {}).get("queueId")
        if q:
            used[q] = f.removesuffix(".json")
    for pr in prs:
        q = ((pr.get("reel") or {}).get("brief") or {}).get("queueId")
        if q:
            used[q] = pr["id"]
    queue = []
    for f in sorted(queue_files):
        d = parse_json(queue_files[f]) or {}
        qid = f.removesuffix(".json")
        queue.append({
            "file": f,
            "hook": hook_of(d),
            "format": (d.get("brief") or {}).get("format", ""),
            "pillar": ((d.get("brief") or {}).get("pillar") or "")[:1],
            "usedBy": used.get(qid, ""),
        })
    by_status = {"approved": [], "published": [], "failed": [], "manual": []}
    for s in states:
        pub = (s.get("publish") or {}).get("status", "pending")
        if pub == "published":
            by_status["published"].append(s)
        elif (s.get("approval") or {}).get("status") == "approved":
            if pub == "failed":
                by_status["failed"].append(s)
            elif pub == "manual-required":
                by_status["manual"].append(s)
            else:
                by_status["approved"].append(s)
    by_status["published"].sort(key=lambda s: s["publish"].get("publishedAt") or "", reverse=True)
    by_status["approved"].sort(key=lambda s: s["approval"].get("approvedAt") or "")
    latest = {}
    for r in runs:
        latest.setdefault(r.get("path", "").split("/")[-1], r)
    var = {k: variables.get(k, default) for k, (default, _) in VARIABLES.items()}
    return {
        "repo": repo,
        "queue": queue,
        "queueLeft": sum(1 for q in queue if not q["usedBy"]),
        "reels": sorted(f.removesuffix(".json") for f in reel_files),
        "archived": sorted(s.get("id") for s in states if s.get("id")),
        "prs": prs,
        "states": states,
        "byStatus": by_status,
        "variables": var,
        "variablesSet": variables,
        "workflows": workflows,
        "latestRuns": latest,
        "runs": runs,
        "queueLowIssue": issues[0] if issues else None,
        "secrets": secrets,
    }


class GitHubClient:
    demo = False

    def __init__(self, token: str, repo: str, api: str | None = None):
        self.repo = repo.strip().strip("/")
        self.owner, self.name = self.repo.split("/", 1)
        self.api = (api or os.environ.get("DEEN_GITHUB_API") or "https://api.github.com").rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({
            "Authorization": f"Bearer {token.strip()}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })

    # ------------------------------------------------------------ transport
    def _req(self, method, path, action="read", ok=(200, 201, 204), **kw):
        r = self.s.request(method, f"{self.api}{path}", timeout=30, **kw)
        if r.status_code not in ok:
            try:
                msg = r.json().get("message", r.text[:200])
            except ValueError:
                msg = r.text[:200]
            raise GitHubError(r.status_code, msg, action)
        return r.json() if r.content and r.status_code != 204 else None

    def gql(self, query, variables=None):
        data = self._req("POST", "/graphql", json={"query": query, "variables": variables or {}})
        if data.get("errors"):
            raise GitHubError(400, "; ".join(e.get("message", "") for e in data["errors"]))
        return data["data"]

    # ------------------------------------------------------------ reads
    def check(self):
        info = self._req("GET", f"/repos/{self.repo}")
        return {"fullName": info["full_name"], "private": info.get("private"), "defaultBranch": info.get("default_branch", "main")}

    def snapshot(self):
        repo = self.check()
        q1 = """
        query($o:String!,$n:String!){repository(owner:$o,name:$n){
          queue: object(expression:"HEAD:%s"){... on Tree{entries{name object{... on Blob{text}}}}}
          reels: object(expression:"HEAD:%s"){... on Tree{entries{name object{... on Blob{text}}}}}
          archive: object(expression:"HEAD:%s"){... on Tree{entries{name type}}}
          pullRequests(states:OPEN, labels:["daily-reel"], first:25, orderBy:{field:CREATED_AT, direction:ASC}){
            nodes{number title url headRefName createdAt labels(first:10){nodes{name}}}}
          issues(states:OPEN, labels:["queue-low"], first:1){nodes{number title url}}
        }}""" % (QUEUE_DIR, REELS_DIR, ARCHIVE_DIR)
        r = self.gql(q1, {"o": self.owner, "n": self.name})["repository"]
        entries = lambda o: (o or {}).get("entries") or []
        queue_files = {e["name"]: (e.get("object") or {}).get("text") for e in entries(r["queue"]) if e["name"].endswith(".json")}
        reel_files = {e["name"]: parse_json((e.get("object") or {}).get("text")) for e in entries(r["reels"]) if e["name"].endswith(".json")}
        archive_ids = [e["name"] for e in entries(r["archive"]) if e.get("type") == "tree"]
        prs = [{
            "number": p["number"], "title": p["title"], "url": p["url"], "branch": p["headRefName"],
            "id": reel_id_from_branch(p["headRefName"]), "createdAt": p["createdAt"],
            "labels": [l["name"] for l in p["labels"]["nodes"]],
        } for p in r["pullRequests"]["nodes"]]

        # Second query: every state.json on main + reel/state on each PR branch, by alias.
        parts = []
        for i, aid in enumerate(archive_ids):
            expr = json.dumps(f"HEAD:{ARCHIVE_DIR}/{aid}/state.json")
            parts.append(f"s{i}: object(expression:{expr}){{... on Blob{{text}}}}")
        for i, p in enumerate(prs):
            branch, rid = p["branch"], p["id"]
            reel_expr = json.dumps(f"{branch}:{REELS_DIR}/{rid}.json")
            state_expr = json.dumps(f"{branch}:{ARCHIVE_DIR}/{rid}/state.json")
            parts.append(f"pr{i}: object(expression:{reel_expr}){{... on Blob{{text}}}}")
            parts.append(f"ps{i}: object(expression:{state_expr}){{... on Blob{{text}}}}")
        states = []
        if parts:
            r2 = self.gql("query($o:String!,$n:String!){repository(owner:$o,name:$n){%s}}" % "\n".join(parts), {"o": self.owner, "n": self.name})["repository"]
            for i in range(len(archive_ids)):
                s = parse_json((r2.get(f"s{i}") or {}).get("text"))
                if s:
                    states.append(s)
            for i, p in enumerate(prs):
                p["reel"] = parse_json((r2.get(f"pr{i}") or {}).get("text"))
                p["state"] = parse_json((r2.get(f"ps{i}") or {}).get("text"))

        variables = self._variables_safe()
        wf = self._req("GET", f"/repos/{self.repo}/actions/workflows?per_page=100") or {}
        workflows = {w["path"].split("/")[-1]: {"id": w["id"], "name": w["name"], "state": w["state"], "url": w.get("html_url")} for w in wf.get("workflows", [])}
        runs_raw = (self._req("GET", f"/repos/{self.repo}/actions/runs?per_page=40") or {}).get("workflow_runs", [])
        runs = [{
            "name": x.get("name"), "path": x.get("path", ""), "event": x.get("event"), "status": x.get("status"),
            "conclusion": x.get("conclusion"), "createdAt": x.get("created_at"), "url": x.get("html_url"),
        } for x in runs_raw]
        try:
            secrets = [s["name"] for s in (self._req("GET", f"/repos/{self.repo}/actions/secrets?per_page=100") or {}).get("secrets", [])]
        except GitHubError:
            secrets = None  # token can't list secret names; that's optional
        return build_snapshot(repo=repo, queue_files=queue_files, reel_files=reel_files, states=states, prs=prs,
                              variables=variables, workflows=workflows, runs=runs,
                              issues=r["issues"]["nodes"], secrets=secrets)

    def _variables_safe(self):
        try:
            return {v["name"]: v["value"] for v in self._req("GET", f"/repos/{self.repo}/actions/variables?per_page=100", "variables").get("variables", [])}
        except GitHubError as e:
            if e.status in (403, 404):
                return {}
            raise

    # ------------------------------------------------------------ actions
    def run_workflow(self, key: str, inputs: dict | None = None, ref: str = "main"):
        file = WORKFLOWS[key][0]
        clean = {k: (str(v).lower() if isinstance(v, bool) else str(v)) for k, v in (inputs or {}).items() if v not in ("", None)}
        self._req("POST", f"/repos/{self.repo}/actions/workflows/{file}/dispatches", "dispatch", json={"ref": ref, "inputs": clean})
        return f"Started “{WORKFLOWS[key][1]}”."

    def approve(self, number: int):
        last = None
        for method in ("merge", "squash", "rebase"):
            try:
                self._req("PUT", f"/repos/{self.repo}/pulls/{number}/merge", "merge", json={"merge_method": method})
                return f"Approved: PR #{number} merged. It posts at the next slot."
            except GitHubError as e:
                last = e
                if e.status != 405 or "not allowed" not in str(e).lower():
                    raise  # e.g. conflicts or checks: don't retry with another method
        raise last

    def reject(self, number: int, note: str = ""):
        body = "❌ Rejected from the control panel." + (f"\n\n{note}" if note else "")
        self._req("POST", f"/repos/{self.repo}/issues/{number}/comments", "close", json={"body": body})
        self._req("PATCH", f"/repos/{self.repo}/pulls/{number}", "close", json={"state": "closed"})
        return f"Rejected: PR #{number} closed. Nothing will be posted."

    def set_hold(self, number: int, hold: bool):
        if hold:
            self._req("POST", f"/repos/{self.repo}/labels", "close", ok=(201, 422), json={"name": "hold", "color": "8B95A7", "description": "Never auto-approve this reel"})
            self._req("POST", f"/repos/{self.repo}/issues/{number}/labels", "close", json={"labels": ["hold"]})
            return f"PR #{number} is on hold: it won't be auto-approved."
        self._req("DELETE", f"/repos/{self.repo}/issues/{number}/labels/hold", "close", ok=(200, 204, 404))
        return f"PR #{number} released: it can be auto-approved again."

    def set_variable(self, name: str, value: str, exists: bool):
        if exists:
            self._req("PATCH", f"/repos/{self.repo}/actions/variables/{name}", "variables", json={"name": name, "value": value})
        else:
            self._req("POST", f"/repos/{self.repo}/actions/variables", "variables", json={"name": name, "value": value})

    def delete_variable(self, name: str):
        self._req("DELETE", f"/repos/{self.repo}/actions/variables/{name}", "variables")

    def set_workflow_enabled(self, key: str, enabled: bool):
        file = WORKFLOWS[key][0]
        self._req("PUT", f"/repos/{self.repo}/actions/workflows/{file}/{'enable' if enabled else 'disable'}", "workflows")
        return f"{WORKFLOWS[key][1]}: {'resumed' if enabled else 'paused'}."

    def upload_draft(self, filename: str, text: str):
        path = f"{QUEUE_DIR}/{filename}"
        self._req("PUT", f"/repos/{self.repo}/contents/{path}", "upload", json={
            "message": f"queue: add {filename} (control panel)",
            "content": base64.b64encode(text.encode()).decode(),
        })
        return f"Added {filename} to the queue."


# ---------------------------------------------------------------- demo
def _demo_reel(hook, fmt, qid=None):
    return {"hooks": [{"text": hook}], "selectedHook": 0, "brief": {"format": fmt, "pillar": "F: Hope, Patience and Trust", **({"queueId": qid} if qid else {})},
            "caption": {"opening": "Sample caption opening.", "hashtags": ["#IslamicReminder", "#Quran", "#DailyReminder"]}}


class DemoClient:
    """Sample data so the panel can be explored (and smoke-tested) without a token."""

    demo = True
    repo = "demo/daily-deen-reels"

    def __init__(self):
        self.log: list[str] = []

    def check(self):
        return {"fullName": self.repo, "private": False, "defaultBranch": "main"}

    def snapshot(self):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        iso = lambda h: (now.timestamp() - h * 3600)
        ts = lambda h: datetime.fromtimestamp(iso(h), timezone.utc).isoformat().replace("+00:00", "Z")
        hooks = ["Having a hard week?", "Who's the strongest person you know?", "Does it matter how it looks?",
                 "Same action. Different reward?", "A du'a for your parents", "A du'a for anyone learning",
                 "Feeling overwhelmed?", "Restless lately?"]
        fmts = ["ayah-reflection", "hadith-practice", "heart-check", "hadith-practice", "dua", "dua", "ayah-reflection", "ayah-reflection"]
        names = ["q001-with-hardship-ease", "q002-strength-in-anger", "q003-what-allah-looks-at", "q004-it-starts-with-intention",
                 "q005-dua-for-parents", "q006-dua-for-knowledge", "q007-not-more-than-you-can-carry", "q008-where-hearts-find-rest"]
        queue_files = {f"{n}.json": json.dumps(_demo_reel(h, f)) for n, h, f in zip(names, hooks, fmts)}
        reel_files = {
            "deen-001-hardship-is-never-alone.json": _demo_reel(hooks[0], fmts[0], names[0]),
            "deen-002-real-strength-looks-like-this.json": _demo_reel(hooks[1], fmts[1], names[1]),
        }
        states = [
            {"id": "deen-001-hardship-is-never-alone", "durationSec": 25.0,
             "approval": {"status": "approved", "approvedBy": "you", "approvedAt": ts(30)},
             "publish": {"status": "published", "permalink": "https://www.instagram.com/reel/DEMO1/", "publishedAt": ts(24)}},
            {"id": "deen-002-real-strength-looks-like-this", "durationSec": 26.5,
             "approval": {"status": "approved", "approvedBy": "you", "approvedAt": ts(3)},
             "publish": {"status": "pending", "attempts": 0}},
        ]
        prs = [{
            "number": 7, "title": "Reel for review: Does it matter how it looks?", "url": "https://github.com/demo/daily-deen-reels/pull/7",
            "branch": "reel/deen-003-what-allah-looks-at", "id": "deen-003-what-allah-looks-at", "createdAt": ts(5),
            "labels": ["daily-reel"], "reel": _demo_reel(hooks[2], "heart-check", names[2]),
            "state": {"id": "deen-003-what-allah-looks-at", "durationSec": 21.3, "qa": {"status": "automated-passed", "errors": 0, "warnings": 1},
                      "critic": {"scores": {"hook": 5, "insight": 4, "accuracy": 5}, "verdict": "pass"}, "needsAttention": False},
        }]
        workflows = {f: {"id": i, "name": f"DEEN · {n}", "state": "active", "url": f"https://github.com/demo/daily-deen-reels/actions/workflows/{f}"}
                     for i, (f, n) in enumerate(WORKFLOWS.values())}
        runs = [
            {"name": "DEEN · Daily reel", "path": ".github/workflows/deen-daily-reel.yml", "event": "schedule", "status": "completed", "conclusion": "success", "createdAt": ts(5), "url": "https://github.com/demo/daily-deen-reels/actions"},
            {"name": "DEEN · Approve & publish", "path": ".github/workflows/deen-publish.yml", "event": "schedule", "status": "completed", "conclusion": "success", "createdAt": ts(1), "url": "https://github.com/demo/daily-deen-reels/actions"},
            {"name": "DEEN · Weekly insights", "path": ".github/workflows/deen-weekly.yml", "event": "schedule", "status": "completed", "conclusion": "failure", "createdAt": ts(50), "url": "https://github.com/demo/daily-deen-reels/actions"},
        ]
        return build_snapshot(repo=self.check(), queue_files=queue_files, reel_files=reel_files, states=states, prs=prs,
                              variables={"DEEN_POST_TIME": "19:00"}, workflows=workflows, runs=runs,
                              issues=[], secrets=["IG_ACCESS_TOKEN", "IG_USER_ID"])

    def _note(self, msg):
        self.log.append(msg)
        return f"Demo mode — nothing changed. Would have: {msg}"

    def run_workflow(self, key, inputs=None, ref="main"):
        return self._note(f"start “{WORKFLOWS[key][1]}” with {json.dumps({k: v for k, v in (inputs or {}).items() if v not in ('', None)})}")

    def approve(self, number):
        return self._note(f"merge PR #{number}")

    def reject(self, number, note=""):
        return self._note(f"close PR #{number}")

    def set_hold(self, number, hold):
        return self._note(f"{'hold' if hold else 'release'} PR #{number}")

    def set_variable(self, name, value, exists):
        return self._note(f"set {name}={value}")

    def delete_variable(self, name):
        return self._note(f"reset {name} to its default")

    def set_workflow_enabled(self, key, enabled):
        return self._note(f"{'resume' if enabled else 'pause'} {WORKFLOWS[key][1]}")

    def upload_draft(self, filename, text):
        return self._note(f"add {filename} to the queue")
