import { Children, isValidElement, type ReactNode } from 'react';

export type SelectOption = { value: string; label: string; disabled: boolean };

function textContent(children: ReactNode): string {
    return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children) : String(child)).join('');
}

export function readOptions(children: ReactNode): SelectOption[] {
    return Children.toArray(children).flatMap(child => {
        if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)) return [];
        if (child.type !== 'option') return readOptions(child.props.children);
        const label = textContent(child.props.children);
        return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
    });
}

export function nextOption(options: SelectOption[], active: number, key: string) {
    const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
    if (!enabled.length) return -1;
    if (key === 'Home') return enabled[0];
    if (key === 'End') return enabled[enabled.length - 1];
    const index = enabled.indexOf(active);
    if (index < 0) return key === 'ArrowUp' ? enabled[enabled.length - 1] : enabled[0];
    return enabled[(index + (key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length];
}
