// Uji beban tanpa dependensi tambahan (Node 20+). Meniru perilaku halaman pengerjaan siswa:
// login → daftar ujian → siapkan → mulai → menjawab sambil autosave + heartbeat → kumpulkan.
//   UJI_BEBAN_PASSWORD=... node dist/scripts/loadTest.js --url https://cbt.contoh.sch.id --siswa 500 --menit 10
// Siapkan datanya dulu dengan loadTestSeed (npm run uji-beban:siapkan). Jalankan dari komputer lain, bukan dari server.
const LABEL = 'UJI-BEBAN';
const args = process.argv.slice(2);
const text = (name: string, fallback: string) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : String(args[i + 1]); };
const number = (name: string, fallback: number) => {
    const value = Number(text(name, String(fallback)));
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Nilai --${name} tidak valid.`);
    return value;
};

const base = text('url', 'http://127.0.0.1:5000').replace(/\/$/, '') + '/api';
const students = number('siswa', 50);
const minutes = number('menit', 5);
// Batas login per IP di server adalah 1500/menit; bawaan menaikkan 10 siswa per detik.
const rampSeconds = number('naik', Math.max(10, students / 10));
const answerEvery = number('jeda', 20);
const password = process.env.UJI_BEBAN_PASSWORD ?? '';
if (!password) throw new Error('Isi UJI_BEBAN_PASSWORD dengan password akun siswa uji.');

type Stat = { times: number[]; errors: number; codes: Record<string, number> };
const stats = new Map<string, Stat>();
const failures: string[] = [];
let finished = 0, submitted = 0, active = 0;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const random = (min: number, max: number) => min + Math.random() * (max - min);

async function call(name: string, method: string, path: string, token?: string, body?: unknown) {
    const stat = stats.get(name) ?? { times: [], errors: 0, codes: {} };
    stats.set(name, stat);
    const started = performance.now();
    try {
        const response = await fetch(base + path, {
            method, signal: AbortSignal.timeout(15000),
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        stat.times.push(performance.now() - started);
        if (!response.ok) {
            stat.errors++;
            stat.codes[response.status] = (stat.codes[response.status] ?? 0) + 1;
        }
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        stat.times.push(performance.now() - started);
        stat.errors++;
        const code = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'jaringan';
        stat.codes[code] = (stat.codes[code] ?? 0) + 1;
        return { ok: false, status: 0, data: {} as Record<string, any> };
    }
}

function answerFor(question: { tipeSoal: string; items: unknown[] }) {
    if (question.tipeSoal === 'PG') return Math.floor(Math.random() * question.items.length);
    if (question.tipeSoal === 'PM') return [0, 1];
    if (question.tipeSoal === 'BS') return question.items.map(() => Math.random() < 0.5);
    return question.tipeSoal === 'ISIAN' ? '42' : 'Jawaban esai uji beban. '.repeat(10);
}

async function student(index: number, endAt: number) {
    const username = 'ub' + String(index).padStart(5, '0');
    const fail = (step: string, result: { status: number; data: any }) => {
        if (failures.length < 15) failures.push(`${username} ${step}: ${result.status} ${result.data?.message ?? ''}`);
    };
    const login = await call('login', 'POST', '/auth/login', undefined, { username, password });
    if (!login.ok) return fail('login', login);
    const token = login.data.token as string;
    const list = await call('daftar ujian', 'GET', '/siswa/ujian', token);
    const exam = list.ok ? list.data.data.find((item: { mapel: string }) => item.mapel === LABEL) : null;
    if (!exam) return fail('daftar ujian', list);
    const prepared = await call('siapkan', 'POST', `/siswa/ujian/${exam.id}/siapkan`, token, {});
    // Pengerjaan yang sudah ada langsung mengembalikan paket soal dari "siapkan".
    const start = prepared.ok && prepared.data.izin
        ? await call('mulai', 'POST', `/siswa/ujian/${exam.id}/mulai`, token, { izin: prepared.data.izin }) : prepared;
    if (!start.ok || !start.data.attemptId) return fail('mulai', start);
    const packet = start.data as { attemptId: number; versi: number; jawaban: Record<string, unknown>; soal: { id: number; tipeSoal: string; items: unknown[] }[] };
    active++;
    const answers = { ...packet.jawaban };
    let version = packet.versi, saved = packet.versi, next = 0, lastContact = Date.now();
    let nextAnswer = Date.now() + random(2, answerEvery) * 1000;
    const heartbeat = random(25000, 35000);
    const save = async (send: boolean) => {
        lastContact = Date.now();
        const sending = version;
        const result = await call(send ? 'kumpulkan' : sending > saved ? 'autosave' : 'heartbeat', 'PUT', `/siswa/ujian/${exam.id}/jawaban`, token,
            { attemptId: packet.attemptId, versi: sending, jawaban: answers, kirim: send, antrean: sending > saved, securityEvents: [] });
        if (result.ok) saved = Math.max(saved, result.data.versi ?? sending);
        return result;
    };
    while (Date.now() < endAt) {
        await sleep(2500 + random(-300, 300));
        if (Date.now() >= nextAnswer && packet.soal.length) {
            const question = packet.soal[next++ % packet.soal.length];
            answers[question.id] = answerFor(question);
            version++;
            nextAnswer = Date.now() + random(0.5, 1.5) * answerEvery * 1000;
        }
        const idle = Date.now() - lastContact;
        if (idle < (version > saved ? 5000 : heartbeat)) continue;
        const result = await save(false);
        if (result.data?.state === 'submitted' || ['RESET', 'HABIS', 'VERSI'].includes(result.data?.code)) { fail('autosave', result); active--; return; }
    }
    version++;
    let done = await save(true);
    for (let retry = 0; retry < 3 && !done.ok; retry++) { await sleep(2000); done = await save(true); }
    active--;
    finished++;
    if (done.ok && ['submitted', 'review'].includes(done.data.state)) submitted++;
    else fail('kumpulkan', done);
}

function percentile(sorted: number[], p: number) {
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}

async function main() {
    console.log(`Uji beban ke ${base}: ${students} siswa, naik selama ${Math.round(rampSeconds)} detik, mengerjakan ${minutes} menit, menjawab tiap ±${answerEvery} detik.`);
    const started = Date.now();
    const endAt = started + rampSeconds * 1000 + minutes * 60000;
    const progress = setInterval(() => {
        const total = [...stats.values()].reduce((sum, stat) => sum + stat.times.length, 0);
        const errors = [...stats.values()].reduce((sum, stat) => sum + stat.errors, 0);
        console.log(`  ${Math.round((Date.now() - started) / 1000)} dtk · ${active} sedang mengerjakan · ${total} permintaan · ${errors} gagal`);
    }, 15000);
    await Promise.all(Array.from({ length: students }, async (_, index) => {
        await sleep(index * rampSeconds * 1000 / students);
        await student(index + 1, endAt).catch(error => { if (failures.length < 15) failures.push('galat skrip: ' + error); });
    }));
    clearInterval(progress);

    const seconds = (Date.now() - started) / 1000;
    console.log('\nLangkah          jumlah  gagal    p50    p95    p99    maks (ms)   kode gagal');
    let total = 0, errors = 0;
    for (const [name, stat] of stats) {
        const sorted = [...stat.times].sort((a, b) => a - b);
        total += sorted.length; errors += stat.errors;
        const ms = (value: number) => String(Math.round(value)).padStart(6);
        console.log(name.padEnd(14) + String(sorted.length).padStart(8) + String(stat.errors).padStart(7) + ' ' +
            ms(percentile(sorted, 0.5)) + ' ' + ms(percentile(sorted, 0.95)) + ' ' + ms(percentile(sorted, 0.99)) + ' ' + ms(sorted[sorted.length - 1] ?? 0) +
            '        ' + (Object.entries(stat.codes).map(([code, count]) => `${code}×${count}`).join(' ') || '-'));
    }
    console.log(`\n${total} permintaan dalam ${Math.round(seconds)} detik (${(total / seconds).toFixed(1)}/dtk), ${errors} gagal (${(errors / Math.max(1, total) * 100).toFixed(2)}%).`);
    console.log(`${submitted} dari ${students} siswa berhasil mengumpulkan; ${finished} sampai tahap kumpul.`);
    if (failures.length) console.log('Contoh kegagalan:\n  ' + failures.join('\n  '));
    // Ambang lulus: semua siswa mengumpulkan, gagal < 1%, dan p95 autosave < 2 detik.
    const autosave = [...(stats.get('autosave')?.times ?? [])].sort((a, b) => a - b);
    const pass = submitted === students && errors / Math.max(1, total) < 0.01 && percentile(autosave, 0.95) < 2000;
    console.log(pass ? 'HASIL: LULUS' : 'HASIL: TIDAK LULUS (ambang: semua mengumpulkan, gagal < 1%, p95 autosave < 2000 ms)');
    process.exitCode = pass ? 0 : 1;
}

main().catch(error => { console.error(error.message ?? error); process.exitCode = 1; });
