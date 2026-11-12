import QuestionContent from '../pages/guru/QuestionContent';

export default function MatchingPairList({ pairs, answers }: {
    pairs: { kiri: string; kanan: string }[];
    answers?: { kanan: string }[];
}) {
    return <ol className="list-decimal space-y-2 pl-5 text-sm">
        {pairs.map((pair, index) => <li key={index} className="rounded-lg bg-white px-3 py-2">
            <div className={'grid gap-2 whitespace-pre-wrap [overflow-wrap:anywhere] ' + (answers ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                <div className="font-medium"><QuestionContent text={pair.kiri} /></div>
                {answers && <div><span className="block text-xs font-semibold text-slate-500">Jawaban siswa</span>
                    <QuestionContent text={answers[index]?.kanan || 'Kosong'} /></div>}
                <div><span className="block text-xs font-semibold text-slate-500">Kunci</span><QuestionContent text={pair.kanan} /></div>
            </div>
        </li>)}
    </ol>;
}
