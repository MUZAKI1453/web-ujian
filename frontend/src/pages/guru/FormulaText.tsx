import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function FormulaText({ text }: { text: string }) {
    return <>{text.split(/(\$[^$\n]+\$)/g).map((part, index) =>
        part.startsWith('$') && part.endsWith('$') && part.length > 2
            ? <span key={index} className="inline-block max-w-full overflow-x-auto align-middle"
                dangerouslySetInnerHTML={{ __html: katex.renderToString(part.slice(1, -1), { throwOnError: false, trust: false }) }} />
            : <span key={index}>{part}</span>
    )}</>;
}
