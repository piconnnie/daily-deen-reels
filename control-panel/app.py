"""DEEN control panel — a Streamlit app that runs in the browser (stlite) and
drives the daily-deen-reels GitHub workflows through the GitHub API.

Your token stays in this browser tab's memory. It is never written to the page,
the URL, the repo or any server other than api.github.com.
"""
from __future__ import annotations

import re

import streamlit as st

import deen_github as gh

DEFAULT_REPO = "piconnnie/daily-deen-reels"

st.set_page_config(page_title="DEEN Control", page_icon="🎬", layout="wide")

ss = st.session_state
ss.setdefault("client", None)
ss.setdefault("snap", None)
ss.setdefault("pending", None)
ss.setdefault("flash", [])


# ---------------------------------------------------------------- helpers
def flash(kind: str, msg: str):
    ss.flash.append((kind, msg))


def show_flash():
    for kind, msg in ss.flash:
        getattr(st, kind)(msg)
    ss.flash = []


def do(action, *args, **kwargs):
    """Run a client action, report the result and reload data."""
    try:
        msg = action(*args, **kwargs)
        flash("info" if ss.client.demo else "success", msg or "Done.")
        ss.snap = None
    except gh.GitHubError as e:
        flash("error", str(e))
    except Exception as e:  # network errors etc.
        flash("error", f"Something went wrong: {e}")
    ss.pending = None
    st.rerun()


def confirm_button(label: str, key: str, question: str, action, *args, kind="secondary", **kwargs):
    """Two-step button so nothing irreversible happens on a single tap."""
    if ss.pending == key:
        st.warning(question)
        c1, c2 = st.columns(2)
        if c1.button("Yes, do it", key=f"{key}-yes", type="primary", width="stretch"):
            do(action, *args, **kwargs)
        if c2.button("Cancel", key=f"{key}-no", width="stretch"):
            ss.pending = None
            st.rerun()
    elif st.button(label, key=key, type=kind, width="stretch"):
        ss.pending = key
        st.rerun()


def run_label(run: dict | None) -> str:
    if not run:
        return "never run"
    if run.get("status") != "completed":
        return f"⏳ {run.get('status', 'running')}"
    return {"success": "✅ success", "failure": "❌ failed", "cancelled": "⏹ cancelled", "skipped": "⏭ skipped"}.get(run.get("conclusion"), run.get("conclusion") or "?")


def asset_url(repo: str, reel_id: str, name: str) -> str:
    return f"https://github.com/{repo}/releases/download/reel-{reel_id}/{name}"


# ---------------------------------------------------------------- connect
def connect_screen():
    st.title("🎬 DEEN control panel")
    st.write("Review, approve and schedule the **Daily Deen Reminders** reels, and run the automation, from one page.")
    show_flash()
    with st.form("connect"):
        token = st.text_input("GitHub token", type="password", placeholder="github_pat_…",
                              help="A fine-grained personal access token for the daily-deen-reels repo. See below.")
        repo = st.text_input("Repository", value=DEFAULT_REPO)
        go = st.form_submit_button("Connect", type="primary")
    if go:
        if not token.strip() or "/" not in repo:
            st.error("Enter a token and a repository like owner/name.")
        else:
            client = gh.GitHubClient(token, repo)
            try:
                with st.spinner("Checking access…"):
                    client.check()
                ss.client, ss.snap = client, None
                st.rerun()
            except gh.GitHubError as e:
                st.error(str(e))
            except Exception as e:
                st.error(f"Couldn't reach GitHub: {e}")
    if st.button("Explore with sample data (no token)"):
        ss.client, ss.snap = gh.DemoClient(), None
        st.rerun()
    with st.expander("How to create the token (2 minutes)"):
        st.markdown(
            """
1. Open **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `daily-deen-reels`.
3. **Repository permissions:**
   - Actions: **Read and write** (run and pause workflows)
   - Contents: **Read and write** (approve = merge, add queue drafts)
   - Pull requests: **Read and write** (approve / reject)
   - Variables: **Read and write** (posting time and other settings)
   - Issues: **Read**
   - Secrets: **Read** *(optional — only shows whether Instagram is connected; values are never readable)*
4. Pick an expiry, generate, and paste it above.

The token stays in this browser tab's memory and goes only to `api.github.com`. Closing the tab forgets it; your browser's password manager can remember it.
"""
        )


