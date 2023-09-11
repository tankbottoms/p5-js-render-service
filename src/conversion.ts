export function toBase64(content: string | Buffer | Uint8Array) {
    return Buffer.from(content).toString('base64');
}

export function fromBase64(content: string) {
    return Buffer.from(content, 'base64');
}

export function fileSizeString(sizeInBytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    let size = sizeInBytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}