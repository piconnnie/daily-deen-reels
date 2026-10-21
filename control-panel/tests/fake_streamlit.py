"""Just enough of the Streamlit API to execute app.py headlessly: every call is
recorded, buttons fire when the test 'presses' them, widgets return scripted
values. It checks the app's logic and control flow, not the visual result —
the real browser check runs in CI (see smoke_browser.py)."""
from __future__ import annotations

import runpy
import sys
import types
from pathlib import Path


class Rerun(BaseException):  # like Streamlit's ScriptControlException
    pass


class SessionState(dict):
    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError as e:
            raise AttributeError(k) from e

    def __setattr__(self, k, v):
        self[k] = v


class Upload:
    def __init__(self, name, text):
        self.name = name
        self._b = text.encode()

    def getvalue(self):
        return self._b


class FakeST:
    def __init__(self):
        self.session_state = SessionState()
        self.press: set[str] = set()
        self.inputs: dict = {}
        self.calls: list[tuple] = []
        self.buttons_seen: list[str] = []
        self.column_config = types.SimpleNamespace(LinkColumn=lambda *a, **k: ("LinkColumn", a, k))
        self.sidebar = self

    # ---------- recording
    def _rec(self, name, *a, **k):
        self.calls.append((name, a, k))

    def texts(self, *kinds):
        out = []
        for name, a, k in self.calls:
            if not kinds or name in kinds:
                out.append(" ".join(str(x) for x in a))
        return out

    def __getattr__(self, name):  # anything not modelled: record and return None
        if name.startswith("__"):
            raise AttributeError(name)
        return lambda *a, **k: self._rec(name, *a, **k)

    # ---------- layout (context managers that return this fake)
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def columns(self, spec, **k):
        n = spec if isinstance(spec, int) else len(spec)
        return [self] * n

    def tabs(self, labels):
        self._rec("tabs", labels)
        return [self] * len(labels)

    def container(self, **k):
        return self

    def expander(self, *a, **k):
        return self

    def form(self, *a, **k):
        return self

    def spinner(self, *a, **k):
        return self

    def set_page_config(self, **k):
        pass

    def rerun(self):
        raise Rerun()

    # ---------- widgets
    def _key(self, label, key):
        return key or label

    def button(self, label, key=None, **k):
        kk = self._key(label, key)
        self.buttons_seen.append(kk)
        self._rec("button", label, key=kk, disabled=k.get("disabled", False))
        if kk in self.press and not k.get("disabled"):
            self.press.discard(kk)
            return True
        return False

    form_submit_button = button

    def link_button(self, label, url, **k):
        self._rec("link_button", label, url)

    def text_input(self, label, value="", key=None, **k):
        self._rec("text_input", label)
        return self.inputs.get(self._key(label, key), value)

    def selectbox(self, label, options, index=0, key=None, **k):
        options = list(options)
        self._rec("selectbox", label, options)
        v = self.inputs.get(self._key(label, key))
        return v if v is not None else (options[index] if options else None)

    def number_input(self, label, min_value=None, max_value=None, value=None, key=None, **k):
        return self.inputs.get(self._key(label, key), value)

    def checkbox(self, label, value=False, key=None, **k):
        return self.inputs.get(self._key(label, key), value)

    def file_uploader(self, label, key=None, **k):
        return self.inputs.get(self._key(label, key))

    def metric(self, label, value, **k):
        self._rec("metric", label, value)


def install() -> FakeST:
    st = FakeST()
    sys.modules["streamlit"] = st  # type: ignore[assignment]
    return st


def run_app(st: FakeST, app: Path, press=(), inputs=None, max_reruns=6):
    """One user interaction: press buttons / set inputs, run the script, follow reruns."""
    st.press = set(press)
    st.inputs = dict(inputs or {})
    for _ in range(max_reruns):
        st.calls, st.buttons_seen = [], []
        try:
            runpy.run_path(str(app), run_name="__main__")
            return
        except Rerun:
            continue
    raise RuntimeError("too many reruns")
