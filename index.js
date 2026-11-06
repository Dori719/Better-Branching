import { buildForest, key, sortForest, visibleFamilies, familyView } from './tree.js';
import { RelationshipCache } from './relationship-cache.js';

const context = () => SillyTavern.getContext();
let list, search, observer, controller;
const relationships = new RelationshipCache();
const summaries = new Map();
let forest, scope = '', previousQuery = '';
let nativeRows = new Map();
let matches = new Set();
const expansion = new Map();
const representatives = new Map();
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

function scopeBody() {
    const ctx = context();
    return { avatar_url: ctx.groupId ? null : ctx.characters[ctx.characterId]?.avatar, group_id: ctx.groupId || null };
}

function revealCurrentFamily() {
    let active = forest.nodes.get(key(context().chatId));
    if (!active?.parent) return;
    while (active.parent) active = active.parent;
    expanded.add(active.id);
}

function showAvailableChats() {
    scope = JSON.stringify(scopeBody());
    if (!expansion.has(scope)) expansion.set(scope, new Set());
    expanded = expansion.get(scope);
    const previous = summaries.get(scope) ?? new Map();
    const chats = search.value.trim() ? new Map(previous) : new Map();
    let rank = nativeRows.size;
    for (const [id, row] of nativeRows) {
        const old = previous.get(id);
        const date = row.querySelector('.chat_messages_date')?.textContent;
        const parsed = context().timestampToMoment(date).valueOf();
        const unchangedDate = old && context().timestampToMoment(old.last_mes).format('lll') === date;
        chats.set(id, {
            ...old, file_name: id,
            timestamp: unchangedDate ? old.timestamp : Number.isFinite(parsed) ? parsed : old?.timestamp ?? rank,
            preview_message: row.querySelector('.select_chat_block_mes')?.textContent ?? '',
        });
        rank--;
    }
    forest = buildForest([...chats.values()]);
    sortForest(forest.roots);
    revealCurrentFamily();
    render();
}

async function refresh(force) {
    const ctx = context();
    const body = {
        avatar_url: ctx.groupId ? null : ctx.characters[ctx.characterId]?.avatar,
        group_id: ctx.groupId || null,
    };
    if (!body.avatar_url && !body.group_id) return;
    const nextScope = JSON.stringify(body);
    if (!force && summaries.has(nextScope)) return;
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    const requestController = controller;
    const timeout = setTimeout(() => requestController.abort(), 20000);
    scope = nextScope;
    if (!expansion.has(scope)) expansion.set(scope, new Set());
    expanded = expansion.get(scope);
    // The list is already rendered. Network work only enriches relationships.
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
        summaries.set(nextScope, new Map(chats.map(chat => [key(chat.file_name), chat])));
        // Bound retained summaries to recently visited characters/groups.
        if (summaries.size > 10) summaries.delete(summaries.keys().next().value);
        forest = buildForest(chats);
        // The latest chat anywhere in a family promotes the original parent.
        sortForest(forest.roots);
        revealCurrentFamily();
        render();
    } catch (error) {
        if (!signal.aborted) console.error('[Better Branching]', error);
    } finally {
        clearTimeout(timeout);
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
    const visible = searching ? visibleFamilies(forest.nodes, matches) : null;
    let sequence = 0;
    const chatRow = (chat, parent) => {
        const row = makeRow(chat);
        row.querySelector('.bb-parent-marker')?.remove();
        if (chat === parent && parent.branches.length && !parent.main_chat) {
            const marker = document.createElement('span');
            marker.className = 'bb-parent-marker';
            marker.title = 'Original parent chat';
            marker.setAttribute('aria-label', 'Original parent chat');
            marker.setAttribute('role', 'img');
            marker.tabIndex = 0;
            // An outlined SVG keeps the symbol independent of installed icon packs.
            marker.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg>';
            row.querySelector('.select_chat_block_filename').before(marker);
        }
        return row;
    };
    const draw = node => {
        if (visible && !visible.has(node.id)) return null;
        const representativeKey = JSON.stringify([scope, node.id]);
        const { representative, others } = familyView(node, representatives.get(representativeKey));
        representatives.set(representativeKey, representative.id);
        const group = document.createElement('div');
        group.className = 'bb-group';
        group.append(chatRow(representative, node));
        const displayedOthers = others.filter(chat => !visible || visible.has(chat.id));
        if (displayedOthers.length) {
            const children = document.createElement('div');
            children.className = 'bb-branches';
            children.id = `bb-branches-${sequence++}`;
            const total = displayedOthers.length;
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'bb-branch-toggle';
            toggle.setAttribute('aria-controls', children.id);
            const icon = document.createElement('i');
            icon.setAttribute('aria-hidden', 'true');
            toggle.append(icon, document.createTextNode(`${total} other ${total === 1 ? 'chat' : 'chats'}`));
            const setOpen = open => {
                children.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                icon.className = `fa-solid fa-chevron-${open ? 'down' : 'right'}`;
            };
            setOpen(searching || expanded.has(node.id) || displayedOthers.some(chat => chat.id === key(context().chatId)));
            toggle.addEventListener('click', () => {
                const open = children.hidden;
                if (open) expanded.add(node.id); else expanded.delete(node.id);
                setOpen(open);
            });
            for (const branch of displayedOthers) {
                const branchGroup = document.createElement('div');
                branchGroup.className = 'bb-group';
                branchGroup.append(chatRow(branch, node));
                children.append(branchGroup);
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
    showAvailableChats();
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
        // Group known relationships before paint, without waiting for reads.
        capture();
    });
    observe();
    if (list.children.length) capture();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
