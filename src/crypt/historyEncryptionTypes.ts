// Types shared with the webview bundle, so this file must not import Node modules.

/**
 * - `not-installed`: git-crypt is missing from this machine.
 * - `not-enabled`: git-crypt works, but the repository does not encrypt `.history`.
 * - `locked`: the repository encrypts `.history`, but this clone has no key, so the files are unreadable.
 * - `unlocked`: the repository encrypts `.history` and this clone can read and write it.
 */
export type HistoryEncryptionState = 'not-installed' | 'not-enabled' | 'locked' | 'unlocked';

export interface GpgKeyInfo {
    fingerprint: string;
    userId: string;
    /** Expiry date as `YYYY-MM-DD`, or empty when the key does not expire. */
    expires: string;
    /** False for expired, revoked, disabled or invalid keys. */
    usable: boolean;
    /** File that holds the private key in the gpg home directory; empty when unknown or for public keys. */
    privateKeyPath: string;
}

export interface AuthorizedKeyInfo {
    fingerprint: string;
    /** User ID from the local keyring; empty when the key is not in it. */
    userId: string;
    /** True when the matching secret key is on this machine. */
    isYours: boolean;
}

export interface HistoryEncryptionStatus {
    state: HistoryEncryptionState;
    /** True when `.gitattributes` already has the git-crypt rule for `.history`. */
    ruleInRepository: boolean;
    gitCryptVersion: string;
    gpgVersion: string;
    /** People who can unlock the repository, from the committed key files. */
    authorizedKeys: AuthorizedKeyInfo[];
    /** Usable secret keys on this machine, the key of the Git user first. */
    secretKeys: GpgKeyInfo[];
    /** Number of files under `.history` that Git stores encrypted; unknown while locked. */
    encryptedFileCount: number | undefined;
    /** Files under `.history` that Git stores as plain text. */
    unencryptedFiles: string[];
    platform: string;
}
