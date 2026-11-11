import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackStack } from '../../frontend/src/components/ui/backStack';

function fixture() {
    let entries: unknown[] = [null];
    let index = 0;
    let queued = false;
    const history = {
        get state() { return entries[index]; },
        pushState(state: unknown) {
            entries = [...entries.slice(0, index + 1), state];
            index++;
        },
        back() { queued = true; }
    };
    const stack = createBackStack(history);
    function traverse() {
        assert.ok(queued && index > 0);
        queued = false;
        index--;
        stack.pop();
    }
    return { history, stack, traverse };
}

test('Back closes the newest dialog first, then returns from detail to the page and dashboard', () => {
    const { history, stack, traverse } = fixture();
    const visited: string[] = [];
    const detail = stack.push(() => { visited.push('detail'); detail(); }, 1);
    const page = stack.push(() => { visited.push('page'); page(); });
    const dialog = stack.push(() => { visited.push('dialog'); dialog(); }, 3);
    const nested = stack.push(() => { visited.push('nested'); nested(); }, 3);

    for (let i = 0; i < 4; i++) {
        history.back();
        traverse();
    }
    assert.deepEqual(visited, ['nested', 'dialog', 'detail', 'page']);
    traverse();
    assert.equal(history.state, null);
});

test('closing a layer in the UI never calls its Back handler or consumes a lower layer', () => {
    const { history, stack, traverse } = fixture();
    let called = 0;
    const guard = stack.push(() => called++);
    const dialog = stack.push(() => assert.fail('closed dialog'), 3);
    dialog();
    for (let i = 0; i < 2; i++) {
        history.back();
        traverse();
    }
    assert.equal(called, 2);
    guard();
    const replacement = stack.push(() => assert.fail('programmatic Back'), 1);
    traverse();
    assert.ok(history.state);
    replacement();
    traverse();
    assert.equal(history.state, null);
});