# ---------------------------------------------------------------- tabs
def overview(snap):
    v = snap["variables"]
    wf = snap["workflows"]
    secrets = snap["secrets"]

    # Things that need attention first.
    if snap["queueLowIssue"]:
        i = snap["queueLowIssue"]
        st.warning(f"Content queue is running low: {snap['queueLeft']} draft(s) left. [{i['title']}]({i['url']})")
    if v["DEEN_WRITER"] != "queue":
        need = "CLAUDE_CODE_OAUTH_TOKEN" if v["DEEN_WRITER"] == "subscription" else "ANTHROPIC_API_KEY"
        if secrets is not None and need not in secrets:
            st.warning(f"Writer is set to **{v['DEEN_WRITER']}** but the `{need}` secret is missing, so reels come from the free queue.")
        else:
            st.info(f"Paid writer on: **{v['DEEN_WRITER']}**. Set it back to `queue` in Settings to stay free.")
    if secrets is not None and "IG_ACCESS_TOKEN" not in secrets:
        st.info("Instagram isn't connected yet: approved reels will need manual posting. See AUTOMATION.md → Connect Instagram.")
    for key in ("daily", "publish"):
        w = wf.get(gh.WORKFLOWS[key][0])
        if w and w["state"] != "active":
            st.warning(f"**{gh.WORKFLOWS[key][1]}** is paused. Resume it in Settings.")
    if not wf:
        st.info("No workflows found yet. Check that Actions are enabled for the repository.")

    c = st.columns(4)
    c[0].metric("Drafts in queue", snap["queueLeft"], help="Each draft is one day's reel.")
    c[1].metric("Waiting for your review", len(snap["prs"]))
    c[2].metric("Approved, not yet posted", len(snap["byStatus"]["approved"]) + len(snap["byStatus"]["failed"]))
    c[3].metric("Posted", len(snap["byStatus"]["published"]))
    st.caption(f"New reel every day at 06:00 IST · posts after **{v['DEEN_POST_TIME']} {v['DEEN_TZ']}**, max {v['DEEN_MAX_PER_DAY']}/day · writer: **{v['DEEN_WRITER']}** · {'fully automated (auto-approve on)' if v['DEEN_AUTO_APPROVE'] != 'false' else 'every post needs your approval'}")

    left, right = st.columns(2)
    with left:
        st.subheader("Recent posts")
        pubs = snap["byStatus"]["published"][:8]
        if not pubs:
            st.write("Nothing posted yet.")
        for s in pubs:
            p = s.get("publish") or {}
            link = p.get("permalink")
            st.markdown(f"- {'[' + s['id'] + '](' + link + ')' if link else s['id']} · {gh.ago(p.get('publishedAt'))}")
        attention = snap["byStatus"]["failed"] + snap["byStatus"]["manual"]
        if attention:
            st.subheader("Needs a look")
            for s in attention:
                p = s.get("publish") or {}
                why = p.get("lastError") or ("post manually — Instagram not connected" if p.get("status") == "manual-required" else p.get("status"))
                st.markdown(f"- **{s['id']}** — {why} (attempts: {p.get('attempts', 0)})")
    with right:
        st.subheader("Automation")
        rows = []
        for key in ("daily", "publish", "timer", "weekly", "check", "token"):
            file, name = gh.WORKFLOWS[key]
            run = snap["latestRuns"].get(file)
            w = wf.get(file) or {}
            rows.append({"Workflow": name, "State": "paused" if w.get("state", "active") != "active" else "on",
                         "Last run": run_label(run), "When": gh.ago(run.get("createdAt")) if run else "",
                         "Link": run.get("url") if run else w.get("url")})
        st.dataframe(rows, hide_index=True, width="stretch",
                     column_config={"Link": st.column_config.LinkColumn("Link", display_text="open")})


