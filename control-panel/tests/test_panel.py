"""Tests for the control panel: API client against a mock GitHub, and the app's
flows (connect, review, make, queue, settings, demo) via a fake Streamlit.

    python3 control-panel/tests/test_panel.py
"""
from __future__ import annotations

import json
import os
import sys
import unittest
import warnings
from pathlib import Path

HERE = Path(__file__).resolve().parent
PANEL = HERE.parent
ROOT = PANEL.parent
sys.path[:0] = [str(PANEL), str(HERE)]

import fake_streamlit  # noqa: E402
import mock_github  # noqa: E402

ST = fake_streamlit.install()
import deen_github as gh  # noqa: E402

APP = PANEL / "app.py"
A = gh.APP


def repo_files():
    """Real queue drafts and reels from this repo + a small archive."""
    main = {}
    for p in sorted((ROOT / A / "data" / "queue").glob("*.json"))[:6]:
        main[f"{gh.QUEUE_DIR}/{p.name}"] = p.read_text()
    q1 = json.loads(main[f"{gh.QUEUE_DIR}/q002-one-ayah-ash-sharh.json"])
    q1["brief"]["queueId"] = "q002-one-ayah-ash-sharh"
    main[f"{gh.REELS_DIR}/deen-003-do-you-need-an-agent.json"] = json.dumps(q1)
    for p in (ROOT / A / "src" / "content" / "reels").glob("deen-001-*.json"):  # the sample reel only; live posts must not change the counts
        main[f"{gh.REELS_DIR}/{p.name}"] = p.read_text()
    main[f"{gh.ARCHIVE_DIR}/deen-003-do-you-need-an-agent/state.json"] = json.dumps({
        "id": "deen-003-do-you-need-an-agent", "approval": {"status": "approved", "approvedAt": "2026-10-17T10:00:00Z"},
        "publish": {"status": "published", "permalink": "https://www.instagram.com/reel/ABC/", "publishedAt": "2026-10-17T13:40:00Z"}})
    main[f"{gh.ARCHIVE_DIR}/deen-003-do-you-need-an-agent/caption.txt"] = "caption"
    main[f"{gh.ARCHIVE_DIR}/deen-004-x/state.json"] = json.dumps({
        "id": "deen-004-x", "approval": {"status": "approved", "approvedAt": "2026-10-18T10:00:00Z"}, "publish": {"status": "pending"}})
    main[f"{gh.ARCHIVE_DIR}/deen-006-y/state.json"] = json.dumps({
        "id": "deen-006-y", "approval": {"status": "approved", "approvedAt": "2026-10-18T11:00:00Z"},
        "publish": {"status": "failed", "attempts": 1, "lastError": "media download failed"}})
    q2 = json.loads(main[f"{gh.QUEUE_DIR}/q003-dua-against-useless-knowledge.json"])
    q2["brief"]["queueId"] = "q003-dua-against-useless-knowledge"
    branch = {
        f"{gh.REELS_DIR}/deen-005-rag.json": json.dumps(q2),
        f"{gh.ARCHIVE_DIR}/deen-005-rag/state.json": json.dumps({"id": "deen-005-rag", "durationSec": 22.4,
                                                                "qa": {"status": "automated-passed", "warnings": 0},
                                                                "critic": {"verdict": "pass", "scores": {"hook": 5}}}),
    }
    return {"main": main, "reel/deen-005-rag": {**main, **branch}}


