"""A small stand-in for api.github.com covering exactly the calls the control
panel makes. Files are served from an in-memory {branch: {path: text}} map."""
from __future__ import annotations

import base64
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "test-token"


class State:
    def __init__(self, files, prs, variables=None, secrets=None, merge_methods=("merge", "squash", "rebase")):
        self.files = files                    # {branch: {path: text}}
        self.prs = prs                        # [{number, branch, title, labels, state}]
        self.variables = dict(variables or {})
        self.secrets = secrets                # list of names, or None -> 403
        self.workflows = {f: "active" for f in ["deen-daily-reel.yml", "deen-publish.yml", "deen-weekly.yml",
                                                "deen-check-instagram.yml", "deen-token-refresh.yml", "deen-reel-edit.yml"]}
        self.merge_methods = merge_methods
        self.log = []                         # (method, path, body)
        self.dispatches = []
        self.comments = []
        self.issues = []                      # open queue-low issues

    def tree(self, branch, directory):
        prefix = directory.rstrip("/") + "/"
        names = {}
        for p, text in self.files.get(branch, {}).items():
            if p.startswith(prefix):
                rest = p[len(prefix):]
                head = rest.split("/")[0]
                names[head] = ("tree", None) if "/" in rest else ("blob", text)
        if not names:
            return None
        return {"entries": [{"name": n, "type": t, "object": ({"text": txt} if t == "blob" else {})} for n, (t, txt) in sorted(names.items())]}

    def blob(self, branch, path):
        text = self.files.get(branch, {}).get(path)
        return None if text is None else {"text": text}


