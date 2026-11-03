import { lazy, Suspense } from 'react';

const FormulaText = lazy(() => import('./FormulaText'));

export default function QuestionContent({ text, image }: { text: string; image?: string }) {
    return (
        <>
            {/\$[^$\n]+\$/.test(text)
                ? <Suspense fallback={<span>{text}</span>}><FormulaText text={text} /></Suspense>
                : <span>{text}</span>}
            {image && <img src={image} alt="Gambar soal" loading="lazy" referrerPolicy="no-referrer"
                className="mt-2 max-h-72 max-w-full rounded-lg object-contain" />}
        </>
    );
}
