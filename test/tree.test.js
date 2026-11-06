import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForest, sortForest, visibleFamilies, familyView } from '../tree.js';

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
    assert.deepEqual([...visibleFamilies(nodes, ['Nested'])], ['Nested', 'Original']);
});

test('newest branch leads while parent participates in the remaining chat order', () => {
    const { roots } = buildForest([
        { file_name: 'Parent', timestamp: 50 },
        { file_name: 'Branch', main_chat: 'Parent', timestamp: 20 },
        { file_name: 'Deep', main_chat: 'Branch', timestamp: 100 },
    ]);
    sortForest(roots);
    const view = familyView(roots[0]);
    assert.equal(view.representative.id, 'Deep');
    assert.deepEqual(view.others.map(node => node.id), ['Parent', 'Branch']);
    assert.equal(roots[0].id, 'Parent');
});

test('representative stays stable on ties but changes for newer activity', () => {
    const { roots, nodes } = buildForest([
        { file_name: 'Parent', timestamp: 100 },
        { file_name: 'Branch', main_chat: 'Parent', timestamp: 100 },
    ]);
    sortForest(roots);
    assert.equal(familyView(roots[0], 'Branch').representative.id, 'Branch');
    nodes.get('Parent').timestamp = 101;
    sortForest(roots);
    assert.equal(familyView(roots[0], 'Branch').representative.id, 'Parent');
    assert.deepEqual(familyView(roots[0], 'Missing').others.map(node => node.id), ['Branch']);
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

test('recent descendants promote their family ahead of newer parent chats', () => {
    const { roots } = buildForest([
        { file_name: 'Old', timestamp: 1 }, { file_name: 'Other', timestamp: 50 },
        { file_name: 'Active', main_chat: 'Old', timestamp: 100 },
        { file_name: 'Earlier', main_chat: 'Old', timestamp: 20 },
    ]);
    sortForest(roots);
    assert.deepEqual(roots.map(node => node.id), ['Old', 'Other']);
    assert.deepEqual(roots[0].branches.map(node => node.id), ['Active', 'Earlier']);
});

test('deep branches share one recency-sorted list under the original parent', () => {
    const { roots } = buildForest([
        { file_name: 'Parent', timestamp: 1 },
        { file_name: 'Other', timestamp: 90 },
        { file_name: 'Branch', main_chat: 'Parent', timestamp: 2 },
        { file_name: 'Sibling', main_chat: 'Parent', timestamp: 80 },
        { file_name: 'Deep', main_chat: 'Branch', timestamp: 100 },
    ]);
    sortForest(roots);
    assert.equal(roots[0].id, 'Parent');
    assert.deepEqual(roots[0].branches.map(node => node.id), ['Deep', 'Sibling', 'Branch']);
    assert.equal(roots[0].activity, 100);
    // Flattening the view must not rewrite the actual chat relationships.
    assert.equal(roots[0].branches[0].parent.id, 'Branch');
    assert.equal(roots[0].branches[2].main_chat, 'Parent');
});

test('equal and invalid dates preserve input order like SillyTavern', () => {
    const { roots } = buildForest([
        { file_name: 'Z', timestamp: 50 },
        { file_name: 'A', timestamp: 50 },
        { file_name: 'Unknown', timestamp: NaN },
    ]);
    sortForest(roots);
    assert.deepEqual(roots.map(node => node.id), ['Z', 'A', 'Unknown']);
});

test('equal branch timestamps preserve source order across different depths', () => {
    const { roots } = buildForest([
        { file_name: 'Parent', timestamp: 1 },
        { file_name: 'Deep', main_chat: 'Branch', timestamp: 50 },
        { file_name: 'Sibling', main_chat: 'Parent', timestamp: 50 },
        { file_name: 'Branch', main_chat: 'Parent', timestamp: 50 },
        { file_name: 'Unknown', main_chat: 'Branch', timestamp: NaN },
    ]);
    sortForest(roots);
    assert.deepEqual(roots[0].branches.map(node => node.id), ['Deep', 'Sibling', 'Branch', 'Unknown']);
    assert.equal(new Set(roots[0].branches.map(node => node.id)).size, 4);
});

test('search shows matching branches and their original parent only', () => {
    const { nodes } = buildForest([
        { file_name: 'Original' },
        { file_name: 'Branch', main_chat: 'Original' },
        { file_name: 'Deep', main_chat: 'Branch' },
        { file_name: 'Other' },
    ]);
    assert.deepEqual([...visibleFamilies(nodes, ['Deep', 'Missing'])], ['Deep', 'Original']);
    assert.deepEqual([...visibleFamilies(nodes, ['Original'])], ['Original']);
    assert.deepEqual([...visibleFamilies(nodes, ['Deep', 'Branch'])], ['Deep', 'Original', 'Branch']);
});

test('empty histories and families without branches stay valid', () => {
    assert.deepEqual(sortForest(buildForest([]).roots), []);
    const { roots } = buildForest([{ file_name: 'Standalone', timestamp: 100 }]);
    sortForest(roots);
    assert.deepEqual(roots[0].branches, []);
    assert.equal(roots[0].activity, 100);
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