def new_state(**kw):
    return mock_github.State(repo_files(), [
        {"number": 5, "branch": "reel/deen-005-rag", "title": "Reel for review: deen-005-rag", "labels": ["daily-reel"], "state": "open"},
        {"number": 6, "branch": "feature/x", "title": "Docs", "labels": ["docs"], "state": "open"},
    ], variables={"DEEN_POST_TIME": "19:00"}, **kw)


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.state = new_state(secrets=["IG_ACCESS_TOKEN"])
        self.srv, url = mock_github.serve(self.state)
        self.c = gh.GitHubClient(mock_github.TOKEN, "me/daily-deen-reels", api=url)

    def tearDown(self):
        self.srv.shutdown()

    def test_snapshot(self):
        s = self.c.snapshot()
        self.assertEqual(len(s["queue"]), 6)
        used = {q["file"]: q["usedBy"] for q in s["queue"]}
        self.assertEqual(used["q002-one-ayah-ash-sharh.json"], "deen-003-do-you-need-an-agent")  # used on main
        self.assertEqual(used["q003-dua-against-useless-knowledge.json"], "deen-005-rag")                 # used by an open PR
        self.assertEqual(s["queueLeft"], 4)  # q002 (main) and q003 (open PR) used
        self.assertEqual([p["number"] for p in s["prs"]], [5])  # only daily-reel PRs
        self.assertEqual(s["prs"][0]["state"]["critic"]["verdict"], "pass")
        self.assertEqual(gh.hook_of(s["prs"][0]["reel"]), gh.hook_of(json.loads(self.state.files["main"][f"{gh.QUEUE_DIR}/q003-dua-against-useless-knowledge.json"])))
        self.assertEqual([x["id"] for x in s["byStatus"]["published"]], ["deen-003-do-you-need-an-agent"])
        self.assertEqual([x["id"] for x in s["byStatus"]["approved"]], ["deen-004-x"])
        self.assertEqual([x["id"] for x in s["byStatus"]["failed"]], ["deen-006-y"])
        self.assertEqual(s["variables"]["DEEN_POST_TIME"], "19:00")
        self.assertEqual(s["variables"]["DEEN_WRITER"], "queue")  # default when unset
        self.assertEqual(s["latestRuns"]["deen-daily-reel.yml"]["conclusion"], "success")  # newest run wins
        self.assertEqual(s["secrets"], ["IG_ACCESS_TOKEN"])
        self.assertIn("deen-003-do-you-need-an-agent", s["archived"])

    def test_snapshot_without_optional_permissions(self):
        self.state.secrets = None
        s = self.c.snapshot()
        self.assertIsNone(s["secrets"])

    def test_bad_token(self):
        c = gh.GitHubClient("wrong", "me/daily-deen-reels", api=self.c.api)
        with self.assertRaises(gh.GitHubError) as e:
            c.check()
        self.assertEqual(e.exception.status, 401)
        self.assertIn("invalid or expired", str(e.exception))

    def test_wrong_repo_hint(self):
        c = gh.GitHubClient(mock_github.TOKEN, "me/other", api=self.c.api)
        with self.assertRaises(gh.GitHubError) as e:
            c.check()
        self.assertIn("permission", str(e.exception))

    def test_actions(self):
        self.c.run_workflow("daily", {"reel_id": "deen-001", "topic": "", "dry_run": False})
        self.assertEqual(self.state.dispatches[-1], ("deen-daily-reel.yml", {"ref": "main", "inputs": {"reel_id": "deen-001", "dry_run": "false"}}))
        self.c.approve(5)
        self.assertEqual(self.state.prs[0]["state"], "merged")
        self.c.reject(6, "off-brand")
        self.assertEqual(self.state.prs[1]["state"], "closed")
        self.assertIn("off-brand", self.state.comments[-1][1])
        self.c.set_variable("DEEN_POST_TIME", "20:30", True)
        self.c.set_variable("DEEN_WRITER", "api", False)
        self.assertEqual(self.state.variables, {"DEEN_POST_TIME": "20:30", "DEEN_WRITER": "api"})
        self.c.delete_variable("DEEN_WRITER")
        self.assertNotIn("DEEN_WRITER", self.state.variables)
        self.c.set_workflow_enabled("daily", False)
        self.assertEqual(self.state.workflows["deen-daily-reel.yml"], "disabled_manually")
        self.c.upload_draft("q099-new.json", '{"a": 1}')
        self.assertEqual(self.state.files["main"][f"{gh.QUEUE_DIR}/q099-new.json"], '{"a": 1}')

    def test_merge_falls_back_when_merge_commits_disabled(self):
        self.state.merge_methods = ("squash",)
        self.c.approve(5)
        merges = [b["merge_method"] for m, p, b in self.state.log if p.endswith("/merge")]
        self.assertEqual(merges, ["merge", "squash"])

    def test_helpers(self):
        self.assertEqual(gh.next_queue_name(["q001-a.json", "q014-b.json"], "My New Draft!"), "q015-my-new-draft.json")
        self.assertEqual(gh.next_queue_name([], ""), "q001-draft.json")
        real = (ROOT / A / "data/queue/q005-before-you-scroll-intention.json").read_text()
        self.assertEqual(gh.validate_draft(real), [])
        self.assertEqual(gh.validate_draft("nope"), ["Not valid JSON."])
        self.assertTrue(any("hook" in p for p in gh.validate_draft(json.dumps({**json.loads(real), "scenes": [{"type": "cards"}, {"type": "takeaway"}]}))))
        self.assertEqual(gh.reel_id_from_branch("reel/deen-009-x"), "deen-009-x")


