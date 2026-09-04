# Transports

Transport implementations belong in this directory.

The proxy core should depend on a small transport interface instead of a specific browser transport. This keeps HTTP rewriting, policy, and transport concerns separate.

A future transport can implement the interface in `index.js` and be registered by the application. Wisp-compatible transport support belongs here rather than in the HTML rewriter or target policy.
