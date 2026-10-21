# DEEN control panel

A Streamlit app that runs in the browser via [stlite](https://github.com/whitphx/stlite) (Streamlit on WebAssembly), so it can be hosted on GitHub Pages with no server. It drives the daily-deen-reels workflows through the GitHub API using a token you paste in.

- `index.html` loads stlite and mounts the app
- `app.py` the Streamlit UI
- `deen_github.py` GitHub REST + GraphQL client, plus a sample-data client
- `tests/` logic tests against a mock GitHub (`python3 tests/test_panel.py`) and a browser smoke test that CI runs before every deploy

Setup and usage: [`../deen-content/AUTOMATION.md`](../deen-content/AUTOMATION.md#control-panel-github-pages).

To try it locally: `python3 -m http.server -d control-panel` and open http://localhost:8000 (needs internet for the stlite CDN).
