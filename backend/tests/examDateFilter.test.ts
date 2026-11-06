import assert from 'node:assert/strict';
import { test } from 'node:test';
import { examDateInRange, examOnDate } from '../../frontend/src/pages/guru/examDateFilter';

test('single date filter matches one Jakarta date and clearing it includes all exams', () => {
    assert.equal(examOnDate('2026-11-05T17:00:00Z', '2026-11-06'), true);
    assert.equal(examOnDate('2026-11-06T16:59:59Z', '2026-11-06'), true);
    assert.equal(examOnDate('2026-11-06T17:00:00Z', '2026-11-06'), false);
    assert.equal(examOnDate('2026-11-05T16:59:59Z', '2026-11-06'), false);
    assert.equal(examOnDate('invalid', '2026-11-06'), false);
    assert.equal(examOnDate('2026-11-01T00:00:00Z', ''), true);
});

test('exam date filters use Jakarta calendar days at midnight boundaries', () => {
    assert.equal(examDateInRange('2026-11-05T17:00:00Z', '2026-11-06', '2026-11-06'), true);
    assert.equal(examDateInRange('2026-11-06T16:59:59Z', '2026-11-06', '2026-11-06'), true);
    assert.equal(examDateInRange('2026-11-05T16:59:59Z', '2026-11-06', '2026-11-06'), false);
    assert.equal(examDateInRange('2026-11-06T17:00:00Z', '2026-11-06', '2026-11-06'), false);
});

test('exam date ranges include both boundaries and support open-ended filters', () => {
    assert.equal(examDateInRange('2026-11-06T03:00:00Z', '2026-11-06', ''), true);
    assert.equal(examDateInRange('2026-11-06T03:00:00Z', '', '2026-11-06'), true);
    assert.equal(examDateInRange('2026-11-06T03:00:00Z', '2026-11-07', ''), false);
    assert.equal(examDateInRange('2026-11-06T03:00:00Z', '', '2026-11-05'), false);
    assert.equal(examDateInRange('2026-11-06T03:00:00Z', '', ''), true);
    assert.equal(examDateInRange('invalid', '2026-11-06', ''), false);
});