def review(snap):
    prs = snap["prs"]
    if not prs:
        st.info("No reels waiting for review. A new one is made every morning, or start one in **Make a reel**.")
        return
    repo = snap["repo"]["fullName"]
    if snap["variables"]["DEEN_AUTO_APPROVE"] != "false":
        st.info(f"Fully automated: the oldest post here approves itself at {snap['variables']['DEEN_POST_TIME']} unless you reject it or put it on hold. "
                "Posts flagged ⚠️ needs attention (QA warnings) always wait for you.")
    else:
        st.info("Every post waits for you. Before approving, open each source link (quran.com / sunnah.com) and check the quote, reference and translation.")
    for pr in prs:
        rid, state, reel = pr["id"], pr.get("state") or {}, pr.get("reel") or {}
        with st.container(border=True):
            st.markdown(f"#### {gh.hook_of(reel) or pr['title']}")
            flag = " · ⚠️ needs attention" if ("needs-attention" in pr["labels"] or state.get("needsAttention")) else ""
            st.caption(f"`{rid}` · PR #{pr['number']} · opened {gh.ago(pr['createdAt'])}{flag}")
            media, info = st.columns([1, 2])
            with media:
                if ss.client.demo:
                    st.info("Cover and video preview appear here.")
                else:
                    st.image(asset_url(repo, rid, f"{rid}.jpg"), width="stretch")
                    st.link_button("▶ Watch the reel", asset_url(repo, rid, f"{rid}.mp4"), width="stretch")
            with info:
                qa = state.get("qa") or {}
                critic = state.get("critic") or {}
                bits = []
                if state.get("durationSec"):
                    bits.append(f"{state['durationSec']:.0f}s")
                if qa:
                    bits.append(f"QA {qa.get('status', '?')} ({qa.get('warnings', 0)} warnings)")
                if critic.get("verdict"):
                    bits.append(f"editor: {critic['verdict']}")
                if (reel.get("brief") or {}).get("format"):
                    bits.append(reel["brief"]["format"])
                st.write(" · ".join(bits))
                cap = reel.get("caption") or {}
                if cap.get("opening"):
                    st.markdown(f"> {cap['opening']}")
                if critic.get("scores"):
                    st.caption("Editor scores: " + ", ".join(f"{k} {v}" for k, v in critic["scores"].items()))
                st.link_button("Open the PR (full script, captions, sources)", pr["url"])
            a, h, r = st.columns(3)
            with h:
                held = "hold" in pr["labels"]
                if st.button("▶ Release hold" if held else "⏸ Hold", key=f"hold-{pr['number']}", width="stretch",
                             help="A post on hold is never auto-approved. You can still approve it yourself."):
                    do(ss.client.set_hold, pr["number"], not held)
            with a:
                confirm_button("✅ Approve", f"approve-{pr['number']}",
                               f"Approve **{rid}**? It will be posted at the next slot ({snap['variables']['DEEN_POST_TIME']}).",
                               ss.client.approve, pr["number"], kind="primary")
            with r:
                note = st.text_input("Reason (optional)", key=f"note-{pr['number']}", label_visibility="collapsed", placeholder="Reason for rejecting (optional)")
                confirm_button("❌ Reject", f"reject-{pr['number']}", f"Reject **{rid}**? The PR closes and nothing is posted.",
                               ss.client.reject, pr["number"], note)
    st.caption("Want to change a word first? Edit the reel's JSON in the PR on GitHub; it re-renders automatically.")


def make(snap):
    v = snap["variables"]
    with st.container(border=True):
        st.subheader("Make a new reel now")
        free = v["DEEN_WRITER"] == "queue"
        if free:
            st.write(f"Takes the next draft from the free queue ({snap['queueLeft']} left) and opens a review PR in ~10–15 minutes.")
        topic = st.text_input("Topic (optional)", disabled=free, help="Only used by a paid writer.")
        c1, c2 = st.columns(2)
        fmt = c1.selectbox("Format (optional)", gh.FORMATS, disabled=free)
        pillar = c2.selectbox("Pillar (optional)", gh.PILLARS, disabled=free)
        if free:
            st.caption("Topic, format and pillar only apply when a paid writer is switched on in Settings.")
        if st.button("Make a reel", type="primary", disabled=snap["queueLeft"] == 0 and free):
            do(ss.client.run_workflow, "daily", {} if free else {"topic": topic, "format": fmt, "pillar": pillar})
        if snap["queueLeft"] == 0 and free:
            st.error("The queue is empty. Add drafts in the **Queue** tab first.")

    with st.container(border=True):
        st.subheader("Send an existing reel to review")
        options = [r for r in snap["reels"] if r not in snap["archived"]] or snap["reels"]
        rid = st.selectbox("Reel", options, key="existing-reel") if options else None
        if st.button("Render and open a review PR", disabled=not rid):
            do(ss.client.run_workflow, "daily", {"reel_id": rid})

    with st.container(border=True):
        st.subheader("Post an approved reel now")
        ready = [s["id"] for s in snap["byStatus"]["approved"] + snap["byStatus"]["failed"] + snap["byStatus"]["manual"]]
        if not ready:
            st.write("No approved reels are waiting. Approve one in **Review**.")
        else:
            rid = st.selectbox("Approved reel", ready, key="post-reel")
            dry = st.checkbox("Dry run (check everything, don't post)")
            confirm_button("📣 Post now" if not dry else "Run the check", "post-now",
                           f"{'Check' if dry else 'Post'} **{rid}** now, ignoring the time slot?",
                           ss.client.run_workflow, "publish", {"reel_id": rid, "dry_run": dry}, kind="primary")

    with st.container(border=True):
        st.subheader("Maintenance")
        c = st.columns(3)
        if c[0].button("Check Instagram setup", width="stretch"):
            do(ss.client.run_workflow, "check")
        if c[1].button("Import insights now", width="stretch"):
            do(ss.client.run_workflow, "weekly")
        if c[2].button("Refresh Instagram token", width="stretch"):
            do(ss.client.run_workflow, "token")
        st.caption("Results appear under Overview → Automation (refresh in a minute).")


