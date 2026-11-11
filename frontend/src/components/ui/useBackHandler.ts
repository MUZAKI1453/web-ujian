import { useLayoutEffect, useRef } from 'react';
import { createBackStack } from './backStack';

export const backLayer = { page: 0, detail: 1, editor: 2, dialog: 3 };

let stack: ReturnType<typeof createBackStack> | undefined;

export function useBackHandler(active: boolean, onBack: () => void, priority = backLayer.page) {
    const handler = useRef(onBack);
    handler.current = onBack;

    useLayoutEffect(() => {
        if (!active) return;
        if (!stack) {
            stack = createBackStack(window.history);
            window.addEventListener('popstate', stack.pop);
        }
        return stack.push(() => handler.current(), priority);
    }, [active, priority]);
}
