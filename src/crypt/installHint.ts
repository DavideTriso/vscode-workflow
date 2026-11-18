/** The command that installs git-crypt on a platform (`process.platform` value). */
export function installHint(platform: string): string {
    if (platform === 'darwin') {
        return 'brew install git-crypt';
    }
    if (platform === 'win32') {
        return 'Install git-crypt for Windows (see the guide for your package manager) and add it to PATH';
    }
    return 'sudo apt install git-crypt (Debian, Ubuntu), sudo dnf install git-crypt (Fedora), sudo pacman -S git-crypt (Arch)';
}