def queue(snap):
    left = snap["queueLeft"]
    st.metric("Drafts left", left, help="One draft = one day's reel.")
    rows = [{"Draft": q["file"].removesuffix(".json"), "Hook": q["hook"], "Format": q["format"], "Pillar": q["pillar"],
             "Status": f"used → {q['usedBy']}" if q["usedBy"] else "waiting"} for q in snap["queue"]]
    rows.sort(key=lambda r: (r["Status"] != "waiting", r["Draft"]))
    st.dataframe(rows, hide_index=True, width="stretch")

    st.subheader("Refill for free")
    st.write("Ask Claude in a chat, then commit the files it gives you (or upload them below):")
    st.code("Write the next batch of 10 queue drafts for daily-deen-reels, validate them, and push them to data/queue.", language=None)
    files = st.file_uploader("Upload draft JSON files", type=["json"], accept_multiple_files=True)
    if files:
        existing = [q["file"] for q in snap["queue"]]
        plan, bad = [], []
        for f in files:
            text = f.getvalue().decode("utf-8", "replace")
            problems = gh.validate_draft(text)
            if problems:
                bad.append((f.name, problems))
                continue
            stem = re.sub(r"^q\d+-", "", f.name.removesuffix(".json"))
            name = gh.next_queue_name(existing, stem)
            existing.append(name)
            plan.append((name, text))
        for name, problems in bad:
            st.error(f"{name}: " + " ".join(problems))
        if plan:
            st.write("Will add: " + ", ".join(f"`{n}`" for n, _ in plan))
            st.caption("Full copy and layout checks run when a draft is used; a draft that fails them is skipped, not posted.")
            if st.button(f"Add {len(plan)} draft(s) to the queue", type="primary"):
                msgs = []
                try:
                    for name, text in plan:
                        msgs.append(ss.client.upload_draft(name, text))
                    flash("info" if ss.client.demo else "success", " ".join(msgs))
                except gh.GitHubError as e:
                    flash("error", (" ".join(msgs) + " " if msgs else "") + str(e))
                ss.snap = None
                st.rerun()


