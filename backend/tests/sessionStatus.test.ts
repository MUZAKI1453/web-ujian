import assert from 'node:assert/strict';
import { test } from 'node:test';
import { participantStatus, sessionExpanded } from '../../frontend/src/pages/guru/sessionStatus';

const now = Date.parse('2026-11-06T03:00:00Z');
const later = '2026-11-06T04:00:00Z';
const current = '2026-11-06T03:00:00Z';

test('session accordions open active sessions and collapse when their status ends', () => {
    assert.equal(sessionExpanded('Berlangsung'), true);
    assert.equal(sessionExpanded('Terjadwal'), false);
    assert.equal(sessionExpanded('Selesai'), false);
    assert.equal(sessionExpanded('Selesai', { status: 'Berlangsung', open: true }), false);
    assert.equal(sessionExpanded('Berlangsung', { status: 'Terjadwal', open: false }), true);
    assert.equal(sessionExpanded('Berlangsung', { status: 'Berlangsung', open: false }), false);
    assert.equal(sessionExpanded('Selesai', { status: 'Selesai', open: true }), true);
});

test('sessions distinguish unstarted, working and submitted participants', () => {
    assert.equal(participantStatus(undefined, false, later, now), 'Belum mulai');
    assert.equal(participantStatus({ waktuKirim: null, batasWaktu: later }, false, later, now), 'Mengerjakan');
    assert.equal(participantStatus({ waktuKirim: current, batasWaktu: later }, false, later, now), 'Sudah mengirim');
    assert.equal(participantStatus(undefined, true, later, now), 'Sudah mengirim');
});

test('participants expire at the earlier of their deadline and the session end', () => {
    assert.equal(participantStatus({ waktuKirim: null, batasWaktu: current }, false, later, now), 'Waktu habis');
    assert.equal(participantStatus({ waktuKirim: null, batasWaktu: later }, false, current, now), 'Waktu habis');
    assert.equal(participantStatus({ waktuKirim: null, batasWaktu: new Date(now + 1).toISOString() }, false, later, now), 'Mengerjakan');
});

test('submitted answers remain submitted after deadlines expire', () => {
    assert.equal(participantStatus({ waktuKirim: current, batasWaktu: current }, false, current, now + 1000), 'Sudah mengirim');
    assert.equal(participantStatus({ waktuKirim: null, batasWaktu: current }, true, current, now + 1000), 'Sudah mengirim');
    assert.equal(participantStatus(undefined, false, current, now + 1000), 'Belum mulai');
});
