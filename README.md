# Better Branching

A small SillyTavern extension that adds expandable branches to the existing chat history popup. Built against the SillyTavern 1.19.0 reference.

Parent chats get a slim **Branches** dropdown. Connected chats appear underneath with nested indentation. The native chat rows, previews, metadata, search, selection highlight, and action icons are preserved. There is no extra toolbar or separate manager.

## Install

Copy this folder into your active SillyTavern installation at:

```text
public/scripts/extensions/third-party/Better-Branching/
```

The runtime needs `manifest.json`, `index.js`, `tree.js`, `relationship-cache.js`, and `style.css`. Reload SillyTavern and open its chat history popup. This project does not install itself or modify the reference installation.

## Behavior

- Click a chat to open it using SillyTavern's existing handler.
- Click the branch bar to expand or collapse connected chats.
- Branches of branches nest underneath their parent.
- Search uses SillyTavern's results and reveals the matching ancestry.
- Families sort by their most recent message anywhere in the subtree. A recent branch promotes its parent and all ancestors; sibling subtrees follow the same rule.
- Current-chat ancestors expand when opening history; expansion is remembered for this browser session.
- Missing or ambiguous parent links leave the chat accessible as an ordinary top-level row.

Relationships use `chat_metadata.main_chat` and source-message `extra.branches`, never filename patterns. Checkpoints with the same parent metadata can also appear as connected chats. The extension renders styled chat containers immediately from SillyTavern's rows and groups known relationships before paint. There is no blocking loading state. Uncached relationships are resolved in the background with at most four concurrent requests; on a first visit, previously unknown branches join their parents when that scan finishes. A bounded session cache reuses unchanged relationship summaries. The active chat is reread to pick up new branch links. Message bodies are not cached. Failed reads leave the displayed chats usable. No chat data is changed by grouping.

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
