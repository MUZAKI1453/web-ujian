import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import ActionDialog, { type ActionPrompt } from './ActionDialog';

const ConfirmationContext = createContext<(prompt: ActionPrompt) => Promise<boolean>>(async () => false);
export const useConfirmation = () => useContext(ConfirmationContext);

export default function ConfirmationProvider({ children }: { children: ReactNode }) {
    const [prompt, setPrompt] = useState<ActionPrompt | null>(null);
    const resolver = useRef<((confirmed: boolean) => void) | null>(null);
    useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);

    function ask(next: ActionPrompt) {
        if (resolver.current) return Promise.resolve(false);
        return new Promise<boolean>(resolve => { resolver.current = resolve; setPrompt(next); });
    }
    function settle(confirmed: boolean) {
        const resolve = resolver.current;
        resolver.current = null;
        setPrompt(null);
        resolve?.(confirmed);
    }

    return <ConfirmationContext.Provider value={ask}>
        {children}
        {prompt && <ActionDialog {...prompt} onClose={() => settle(false)} onConfirm={() => settle(true)} />}
    </ConfirmationContext.Provider>;
}