def settings(snap):
    st.subheader("Pause or resume")
    wf = snap["workflows"]
    for key, what in (("daily", "making a new reel every morning"), ("publish", "posting approved reels"), ("weekly", "the weekly insights import")):
        file, name = gh.WORKFLOWS[key]
        w = wf.get(file)
        if not w:
            continue
        active = w["state"] == "active"
        c1, c2 = st.columns([3, 1])
        c1.markdown(f"**{name}** — {what}: {'🟢 on' if active else '⏸ paused'}")
        with c2:
            confirm_button("Pause" if active else "Resume", f"toggle-{key}",
                           f"{'Pause' if active else 'Resume'} {name.lower()}?", ss.client.set_workflow_enabled, key, not active)

    st.subheader("Schedule and settings")
    v, was_set = snap["variables"], snap["variablesSet"]
    with st.form("settings"):
        new = {}
        c1, c2 = st.columns(2)
        new["DEEN_POST_TIME"] = c1.text_input("Posting time (HH:MM)", v["DEEN_POST_TIME"], help=gh.VARIABLES["DEEN_POST_TIME"][1])
        new["DEEN_TZ"] = c2.text_input("Time zone", v["DEEN_TZ"], help=gh.VARIABLES["DEEN_TZ"][1])
        c1, c2, c3 = st.columns(3)
        new["DEEN_MAX_PER_DAY"] = str(c1.number_input("Posts per day", 1, 5, int(v["DEEN_MAX_PER_DAY"] or 1)))
        new["DEEN_MAX_OPEN_REVIEWS"] = str(c2.number_input("Max reels waiting for review", 1, 10, int(v["DEEN_MAX_OPEN_REVIEWS"] or 3)))
        new["DEEN_QUEUE_LOW"] = str(c3.number_input("Warn when drafts left ≤", 0, 30, int(v["DEEN_QUEUE_LOW"] or 5)))
        c1, c2 = st.columns(2)
        writer = v["DEEN_WRITER"] if v["DEEN_WRITER"] in gh.WRITERS else "queue"
        new["DEEN_WRITER"] = c1.selectbox("Writer", gh.WRITERS, gh.WRITERS.index(writer),
                                          format_func=lambda w: {"queue": "queue (free)", "subscription": "Claude subscription (paid plan)", "api": "Claude API (pay per token)"}[w])
        auto = c1.selectbox("Auto-approve", ["true", "false"], ["true", "false"].index("false" if v["DEEN_AUTO_APPROVE"] == "false" else "true"),
                            format_func=lambda x: {"true": "on — fully automated (I can still reject or hold)", "false": "off — I approve every post"}[x])
        new["DEEN_AUTO_APPROVE"] = auto
        login = v["IG_LOGIN"] if v["IG_LOGIN"] in ("instagram", "facebook") else "instagram"
        new["IG_LOGIN"] = c2.selectbox("Instagram login type", ["instagram", "facebook"], ["instagram", "facebook"].index(login))
        saved = st.form_submit_button("Save settings", type="primary")
    if saved:
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", new["DEEN_POST_TIME"].strip()):
            st.error("Posting time must look like 19:00 (24-hour).")
            return
        changes = {k: val.strip() for k, val in new.items() if val.strip() != v[k]}
        if not changes:
            st.info("Nothing changed.")
            return
        msgs = []
        try:
            for k, val in changes.items():
                default = gh.VARIABLES[k][0]
                if val == default and k in was_set:
                    r = ss.client.delete_variable(k)
                else:
                    r = ss.client.set_variable(k, val, k in was_set)
                msgs.append(r or f"{k} = {val}")
            flash("info" if ss.client.demo else "success", "Saved: " + "; ".join(msgs))
        except gh.GitHubError as e:
            flash("error", str(e))
        ss.snap = None
        st.rerun()
    st.caption("The posting time is checked every hour, so changes apply within the hour. "
               "The morning reel is made at 06:00 IST (set in the workflow file). Paid writers also need their secret in the repo settings.")


# ---------------------------------------------------------------- main
def main():
    if ss.client is None:
        connect_screen()
        return
    client = ss.client
    with st.sidebar:
        st.markdown(f"**{client.repo}**" + (" · sample data" if client.demo else ""))
        if st.button("↻ Refresh", width="stretch"):
            ss.snap = None
            st.rerun()
        if st.button("Disconnect", width="stretch"):
            ss.client, ss.snap, ss.pending = None, None, None
            st.rerun()
        if not client.demo:
            st.link_button("Open repository", f"https://github.com/{client.repo}", width="stretch")
            st.link_button("Actions runs", f"https://github.com/{client.repo}/actions", width="stretch")
    st.title("🎬 DEEN control panel")
    if client.demo:
        st.info("You're exploring sample data. Buttons show what they would do; nothing changes.")
    show_flash()
    if ss.snap is None:
        try:
            with st.spinner("Loading from GitHub…"):
                ss.snap = client.snapshot()
        except gh.GitHubError as e:
            st.error(str(e))
            return
        except Exception as e:
            st.error(f"Couldn't load data from GitHub: {e}")
            return
    snap = ss.snap
    t = st.tabs([f"Overview", f"Review ({len(snap['prs'])})", "Make a reel", f"Queue ({snap['queueLeft']})", "Settings"])
    with t[0]:
        overview(snap)
    with t[1]:
        review(snap)
    with t[2]:
        make(snap)
    with t[3]:
        queue(snap)
    with t[4]:
        settings(snap)


main()
