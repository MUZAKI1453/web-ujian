type BackHistory = Pick<History, 'state' | 'pushState' | 'back'>;

const marker = 'cbtBack';

export function createBackStack(history: BackHistory) {
    const handlers: { run: () => void; priority: number }[] = [];
    let removing = false;

    function arm() {
        if (!removing && history.state?.[marker] !== true) {
            history.pushState({ ...history.state, [marker]: true }, '');
        }
    }

    return {
        push(run: () => void, priority = 0) {
            const handler = { run, priority };
            handlers.push(handler);
            arm();
            return () => {
                const index = handlers.indexOf(handler);
                if (index < 0) return;
                handlers.splice(index, 1);
                if (!handlers.length && !removing && history.state?.[marker] === true) {
                    removing = true;
                    history.back();
                }
            };
        },
        pop() {
            if (removing) {
                removing = false;
                if (handlers.length) arm();
                return;
            }
            if (history.state?.[marker] === true) return;
            const top = handlers.reduce<(typeof handlers)[number] | undefined>(
                (current, handler) => !current || handler.priority >= current.priority ? handler : current, undefined
            );
            if (!top) return;
            // Keep one browser entry for the stack so UI closes and nested unmounts cannot leave dead entries.
            arm();
            top.run();
        }
    };
}
