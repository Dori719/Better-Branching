// Session-only, bounded cache. Never retain message bodies.
export class RelationshipCache {
    entries = new Map();
    constructor(limit = 500) { this.limit = limit; }
    signature(chat) {
        return JSON.stringify([chat.last_mes, chat.message_count, chat.file_size]);
    }
    get(scope, chat) {
        const id = JSON.stringify([scope, chat.file_name]);
        const entry = this.entries.get(id);
        if (!entry || entry.signature !== this.signature(chat)) return null;
        this.entries.delete(id);
        this.entries.set(id, entry);
        return entry.relationship;
    }
    set(scope, chat, relationship) {
        const id = JSON.stringify([scope, chat.file_name]);
        this.entries.delete(id);
        this.entries.set(id, { signature: this.signature(chat), relationship });
        while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    }
}
