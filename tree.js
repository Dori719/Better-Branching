// File IDs, not generated branch titles, are the relationship keys.
export const key = value => String(value ?? '').replace(/\.jsonl$/i, '');

export function buildForest(chats) {
    const nodes = new Map(chats.map(chat => [key(chat.file_name), {
        ...chat, id: key(chat.file_name), children: [], parent: null, message: null,
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

export function sortForest(roots, mode = 'recent') {
    const visit = node => {
        node.activity = Number(node.timestamp) || 0;
        node.descendants = 0;
        for (const child of node.children) {
            visit(child);
            node.activity = Math.max(node.activity, child.activity);
            node.descendants += 1 + child.descendants;
        }
        node.children.sort(compare);
    };
    const compare = (a, b) => mode === 'name'
        ? a.id.localeCompare(b.id, undefined, { numeric: true })
        : b.activity - a.activity || a.id.localeCompare(b.id);
    roots.forEach(visit);
    roots.sort(compare);
    return roots;
}

export function visiblePaths(nodes, matches) {
    const visible = new Set();
    for (const id of matches) {
        let node = nodes.get(key(id));
        while (node && !visible.has(node.id)) {
            visible.add(node.id);
            node = node.parent;
        }
    }
    return visible;
}