class AppTests(unittest.TestCase):
    """Drives app.py like a user would."""

    def setUp(self):
        self.state = new_state(secrets=["IG_ACCESS_TOKEN", "IG_USER_ID"])
        self.srv, url = mock_github.serve(self.state)
        os.environ["DEEN_GITHUB_API"] = url
        ST.session_state.clear()

    def tearDown(self):
        self.srv.shutdown()
        os.environ.pop("DEEN_GITHUB_API", None)

    def run_app(self, press=(), **inputs):
        fake_streamlit.run_app(ST, APP, press=press, inputs=inputs)

    def errors(self):
        return ST.texts("error", "exception")

    def connect(self):
        self.run_app()
        self.assertIn("Connect", ST.buttons_seen)
        self.run_app(press={"Connect"}, **{"GitHub token": mock_github.TOKEN, "Repository": "me/daily-deen-reels"})
        self.assertEqual(self.errors(), [])
        self.assertIsNotNone(ST.session_state.client)

    def test_connect_rejects_bad_token(self):
        self.run_app(press={"Connect"}, **{"GitHub token": "nope", "Repository": "me/daily-deen-reels"})
        self.assertTrue(any("invalid or expired" in e for e in self.errors()))
        self.assertIsNone(ST.session_state.client)

    def test_overview_and_tabs_render(self):
        self.connect()
        metrics = {a[0]: a[1] for n, a, k in ST.calls if n == "metric"}
        self.assertEqual(metrics["Drafts in queue"], 4)
        self.assertEqual(metrics["Waiting for your review"], 1)
        self.assertEqual(metrics["Approved, not yet posted"], 2)
        self.assertEqual(metrics["Posted"], 1)
        self.assertIn(["Overview", "Review (1)", "Make a reel", "Queue (4)", "Settings"], [a[0] for n, a, k in ST.calls if n == "tabs"])
        self.assertIn("approve-5", ST.buttons_seen)
        self.assertTrue(any("media download failed" in t for t in ST.texts("markdown")))

    def test_approve_needs_confirmation(self):
        self.connect()
        self.run_app(press={"approve-5"})
        self.assertEqual(self.state.prs[0]["state"], "open")  # first tap only asks
        self.assertTrue(any("Approve" in t for t in ST.texts("warning")))
        self.run_app(press={"approve-5-yes"})
        self.assertEqual(self.state.prs[0]["state"], "merged")
        self.assertTrue(any("Approved" in t for t in ST.texts("success")))

    def test_reject_with_reason(self):
        self.connect()
        self.run_app(press={"reject-5"})
        self.run_app(press={"reject-5-yes"}, **{"note-5": "too generic"})
        self.assertEqual(self.state.prs[0]["state"], "closed")
        self.assertIn("too generic", self.state.comments[-1][1])

    def test_cancel(self):
        self.connect()
        self.run_app(press={"reject-5"})
        self.run_app(press={"reject-5-no"})
        self.assertEqual(self.state.prs[0]["state"], "open")
        self.assertIsNone(ST.session_state.pending)

    def test_make_reel_free_mode_sends_no_topic(self):
        self.connect()
        self.run_app(press={"Make a reel"}, **{"Topic (optional)": "ignored in free mode"})
        self.assertEqual(self.state.dispatches[-1], ("deen-daily-reel.yml", {"ref": "main", "inputs": {}}))

    def test_make_reel_paid_mode_sends_topic(self):
        self.state.variables["DEEN_WRITER"] = "api"
        self.connect()
        self.run_app(press={"Make a reel"}, **{"Topic (optional)": "Patience at work", "Format (optional)": "dua"})
        self.assertEqual(self.state.dispatches[-1][1]["inputs"], {"topic": "Patience at work", "format": "dua"})

    def test_existing_reel_and_post_now_and_maintenance(self):
        self.connect()
        self.run_app(press={"Render and open a review PR"})
        self.assertEqual(self.state.dispatches[-1][0], "deen-daily-reel.yml")
        self.assertTrue(self.state.dispatches[-1][1]["inputs"]["reel_id"].startswith("deen-00"))
        self.run_app(press={"post-now"})
        self.run_app(press={"post-now-yes"}, **{"Dry run (check everything, don't post)": True})
        self.assertEqual(self.state.dispatches[-1], ("deen-publish.yml", {"ref": "main", "inputs": {"reel_id": "deen-004-x", "dry_run": "true"}}))
        for label, wf in (("Check Instagram setup", "deen-check-instagram.yml"), ("Import insights now", "deen-weekly.yml"), ("Refresh Instagram token", "deen-token-refresh.yml")):
            self.run_app(press={label})
            self.assertEqual(self.state.dispatches[-1][0], wf)

    def test_settings(self):
        self.connect()
        self.run_app(press={"Save settings"}, **{"Posting time (HH:MM)": "7pm"})
        self.assertTrue(any("24-hour" in e for e in self.errors()))
        self.assertEqual(self.state.variables["DEEN_POST_TIME"], "19:00")
        self.run_app(press={"Save settings"}, **{"Posting time (HH:MM)": "20:30", "Writer": "subscription", "Posts per day": 2})
        self.assertEqual(self.state.variables, {"DEEN_POST_TIME": "20:30", "DEEN_WRITER": "subscription", "DEEN_MAX_PER_DAY": "2"})
        # back to a default removes the variable
        self.run_app(press={"Save settings"}, **{"Writer": "queue"})
        self.assertNotIn("DEEN_WRITER", self.state.variables)
        # paid writer without its secret is flagged on the overview
        self.state.variables["DEEN_WRITER"] = "api"
        self.run_app(press={"↻ Refresh"})
        self.assertTrue(any("ANTHROPIC_API_KEY" in w for w in ST.texts("warning")))

    def test_auto_approve_setting_and_hold(self):
        self.connect()
        self.run_app(press={"↻ Refresh"})
        self.assertTrue(any("Fully automated" in t for t in ST.texts("info")))  # on by default
        self.run_app(press={"Save settings"}, **{"Auto-approve": "false"})
        self.assertEqual(self.state.variables.get("DEEN_AUTO_APPROVE"), "false")
        self.run_app(press={"↻ Refresh"})
        self.assertTrue(any("Every post waits for you" in t for t in ST.texts("info")))
        self.run_app(press={"hold-5"})
        self.assertIn("hold", self.state.prs[0]["labels"])
        self.run_app(press={"hold-5"})
        self.assertNotIn("hold", self.state.prs[0]["labels"])
        self.run_app(press={"Save settings"}, **{"Auto-approve": "true"})
        self.assertNotIn("DEEN_AUTO_APPROVE", self.state.variables)  # back to default removes it

    def test_pause_resume(self):
        self.connect()
        self.run_app(press={"toggle-daily"})
        self.run_app(press={"toggle-daily-yes"})
        self.assertEqual(self.state.workflows["deen-daily-reel.yml"], "disabled_manually")
        self.assertTrue(any("paused" in w for w in ST.texts("warning")))
        self.run_app(press={"toggle-daily"})
        self.run_app(press={"toggle-daily-yes"})
        self.assertEqual(self.state.workflows["deen-daily-reel.yml"], "active")

    def test_upload_drafts(self):
        self.connect()
        good = (ROOT / A / "data/queue/q005-before-you-scroll-intention.json").read_text()
        ups = [fake_streamlit.Upload("q123-monitor-after-launch.json", good), fake_streamlit.Upload("broken.json", "{")]
        self.run_app(**{"Upload draft JSON files": ups})
        self.assertTrue(any("broken.json" in e for e in self.errors()))
        self.run_app(press={"Add 1 draft(s) to the queue"}, **{"Upload draft JSON files": ups})
        self.assertIn(f"{gh.QUEUE_DIR}/q007-monitor-after-launch.json", self.state.files["main"])  # renumbered after the highest existing draft (q006 in the mock)
        self.assertNotIn(f"{gh.QUEUE_DIR}/broken.json", self.state.files["main"])
        story = (ROOT / A / "data/queue/q007-story-weekly-self-check.json").read_text()
        self.assertEqual(gh.validate_draft(story), [])

    def test_demo_mode_every_button(self):
        self.run_app(press={"Explore with sample data (no token)"})
        self.assertTrue(ST.session_state.client.demo)
        seen = list(dict.fromkeys(ST.buttons_seen))
        pressed = 0
        for b in seen:
            if b in ("Disconnect",):
                continue
            self.run_app(press={b})
            if f"{b}-yes" in ST.buttons_seen:
                self.run_app(press={f"{b}-yes"})
            pressed += 1
            self.assertEqual([e for e in self.errors() if "Posting time" not in e], [], b)
        self.assertGreater(pressed, 10)
        self.assertGreaterEqual(len(ST.session_state.client.log), 8)
        self.run_app(press={"Disconnect"})
        self.assertIsNone(ST.session_state.client)


if __name__ == "__main__":
    warnings.simplefilter("ignore", ResourceWarning)
    unittest.main(verbosity=1)
