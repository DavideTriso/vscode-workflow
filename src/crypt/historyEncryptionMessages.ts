import type { HistoryEncryptionStatus } from './historyEncryptionTypes';

/** Messages the History encryption section sends to the extension. */
export type HistoryEncryptionRequest =
    | { type: 'refreshHistoryEncryption' }
    | { type: 'enableHistoryEncryption'; fingerprint: string }
    | HistoryEncryptionCopyRequest
    | { type: 'addTeammateKey'; armoredKey: string }
    | { type: 'unlockHistory' }
    | { type: 'renormalizeHistory' };

/** Copies text to the clipboard; the extension answers with `historyEncryptionCopied` and the same `requestId`. */
export type HistoryEncryptionCopyRequest =
    | { type: 'copyPublicKey'; fingerprint: string; requestId: string }
    | { type: 'copyFingerprint'; fingerprint: string; requestId: string };

/** Messages the extension sends to the History encryption section. */
export type HistoryEncryptionNotice =
    | { type: 'historyEncryptionStatus'; status: HistoryEncryptionStatus | undefined }
    | { type: 'historyEncryptionResult'; message: string; error: boolean }
    | { type: 'expandHistoryEncryption' }
    /** Answers a copy request: `ok` is false when the copy failed, with the reason in `message`. */
    | { type: 'historyEncryptionCopied'; requestId: string; ok: boolean; message: string };

const requestsWithoutPayload = [
    'refreshHistoryEncryption', 'unlockHistory', 'renormalizeHistory',
];
const copyRequestTypes = ['copyPublicKey', 'copyFingerprint'];

export function isHistoryEncryptionRequest(message: unknown): message is HistoryEncryptionRequest {
    if (typeof message !== 'object' || message === null || !('type' in message) || typeof message.type !== 'string') {
        return false;
    }
    if (requestsWithoutPayload.includes(message.type)) {
        return true;
    }
    if (message.type === 'enableHistoryEncryption') {
        return 'fingerprint' in message && typeof message.fingerprint === 'string';
    }
    if (copyRequestTypes.includes(message.type)) {
        return 'fingerprint' in message && typeof message.fingerprint === 'string'
            && 'requestId' in message && typeof message.requestId === 'string';
    }
    return message.type === 'addTeammateKey' && 'armoredKey' in message && typeof message.armoredKey === 'string';
}

const noticeTypes = ['historyEncryptionStatus', 'historyEncryptionResult', 'expandHistoryEncryption', 'historyEncryptionCopied'];

export function isHistoryEncryptionNotice(message: { type: string }): message is HistoryEncryptionNotice {
    return noticeTypes.includes(message.type);
}

export function isHistoryEncryptionCopyRequest(request: HistoryEncryptionRequest): request is HistoryEncryptionCopyRequest {
    return copyRequestTypes.includes(request.type);
}
