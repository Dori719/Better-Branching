import { buildForest, key, sortForest, visiblePaths } from './tree.js';
import { RelationshipCache } from './relationship-cache.js';

const context = () => SillyTavern.getContext();
let list, search, observer, controller;
const relationships = new RelationshipCache();
let forest, scope = '', previousQuery = '';
let nativeRows = new Map();
let matches = new Set();
const expansion = new Map();
let expanded = new Set();

async function post(url, body, signal) {
    const response = await fetch(url, {
        method: 'POST', headers: context().getRequestHeaders(),
        body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw new Error(`Chat request failed (${response.status})`);
    return response.json();
}

function observe() {
    observer.observe(list, { childList: true });
}

function setLoading(loading) {
    list.classList.toggle('bb-loading', loading);
    list.setAttribute('aria-busy', String(loading));
}

async function refresh(force) {
    const ctx = context();
    const body = {
        avatar_url: ctx.groupId ? null : ctx.characters[ctx.characterId]?.avatar,
        group_id: ctx.groupId || null,
    };
    if (!body.avatar_url && !body.group_id) { setLoading(false); return; }
    const nextScope = JSON.stringify(body);
    if (!force && forest && nextScope === scope) { render(); setLoading(false); return; }
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 20000);
    scope = nextScope;
    if (!expansion.has(scope)) expansion.set(scope, new Set());
    expanded = expansion.get(scope);
    // A previous scope's tree must never be reused during a new load.
    forest = null;
    try {
        const chats = await post('/api/chats/search', { ...body, query: '' }, signal);
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(4, chats.length) }, async () => {
            while (cursor < chats.length) {
                const chat = chats[cursor++];
                chat.timestamp = ctx.timestampToMoment(chat.last_mes).valueOf();
                // The active chat can acquire a branch link without changing
                // its message count or rounded file size. Always reread it.
                const cached = key(chat.file_name) === key(ctx.chatId) ? null : relationships.get(nextScope, chat);
                if (cached) { Object.assign(chat, cached); continue; }
                try {
                    const data = await post(body.group_id ? '/api/chats/group/get' : '/api/chats/get',
                        body.group_id ? { id: key(chat.file_name) } : { avatar_url: body.avatar_url, file_name: key(chat.file_name) }, signal);
                    if (!Array.isArray(data)) continue;
                    chat.main_chat = data[0]?.chat_metadata?.main_chat;
                    chat.links = [];
                    let message = 0;
                    for (const item of data) {
                        if (item.chat_metadata !== undefined && item.mes === undefined) continue;
                        message++;
                        for (const name of item.extra?.branches ?? []) chat.links.push({ name, message });
                    }
                    relationships.set(nextScope, chat, { main_chat: chat.main_chat, links: chat.links });
                } catch (error) {
                    if (signal.aborted) throw error;
                    console.warn('[Better Branching] Could not read relationships:', chat.file_name, error);
                }
            }
        }));
        if (signal.aborted) return;
        forest = buildForest(chats);
        // Preserve ST's last-message ordering among parents and siblings.
        sortForest(forest.roots);
        let active = forest.nodes.get(key(ctx.chatId))?.parent;
        while (active) { expanded.add(active.id); active = active.parent; }
        render();
    } catch (error) {
        if (!signal.aborted) console.error('[Better Branching]', error);
    } finally {
        clearTimeout(timeout);
        // A superseded request cannot reveal another request's unfinished list.
        if (controller === requestController) setLoading(false);
    }
}

function makeRow(node) {
    // Use the actual native rows, including their original icons and metadata.
    const existing = nativeRows.get(node.id);
    if (existing) return existing;
    // A search match may need an ancestor that ST omitted from its results.
    const row = document.querySelector('#past_chat_template .select_chat_block_wrapper').cloneNode(true);
    row.querySelector('.select_chat_block').setAttribute('file_name', node.file_name);
    if (node.id === key(context().chatId)) row.querySelector('.select_chat_block').setAttribute('highlight', 'true');
    row.querySelector('.select_chat_block_filename').textContent = node.file_name;
    row.querySelector('.chat_file_size').textContent = `(${node.file_size},`;
    row.querySelector('.chat_messages_num').textContent = `${node.message_count} 💬)`;
    row.querySelector('.chat_messages_date').textContent = context().timestampToMoment(node.last_mes).format('lll');
    row.querySelector('.select_chat_block_mes').textContent = node.preview_message;
    row.querySelector('.PastChat_cross').setAttribute('file_name', node.file_name);
    return row;
}

function render() {
    if (!forest) return;
    const searching = Boolean(search.value.trim());
    const visible = searching ? visiblePaths(forest.nodes, matches) : null;
    let sequence = 0;
    const draw = node => {
        if (visible && !visible.has(node.id)) return null;
        const group = document.createElement('div');
        group.className = 'bb-group';
        group.append(makeRow(node));
        if (node.children.length) {
            const children = document.createElement('div');
            children.className = 'bb-branches';
            children.id = `bb-branches-${sequence++}`;
            const count = item => item.children.reduce((sum, child) => sum + 1 + count(child), 0);
            const total = count(node);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'bb-branch-toggle';
            toggle.setAttribute('aria-controls', children.id);
            const icon = document.createElement('i');
            icon.setAttribute('aria-hidden', 'true');
            toggle.append(icon, document.createTextNode(`${total} ${total === 1 ? 'branch' : 'branches'}`));
            const setOpen = open => {
                children.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                icon.className = `fa-solid fa-chevron-${open ? 'down' : 'right'}`;
            };
            setOpen(searching || expanded.has(node.id));
            toggle.addEventListener('click', () => {
                const open = children.hidden;
                if (open) expanded.add(node.id); else expanded.delete(node.id);
                setOpen(open);
            });
            for (const child of node.children) {
                const rendered = draw(child);
                if (rendered) children.append(rendered);
            }
            group.append(toggle, children);
        }
        return group;
    };
    const scroll = list.scrollTop;
    observer.disconnect();
    try {
        const result = document.createDocumentFragment();
        for (const root of forest.roots) {
            const group = draw(root);
            if (group) result.append(group);
        }
        // A chat added during an in-flight read must not disappear.
        for (const [id, row] of nativeRows) if (!forest.nodes.has(id)) result.append(row);
        list.replaceChildren(result);
        list.scrollTop = scroll;
    } finally { observe(); }
}

function capture() {
    nativeRows = new Map([...list.querySelectorAll('.select_chat_block_wrapper')].map(row => [
        key(row.querySelector('.select_chat_block').getAttribute('file_name')), row,
    ]));
    matches = new Set(nativeRows.keys());
    const query = search.value.trim();
    const changed = query !== previousQuery;
    previousQuery = query;
    refresh(!query && !changed);
}

function initialize() {
    list = document.querySelector('#select_chat_div');
    search = document.querySelector('#select_chat_search');
    if (!list || !search) return;
    document.querySelector('#select_chat_popup').classList.add('bb-history');
    observer = new MutationObserver(() => {
        // Invalidate a pending load before ST's replacement rows are captured.
        controller?.abort();
        // Mutation observers run before paint: hide ungrouped replacement rows
        // immediately, rather than displaying them throughout network reads.
        setLoading(true);
        capture();
    });
    observe();
    if (list.children.length) { setLoading(true); capture(); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