def make_handler(state: State):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body=None):
            data = b"" if body is None else json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}") if n else {}

        def _route(self, method):
            body = self._body() if method in ("POST", "PUT", "PATCH") else {}
            path = self.path.split("?")[0]
            state.log.append((method, path, body))
            if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                return self._send(401, {"message": "Bad credentials"})
            m = re.match(r"^/repos/([^/]+)/([^/]+)(/.*)?$", path)
            if path == "/graphql":
                return self._graphql(body)
            if not m or f"{m.group(1)}/{m.group(2)}" != "me/daily-deen-reels":
                return self._send(404, {"message": "Not Found"})
            rest = m.group(3) or ""
            if rest == "" and method == "GET":
                return self._send(200, {"full_name": "me/daily-deen-reels", "private": False, "default_branch": "main"})
            if rest == "/actions/variables" and method == "GET":
                return self._send(200, {"variables": [{"name": k, "value": v} for k, v in state.variables.items()]})
            if rest == "/actions/variables" and method == "POST":
                if body["name"] in state.variables:
                    return self._send(409, {"message": "Already exists"})
                state.variables[body["name"]] = body["value"]
                return self._send(201, {})
            mv = re.match(r"^/actions/variables/(\w+)$", rest)
            if mv and method == "PATCH":
                if mv.group(1) not in state.variables:
                    return self._send(404, {"message": "Not Found"})
                state.variables[mv.group(1)] = body["value"]
                return self._send(204)
            if mv and method == "DELETE":
                state.variables.pop(mv.group(1), None)
                return self._send(204)
            if rest == "/actions/secrets":
                if state.secrets is None:
                    return self._send(403, {"message": "Resource not accessible by personal access token"})
                return self._send(200, {"secrets": [{"name": s} for s in state.secrets]})
            if rest == "/actions/workflows":
                return self._send(200, {"workflows": [{"id": i, "name": f, "path": f".github/workflows/{f}", "state": s, "html_url": f"https://x/{f}"}
                                                      for i, (f, s) in enumerate(state.workflows.items())]})
            mw = re.match(r"^/actions/workflows/([\w.-]+)/(enable|disable|dispatches)$", rest)
            if mw:
                f, op = mw.groups()
                if f not in state.workflows:
                    return self._send(404, {"message": "Not Found"})
                if op == "dispatches":
                    state.dispatches.append((f, body))
                else:
                    state.workflows[f] = "active" if op == "enable" else "disabled_manually"
                return self._send(204)
            if rest == "/actions/runs":
                return self._send(200, {"workflow_runs": [
                    {"name": "DEEN · Daily reel", "path": ".github/workflows/deen-daily-reel.yml", "event": "schedule", "status": "completed", "conclusion": "success", "created_at": "2026-10-19T00:40:00Z", "html_url": "https://x/run/1"},
                    {"name": "DEEN · Daily reel", "path": ".github/workflows/deen-daily-reel.yml", "event": "schedule", "status": "completed", "conclusion": "failure", "created_at": "2026-10-18T00:40:00Z", "html_url": "https://x/run/0"},
                ]})
            mp = re.match(r"^/pulls/(\d+)(/merge)?$", rest)
            if mp:
                pr = next((p for p in state.prs if p["number"] == int(mp.group(1))), None)
                if not pr:
                    return self._send(404, {"message": "Not Found"})
                if mp.group(2) and method == "PUT":
                    if body.get("merge_method", "merge") not in state.merge_methods:
                        return self._send(405, {"message": "Merge commits are not allowed on this repository."})
                    pr["state"] = "merged"
                    return self._send(200, {"merged": True})
                if method == "PATCH":
                    pr["state"] = body.get("state", pr["state"])
                    return self._send(200, {})
            if rest == "/labels" and method == "POST":
                return self._send(201, {})
            ml = re.match(r"^/issues/(\d+)/labels(?:/([\w-]+))?$", rest)
            if ml:
                pr = next((p for p in state.prs if p["number"] == int(ml.group(1))), None)
                if not pr:
                    return self._send(404, {"message": "Not Found"})
                if method == "POST":
                    pr["labels"] = list(dict.fromkeys(pr["labels"] + body["labels"]))
                    return self._send(200, [])
                if method == "DELETE":
                    pr["labels"] = [l for l in pr["labels"] if l != ml.group(2)]
                    return self._send(200, [])
            mc = re.match(r"^/issues/(\d+)/comments$", rest)
            if mc and method == "POST":
                state.comments.append((int(mc.group(1)), body["body"]))
                return self._send(201, {})
            mf = re.match(r"^/contents/(.+)$", rest)
            if mf and method == "PUT":
                p = mf.group(1)
                if p in state.files["main"]:
                    return self._send(422, {"message": "sha wasn't supplied"})
                state.files["main"][p] = base64.b64decode(body["content"]).decode()
                return self._send(201, {})
            return self._send(404, {"message": f"mock: no route {method} {rest}"})

        def _graphql(self, body):
            q = body["query"]
            out = {}
            for alias, expr in re.findall(r'(\w+): object\(expression:"([^"]+)"\)', q):
                branch, path = expr.split(":", 1)
                branch = "main" if branch == "HEAD" else branch
                if "on Tree" in q.split(f"{alias}: object", 1)[1].split("\n", 1)[0]:
                    out[alias] = state.tree(branch, path)
                else:
                    out[alias] = state.blob(branch, path)
            if "pullRequests(" in q:
                out["pullRequests"] = {"nodes": [{"number": p["number"], "title": p["title"], "url": f"https://x/pull/{p['number']}",
                                                  "headRefName": p["branch"], "createdAt": "2026-10-19T01:00:00Z",
                                                  "labels": {"nodes": [{"name": l} for l in p["labels"]]}}
                                                 for p in state.prs if p["state"] == "open" and "daily-reel" in p["labels"]]}
            if "issues(" in q:
                out["issues"] = {"nodes": state.issues}
            return self._send(200, {"data": {"repository": out}})

        def do_GET(self):
            self._route("GET")

        def do_POST(self):
            self._route("POST")

        def do_PUT(self):
            self._route("PUT")

        def do_PATCH(self):
            self._route("PATCH")

        def do_DELETE(self):
            self._route("DELETE")

    return H


def serve(state: State):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"
