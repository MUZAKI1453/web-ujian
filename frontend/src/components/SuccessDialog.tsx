import ActionDialog from './ActionDialog';

export default function SuccessDialog({ title, message, onClose }: {
    title: string; message: string; onClose: () => void;
}) {
    return <ActionDialog title={title} message={message} tone="success" confirmLabel="Tutup" onClose={onClose} />;
}
