// File IDs, not generated branch titles, are the relationship keys.
export const key = value => String(value ?? '').replace(/\.jsonl$/i, '');

export function buildForest(chats) {
    const nodes = new Map(chats.map((chat, order) => [key(chat.file_name), {
        ...chat, id: key(chat.file_name), order, children: [], parent: null, message: null,
    }]));
    const links = new Map();
    for (const node of nodes.values()) {
        for (const link of node.links ?? []) {
            const id = key(link.name);
            if (!links.has(id)) links.set(id, []);
            links.get(id).push({ parent: node.id, message: link.message });
        }
    }
    for (const node of nodes.values()) {
        const declared = key(node.main_chat);
        const candidates = links.get(node.id) ?? [];
        // Copied history can contain an ancestor's branch links. Prefer the
        // child's explicit parent; only recover a missing link if unambiguous.
        const source = candidates.find(link => link.parent === declared);
        const fallback = candidates.length === 1 ? candidates[0] : null;
        const parentId = nodes.has(declared) ? declared : fallback?.parent;
        if (parentId && parentId !== node.id) {
            node.parent = nodes.get(parentId);
            node.message = (source ?? fallback)?.message ?? null;
        } else if (declared) node.warning = 'Parent unavailable';
    }
    // Imported or damaged metadata must never create a disappearing cycle.
    for (const node of nodes.values()) {
        const seen = new Set([node.id]);
        let cursor = node.parent;
        while (cursor) {
            if (seen.has(cursor.id)) {
                node.parent = null;
                node.warning = 'Circular parent link';
                break;
            }
            seen.add(cursor.id);
            cursor = cursor.parent;
        }
    }
    for (const node of nodes.values()) node.parent?.children.push(node);
    return { nodes, roots: [...nodes.values()].filter(node => !node.parent) };
}

export function sortForest(roots) {
    const timestamp = node => Number.isFinite(node.timestamp) ? node.timestamp : -Infinity;
    const compare = (a, b) => (timestamp(b) - timestamp(a)) || a.order - b.order;
    for (const root of roots) {
        // Keep real parent links intact, but expose every descendant in one
        // flat list. A branch's own last message determines its position.
        const branches = [];
        const pending = [...root.children];
        while (pending.length) {
            const branch = pending.pop();
            branches.push(branch);
            pending.push(...branch.children);
        }
        root.branches = branches.sort(compare);
        root.activity = Math.max(timestamp(root), branches.length ? timestamp(branches[0]) : -Infinity);
    }
    roots.sort((a, b) => (b.activity - a.activity) || a.order - b.order);
    return roots;
}

export function visibleFamilies(nodes, matches) {
    const visible = new Set();
    for (const id of matches) {
        let node = nodes.get(key(id));
        if (!node) continue;
        visible.add(node.id);
        // Searching a deep branch needs only its original parent for context,
        // not every intermediate branch through which it was created.
        while (node.parent) node = node.parent;
        visible.add(node.id);
    }
    return visible;
}

export function familyView(root, previousId) {
    const time = node => Number.isFinite(node.timestamp) ? node.timestamp : -Infinity;
    const members = [root, ...root.branches].sort((a, b) => (time(b) - time(a)) || a.order - b.order);
    const previous = members.find(node => node.id === previousId);
    const representative = previous && time(previous) === time(members[0]) ? previous : members[0];
    return { representative, others: members.filter(node => node !== representative) };
}
