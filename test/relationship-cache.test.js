import test from 'node:test';
import assert from 'node:assert/strict';
import { RelationshipCache } from '../relationship-cache.js';

test('reuse unchanged summaries but invalidate modified chats and isolate characters', () => {
    const cache = new RelationshipCache();
    const chat = { file_name: 'A', last_mes: 100, message_count: 4, file_size: '1 KB' };
    const relationship = { main_chat: 'Parent', links: [] };
    cache.set('character-1', chat, relationship);
    assert.equal(cache.get('character-1', { ...chat }), relationship);
    assert.equal(cache.get('character-2', chat), null);
    for (const change of [{ last_mes: 101 }, { message_count: 5 }, { file_size: '2 KB' }, { file_name: 'Renamed' }]) {
        assert.equal(cache.get('character-1', { ...chat, ...change }), null);
    }
});

test('cache evicts least recently used summaries', () => {
    const cache = new RelationshipCache(2);
    const a = { file_name: 'A' }, b = { file_name: 'B' }, c = { file_name: 'C' };
    cache.set('scope', a, {});
    cache.set('scope', b, {});
    cache.get('scope', a);
    cache.set('scope', c, {});
    assert.equal(cache.get('scope', b), null);
    assert.ok(cache.get('scope', a));
    assert.ok(cache.get('scope', c));
});
