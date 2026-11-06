import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { nextOption, optionScrollTop, readOptions, type SelectOption } from './selectOptions';

type Props = {
    children: ReactNode; value?: string | number; defaultValue?: string | number;
    onValueChange?: (value: string) => void; className?: string; name?: string; id?: string;
    disabled?: boolean; required?: boolean; form?: string; title?: string;
    'aria-label'?: string; 'aria-labelledby'?: string;
};

export default function Select({ children, value, defaultValue, onValueChange, className = '', name, id, disabled, required, form, title,
    'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }: Props) {
    const options = readOptions(children);
    const [localValue, setLocalValue] = useState(String(defaultValue ?? options[0]?.value ?? ''));
    const selectedValue = value !== undefined ? String(value) : options.some(option => option.value === localValue) ? localValue : options[0]?.value ?? '';
    const selected = options.find(option => option.value === selectedValue);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(-1);
    const [invalid, setInvalid] = useState(false);
    const [label, setLabel] = useState('Pilih opsi');
    const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden', top: 0, left: 0 });
    const root = useRef<HTMLSpanElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const sizer = useRef<HTMLSpanElement>(null);
    const native = useRef<HTMLSelectElement>(null);
    const popup = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const typeahead = useRef({ text: '', time: 0 });
    const listId = useId();
    const searchable = options.length > 7;
    const filtered = options.filter(option => option.label.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID')));
    const signature = filtered.map(option => option.value + ':' + option.disabled).join('|');

    useEffect(() => {
        const parentLabel = root.current?.closest('label');
        const text = parentLabel && Array.from(parentLabel.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent).join(' ').trim();
        if (text) setLabel(text);
    }, []);

    useEffect(() => {
        const element = native.current?.form;
        const reset = () => { setLocalValue(String(defaultValue ?? options[0]?.value ?? '')); setInvalid(false); setOpen(false); };
        element?.addEventListener('reset', reset);
        return () => element?.removeEventListener('reset', reset);
    }, [defaultValue, options[0]?.value]);

    function show(direction = 1) {
        if (disabled || trigger.current?.matches(':disabled')) return;
        setPosition({ position: 'fixed', visibility: 'hidden', top: 0, left: 0 });
        setQuery('');
        const index = options.findIndex(option => option.value === selectedValue && !option.disabled);
        const enabled = options.flatMap((option, i) => option.disabled ? [] : [i]);
        setActive(index >= 0 ? index : direction > 0 ? enabled[0] ?? -1 : enabled[enabled.length - 1] ?? -1);
        setOpen(true);
    }

    function choose(option: SelectOption | undefined) {
        if (!option || option.disabled || disabled || trigger.current?.matches(':disabled')) return;
        if (value === undefined) setLocalValue(option.value);
        setInvalid(false);
        onValueChange?.(option.value);
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
    }

    useEffect(() => {
        if (!open) return;
        setActive(previous => filtered[previous] && !filtered[previous].disabled ? previous : filtered.findIndex(option => !option.disabled));
    }, [open, signature, query]);

    useLayoutEffect(() => {
        if (!open) return;
        function place() {
            const rect = trigger.current?.getBoundingClientRect();
            if (!rect) return;
            const viewport = window.visualViewport;
            const viewportTop = viewport?.offsetTop ?? 0;
            const viewportLeft = viewport?.offsetLeft ?? 0;
            const height = viewport?.height ?? window.innerHeight;
            const width = viewport?.width ?? window.innerWidth;
            const bottomSpace = viewportTop + height - rect.bottom - 12;
            const topSpace = rect.top - viewportTop - 12;
            const desiredHeight = Math.min(popup.current?.scrollHeight ?? 360, 360);
            const above = bottomSpace < desiredHeight && topSpace > bottomSpace;
            const maxHeight = Math.max(0, Math.min(360, above ? topSpace : bottomSpace));
            // Short menus follow the control; longer labels can expand within the screen.
            const contentWidth = sizer.current?.scrollWidth ?? rect.width;
            const menuWidth = Math.min(Math.max(rect.width, Math.min(contentWidth, 480)), width - 24);
            setPosition({ position: 'fixed', width: menuWidth, maxHeight,
                left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + width - menuWidth - 12)),
                top: above ? undefined : rect.bottom + 6,
                bottom: above ? window.innerHeight - rect.top + 6 : undefined });
        }
        place();
        const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) place(); };
        window.addEventListener('resize', place);
        window.addEventListener('scroll', scroll, true);
        window.visualViewport?.addEventListener('resize', place);
        const observer = new ResizeObserver(place);
        if (trigger.current) observer.observe(trigger.current);
        if (sizer.current) observer.observe(sizer.current);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', scroll, true);
            window.visualViewport?.removeEventListener('resize', place);
        };
    }, [open, signature, query]);

    useEffect(() => {
        if (!open) return;
        if (searchable) search.current?.focus({ preventScroll: true });
        const outside = (event: Event) => {
            if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('focusin', outside);
        return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside); };
    }, [open, searchable]);

    useLayoutEffect(() => {
        if (!open || active < 0 || !list.current) return;
        const option = document.getElementById(listId + '-' + active);
        if (!option || position.visibility === 'hidden') return;
        const container = list.current;
        container.scrollTop = optionScrollTop(container.scrollTop, container.getBoundingClientRect(), option.getBoundingClientRect());
    }, [active, open, listId, position]);

    function keydown(event: KeyboardEvent<HTMLElement>) {
        if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); return;
        }
        if (event.key === 'Tab' && open) {
            setOpen(false);
            if (event.currentTarget !== trigger.current) {
                event.preventDefault();
                const scope = trigger.current?.closest('[data-dialog-layer]') ?? document.body;
                const fields = Array.from(scope.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]'))
                    .filter(element => !element.matches(':disabled, [tabindex="-1"]') && element.getClientRects().length && !popup.current?.contains(element));
                const index = fields.indexOf(trigger.current!);
                (fields[(index + (event.shiftKey ? -1 : 1) + fields.length) % fields.length] ?? trigger.current)?.focus();
            }
            return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (!open) { show(event.key === 'ArrowUp' || event.key === 'End' ? -1 : 1); return; }
            setActive(nextOption(filtered, active, event.key));
        } else if ((event.key === 'Enter' || event.key === ' ') && (event.currentTarget === trigger.current || event.key === 'Enter')) {
            event.preventDefault();
            if (!open) show();
            else if (filtered[active]) choose(filtered[active]);
        } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const now = Date.now();
            const text = (now - typeahead.current.time < 700 ? typeahead.current.text : '') + event.key.toLocaleLowerCase('id-ID');
            typeahead.current = { text, time: now };
            if (!open) show();
            const index = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase('id-ID').startsWith(text));
            if (index >= 0) setActive(index);
        }
    }

    const accessibleLabel = ariaLabel ?? label;
    const layoutClasses = className.split(/\s+/).filter(token => !/^(?:ui-input|block|inline-block|(?:[\w-]+:)*(?:border|rounded|bg|text|font|shadow|p[trblxy]?|appearance|cursor|outline|ring)(?:-|$))/.test(token)).join(' ');
    return <span ref={root} className={'ui-select ' + layoutClasses}>
        <span ref={sizer} aria-hidden="true" className="ui-select-sizer">
            {options.map(option => <span key={option.value}>{option.label}</span>)}
        </span>
        <select ref={native} name={name} value={selectedValue} disabled={disabled} required={required} form={form}
            aria-hidden="true" tabIndex={-1} className="sr-only pointer-events-none"
            onChange={event => choose(options.find(option => option.value === event.target.value)!)}
            onInvalid={event => {
                event.preventDefault();
                setInvalid(true);
                const firstInvalid = native.current?.form?.querySelector('input:invalid, select:invalid, textarea:invalid');
                if (!firstInvalid || firstInvalid === native.current) { trigger.current?.focus(); show(); }
            }}>
            {children}
        </select>
        <button ref={trigger} id={id} type="button" disabled={disabled} title={title ?? selected?.label} role="combobox"
            aria-label={accessibleLabel} aria-labelledby={ariaLabelledby} aria-expanded={open} aria-controls={listId}
            aria-haspopup="listbox" aria-required={required} aria-invalid={invalid || undefined}
            aria-activedescendant={open && !searchable && active >= 0 ? listId + '-' + active : undefined}
            className="ui-select-trigger" onKeyDown={keydown} onClick={() => open ? setOpen(false) : show()}>
            <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? 'Pilih opsi'}</span>
            <ChevronDown size={17} aria-hidden="true" className={'shrink-0 text-slate-400 transition-transform ' + (open ? 'rotate-180' : '')} />
        </button>
        {open && createPortal(<div ref={popup} data-dialog-layer data-select-popup style={position} className="ui-select-popup"
            onKeyDown={keydown} onClick={event => { event.preventDefault(); event.stopPropagation(); }}>
            {searchable && <div className="relative shrink-0 border-b border-slate-100 p-2">
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input ref={search} role="combobox" aria-label={'Cari ' + accessibleLabel.toLocaleLowerCase('id-ID')} aria-expanded="true"
                    aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? listId + '-' + active : undefined}
                    className="ui-input w-full pl-9" placeholder="Cari pilihan…" value={query}
                    onChange={event => { setQuery(event.target.value); setActive(-1); }} />
            </div>}
            <div ref={list} id={listId} role="listbox" aria-label={accessibleLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
                {!filtered.length && <p role="status" className="px-3 py-5 text-center text-sm text-slate-500">Pilihan tidak ditemukan.</p>}
                {filtered.map((option, index) => <div key={option.value} id={listId + '-' + index} role="option"
                    aria-selected={option.value === selectedValue} aria-disabled={option.disabled || undefined}
                    data-active={active === index} className="ui-select-option"
                    onPointerMove={() => { if (!option.disabled && active !== index) setActive(index); }}
                    onClick={event => { event.preventDefault(); event.stopPropagation(); choose(option); }}>
                    <span className="min-w-0 flex-1 break-words">{option.label}</span>
                    {option.value === selectedValue && <Check size={17} className="shrink-0 text-blue-600" aria-hidden="true" />}
                </div>)}
            </div>
        </div>, document.fullscreenElement ?? document.body)}
    </span>;
}
