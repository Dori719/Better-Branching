import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForest, sortForest, visiblePaths } from '../tree.js';

test('nested families use explicit parents despite copied ancestor links', () => {
    const { nodes, roots } = buildForest([
        { file_name: 'Original', links: [{ name: 'Branch', message: 42 }] },
        { file_name: 'Branch', main_chat: 'Original', links: [{ name: 'Branch', message: 42 }, { name: 'Nested', message: 61 }] },
        { file_name: 'Nested', main_chat: 'Branch' },
    ]);
    assert.equal(roots.length, 1);
    assert.equal(nodes.get('Branch').message, 42);
    assert.equal(nodes.get('Nested').parent.id, 'Branch');
    assert.equal(nodes.get('Nested').message, 61);
    assert.deepEqual([...visiblePaths(nodes, ['Nested'])], ['Nested', 'Branch', 'Original']);
});

test('missing parents and cycles keep every chat reachable exactly once', () => {
    const { roots } = buildForest([
        { file_name: 'A', main_chat: 'B' }, { file_name: 'B', main_chat: 'A' },
        { file_name: 'Lost', main_chat: 'Deleted' }, { file_name: 'Self', main_chat: 'Self' },
    ]);
    const seen = [];
    const visit = node => { seen.push(node.id); node.children.forEach(visit); };
    roots.forEach(visit);
    assert.deepEqual(seen.sort(), ['A', 'B', 'Lost', 'Self']);
    assert.equal(roots.find(node => node.id === 'Lost').warning, 'Parent unavailable');
});

test('recent activity sorts families and siblings without flattening descendants', () => {
    const { roots } = buildForest([
        { file_name: 'Old', timestamp: 1 }, { file_name: 'Other', timestamp: 50 },
        { file_name: 'Active', main_chat: 'Old', timestamp: 100 },
        { file_name: 'Earlier', main_chat: 'Old', timestamp: 20 },
    ]);
    sortForest(roots);
    assert.equal(roots[0].id, 'Old');
    assert.equal(roots[0].descendants, 2);
    assert.deepEqual(roots[0].children.map(node => node.id), ['Active', 'Earlier']);
    sortForest(roots, 'name');
    assert.deepEqual(roots.map(node => node.id), ['Old', 'Other']);
});

test('unambiguous source links recover renamed parents; ambiguous copies do not', () => {
    const { nodes } = buildForest([
        { file_name: 'Renamed', links: [{ name: 'Child.jsonl', message: 7 }] },
        { file_name: 'Child', main_chat: 'Old name' },
        { file_name: 'Copy1', links: [{ name: 'Ambiguous', message: 8 }] },
        { file_name: 'Copy2', links: [{ name: 'Ambiguous', message: 8 }] },
        { file_name: 'Ambiguous', main_chat: 'Gone' },
    ]);
    assert.equal(nodes.get('Child').parent.id, 'Renamed');
    assert.equal(nodes.get('Child').message, 7);
    assert.equal(nodes.get('Ambiguous').parent, null);
});
