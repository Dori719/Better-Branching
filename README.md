# Better Branching

A small SillyTavern extension that adds expandable branches to the existing chat history popup. Built against the SillyTavern 1.19.0 reference.

Parent chats get a slim **Branches** dropdown. Connected chats appear underneath with nested indentation. The native chat rows, previews, metadata, search, selection highlight, and action icons are preserved. There is no extra toolbar or separate manager.

## Install

Copy this folder into your active SillyTavern installation at:

```text
public/scripts/extensions/third-party/Better-Branching/
```

The runtime needs `manifest.json`, `index.js`, `tree.js`, and `style.css`. Reload SillyTavern and open its chat history popup. This project does not install itself or modify the reference installation.

## Behavior

- Click a chat to open it using SillyTavern's existing handler.
- Click the branch bar to expand or collapse connected chats.
- Branches of branches nest underneath their parent.
- Search uses SillyTavern's results and reveals the matching ancestry.
- Parents and siblings use their own last-message dates for ordering.
- Current-chat ancestors expand when opening history; expansion is remembered for this browser session.
- Missing or ambiguous parent links leave the chat accessible as an ordinary top-level row.

Relationships use `chat_metadata.main_chat` and source-message `extra.branches`, never filename patterns. Checkpoints with the same parent metadata can also appear as connected chats. Opening history reads chat metadata with at most four concurrent requests because the search endpoint omits it. The native list remains usable while these reads run, and remains available if loading fails. No chat data is changed by grouping.

## Development preview

```powershell
node preview/server.mjs
```

Open http://127.0.0.1:8766. The preview uses synthetic chats, the production grouping code, a native-style popup fixture, and the reference installation's icon font. Action icons report their intent in the preview rather than modifying chats.

```powershell
npm test
npm run check
```

Model tests cover nested relationships, copied links, cycles, missing parents, renamed-parent recovery, sorting, and search paths. Real installed integration remains a separate validation step.
